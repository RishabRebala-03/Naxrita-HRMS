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


RUN_TAG = "codex-timesheet-period-unlocks-2026-07-09"


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
    employee_id = ObjectId()
    users = [
        {
            "_id": admin_id,
            "name": "Unlock Admin",
            "email": "unlock-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-UNLOCK-1",
            "adminMenuAccess": ["timesheets"],
            "testTag": RUN_TAG,
        },
        {
            "_id": manager_id,
            "name": "Unlock Manager",
            "email": "unlock-manager@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-UNLOCK-1",
            "adminMenuAccess": ["timesheets"],
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Unlock Employee",
            "email": "unlock-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-UNLOCK-1",
            "reportsTo": manager_id,
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users[0], users[1], users[2]


def seed_charge_code(employee):
    charge_code_id = ObjectId()
    mongo.db.charge_codes.insert_one({
        "_id": charge_code_id,
        "code": "ULK001",
        "name": "Unlock Project",
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


def current_datetime(year, month, day):
    return datetime(year, month, day, 10, 0, 0)


def save_draft_payload(employee, charge_code_id, period_start="2026-07-01", period_end="2026-07-15"):
    return {
        "employee_id": str(employee["_id"]),
        "period_start": period_start,
        "period_end": period_end,
        "entries": [{
            "date": period_start,
            "entry_type": "work",
            "charge_code_id": str(charge_code_id),
            "hours": 9,
        }],
    }


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.timesheet_period_unlocks.delete_many({"employee_email": "unlock-employee@naxrita.local"})
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})
        mongo.db.system_settings.delete_one({"key": "global_timesheet_block_settings"})
        mongo.db.timesheet_block_overrides.delete_many({"notes": {"$regex": RUN_TAG}})

        admin, manager, employee = seed_users()
        charge_code_id = seed_charge_code(employee)
        client = app.test_client()
        results = []

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 13)):
            save_open = client.post(
                "/api/timesheets/save_draft",
                json=save_draft_payload(employee, charge_code_id),
                headers=header(employee["_id"]),
            )
            assert_status(save_open, 200, "First-half draft save before cutoff")
            results.append("PASS: employee can save the first-half timesheet before July 14")

        mongo.db.timesheets.delete_many({"employee_email": employee["email"]})

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 14)):
            blocked_save = client.post(
                "/api/timesheets/save_draft",
                json=save_draft_payload(employee, charge_code_id),
                headers=header(employee["_id"]),
            )
            assert_status(blocked_save, 400, "First-half draft save on cutoff day should be blocked")
            blocked_payload = blocked_save.get_json() or {}
            assert_true("14th onward" in (blocked_payload.get("error") or ""), "Blocked save should explain the 14th deadline")
            results.append("PASS: employee is blocked from saving the first-half timesheet on July 14")

            access_state = client.get(
                f"/api/timesheets/period-access?employee_id={employee['_id']}&period_start=2026-07-01&period_end=2026-07-15",
                headers=header(employee["_id"]),
            )
            assert_status(access_state, 200, "Employee period-access response")
            access_payload = access_state.get_json()
            assert_true(access_payload.get("entry_blocked") is True, "Period access should report blocked fortnight")
            results.append("PASS: period-access exposes blocked fortnight state to the UI")

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 13)):
            settings_response = client.put(
                "/api/timesheets/block-settings",
                json={"first_fortnight_block_day": 13, "second_fortnight_block_day": 27},
                headers=header(admin["_id"]),
            )
            assert_status(settings_response, 200, "Admin updates global timesheet block settings")
            settings_payload = settings_response.get_json() or {}
            assert_true(settings_payload.get("first_fortnight_block_day") == 13, "First-half block day should be saved")
            assert_true(settings_payload.get("second_fortnight_block_day") == 27, "Second-half block day should be saved")

            configured_access = client.get(
                f"/api/timesheets/period-access?employee_id={employee['_id']}&period_start=2026-07-01&period_end=2026-07-15",
                headers=header(employee["_id"]),
            )
            assert_status(configured_access, 200, "Period access after global block setting update")
            configured_payload = configured_access.get_json() or {}
            assert_true(configured_payload.get("entry_deadline_date") == "2026-07-13", "Configured first-half block date should map to the selected period")
            assert_true(configured_payload.get("entry_blocked") is True, "Configured block date should apply to all employees")
            results.append("PASS: admin-configured first-half block date applies globally")

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 14)):
            override_response = client.post(
                "/api/timesheets/block-settings/employee-overrides",
                json={
                    "employee_id": str(employee["_id"]),
                    "first_fortnight_block_day": 15,
                    "second_fortnight_block_day": 29,
                    "effective_start": "2026-07-01",
                    "effective_end": "2026-07-31",
                    "notes": f"{RUN_TAG} employee override",
                },
                headers=header(admin["_id"]),
            )
            assert_status(override_response, 200, "Admin saves employee-specific block override")

            override_access = client.get(
                f"/api/timesheets/period-access?employee_id={employee['_id']}&period_start=2026-07-01&period_end=2026-07-15",
                headers=header(employee["_id"]),
            )
            assert_status(override_access, 200, "Period access after employee-specific block override")
            override_payload = override_access.get_json() or {}
            assert_true(override_payload.get("block_rule_scope") == "employee", "Employee override should take precedence over global rule")
            assert_true(override_payload.get("entry_deadline_date") == "2026-07-15", "Employee override should map first-half block date")
            assert_true(override_payload.get("entry_blocked") is False, "Employee override should keep July 14 editable for this employee")
            results.append("PASS: employee-specific block date range overrides the global rule")

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 15)):
            inclusive_override_access = client.get(
                f"/api/timesheets/period-access?employee_id={employee['_id']}&period_start=2026-07-01&period_end=2026-07-15",
                headers=header(employee["_id"]),
            )
            assert_status(inclusive_override_access, 200, "Period access on employee-specific final editable day")
            assert_true(
                inclusive_override_access.get_json().get("entry_blocked") is False,
                "Employee-specific cutoff should keep the selected final day editable",
            )
            results.append("PASS: employee-specific cutoff date is inclusive")

        mongo.db.system_settings.delete_one({"key": "global_timesheet_block_settings"})
        mongo.db.timesheet_block_overrides.delete_many({"notes": {"$regex": RUN_TAG}})

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 8, 18)):
            august_save = client.post(
                "/api/timesheets/save_draft",
                json=save_draft_payload(employee, charge_code_id, "2026-08-01", "2026-08-15"),
                headers=header(employee["_id"]),
            )
            assert_status(august_save, 200, "August 2026 first-half draft save after cutoff should remain editable")

            august_access = client.get(
                f"/api/timesheets/period-access?employee_id={employee['_id']}&period_start=2026-08-01&period_end=2026-08-15",
                headers=header(employee["_id"]),
            )
            assert_status(august_access, 200, "August 2026 period-access response")
            august_payload = august_access.get_json() or {}
            assert_true(august_payload.get("entry_blocked") is False, "August 2026 should not be blocked by the cutoff")
            results.append("PASS: August 2026 first-half timesheet stays editable after the cutoff")

        mongo.db.timesheets.delete_many({"employee_email": employee["email"]})

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 8, 28)):
            august_second_half_save = client.post(
                "/api/timesheets/save_draft",
                json=save_draft_payload(employee, charge_code_id, "2026-08-16", "2026-08-31"),
                headers=header(employee["_id"]),
            )
            assert_status(august_second_half_save, 200, "August 2026 second-half draft save on cutoff should remain editable")
            results.append("PASS: August 2026 second-half timesheet stays editable on and after the cutoff")

        mongo.db.timesheets.delete_many({"employee_email": employee["email"]})

        with patch("routes.timesheet_routes.now_ist", return_value=current_datetime(2026, 7, 14)):
            forbidden_unlock = client.put(
                "/api/timesheets/period-unlocks",
                json={
                    "employee_id": str(employee["_id"]),
                    "period_start": "2026-07-01",
                    "period_end": "2026-07-15",
                    "unlocked": True,
                    "notes": "Manager attempted override",
                },
                headers=header(manager["_id"]),
            )
            assert_status(forbidden_unlock, 403, "Non-admin unlock attempt")
            results.append("PASS: delegated timesheet users cannot manage fortnight unblocks")

            admin_unlock = client.put(
                "/api/timesheets/period-unlocks",
                json={
                    "employee_id": str(employee["_id"]),
                    "period_start": "2026-07-01",
                    "period_end": "2026-07-15",
                    "unlocked": True,
                    "notes": "Admin reopened missed fortnight",
                },
                headers=header(admin["_id"]),
            )
            assert_status(admin_unlock, 200, "Admin unlock blocked fortnight")
            unlock_payload = admin_unlock.get_json()
            assert_true(unlock_payload.get("unlock_active") is True, "Unlock should become active")
            results.append("PASS: full admin can unblock a blocked fortnight for any employee")

            unlocked_save = client.post(
                "/api/timesheets/save_draft",
                json=save_draft_payload(employee, charge_code_id),
                headers=header(employee["_id"]),
            )
            assert_status(unlocked_save, 200, "Save draft after admin unlock")
            results.append("PASS: employee can save the blocked fortnight after admin unlock")

            admin_relock = client.put(
                "/api/timesheets/period-unlocks",
                json={
                    "employee_id": str(employee["_id"]),
                    "period_start": "2026-07-01",
                    "period_end": "2026-07-15",
                    "unlocked": False,
                    "notes": "Admin reblocked the fortnight",
                },
                headers=header(admin["_id"]),
            )
            assert_status(admin_relock, 200, "Admin reblock fortnight")
            relock_payload = admin_relock.get_json()
            assert_true(relock_payload.get("entry_blocked") is True, "Reblocked fortnight should return to blocked state")
            results.append("PASS: admin can block the fortnight again after the override")

        print("Timesheet period unlock test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.system_settings.delete_one({"key": "global_timesheet_block_settings"})
        mongo.db.timesheet_block_overrides.delete_many({"notes": {"$regex": RUN_TAG}})
        mongo.db.timesheet_period_unlocks.delete_many({"employee_email": "unlock-employee@naxrita.local"})
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
        mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
