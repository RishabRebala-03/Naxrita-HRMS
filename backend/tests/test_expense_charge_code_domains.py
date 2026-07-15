import os
import sys

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


RUN_TAG = "codex-expense-charge-code-domains-2026-07-10"


def header(user_id):
    return {"X-User-Id": str(user_id)}


def assert_status(response, expected, message):
    if response.status_code != expected:
        try:
            payload = response.get_json()
        except Exception:
            payload = response.data.decode("utf-8", errors="ignore")
        raise AssertionError(
            f"{message}: expected {expected}, got {response.status_code}, payload={payload}"
        )


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def seed_users():
    admin_id = ObjectId()
    employee_id = ObjectId()
    mongo.db.users.insert_many([
        {
            "_id": admin_id,
            "name": "Expense Admin",
            "email": "expense-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-EXP-1",
            "adminMenuAccess": ["timesheets"],
            "testTag": RUN_TAG,
        },
        {
            "_id": employee_id,
            "name": "Expense Employee",
            "email": "expense-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-EXP-1",
            "department": "Finance",
            "testTag": RUN_TAG,
        },
    ])
    return admin_id, employee_id


def seed_charge_code(employee_id, code, name, domain):
    charge_code_id = ObjectId()
    mongo.db.charge_codes.insert_one({
        "_id": charge_code_id,
        "code": code,
        "name": name,
        "domain": domain,
        "is_active": True,
        "testTag": RUN_TAG,
    })
    mongo.db.charge_code_assignments.insert_one({
        "_id": ObjectId(),
        "employee_id": employee_id,
        "employee_name": "Expense Employee",
        "charge_code_id": charge_code_id,
        "charge_code": code,
        "charge_code_name": name,
        "domain": domain,
        "is_active": True,
        "testTag": RUN_TAG,
    })
    return charge_code_id


def cleanup():
    mongo.db.expenses.delete_many({"employee_email": "expense-employee@naxrita.local"})
    mongo.db.charge_code_assignments.delete_many({"testTag": RUN_TAG})
    mongo.db.charge_codes.delete_many({"testTag": RUN_TAG})
    mongo.db.users.delete_many({"testTag": RUN_TAG})


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        cleanup()
        admin_id, employee_id = seed_users()
        seed_charge_code(employee_id, "TIME001", "Timesheet Project", "time")
        seed_charge_code(employee_id, "EXP001", "Expense Travel", "expense")

        client = app.test_client()

        expense_codes = client.get(
            f"/api/charge_codes/employee/{employee_id}?active_only=true&include_existing=false&domain=expense",
            headers=header(admin_id),
        )
        assert_status(expense_codes, 200, "Fetch expense charge codes")
        expense_payload = expense_codes.get_json()
        assert_true(len(expense_payload) == 1, "Only one expense charge code should be returned")
        assert_true(expense_payload[0]["charge_code"] == "EXP001", "Expense dropdown should exclude time charge codes")

        bad_expense = client.post(
            "/api/expenses",
            json={
                "employee_id": str(employee_id),
                "expense_date": "2026-07-10",
                "category": "Other Expense",
                "client_code": "TIME001",
                "amount": 1200,
                "description": "Should fail for time charge code",
            },
            headers=header(employee_id),
        )
        assert_status(bad_expense, 400, "Reject expense creation with time charge code")

        good_expense = client.post(
            "/api/expenses",
            json={
                "employee_id": str(employee_id),
                "expense_date": "2026-07-10",
                "category": "Other Expense",
                "client_code": "EXP001",
                "amount": 1200,
                "description": "Valid expense charge code",
            },
            headers=header(employee_id),
        )
        assert_status(good_expense, 201, "Create expense with assigned expense charge code")
        created = good_expense.get_json()
        assert_true(created.get("client_code") == "EXP001", "Expense should store the expense charge code")
        assert_true(created.get("charge_code_name") == "Expense Travel", "Expense should snapshot charge code metadata")

        admin_expense_codes = client.get(
            "/api/charge_codes/all?active_only=true&domain=expense",
            headers=header(admin_id),
        )
        assert_status(admin_expense_codes, 200, "Admin expense charge code list")
        admin_codes = admin_expense_codes.get_json()
        assert_true(
            all(item.get("domain") == "expense" for item in admin_codes),
            "Admin expense charge code list should stay isolated to expense-domain records",
        )

        print("Expense charge code domain test results")
        print("PASS: expense dropdown excludes time charge codes")
        print("PASS: expense API rejects time-domain charge codes")
        print("PASS: expense API accepts assigned expense-domain charge codes")
        print("PASS: admin expense charge code list stays segregated")

        cleanup()


if __name__ == "__main__":
    run()
