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


RUN_TAG = "codex-timesheet-admin-preferences-2026-07-06"


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
    default_lead_id = ObjectId()
    configured_approver_id = ObjectId()
    employee_id = ObjectId()
    users = [
        {
            "_id": admin_id,
            "name": "Prefs Admin",
            "email": "prefs-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-PREFS-1",
            "adminMenuAccess": ["timesheets"],
            "testTag": RUN_TAG,
        },
        {
            "_id": default_lead_id,
            "name": "Default Lead",
            "email": "default-lead@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-PREFS-1",
            "testTag": RUN_TAG,
        },
        {
            "_id": configured_approver_id,
            "name": "Configured Approver",
            "email": "configured-approver@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-PREFS-2",
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Prefs Employee",
            "email": "prefs-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-PREFS-1",
            "reportsTo": default_lead_id,
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users[0], users[1], users[2], users[3]


def seed_charge_code(employee):
    charge_code_id = ObjectId()
    mongo.db.charge_codes.insert_one({
        "_id": charge_code_id,
        "code": "PREF001",
        "name": "Preference Project",
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


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.email_logs.delete_many({"subject": {"$regex": "Prefs Employee"}})
        mongo.db.timesheet_preferences.delete_many({"managed_by_admin_name": "Prefs Admin"})
        mongo.db.timesheets.delete_many({"employee_email": "prefs-employee@naxrita.local"})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        admin, default_lead, configured_approver, employee = seed_users()
        charge_code_id = seed_charge_code(employee)
        client = app.test_client()
        results = []

        save_preferences = client.put(
            "/api/timesheets/preferences",
            json={
                "employee_id": str(employee["_id"]),
                "period_start": "2026-07-01",
                "period_end": "2026-07-15",
                "reviewers": ["reviewer.one@naxrita.local"],
                "notifications": ["notify.one@naxrita.local", "notify.two@naxrita.local"],
                "delegates": ["delegate.one@naxrita.local"],
                "approvers": [configured_approver["email"], "external-approver@naxrita.local"],
            },
            headers=header(admin["_id"]),
        )
        assert_status(save_preferences, 200, "Save admin timesheet preferences")
        saved_payload = save_preferences.get_json()
        assert_true(saved_payload.get("managed_by_admin_name") == "Prefs Admin", "Saved preferences should record the admin name")
        results.append("PASS: admin can save per-employee per-fortnight workflow preferences")

        save_draft = client.post(
            "/api/timesheets/save_draft",
            json={
                "employee_id": str(employee["_id"]),
                "period_start": "2026-07-01",
                "period_end": "2026-07-15",
                "entries": [{
                    "date": "2026-07-01",
                    "entry_type": "work",
                    "charge_code_id": str(charge_code_id),
                    "hours": 9,
                }],
            },
            headers=header(employee["_id"]),
        )
        assert_status(save_draft, 200, "Save draft with admin-managed preferences")
        timesheet_id = save_draft.get_json()["timesheet_id"]

        submit = client.put(
            f"/api/timesheets/submit/{timesheet_id}",
            headers=header(employee["_id"]),
        )
        assert_status(submit, 200, "Submit timesheet with admin-managed preferences")

        submitted_doc = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        assert_true(submitted_doc.get("status") == "pending_lead", "Submitted timesheet should enter pending lead status")
        assert_true(str(submitted_doc.get("reporting_lead_id")) == str(configured_approver["_id"]), "Configured approver email should override routing lead when it matches a user")
        workflow = submitted_doc.get("timesheet_workflow_preferences") or {}
        assert_true(workflow.get("approvers") == [configured_approver["email"], "external-approver@naxrita.local"], "Timesheet should snapshot configured approver emails")
        assert_true(workflow.get("notifications") == ["notify.one@naxrita.local", "notify.two@naxrita.local"], "Timesheet should snapshot configured notification emails")
        results.append("PASS: submitted timesheet snapshots admin workflow preferences and routes to configured approver")

        pending_for_configured = client.get(
            f"/api/timesheets/pending/lead/{configured_approver['_id']}",
            headers=header(configured_approver["_id"]),
        )
        assert_status(pending_for_configured, 200, "Configured approver pending queue")
        pending_items = pending_for_configured.get_json()
        assert_true(any(item.get("_id") == timesheet_id for item in pending_items), "Configured approver should see the timesheet in their pending queue")
        results.append("PASS: configured approver can review the submitted timesheet in-app")

        email_logs = list(mongo.db.email_logs.find({"metadata.timesheet_id": timesheet_id}))
        approver_mail = next((item for item in email_logs if item.get("mail_type") == "timesheet_approval_request"), None)
        notification_mail = next((item for item in email_logs if item.get("mail_type") == "timesheet_submission_notification"), None)
        assert_true(approver_mail is not None, "Approver email log should be queued")
        assert_true(notification_mail is not None, "Notification email log should be queued")
        assert_true(configured_approver["email"] in (approver_mail.get("recipients") or []), "Approver queue should include configured approver email")
        assert_true("notify.one@naxrita.local" in (notification_mail.get("recipients") or []), "Notification queue should include configured notification email")
        results.append("PASS: submission queues emails to configured approvers and notification recipients")

        notification = mongo.db.notifications.find_one({
            "user_id": configured_approver["_id"],
            "type": "timesheet_submitted",
            "related_timesheet_id": ObjectId(timesheet_id),
        })
        assert_true(notification is not None, "Configured approver should receive an in-app notification")
        results.append("PASS: configured approver receives an in-app submission notification")

        print("Timesheet admin preferences test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.email_logs.delete_many({"subject": {"$regex": "Prefs Employee"}})
        mongo.db.timesheet_preferences.delete_many({"managed_by_admin_name": "Prefs Admin"})
        mongo.db.timesheets.delete_many({"employee_email": "prefs-employee@naxrita.local"})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
