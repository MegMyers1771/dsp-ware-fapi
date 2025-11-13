from .general_conf import SPREADSHEET_ID
CONFIG = {
    "spreadsheet_id": SPREADSHEET_ID,
    "worksheet_name": "Расходка",

    # колонка с названием коробки
    "box_column": "Ящик",

    # маппинг колонок к ключам
    "fields": {
        "Размер": "Размер",
        "Кол-во": "Кол-во",
        "Комментарий": "Комментарий",

    },

    # диапазоны для reserved значений (из data validation)
    "reserved_ranges": {

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