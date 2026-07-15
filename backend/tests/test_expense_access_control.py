import os
import sys
from io import BytesIO

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


RUN_TAG = "codex-expense-access-2026-07-15"


def header(user):
    return {"X-User-Id": str(user["_id"])}


def assert_status(response, expected, message):
    if response.status_code != expected:
        raise AssertionError(
            f"{message}: expected {expected}, got {response.status_code}, "
            f"payload={response.get_json(silent=True)}"
        )


def seed_users():
    users = {
        "employee": {
            "_id": ObjectId(), "name": "Expense Employee", "email": "expense.employee@naxrita.local",
            "role": "Employee", "department": "Engineering", "testTag": RUN_TAG,
        },
        "outsider": {
            "_id": ObjectId(), "name": "Other Employee", "email": "other.employee@naxrita.local",
            "role": "Employee", "department": "QA", "testTag": RUN_TAG,
        },
        "manager": {
            "_id": ObjectId(), "name": "Regular Manager", "email": "expense.manager@naxrita.local",
            "role": "Manager", "adminMenuAccess": [], "testTag": RUN_TAG,
        },
        "reviewer": {
            "_id": ObjectId(), "name": "Expense Reviewer", "email": "expense.reviewer@naxrita.local",
            "role": "Manager", "adminMenuAccess": ["timesheets"], "testTag": RUN_TAG,
        },
        "admin": {
            "_id": ObjectId(), "name": "Expense Admin", "email": "expense.admin@naxrita.local",
            "role": "Admin", "testTag": RUN_TAG,
        },
    }
    mongo.db.users.insert_many(list(users.values()))
    return users


def cleanup():
    expenses = list(mongo.db.expenses.find({"testTag": RUN_TAG}))
    for expense in expenses:
        filename = (expense.get("document") or {}).get("filename")
        if filename:
            path = os.path.join(ROOT_DIR, "static", "expense_documents", os.path.basename(filename))
            if os.path.isfile(path):
                os.remove(path)
    user_ids = [user["_id"] for user in mongo.db.users.find({"testTag": RUN_TAG}, {"_id": 1})]
    if user_ids:
        mongo.db.expenses.delete_many({"employee_id": {"$in": user_ids}})
    mongo.db.users.delete_many({"testTag": RUN_TAG})


def create_claim(client, employee, amount=125.50, expense_date="2026-07-15"):
    response = client.post(
        "/api/expenses",
        headers=header(employee),
        json={
            "employee_id": str(employee["_id"]),
            "expense_date": expense_date,
            "category": "Telecom/Internet",
            "amount": amount,
            "currency": "INR",
            "description": "Monthly internet reimbursement",
            "public_official_over_25": False,
            "no_vendor_gst_number": True,
        },
    )
    assert_status(response, 201, "Create own expense")
    return response.get_json()


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        cleanup()
        users = seed_users()
        client = app.test_client()

        assert_status(client.get("/api/expenses"), 401, "Unauthenticated list")

        claim = create_claim(client, users["employee"])
        mongo.db.expenses.update_one({"_id": ObjectId(claim["_id"])}, {"$set": {"testTag": RUN_TAG}})

        forged = client.post(
            "/api/expenses",
            headers=header(users["employee"]),
            json={
                "employee_id": str(users["outsider"]["_id"]),
                "expense_date": "2026-07-15",
                "category": "Other Expense",
                "amount": 50,
            },
        )
        assert_status(forged, 403, "Employee create for another employee")

        own_list = client.get(
            f"/api/expenses?employee_id={users['outsider']['_id']}",
            headers=header(users["employee"]),
        )
        assert_status(own_list, 200, "Employee own list")
        assert all(item["employee_id"] == str(users["employee"]["_id"]) for item in own_list.get_json())

        assert_status(
            client.put(f"/api/expenses/{claim['_id']}", headers=header(users["outsider"]), json={"amount": 1}),
            403,
            "Other employee update",
        )
        assert_status(
            client.get("/api/expenses?role=Admin", headers=header(users["manager"])),
            403,
            "Regular manager admin list",
        )
        assert_status(
            client.get("/api/expenses?role=Admin", headers=header(users["reviewer"])),
            200,
            "Delegated reviewer admin list",
        )
        assert_status(
            client.put(
                f"/api/expenses/{claim['_id']}/approve",
                headers=header(users["admin"]),
                json={"approver_name": users["admin"]["name"]},
            ),
            400,
            "Admin cannot approve draft",
        )

        upload = client.post(
            f"/api/expenses/{claim['_id']}/document",
            headers=header(users["employee"]),
            data={"document": (BytesIO(b"receipt"), "receipt.txt")},
            content_type="multipart/form-data",
        )
        assert_status(upload, 200, "Employee receipt upload")

        submit = client.post(
            "/api/expenses/submit",
            headers=header(users["employee"]),
            json={"employee_id": str(users["employee"]["_id"]), "expense_date": "2026-07-15"},
        )
        assert_status(submit, 200, "Employee submit")

        approve = client.put(
            f"/api/expenses/{claim['_id']}/approve",
            headers=header(users["reviewer"]),
            json={"approved_expense_date": "2026-07-15"},
        )
        assert_status(approve, 200, "Delegated reviewer approval")
        assert approve.get_json()["status"] == "approved"

        assert_status(
            client.delete(f"/api/expenses/{claim['_id']}", headers=header(users["employee"])),
            400,
            "Approved expense cannot be deleted",
        )

        rejected_claim = create_claim(client, users["employee"], amount=80, expense_date="2026-07-16")
        assert_status(
            client.put(
                f"/api/expenses/{rejected_claim['_id']}",
                headers=header(users["employee"]),
                json={"amount": 90, "description": "Updated claim"},
            ),
            200,
            "Employee update draft",
        )
        assert_status(
            client.post(
                "/api/expenses/submit",
                headers=header(users["employee"]),
                json={"expense_date": "2026-07-16"},
            ),
            200,
            "Employee submit without redundant employee id",
        )
        rejected = client.put(
            f"/api/expenses/{rejected_claim['_id']}/reject",
            headers=header(users["admin"]),
            json={"rejection_comments": "Receipt details are incomplete"},
        )
        assert_status(rejected, 200, "Admin reject submitted expense")
        assert rejected.get_json()["status"] == "rejected"

        disposable_claim = create_claim(client, users["employee"], amount=25, expense_date="2026-07-17")
        assert_status(
            client.delete(f"/api/expenses/{disposable_claim['_id']}", headers=header(users["employee"])),
            200,
            "Employee delete draft",
        )

        print("Expense access control and workflow tests passed")
        cleanup()


if __name__ == "__main__":
    run()
