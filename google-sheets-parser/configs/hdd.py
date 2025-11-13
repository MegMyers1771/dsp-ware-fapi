from .general_conf import SPREADSHEET_ID
CONFIG = {
    "spreadsheet_id": SPREADSHEET_ID,
    "worksheet_name": "HDD",

    # колонка с названием коробки
    "box_column": "Ящик",

    # маппинг колонок к ключам
    "fields": {
        "Имя": "Товар",
        "Кол-во": "Шт",
        "Формат": "Фор.",
        "Вендор": "Вендор",
        "Объем": "Объем",
        "RPM": "RPM",
        "Кэш": "Кэш",
        "Салазки": "Салазки",
        "Комментарий": "Комментарий"
    },

    # диапазоны для reserved значений (из data validation)
    "reserved_ranges": {
        "Форм": "D6:D7",
        "Инт.": "E6:E7",
        "Объем": "F6:F7",
        "Вендор": "G6:G7",
        "RPM": "H6:H7",
        "КЕШ": "I6:I7",
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