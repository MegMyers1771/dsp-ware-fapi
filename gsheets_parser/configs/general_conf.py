import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = PROJECT_ROOT / "sheets_config.json"


def _load_from_config() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return {}
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


_settings = _load_from_config()

SPREADSHEET_ID = _settings.get("SPREADSHEET_ID") or os.getenv("SPREADSHEET_ID") or "1BUoLe_K90Di-FoGsNyQH-sg5DVSjxBFjcdotgMcxsYM"
CREDENTIALS = _settings.get("CREDENTIALS") or os.getenv("CREDENTIALS") or "test-credentials.json"

def get_all_configs() -> list[dict]:
    from .hdd import CONFIG as hdd_conf
    from .cpu import CONFIG as cpu_conf
    from .consumable import CONFIG as cons_conf
    from .controllers import CONFIG as contr_conf
    from .fans import CONFIG as fan_conf
    from .misc import CONFIG as misc_conf
    from .motherboards import CONFIG as mb_conf
    from .power_supply import CONFIG as ps_conf
    from .ram import CONFIG as ram_conf
    from .samples import CONFIG as sample_conf
    from .sled import CONFIG as sled_conf
    
    CONFIGS = [
        hdd_conf, cpu_conf, cons_conf, contr_conf, fan_conf,
        misc_conf, mb_conf, ps_conf, ram_conf, sample_conf, sled_conf
    ]
    
    for c in CONFIGS:
        c['creds'] = CREDENTIALS
    
    return CONFIGS
