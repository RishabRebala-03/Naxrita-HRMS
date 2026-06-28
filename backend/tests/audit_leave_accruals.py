import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


def parse_datetime(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def normalize_month_start(value):
    if not isinstance(value, datetime):
        return None
    return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=value.tzinfo)


def month_diff_inclusive(join_dt, today):
    months = (today.year - join_dt.year) * 12 + (today.month - join_dt.month) + 1
    if join_dt.day > 15:
        months -= 1
    return max(months, 0)


def moneyish(value):
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def expected_balances(user, today):
    join_dt = parse_datetime(user.get("dateOfJoining"))
    if not join_dt:
        return None

    if join_dt.tzinfo is not None:
        today = today.replace(tzinfo=join_dt.tzinfo)

    months = month_diff_inclusive(join_dt, today)
    employment_type = str(user.get("employment_type") or "Employee").strip().lower()

    if employment_type == "intern":
        return {
            "months": months,
            "sick_total": round(months * 1.0, 2),
            "planned_total": 0.0,
            "rule": "intern",
        }

    return {
        "months": months,
        "sick_total": round(months * 0.5, 2),
        "planned_total": round(months * 1.0, 2),
        "rule": "employee",
    }


def main():
    today = datetime.utcnow()
    this_month_start = normalize_month_start(today)

    with app.app_context():
        mongo.cx.admin.command("ping")
        users = list(mongo.db.users.find({}).sort("name", 1))

    scanned = 0
    excluded = []
    mismatches = []
    rule_mismatches = []
    current_month_not_accrued = []

    for user in users:
        role = str(user.get("role") or "").strip().lower()
        if role == "admin":
            continue

        scanned += 1
        leave_balance = user.get("leaveBalance") or {}
        expected = expected_balances(user, today)
        level = user.get("level")
        employment_type = str(user.get("employment_type") or "Employee").strip() or "Employee"
        join_dt = parse_datetime(user.get("dateOfJoining"))
        last_accrual = normalize_month_start(parse_datetime(leave_balance.get("lastAccrualDate")))

        if employment_type.lower() == "intern" and level != 14:
            rule_mismatches.append({
                "name": user.get("name", ""),
                "employeeId": user.get("employeeId", ""),
                "employment_type": employment_type,
                "level": level,
                "issue": "Intern is not level 14, but monthly accrual job keys off level 14.",
            })
        if employment_type.lower() != "intern" and level == 14:
            rule_mismatches.append({
                "name": user.get("name", ""),
                "employeeId": user.get("employeeId", ""),
                "employment_type": employment_type,
                "level": level,
                "issue": "Non-intern is level 14, so monthly accrual job may credit intern-style leaves.",
            })

        if not join_dt:
            excluded.append({
                "name": user.get("name", ""),
                "employeeId": user.get("employeeId", ""),
                "employment_type": employment_type,
                "level": level,
                "issue": "Missing or invalid dateOfJoining; monthly accrual job skips this user completely.",
            })
            continue

        if last_accrual != this_month_start:
            current_month_not_accrued.append({
                "name": user.get("name", ""),
                "employeeId": user.get("employeeId", ""),
                "employment_type": employment_type,
                "level": level,
                "lastAccrualDate": leave_balance.get("lastAccrualDate"),
            })

        if not expected:
            continue

        actual_sick_total = moneyish(leave_balance.get("sickTotal"))
        actual_planned_total = moneyish(leave_balance.get("plannedTotal"))
        expected_sick_total = expected["sick_total"]
        expected_planned_total = expected["planned_total"]

        if actual_sick_total != expected_sick_total or actual_planned_total != expected_planned_total:
            mismatches.append({
                "name": user.get("name", ""),
                "employeeId": user.get("employeeId", ""),
                "employment_type": employment_type,
                "level": level,
                "months": expected["months"],
                "expected_rule": expected["rule"],
                "expected_sick_total": expected_sick_total,
                "actual_sick_total": actual_sick_total,
                "expected_planned_total": expected_planned_total,
                "actual_planned_total": actual_planned_total,
                "lastAccrualDate": leave_balance.get("lastAccrualDate"),
            })

    print("Leave accrual audit")
    print(f"Scanned non-admin users: {scanned}")
    print(f"Excluded from accrual due to missing/invalid DOJ: {len(excluded)}")
    print(f"Users not accrued for current month: {len(current_month_not_accrued)}")
    print(f"Users with expected-total mismatches: {len(mismatches)}")
    print(f"Users with intern/level rule mismatch risk: {len(rule_mismatches)}")

    if excluded:
        print("\nExcluded users")
        for item in excluded:
            print(
                f"- {item['name']} ({item['employeeId']}) | type={item['employment_type']} | "
                f"level={item['level']} | {item['issue']}"
            )

    if current_month_not_accrued:
        print("\nNot accrued this month")
        for item in current_month_not_accrued:
            print(
                f"- {item['name']} ({item['employeeId']}) | type={item['employment_type']} | "
                f"level={item['level']} | lastAccrualDate={item['lastAccrualDate']}"
            )

    if mismatches:
        print("\nBalance mismatches")
        for item in mismatches:
            print(
                f"- {item['name']} ({item['employeeId']}) | type={item['employment_type']} | "
                f"rule={item['expected_rule']} | months={item['months']} | "
                f"sick expected/actual={item['expected_sick_total']}/{item['actual_sick_total']} | "
                f"planned expected/actual={item['expected_planned_total']}/{item['actual_planned_total']} | "
                f"lastAccrualDate={item['lastAccrualDate']}"
            )

    if rule_mismatches:
        print("\nIntern rule mismatches")
        for item in rule_mismatches:
            print(
                f"- {item['name']} ({item['employeeId']}) | type={item['employment_type']} | "
                f"level={item['level']} | {item['issue']}"
            )


if __name__ == "__main__":
    main()
