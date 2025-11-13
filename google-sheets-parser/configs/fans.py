from .general_conf import SPREADSHEET_ID
CONFIG = {
    "spreadsheet_id": SPREADSHEET_ID,
    "worksheet_name": "кулеры",

    # колонка с названием коробки
    "box_column": "Ящик",

    # маппинг колонок к ключам
    "fields": {
        "Имя": "Товар",
        "Кол-во": "Шт",
        "Вендор": "Вендор",
        "Размер": "Размер",
        "Ампер": "Ампер",
        "Вольт": "Вольт",
        "Штекер": "Штекер",
        "Длина Пр.": "Длина Пр.",
        "Комментарий": "Комментарий"
    },

    # диапазоны для reserved значений (из data validation)
    "reserved_ranges": {
        "Вендор": "D6:D7",
        "Размер": "E6:E7",
        "Ампер": "F6:F7",
        "Вольт": "G6:G7",
        "Штекер": "H6:H7",
        "Длина Пр.": "I6:I7",
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