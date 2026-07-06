import os
import sys
from datetime import datetime

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


RUN_TAG = "codex-backdated-timesheet-sync-2026-07-06"


def header(user_id):
    return {"X-User-Id": str(user_id)}


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def assert_status(response, expected, message):
    if response.status_code != expected:
        payload = None
        try:
            payload = response.get_json()
        except Exception:
            payload = response.data.decode("utf-8", errors="ignore")
        raise AssertionError(
            f"{message}: expected {expected}, got {response.status_code}, payload={payload}"
        )


def seed_users():
    admin_id = ObjectId()
    lead_id = ObjectId()
    employee_id = ObjectId()
    users = [
        {
            "_id": admin_id,
            "name": "Backdated Admin",
            "email": "backdated-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-BACKDATED-1",
            "adminMenuAccess": ["timesheets", "payslips"],
            "testTag": RUN_TAG,
        },
        {
            "_id": lead_id,
            "name": "Backdated Lead",
            "email": "backdated-lead@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-BACKDATED-1",
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Backdated Employee",
            "email": "backdated-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-BACKDATED-1",
            "reportsTo": lead_id,
            "leaveBalance": {
                "sick": 6,
                "sickTotal": 6,
                "planned": 12,
                "plannedTotal": 12,
                "optional": 2,
                "optionalTotal": 2,
                "lwp": 0,
            },
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users[0], users[1], users[2]


def seed_second_fortnight_timesheet(employee, lead):
    now = datetime.utcnow()
    doc = {
        "_id": ObjectId(),
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "Engineering",
        "period_start": "2026-06-16",
        "period_end": "2026-06-30",
        "entries": [
            {
                "_id": ObjectId(),
                "date": "2026-06-18",
                "hours": 9,
                "entry_type": "work",
                "charge_code_id": ObjectId(),
                "charge_code": "SYNC001",
                "charge_code_name": "Sync Project",
                "description": "",
            }
        ],
        "daily_overtime": {},
        "holiday_payout": {},
        "work_schedule_by_date": {},
        "total_hours": 9,
        "work_hours": 9,
        "status": "draft",
        "reporting_lead_id": lead["_id"],
        "submitted_at": now,
        "updated_at": now,
        "approval_history": [],
        "testTag": RUN_TAG,
    }
    mongo.db.timesheets.insert_one(doc)
    return doc


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.leaves.delete_many({"employee_email": "backdated-employee@naxrita.local"})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        admin, lead, employee = seed_users()
        existing_second_half = seed_second_fortnight_timesheet(employee, lead)

        client = app.test_client()
        results = []

        create_response = client.post(
            "/api/leaves/admin/backdated",
            json={
                "employee_id": str(employee["_id"]),
                "leave_type": "Sick",
                "start_date": "2026-06-14",
                "end_date": "2026-06-17",
                "reason": RUN_TAG,
                "recorded_by_name": "Backdated Admin",
            },
            headers=header(admin["_id"]),
        )
        assert_status(create_response, 201, "Create backdated leave regularization")
        results.append("PASS: admin can create backdated leave regularization")

        employee_timesheets_response = client.get(
            f"/api/timesheets/employee/{employee['_id']}",
            headers=header(employee["_id"]),
        )
        assert_status(employee_timesheets_response, 200, "Fetch employee timesheets after backdated leave")
        employee_timesheets = employee_timesheets_response.get_json()

        first_half = next(
            (item for item in employee_timesheets if item.get("period_start") == "2026-06-01" and item.get("period_end") == "2026-06-15"),
            None,
        )
        assert_true(first_half is not None, "Backdated leave should create a first-half timesheet when one does not exist")
        assert_true(first_half.get("auto_created_from_leave_sync") is True, "Auto-created leave-sync timesheet should be marked")
        first_half_leave_dates = sorted(
            entry.get("date")
            for entry in (first_half.get("entries") or [])
            if entry.get("entry_type") == "leave"
        )
        assert_true("2026-06-16" not in first_half_leave_dates, "First-half leave timesheet should not contain out-of-period entries")
        assert_true("2026-06-14" not in first_half_leave_dates, "Weekend leave date should not produce a weekday leave entry")
        results.append("PASS: missing fortnight timesheet is created for employee visibility")

        second_half = next(
            (item for item in employee_timesheets if item.get("_id") == str(existing_second_half["_id"])),
            None,
        )
        assert_true(second_half is not None, "Existing second-half timesheet should still be returned")
        second_half_leave_dates = sorted(
            entry.get("date")
            for entry in (second_half.get("entries") or [])
            if entry.get("entry_type") == "leave"
        )
        assert_true(second_half_leave_dates == ["2026-06-16", "2026-06-17"], "Existing overlapping timesheet should be refreshed with backdated leave entries")
        work_entry_dates = sorted(
            entry.get("date")
            for entry in (second_half.get("entries") or [])
            if entry.get("entry_type") == "work"
        )
        assert_true("2026-06-18" in work_entry_dates, "Non-overlapping work entries should remain after leave sync")
        results.append("PASS: existing fortnight timesheet is refreshed with backdated leave entries")

        print("Backdated leave timesheet sync test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.leaves.delete_many({"employee_email": "backdated-employee@naxrita.local"})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
