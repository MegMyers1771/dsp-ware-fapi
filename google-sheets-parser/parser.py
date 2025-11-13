import json
import pandas as pd
import os
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError



####################################
# DATA VALIDATION PARSER
####################################

def get_data_validation_values(spreadsheet_id, range_name, sheet_name, creds_file):
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = Credentials.from_service_account_file(creds_file, scopes=scopes)
    service = build('sheets', 'v4', credentials=creds)

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

def load_sheet_df(spreadsheet_id, worksheet_name, creds_file):
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = Credentials.from_service_account_file(creds_file, scopes=scopes)
    service = build('sheets', 'v4', credentials=creds)

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

def parse_boxes(df, config, reserved_values):
    box_col = config["box_column"]
    field_map = config["fields"]

    boxes = []
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
            current_box = box_value.strip()
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


####################################
# RUN
####################################

def main(config):
    spreadsheet_id = config["spreadsheet_id"]
    sheet_name = config["worksheet_name"]
    creds = config["creds"]

    print("Loading sheet data...")
    df = load_sheet_df(spreadsheet_id, sheet_name, creds)

    print("Extracting reserved values...")
    reserved_values = {}

    for field, range_ in config["reserved_ranges"].items():
        reserved_values[field] = get_data_validation_values(
            spreadsheet_id,
            range_,
            sheet_name,
            creds
        )
        print(f"{field}: {reserved_values[field]}")

    print("Parsing boxes...")
    boxes = parse_boxes(df, config, reserved_values)

    return boxes
# json.dumps(boxes, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    from configs.general_conf import get_all_configs
    
    
    all_configs = get_all_configs()
    for conf in all_configs:
        # with open()
        try:
            result = main(conf)
            conf_name = result["worksheet_name"] + '.json'
        
            print(f"Total boxes in {conf_name} - {len(result["boxes"])}")
            
            parsed_path = os.path.join('parsed-tabs', conf_name)
            with open(parsed_path, 'w+', encoding='utf-8') as file:
                json.dump(result, file, indent=4)
                
            print(conf_name + " dumped")
        except HttpError as ex:
            print(f"Error parsing {conf.__str__()}")
            
        
