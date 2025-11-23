import json
import os
from typing import Any, Dict, Union, Optional

import pandas as pd
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build


SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _load_credentials(creds_source: Union[str, Dict[str, Any], Credentials]) -> Credentials:
    if isinstance(creds_source, Credentials):
        return creds_source

    if isinstance(creds_source, dict):
        return Credentials.from_service_account_info(creds_source, scopes=SCOPES)

    if isinstance(creds_source, str):
        if os.path.isfile(creds_source):
            return Credentials.from_service_account_file(creds_source, scopes=SCOPES)
        try:
            data = json.loads(creds_source)
        except json.JSONDecodeError as exc:
            raise FileNotFoundError(f"Credentials file '{creds_source}' not found") from exc
        return Credentials.from_service_account_info(data, scopes=SCOPES)

    raise TypeError("Unsupported credentials source type")


def build_sheets_service(creds_source: Union[str, Dict[str, Any], Credentials]):
    creds = _load_credentials(creds_source)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _dedupe_box_name(name: str, seen: Dict[str, int]) -> tuple[str, bool]:
    """
    Keeps box names unique by appending counters for duplicates:
    Box, Box (2), Box (3), etc.
    """
    count = seen.get(name, 0) + 1
    seen[name] = count
    if count == 1:
        return name, False
    return f"{name} ({count})", True


def _column_index_to_letter(idx: int) -> str:
    """Convert zero-based index to column letter (A, B, ..., AA, AB, ...)."""
    result = ""
    current = idx + 1
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _update_sheet_cell(service, spreadsheet_id: str, worksheet_name: str, column_letter: str, row_number: int, value: str) -> None:
    if not service or not spreadsheet_id or not worksheet_name or not column_letter:
        return
    cell_range = f"'{worksheet_name}'!{column_letter}{row_number}"
    body = {"values": [[value]]}
    try:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=cell_range,
            valueInputOption="USER_ENTERED",
            body=body,
        ).execute()
    except Exception:
        # Не прерываем парсер из-за ошибки обновления таблицы
        print(f"Failed to update duplicate box name at {cell_range}")


####################################
# DATA VALIDATION PARSER
####################################

def get_data_validation_values(spreadsheet_id, range_name, sheet_name, creds_source):
    service = build_sheets_service(creds_source)

    # 1. Определяем sheetId вкладки по имени
    metadata = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets.properties"
    ).execute()

    target_sheet_id = None
    for sh in metadata["sheets"]:
        props = sh["properties"]
        if props["title"] == sheet_name:
            target_sheet_id = props["sheetId"]
            break

    if target_sheet_id is None:
        raise ValueError(f"Sheet '{sheet_name}' not found")

    # 2. Получаем dataValidation правила только этой вкладки
    response = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        ranges=[f"'{sheet_name}'!{range_name}"],
        fields="sheets(data(rowData(values(dataValidation)))),sheets.properties"
    ).execute()

    values = set()

    for sheet in response.get("sheets", []):
        if sheet["properties"]["sheetId"] != target_sheet_id:
            continue
        for data in sheet.get("data", []):
            for row in data.get("rowData", []):
                for cell in row.get("values", []):
                    dv = cell.get("dataValidation")
                    if not dv:
                        continue
                    cond = dv.get("condition", {})
                    if cond.get("type") != "ONE_OF_LIST":
                        continue
                    for v in cond.get("values", []):
                        raw = v.get("userEnteredValue")
                        if raw:
                            values.add(raw)

    return sorted(values)


####################################
# SHEET LOADER
####################################

def load_sheet_df(spreadsheet_id, worksheet_name, creds_source):
    service = build_sheets_service(creds_source)

    resp = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=worksheet_name
    ).execute()

    rows = resp.get("values", [])
    header = rows[0]
    header_len = len(header)

    normalized_rows = []

    for r in rows[1:]:
        if len(r) < header_len:
            # Добавляем пустые значения
            r = r + [""]*(header_len - len(r))
        elif len(r) > header_len:
            # Обрезаем лишние
            r = r[:header_len]

        normalized_rows.append(r)

    df = pd.DataFrame(normalized_rows, columns=header)
    return df


####################################
# MAIN PARSER
####################################

