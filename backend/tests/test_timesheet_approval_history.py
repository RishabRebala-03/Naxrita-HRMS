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


RUN_TAG = "codex-timesheet-approval-history-2026-09-25"


def header(user_id):
    return {"X-User-Id": str(user_id)}


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})

        approver_id = ObjectId()
        other_user_id = ObjectId()
        employee_id = ObjectId()
        mongo.db.users.insert_many([
            {
                "_id": approver_id,
                "name": "History Approver",
                "email": "history-approver@naxrita.local",
                "role": "Manager",
                "testTag": RUN_TAG,
            },
            {
                "_id": other_user_id,
                "name": "Other User",
                "email": "other-user@naxrita.local",
                "role": "Manager",
                "testTag": RUN_TAG,
            },
            {
                "_id": employee_id,
                "name": "History Employee",
                "email": "history-employee@naxrita.local",
                "role": "Employee",
                "testTag": RUN_TAG,
            },
        ])

        recorded_id = ObjectId()
        legacy_id = ObjectId()
        unrelated_id = ObjectId()
        mongo.db.timesheets.insert_many([
            {
                "_id": recorded_id,
                "employee_id": employee_id,
                "employee_name": "History Employee",
                "period_start": "2026-09-01",
                "period_end": "2026-09-15",
                "status": "approved",
                "approval_history": [{
                    "action": "approved",
                    "approver_id": approver_id,
                    "approver_name": "History Approver",
                    "timestamp": datetime.utcnow(),
                }],
                "testTag": RUN_TAG,
            },
            {
                "_id": legacy_id,
                "employee_id": employee_id,
                "employee_name": "History Employee",
                "period_start": "2026-08-16",
                "period_end": "2026-08-31",
                "status": "approved",
                "lead_approved_by": "History Approver",
                "lead_approved_at": datetime.utcnow(),
                "testTag": RUN_TAG,
            },
            {
                "_id": unrelated_id,
                "employee_id": employee_id,
                "period_start": "2026-08-01",
                "period_end": "2026-08-15",
                "status": "approved",
                "approval_history": [{
                    "action": "approved",
                    "approver_id": other_user_id,
                    "approver_name": "Other User",
                    "timestamp": datetime.utcnow(),
                }],
                "testTag": RUN_TAG,
            },
        ])

        client = app.test_client()
        history_response = client.get(
            f"/api/timesheets/approval-history/{approver_id}",
            headers=header(approver_id),
        )
        assert_true(history_response.status_code == 200, "Approver history should load")
        returned_ids = {item["_id"] for item in history_response.get_json()}
        assert_true(str(recorded_id) in returned_ids, "Recorded approval should appear")
        assert_true(str(legacy_id) in returned_ids, "Legacy approval should appear")
        assert_true(str(unrelated_id) not in returned_ids, "Other approvers' history must not appear")

        forbidden_response = client.get(
            f"/api/timesheets/approval-history/{approver_id}",
            headers=header(other_user_id),
        )
        assert_true(forbidden_response.status_code == 403, "Users must not read another approver's history")
        print("PASS: timesheet approval history includes recorded and legacy approvals for the approver only")

    with app.app_context():
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
