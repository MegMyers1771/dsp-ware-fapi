from .general_conf import SPREADSHEET_ID
CONFIG = {
    "spreadsheet_id": SPREADSHEET_ID,
    "worksheet_name": "Салазки",

    # колонка с названием коробки
    "box_column": "Ящик",

    # маппинг колонок к ключам
    "fields": {
        "Формат": "Формат",
        "Вендор": "Вендор",
        "Парт": "Парт",
        "Части": "Части",
        "Кол-во": "Кол-во",
        "Сервер": "Сервер",
        "Аналоги": "Аналоги",
        "Комментарий": "Комментарий",
    },

    # диапазоны для reserved значений (из data validation)
    "reserved_ranges": {
        "Формат": "B6:B7",
        "Вендор": "C6:C7",
        "Парт": "D6:D7",
        "Части": "E6:E7",
    },

    "creds": "service_account.json"
}

# result = {
#     "worksheet_name": {ws_name},
#     "fields": [field1, field2, field3...],
#     "reserved": {
#         "field1": [reserved1, reserved2,...]
#         "field2": [reserved1, reserved2,...]
#         "field3": [reserved1, reserved2,...]
#         ...
#     }
#     "boxes": [
#         {
#             "box": {box_name}
#             "items": [
#                 ...
#             ]
#         }
#     ]
# }