import os
import sys
from datetime import datetime, timedelta

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402
from routes.timesheet_routes import check_timesheet_escalations  # noqa: E402


RUN_TAG = "codex-timesheet-escalation-flow-2026-07-09"


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
    manager_id = ObjectId()
    lead_id = ObjectId()
    employee_id = ObjectId()
    users = [
        {
            "_id": admin_id,
            "name": "Escalation Admin",
            "email": "timesheet-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-TS-1",
            "adminMenuAccess": ["timesheets"],
            "testTag": RUN_TAG,
        },
        {
            "_id": manager_id,
            "name": "Escalation Manager",
            "email": "timesheet-manager@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-TS-1",
            "testTag": RUN_TAG,
        },
        {
            "_id": lead_id,
            "name": "Escalation Lead",
            "email": "timesheet-lead@naxrita.local",
            "role": "Manager",
            "employeeId": "LEAD-TS-1",
            "reportsTo": manager_id,
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Escalation Employee",
            "email": "timesheet-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-TS-1",
            "reportsTo": lead_id,
            "peopleLead": manager_id,
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users[0], users[1], users[2], users[3]


def seed_charge_code(employee):
    charge_code_id = ObjectId()
    mongo.db.charge_codes.insert_one({
        "_id": charge_code_id,
        "code": "ESC001",
        "name": "Escalation Project",
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


def draft_payload(employee, charge_code_id):
    return {
        "employee_id": str(employee["_id"]),
        "period_start": "2026-08-01",
        "period_end": "2026-08-15",
        "entries": [{
            "date": "2026-08-03",
            "entry_type": "work",
            "charge_code_id": str(charge_code_id),
            "hours": 9,
        }],
    }


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.notifications.delete_many({"message": {"$regex": "timesheet"}})
        mongo.db.timesheet_preferences.delete_many({"managed_by_admin_name": "Escalation Admin"})
        mongo.db.timesheets.delete_many({"employee_email": "timesheet-employee@naxrita.local"})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        admin, manager, lead, employee = seed_users()
        charge_code_id = seed_charge_code(employee)
        client = app.test_client()
        results = []

        save_draft = client.post(
            "/api/timesheets/save_draft",
            json=draft_payload(employee, charge_code_id),
            headers=header(employee["_id"]),
        )
        assert_status(save_draft, 200, "Save draft for escalation flow")
        timesheet_id = save_draft.get_json()["timesheet_id"]

        submit = client.put(
            f"/api/timesheets/submit/{timesheet_id}",
            headers=header(employee["_id"]),
        )
        assert_status(submit, 200, "Submit timesheet for escalation flow")
        submitted_doc = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        assert_true(submitted_doc.get("status") == "pending_lead", "Initial timesheet status should be pending_lead")
        assert_true(str(submitted_doc.get("current_approver_id")) == str(lead["_id"]), "Lead should be the first approver")
        results.append("PASS: timesheet starts with the direct lead as current approver")

        lead_pending = client.get(
            f"/api/timesheets/pending/lead/{lead['_id']}",
            headers=header(lead["_id"]),
        )
        assert_status(lead_pending, 200, "Lead pending queue")
        lead_items = lead_pending.get_json()
        assert_true(any(item.get("_id") == timesheet_id for item in lead_items), "Lead should see the submitted timesheet")
        results.append("PASS: lead queue includes the submitted timesheet")

        lead_approve = client.put(
            f"/api/timesheets/approve/lead/{timesheet_id}",
            json={"approved_by": str(lead["_id"]), "comments": "Approved by lead"},
            headers=header(lead["_id"]),
        )
        assert_status(lead_approve, 200, "Lead approve escalated timesheet")
        approved_doc = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        assert_true(approved_doc.get("status") == "approved", "Lead approval should fully approve the timesheet")
        assert_true(approved_doc.get("current_approver_id") is None, "Approved timesheet should not keep a current approver")
        assert_true(approved_doc.get("is_locked") is True, "Lead-approved timesheet should be locked")

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {"$set": {"submitted_at": datetime.utcnow() - timedelta(days=3)}},
        )
        approved_escalation_result = check_timesheet_escalations()
        still_approved_doc = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        assert_true(still_approved_doc.get("status") == "approved", "Approved timesheet should not be escalated")
        assert_true(still_approved_doc.get("escalation_level", 0) == 0, "Approved timesheet should keep escalation level unchanged")
        assert_true(approved_escalation_result.get("escalated_count", 0) == 0, "Escalation job should ignore approved timesheets")
        results.append("PASS: lead approval fully approves and prevents later escalation")

        second_draft = client.post(
            "/api/timesheets/save_draft",
            json={
                **draft_payload(employee, charge_code_id),
                "period_start": "2026-09-01",
                "period_end": "2026-09-15",
                "entries": [{
                    "date": "2026-09-01",
                    "entry_type": "work",
                    "charge_code_id": str(charge_code_id),
                    "hours": 9,
                }],
            },
            headers=header(employee["_id"]),
        )
        assert_status(second_draft, 200, "Save second draft")
        second_timesheet_id = second_draft.get_json()["timesheet_id"]
        second_submit = client.put(
            f"/api/timesheets/submit/{second_timesheet_id}",
            headers=header(employee["_id"]),
        )
        assert_status(second_submit, 200, "Submit second timesheet")
        mongo.db.timesheets.update_one(
            {"_id": ObjectId(second_timesheet_id)},
            {"$set": {"submitted_at": datetime.utcnow() - timedelta(days=3)}},
        )

        escalation_result = check_timesheet_escalations()
        escalated_doc = mongo.db.timesheets.find_one({"_id": ObjectId(second_timesheet_id)})
        assert_true(escalation_result.get("escalated_count", 0) >= 1, "Escalation job should escalate stale pending timesheets")
        assert_true(escalated_doc.get("status") == "pending_manager", "Stale lead-pending timesheet should escalate to pending_manager")
        assert_true(str(escalated_doc.get("current_approver_id")) == str(manager["_id"]), "Escalation should move approval to the next approver")
        results.append("PASS: timesheet escalation job advances stale approvals to the next approver")

        print("Timesheet escalation flow test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": "timesheet"}})
        mongo.db.timesheet_preferences.delete_many({"managed_by_admin_name": "Escalation Admin"})
        mongo.db.timesheets.delete_many({"employee_email": "timesheet-employee@naxrita.local"})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
