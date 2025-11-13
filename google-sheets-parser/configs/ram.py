from .general_conf import SPREADSHEET_ID
CONFIG = {
    "spreadsheet_id": SPREADSHEET_ID,
    "worksheet_name": "ОП",

    # колонка с названием коробки
    "box_column": "Ящик",

    # маппинг колонок к ключам
    "fields": {
        "Имя": "Товар",
        "Кол-во": "Шт",
        "Скорость": "Скорость",
        "Вендор": "Вендор",
        "Тип": "Тип",
        "Обьем": "Обьем",
        "Rev": "Rev",
        "Ранг": "Ранг",
        "Комментарий": "Комментарий",
    },

    # диапазоны для reserved значений (из data validation)
    "reserved_ranges": {
        "Скорость": "D6:D7",
        "Вендор": "E6:E7",
        "Тип": "F6:F7",
        "Обьем": "G6:G7",
        "Rev": "H6:H7",
        "Ранг": "I6:I7",
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