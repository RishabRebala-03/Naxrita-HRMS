from datetime import datetime
from zoneinfo import ZoneInfo


IST = ZoneInfo("Asia/Kolkata")


def now_ist():
    return datetime.now(IST)


def now_ist_naive():
    return now_ist().replace(tzinfo=None)


def ist_today():
    return now_ist().date()


def month_start_ist(value=None):
    reference = value or now_ist()
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=IST)
    else:
        reference = reference.astimezone(IST)
    return reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
