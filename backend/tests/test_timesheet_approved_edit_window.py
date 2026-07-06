import os
import sys
from datetime import datetime
from unittest.mock import patch

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


RUN_TAG = "codex-timesheet-edit-window-2026-07-03"


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
    lead_id = ObjectId()
    employee_id = ObjectId()
    users = [
        {
            "_id": lead_id,
            "name": "Window Lead",
            "email": "window-lead@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-WINDOW-1",
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Window Employee",
            "email": "window-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-WINDOW-1",
            "reportsTo": lead_id,
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users[0], users[1]


def seed_charge_code(employee):
    charge_code_id = ObjectId()
    mongo.db.charge_codes.insert_one({
        "_id": charge_code_id,
        "code": "WIN001",
        "name": "Window Project",
        "is_active": True,
        "testTag": RUN_TAG,
    })
    mongo.db.charge_code_assignments.insert_one({
        "_id": ObjectId(),
        "employee_id": employee["_id"],
        "charge_code_id": charge_code_id,
        "is_active": True,
        "testTag": RUN_TAG,
    })
    return charge_code_id


def seed_approved_timesheet(employee, lead, charge_code_id, period_start, period_end):
    now = datetime.utcnow()
    doc = {
        "_id": ObjectId(),
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "QA",
        "period_start": period_start,
        "period_end": period_end,
        "entries": [
            {
                "_id": ObjectId(),
                "date": period_start,
                "hours": 9,
                "entry_type": "work",
                "charge_code_id": charge_code_id,
                "charge_code": "WIN001",
                "charge_code_name": "Window Project",
                "description": "",
            }
        ],
        "daily_overtime": {},
        "holiday_payout": {},
        "work_schedule_by_date": {},
        "total_hours": 9,
        "work_hours": 9,
        "status": "approved",
        "reporting_lead_id": lead["_id"],
        "lead_approved_at": now,
        "lead_approved_by": lead["name"],
        "lead_approved_by_id": lead["_id"],
        "submitted_at": now,
        "updated_at": now,
        "approval_history": [
            {
                "stage": "lead",
                "action": "approved",
                "approver_id": lead["_id"],
                "approver_name": lead["name"],
                "comments": "Initial approval",
                "timestamp": now,
            }
        ],
        "is_locked": True,
        "testTag": RUN_TAG,
    }
    mongo.db.timesheets.insert_one(doc)
    return doc


def approved_window_datetime(year, month, day):
    return datetime(year, month, day, 10, 0, 0)


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        lead, employee = seed_users()
        charge_code_id = seed_charge_code(employee)
        first_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-07-01", "2026-07-15")
        second_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-07-16", "2026-07-31")

        client = app.test_client()
        results = []

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 12)):
            blocked = client.put(
                f"/api/timesheets/update/{first_half['_id']}",
                json={"entries": [{"date": "2026-07-01", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 8}]},
                headers=header(employee["_id"]),
            )
            assert_status(blocked, 400, "Approved first-half edit should be blocked outside 13-14 window")
            results.append("PASS: first-half approved timesheet stays locked outside the 13-14 window")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 13)):
            employee_timesheets = client.get(
                f"/api/timesheets/employee/{employee['_id']}",
                headers=header(employee["_id"]),
            )
            assert_status(employee_timesheets, 200, "Employee timesheet list on first-half window")
            items = employee_timesheets.get_json()
            first_item = next(item for item in items if item["_id"] == str(first_half["_id"]))
            assert_true(first_item.get("approved_edit_window_open") is True, "First-half timesheet should advertise edit window")

            update_response = client.put(
                f"/api/timesheets/update/{first_half['_id']}",
                json={"entries": [{"date": "2026-07-01", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 8}]},
                headers=header(employee["_id"]),
            )
            assert_status(update_response, 200, "Approved first-half edit in window")
            updated_doc = mongo.db.timesheets.find_one({"_id": first_half["_id"]})
            assert_true(updated_doc.get("status") == "draft", "Editing approved timesheet should reopen it as draft")
            assert_true(updated_doc.get("reopened_from_approved") is True, "Reopened approved timesheet should be marked")

            submit_response = client.put(
                f"/api/timesheets/submit/{first_half['_id']}",
                headers=header(employee["_id"]),
            )
            assert_status(submit_response, 200, "Resubmit reopened first-half timesheet")
            submitted_doc = mongo.db.timesheets.find_one({"_id": first_half["_id"]})
            assert_true(submitted_doc.get("status") == "pending_lead", "Resubmitted reopened timesheet should return to pending lead approval")
            results.append("PASS: first-half approved timesheet can be edited on July 13 and resubmitted for lead approval")

            approve_response = client.put(
                f"/api/timesheets/approve/lead/{first_half['_id']}",
                json={"approved_by": str(lead["_id"]), "comments": "Reapproved after correction"},
                headers=header(lead["_id"]),
            )
            assert_status(approve_response, 200, "Lead re-approval after approved-window resubmission")
            reapproved_doc = mongo.db.timesheets.find_one({"_id": first_half["_id"]})
            approved_actions = [
                item for item in (reapproved_doc.get("approval_history") or [])
                if item.get("stage") == "lead" and item.get("action") == "approved"
            ]
            assert_true(len(approved_actions) >= 2, "Reapproval should add a second lead approved history entry")
            results.append("PASS: resubmitted approved timesheet goes through lead approval again")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 27)):
            update_response = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 7}]},
                headers=header(employee["_id"]),
            )
            assert_status(update_response, 200, "Approved second-half edit in 27-28 window")
            results.append("PASS: second-half approved timesheet can be edited on July 27")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 29)):
            blocked = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 6}]},
                headers=header(employee["_id"]),
            )
            assert_status(blocked, 400, "Approved second-half edit should be blocked outside 27-28 window")
            results.append("PASS: second-half approved timesheet stays locked outside the 27-28 window")

        print("Approved timesheet edit window test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
