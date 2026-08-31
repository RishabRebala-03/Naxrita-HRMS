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


RUN_TAG = "codex-timesheet-edit-window-2026-07-06"


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
            "name": "Window Admin",
            "email": "window-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-WINDOW-1",
            "testTag": RUN_TAG,
        },
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
    return users[0], users[1], users[2]


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
        mongo.db.timesheet_period_unlocks.delete_many({"employee_email": "window-employee@naxrita.local"})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        admin, lead, employee = seed_users()
        charge_code_id = seed_charge_code(employee)
        first_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-07-01", "2026-07-15")
        second_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-07-16", "2026-07-31")
        august_first_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-08-01", "2026-08-15")
        august_second_half = seed_approved_timesheet(employee, lead, charge_code_id, "2026-08-16", "2026-08-31")

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
            assert_true(bool(submitted_doc.get("resubmitted_after_approval_at")), "Resubmitted approved timesheet should record a reapproval submission timestamp")
            pending_again = client.get(
                f"/api/timesheets/pending/lead/{lead['_id']}",
                headers=header(lead["_id"]),
            )
            assert_status(pending_again, 200, "Lead pending list after approved-window resubmission")
            pending_items = pending_again.get_json()
            assert_true(any(item.get("_id") == str(first_half["_id"]) for item in pending_items), "Resubmitted approved timesheet should reappear for the same lead approver")
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

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 14)):
            update_response = client.put(
                f"/api/timesheets/update/{first_half['_id']}",
                json={"entries": [{"date": "2026-07-01", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 7.5}]},
                headers=header(employee["_id"]),
            )
            assert_status(update_response, 200, "Approved first-half edit on July 14")
            results.append("PASS: first-half approved timesheet can still be edited on July 14")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 15)):
            blocked = client.put(
                f"/api/timesheets/update/{first_half['_id']}",
                json={"entries": [{"date": "2026-07-01", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 6}]},
                headers=header(employee["_id"]),
            )
            assert_status(blocked, 400, "Approved first-half edit should be blocked after July 14 window")
            results.append("PASS: first-half approved timesheet stays locked again on July 15")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 27)):
            update_response = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 7}]},
                headers=header(employee["_id"]),
            )
            assert_status(update_response, 200, "Approved second-half edit in 27-28 window")
            results.append("PASS: second-half approved timesheet can be edited on July 27")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 28)):
            blocked = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 6.5}]},
                headers=header(employee["_id"]),
            )
            assert_status(blocked, 400, "Approved second-half edit should be blocked after July 27 window")
            results.append("PASS: second-half approved timesheet stays locked again on July 28")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 7, 29)):
            blocked = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 6}]},
                headers=header(employee["_id"]),
            )
            assert_status(blocked, 400, "Approved second-half edit should be blocked outside 27-28 window")
            results.append("PASS: second-half approved timesheet stays locked outside the 27-28 window")

            admin_unlock = client.put(
                "/api/timesheets/period-unlocks",
                json={
                    "employee_id": str(employee["_id"]),
                    "period_start": "2026-07-16",
                    "period_end": "2026-07-31",
                    "unlocked": True,
                    "notes": "Admin reopened approved fortnight",
                },
                headers=header(admin["_id"]),
            )
            assert_status(admin_unlock, 200, "Admin unlocks approved second-half timesheet")

            employee_timesheets = client.get(
                f"/api/timesheets/employee/{employee['_id']}",
                headers=header(employee["_id"]),
            )
            assert_status(employee_timesheets, 200, "Employee timesheet list after admin unlock")
            items = employee_timesheets.get_json()
            unlocked_item = next(item for item in items if item["_id"] == str(second_half["_id"]))
            assert_true(unlocked_item.get("period_unlock_active") is True, "Employee list should show the admin unlock")
            assert_true(unlocked_item.get("is_employee_editable") is True, "Admin-unlocked approved timesheet should be editable")

            unlocked_update = client.put(
                f"/api/timesheets/update/{second_half['_id']}",
                json={"entries": [{"date": "2026-07-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 6}]},
                headers=header(employee["_id"]),
            )
            assert_status(unlocked_update, 200, "Employee edits approved timesheet after admin unlock")
            results.append("PASS: admin unlock makes approved timesheet visible as editable to the employee")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 8, 18)):
            employee_timesheets = client.get(
                f"/api/timesheets/employee/{employee['_id']}",
                headers=header(employee["_id"]),
            )
            assert_status(employee_timesheets, 200, "Employee timesheet list during August exemption")
            items = employee_timesheets.get_json()
            august_item = next(item for item in items if item["_id"] == str(august_first_half["_id"]))
            assert_true(august_item.get("approved_edit_window_open") is True, "August approved timesheet should advertise editability")
            assert_true(august_item.get("is_employee_editable") is True, "August approved timesheet should be employee editable")

            august_update = client.put(
                f"/api/timesheets/update/{august_first_half['_id']}",
                json={"entries": [{"date": "2026-08-01", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 8}]},
                headers=header(employee["_id"]),
            )
            assert_status(august_update, 200, "Approved August first-half edit after normal window")
            august_updated_doc = mongo.db.timesheets.find_one({"_id": august_first_half["_id"]})
            assert_true(august_updated_doc.get("status") == "draft", "Editing approved August timesheet should reopen it as draft")
            results.append("PASS: August approved first-half timesheet can be edited on August 18")

        with patch("routes.timesheet_routes.now_ist", return_value=approved_window_datetime(2026, 9, 5)):
            august_later_update = client.put(
                f"/api/timesheets/update/{august_second_half['_id']}",
                json={"entries": [{"date": "2026-08-16", "entry_type": "work", "charge_code_id": str(charge_code_id), "hours": 8}]},
                headers=header(employee["_id"]),
            )
            assert_status(august_later_update, 200, "Approved August second-half edit after August should remain exempt")
            results.append("PASS: August approved second-half timesheet remains editable after August")

        print("Approved timesheet edit window test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.timesheet_period_unlocks.delete_many({"employee_email": "window-employee@naxrita.local"})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
