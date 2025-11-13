SPREADSHEET_ID = '1BUoLe_K90Di-FoGsNyQH-sg5DVSjxBFjcdotgMcxsYM'
CREDENTIALS = 'test-credentials.json'

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