def parse_boxes(df, config, reserved_values, *, service=None, spreadsheet_id: Optional[str] = None, worksheet_name: Optional[str] = None):
    box_col = config["box_column"]
    field_map = config["fields"]

    boxes = []
    box_name_counts: Dict[str, int] = {}
    current_box = None
    current_items = []

    rows = df.to_dict("records")
    total_rows = len(rows)

    # проверка блока ящика — минимум 3 строки (merged)
    def is_valid_box(index):
        count = 1
        for j in range(index + 1, total_rows):
            if rows[j].get(box_col, "").strip() == "":
                count += 1
            else:
                break
        return count >= 3

    column_letter = None
    try:
        column_idx = df.columns.get_loc(box_col)
        column_letter = _column_index_to_letter(column_idx)
    except Exception:
        column_letter = None

    i = 0
    while i < total_rows:
        row = rows[i]
        box_value = row.get(box_col)

        # нашли новый ящик
        if isinstance(box_value, str) and box_value.strip():
            # validate block size
            if not is_valid_box(i):
                i += 1
                continue

            # если был текущий — закрываем его
            if current_box is not None:
                boxes.append({
                    "box": current_box,
                    "items": current_items
                })

            # начинаем новый бокс
            normalized_name = box_value.strip()
            unique_name, was_modified = _dedupe_box_name(normalized_name, box_name_counts)
            if was_modified and column_letter:
                row_number = i + 2  # учитываем заголовок
                _update_sheet_cell(service, spreadsheet_id, worksheet_name, column_letter, row_number, unique_name)
            current_box = unique_name
            current_items = []

        if not current_box:
            i += 1
            continue

        # формируем item
        item = {}
        skip_item = False

        for key, col in field_map.items():
            # print(key, col)
            val = row.get(col)

            # проверка пустого name/Товар
            if key.lower() in ["имя", "товар"] and (not val or str(val).strip() == ""):
                # print("skipped")
                skip_item = True
                break

            item[key] = val

        if not skip_item:
            current_items.append(item)

        i += 1

    # добавляем последний бокс
    if current_box:
        boxes.append({"box": current_box, "items": current_items})

    # итоговый результат
    result = {
        "worksheet_name": config["worksheet_name"],
        "fields": list(field_map.keys()),
        "reserved": reserved_values,
        "boxes": boxes
    }

    return result


def extract_box_structure(values, config):
    """
    Возвращает структуру боксов/айтемов с указанием строк листа (row_number).
    values — матрица вида [[header...], [...], ...] как возвращает Sheets API.
    """
    if not values:
        return []
    header = values[0]
    rows = values[1:]
    header_map = {str(col).strip(): idx for idx, col in enumerate(header)}
    box_column_name = config.get("box_column")
    if box_column_name not in header_map:
        raise ValueError(f"Колонка ящика «{box_column_name}» не найдена в таблице")
    box_idx = header_map[box_column_name]

    field_map = config.get("fields") or {}
    field_indices = {}
    for field, column in field_map.items():
        column_idx = header_map.get(column)
        if column_idx is not None:
            field_indices[field] = column_idx

    total_rows = len(rows)

    def get_cell(row, idx):
        if idx is None:
            return ""
        if idx >= len(row):
            return ""
        return str(row[idx]).strip()

    def is_valid_box(start_idx):
        count = 1
        for j in range(start_idx + 1, total_rows):
            cell = get_cell(rows[j], box_idx)
            if not cell:
                count += 1
            else:
                break
        return count >= 3

    boxes = []
    current_box = None
    current_items = None
    box_name_counts: Dict[str, int] = {}

    i = 0
    while i < total_rows:
        row = rows[i]
        row_number = i + 2  # с учётом заголовка
        box_value = get_cell(row, box_idx)

        if box_value:
            if not is_valid_box(i):
                i += 1
                continue

            if current_box is not None:
                boxes.append(current_box)

            normalized_name = box_value
            unique_name, _ = _dedupe_box_name(normalized_name, box_name_counts)
            current_box = {
                "box": unique_name,
                "__header_row": row_number,
                "items": [],
            }
            current_items = current_box["items"]

        if not current_box:
            i += 1
            continue

        item = {}
        skip_item = False
        for field_name, column_idx in field_indices.items():
            value = get_cell(row, column_idx)
            item[field_name] = value
            if field_name.lower() in ["имя", "товар", "name"] and not value:
                skip_item = True
                break

        if not skip_item:
            item["__row_number"] = row_number
            current_items.append(item)

        i += 1

    if current_box:
        boxes.append(current_box)

    return boxes

####################################
# RUN
####################################

def main(config, creds_override=None):
    config_data = dict(config)
    spreadsheet_id = config_data["spreadsheet_id"]
    sheet_name = config_data["worksheet_name"]
    creds_source = creds_override if creds_override is not None else config_data.get("creds")
    if creds_source is None:
        raise ValueError("Credentials are not provided. Pass them via config['creds'] or CLI.")

    print("Loading sheet data...")
    df = load_sheet_df(spreadsheet_id, sheet_name, creds_source)
    service = build_sheets_service(creds_source)

    print("Extracting reserved values...")
    reserved_values = {}
    direct_allowed = config_data.get("allowed_values") or config_data.get("reserved") or {}
    if isinstance(direct_allowed, dict):
        for field, values in direct_allowed.items():
            if values is None:
                continue
            reserved_values[field] = list(values)

    for field, range_ in (config_data.get("reserved_ranges") or {}).items():
        reserved_values[field] = get_data_validation_values(
            spreadsheet_id,
            range_,
            sheet_name,
            creds_source
        )
        # print(f"{field}: {reserved_values[field]}")

    print("Parsing boxes...")
    boxes = parse_boxes(
        df,
        config_data,
        reserved_values,
        service=service,
        spreadsheet_id=spreadsheet_id,
        worksheet_name=sheet_name,
    )

    return boxes
