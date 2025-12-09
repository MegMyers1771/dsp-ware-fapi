from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.utils import parser_storage
from app.services import sheets_config
from gsheets_parser import parser as sheets_parser

logger = logging.getLogger(__name__)

NAME_KEYS = {"имя", "товар", "name", "item", "название"}
QTY_KEYS = {"qty", "quantity", "кол-во", "количество", "шт"}


class SyncConfigurationError(ValueError):
    """Raised when sync settings are incomplete."""


class TabSyncManager:
    def __init__(self, config_name: str):
        self.config = parser_storage.get_config(config_name)
        if not self.config:
            raise SyncConfigurationError(f"Конфигурация '{config_name}' не найдена")

        settings = sheets_config.get_settings()
        spreadsheet_id = settings.get("spreadsheet_id")
        if not spreadsheet_id:
            raise SyncConfigurationError("SPREADSHEET_ID не указан в sheets_config.json")

        worksheet = self.config.get("worksheet_name")
        if not worksheet:
            raise SyncConfigurationError("В конфигурации отсутствует worksheet_name")

        creds = sheets_config.get_credentials_file()
        self.service = sheets_parser.build_sheets_service(creds)
        self.spreadsheet_id = spreadsheet_id
        self.worksheet_name = worksheet
        self.sheet_id: Optional[int] = None

        self.box_column_name = self.config.get("box_column")
        if not self.box_column_name:
            raise SyncConfigurationError("Не указана колонка ящика (box_column)")

        self.fields = self.config.get("fields") or {}
        self.name_field = self._resolve_field(NAME_KEYS)
        self.qty_field = self._resolve_field(QTY_KEYS)

        self._values: Optional[List[List[str]]] = None
        self._header_map: Optional[Dict[str, int]] = None
        self._boxes: Optional[List[Dict[str, Any]]] = None

    def _resolve_field(self, tokens) -> Optional[str]:
        for field_name in self.fields.keys():
            if field_name and field_name.strip().lower() in tokens:
                return field_name
        return None

    def _fetch_state(self):
        response = (
            self.service.spreadsheets()
            .values()
            .get(spreadsheetId=self.spreadsheet_id, range=self.worksheet_name)
            .execute()
        )
        values = response.get("values") or []
        if not values:
            raise SyncConfigurationError(f"Лист '{self.worksheet_name}' пуст")
        self._values = values
        self._header_map = {str(col).strip(): idx for idx, col in enumerate(values[0])}
        self._boxes = sheets_parser.extract_box_structure(values, self.config)

    def _ensure_state(self):
        logger.info("STATE")
        if self._values is None or self._header_map is None or self._boxes is None:
            self._fetch_state()
            self._ensure_columns_present()

    def _clear_state(self):
        self._values = None
        self._header_map = None
        self._boxes = None

    def _ensure_columns_present(self):
        """
        Если в таблице нет колонок из маппинга конфигурации, добавляем их в шапку.
        """
        missing = [col for col in (self.fields or {}).values() if col and col not in (self._header_map or {})]
        if not missing:
            logger.info("THERE IS NO MISSING in: ", self.fields )
            return

        logger.info("MISSING: ", missing)

        next_idx = len(self._header_map or {})
        for column_name in missing:
            column_letter = self._column_letter(next_idx)
            # Обновляем заголовок в первой строке, чтобы создать новую колонку.
            self.service.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{self.worksheet_name}'!{column_letter}1",
                valueInputOption="USER_ENTERED",
                body={"values": [[column_name]]},
            ).execute()
            next_idx += 1

        # После модификации шапки перезагружаем состояние.
        self._fetch_state()

    def _find_box(self, name: str) -> Optional[Dict[str, Any]]:
        self._ensure_state()
        if not name:
            return None
        target = name.strip().lower()
        for box in self._boxes or []:
            if str(box.get("box") or "").strip().lower() == target:
                return box
        return None

    def _items_equal(self, candidate: Dict[str, Any], payload_item: Dict[str, Any]) -> bool:
        if not candidate or not payload_item:
            return False
        name_field = self.name_field or next(iter(self.fields or []), None)
        existing_name = str(candidate.get(name_field) or "").strip().lower()
        target_name = str(payload_item.get("name") or "").strip().lower()
        if existing_name != target_name:
            return False
        metadata = payload_item.get("metadata") or {}
        for key, value in metadata.items():
            if str(candidate.get(key) or "").strip() != str(value or "").strip():
                return False
        return True

    def _find_item(self, box: Dict[str, Any], payload_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for item in box.get("items") or []:
            if self._items_equal(item, payload_item):
                return item
        return None

    def _ensure_sheet_id(self) -> int:
        if self.sheet_id is not None:
            return self.sheet_id
        metadata = (
            self.service.spreadsheets()
            .get(spreadsheetId=self.spreadsheet_id, fields="sheets.properties")
            .execute()
        )
        for sheet in metadata.get("sheets", []):
            props = sheet.get("properties", {})
            if props.get("title") == self.worksheet_name:
                self.sheet_id = props.get("sheetId")
                break
        if self.sheet_id is None:
            raise SyncConfigurationError(f"Лист '{self.worksheet_name}' не найден в таблице")
        return self.sheet_id

    def _column_letter(self, index: int) -> str:
        base = ord("A")
        result = ""
        idx = index
        while True:
            result = chr(base + (idx % 26)) + result
            idx = idx // 26 - 1
            if idx < 0:
                break
        return result

    def _update_cells(self, row_number: int, updates: Dict[int, Any]):
        if not updates:
            return
        data = []
        for col_idx, value in updates.items():
            column_letter = self._column_letter(col_idx)
            range_ref = f"'{self.worksheet_name}'!{column_letter}{row_number}"
            data.append({"range": range_ref, "values": [[value]]})
        self.service.spreadsheets().values().batchUpdate(
            spreadsheetId=self.spreadsheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": data},
        ).execute()

    def _insert_row(self, row_number: int):
        request = {
            "requests": [
                {
                    "insertDimension": {
                        "range": {
                            "sheetId": self._ensure_sheet_id(),
                            "dimension": "ROWS",
                            "startIndex": row_number - 1,
                            "endIndex": row_number,
                        }
                    }
                }
            ]
        }
        self.service.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body=request).execute()

    def _delete_row(self, row_number: int):
        request = {
            "requests": [
                {
                    "deleteDimension": {
                        "range": {
                            "sheetId": self._ensure_sheet_id(),
                            "dimension": "ROWS",
                            "startIndex": row_number - 1,
                            "endIndex": row_number,
                        }
                    }
                }
            ]
        }
        self.service.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body=request).execute()

    def _build_row(self, payload: Dict[str, Any]) -> List[str]:
        header = self._values[0] if self._values else []
        row = ["" for _ in range(len(header))]
        item_info = payload.get("item") or {}
        metadata = item_info.get("metadata") or {}
        for field_name, column_name in self.fields.items():
            column_idx = self._header_map.get(column_name)
            if column_idx is None:
                continue
            normalized = (field_name or "").strip().lower()
            if normalized in NAME_KEYS:
                row[column_idx] = item_info.get("name") or ""
            elif normalized in QTY_KEYS:
                row[column_idx] = item_info.get("qty") or ""
            else:
                row[column_idx] = metadata.get(field_name, "")
        return row

    def handle_create(self, payload: Dict[str, Any]) -> None:
        if not payload:
            return
        try:
            self._ensure_state()
        except SyncConfigurationError as exc:
            logger.warning("Синхронизация пропущена: %s", exc)
            return

        box_name = payload.get("box", {}).get("name", "")
        box = self._find_box(box_name)
        if not box:
            logger.warning("Бокс «%s» не найден в таблице — пропускаем создание строки", box_name)
            return

        payload_item = payload.get("item") or {}
        existing = self._find_item(box, payload_item)

        if existing and self.qty_field:
            qty_column_name = self.fields.get(self.qty_field)
            qty_column_idx = self._header_map.get(qty_column_name)
            if qty_column_idx is None:
                return
            try:
                previous = int(existing.get(self.qty_field) or 0)
            except (ValueError, TypeError):
                previous = 0
            new_qty = previous + int(payload_item.get("qty") or 0)
            self._update_cells(existing.get("__row_number"), {qty_column_idx: new_qty})
        else:
            reference_row = (
                box["items"][-1]["__row_number"] if box.get("items") else box.get("__header_row", 1)
            )
            target_row = (reference_row or 1) + 1
            self._insert_row(target_row)
            row_values = self._build_row(payload)
            range_ref = f"'{self.worksheet_name}'!{target_row}:{target_row}"
            self.service.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=range_ref,
                valueInputOption="USER_ENTERED",
                body={"values": [row_values]},
            ).execute()

        self._clear_state()

    def handle_update(self, before: Dict[str, Any], after: Dict[str, Any]) -> None:
        if not after:
            return
        try:
            self._ensure_state()
        except SyncConfigurationError as exc:
            logger.warning("Синхронизация пропущена: %s", exc)
            return

        box_name = before.get("box", {}).get("name") or after.get("box", {}).get("name") or ""
        box = self._find_box(box_name)
        if not box:
            logger.warning("Бокс «%s» не найден в таблице — пропускаем обновление", box_name)
            return

        reference_item = before.get("item") or {}
        target_item = self._find_item(box, reference_item)
        if not target_item:
            reference_item = after.get("item") or {}
            target_item = self._find_item(box, reference_item)
        if not target_item:
            logger.info("Строка не найдена, создаём новую")
            self.handle_create(after)
            return

        metadata = (after.get("item") or {}).get("metadata") or {}
        updates = {}
        for field_name, column_name in self.fields.items():
            column_idx = self._header_map.get(column_name)
            if column_idx is None:
                continue
            normalized = (field_name or "").strip().lower()
            if normalized in NAME_KEYS:
                new_value = after.get("item", {}).get("name") or ""
            elif normalized in QTY_KEYS:
                new_value = after.get("item", {}).get("qty") or ""
            else:
                new_value = metadata.get(field_name, "")
            if str(target_item.get(field_name) or "") != str(new_value):
                updates[column_idx] = new_value

        if updates:
            self._update_cells(target_item.get("__row_number"), updates)
        self._clear_state()

    def handle_delete(self, payload: Dict[str, Any]) -> None:
        if not payload:
            return
        try:
            self._ensure_state()
        except SyncConfigurationError as exc:
            logger.warning("Синхронизация пропущена: %s", exc)
            return

        box_name = payload.get("box", {}).get("name", "")
        box = self._find_box(box_name)
        if not box:
            logger.warning("Бокс «%s» не найден в таблице — пропускаем удаление", box_name)
            return

        target_item = self._find_item(box, payload.get("item") or {})
        if not target_item:
            logger.info(
                "Строка для очищения не найдена (ящик=%s, айтем=%s)",
                box_name,
                (payload.get("item") or {}).get("name"),
            )
            return

        row_number = target_item.get("__row_number")
        updates = {}
        for column_name in self.fields.values():
            column_idx = self._header_map.get(column_name)
            if column_idx is not None:
                updates[column_idx] = ""
        self._update_cells(row_number, updates)
        self._clear_state()
