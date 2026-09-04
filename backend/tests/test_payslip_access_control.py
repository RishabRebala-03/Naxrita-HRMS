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


RUN_TAG = "codex-payslip-access-2026-07-06"


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
    admin = {
        "_id": ObjectId(),
        "name": "Payslip Admin",
        "email": "payslip-admin@naxrita.local",
        "role": "Admin",
        "employeeId": "ADM-PS-1",
        "adminMenuAccess": ["payslips"],
        "testTag": RUN_TAG,
    }
    manager = {
        "_id": ObjectId(),
        "name": "Payslip Manager",
        "email": "payslip-manager@naxrita.local",
        "role": "Manager",
        "employeeId": "MGR-PS-1",
        "adminMenuAccess": [],
        "testTag": RUN_TAG,
    }
    delegated_manager = {
        "_id": ObjectId(),
        "name": "Delegated Payslip Manager",
        "email": "delegated-payslip-manager@naxrita.local",
        "role": "Manager",
        "employeeId": "MGR-PS-2",
        "adminMenuAccess": ["payslips"],
        "testTag": RUN_TAG,
    }
    employee = {
        "_id": ObjectId(),
        "name": "Payslip Employee",
        "email": "payslip-employee@naxrita.local",
        "role": "Employee",
        "employeeId": "EMP-PS-1",
        "reportsTo": manager["_id"],
        "testTag": RUN_TAG,
    }
    outsider = {
        "_id": ObjectId(),
        "name": "Payslip Outsider",
        "email": "payslip-outsider@naxrita.local",
        "role": "Employee",
        "employeeId": "EMP-PS-2",
        "testTag": RUN_TAG,
    }

    mongo.db.users.insert_many([admin, manager, delegated_manager, employee, outsider])
    return {
        "admin": admin,
        "manager": manager,
        "delegated_manager": delegated_manager,
        "employee": employee,
        "outsider": outsider,
    }


def seed_payslip(employee, month, published):
    now = datetime.utcnow()
    doc = {
        "_id": ObjectId(),
        "user_id": employee["_id"],
        "employee_id": employee["employeeId"],
        "employee_name": employee["name"],
        "month": month,
        "month_number": 6 if month == "June" else 5,
        "year": "2026",
        "period_key": f"2026-{'06' if month == 'June' else '05'}",
        "lop_days": 0,
        "std_days": 30,
        "worked_days": 30,
        "basic": 30000,
        "hra": 12000,
        "personal_allowance": 4000,
        "pf_deduction": 1800,
        "professional_tax": 200,
        "income_tax": 2500,
        "esi": 0,
        "earnings": [],
        "deductions": [],
        "gross_earnings": 46000,
        "gross_deductions": 4500,
        "net_pay": 41500,
        "employee_profile": {
            "name": employee["name"],
            "department": "QA",
            "location": "Hyderabad",
        },
        "generated_at": now,
        "pdf_filename": f"Payslip_{employee['employeeId']}_{month}_2026.pdf",
        "published": published,
        "published_at": now if published else None,
        "published_by": ObjectId() if published else None,
        "testTag": RUN_TAG,
    }
    mongo.db.payslips.insert_one(doc)
    return doc


def cleanup():
    mongo.db.payslips.delete_many({"testTag": RUN_TAG})
    mongo.db.users.delete_many({"testTag": RUN_TAG})


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        cleanup()

        users = seed_users()
        published = seed_payslip(users["employee"], "May", True)
        draft = seed_payslip(users["employee"], "June", False)

        client = app.test_client()
        results = []

        employee_list = client.get("/api/payslips", headers=header(users["employee"]["_id"]))
        assert_status(employee_list, 200, "Employee payslip list")
        employee_items = [item for item in employee_list.get_json()["payslips"] if item.get("testTag") == RUN_TAG]
        assert_true(len(employee_items) == 1 and employee_items[0]["_id"] == str(published["_id"]), "Employee should see only their own published payslip")
        assert_true(all(item.get("published") is True for item in employee_items), "Employee list must never contain draft payslips")
        results.append("PASS: employee only sees their own published payslip")

        manager_list = client.get("/api/payslips", headers=header(users["manager"]["_id"]))
        assert_status(manager_list, 200, "Manager payslip list")
        manager_items = [item for item in manager_list.get_json()["payslips"] if item.get("testTag") == RUN_TAG]
        assert_true(len(manager_items) == 0, "Regular manager must not see reportee payslips")
        results.append("PASS: regular manager cannot list reportee payslips")

        manager_download = client.get(f"/api/payslips/download/{published['_id']}", headers=header(users["manager"]["_id"]))
        assert_status(manager_download, 403, "Regular manager payslip download")
        results.append("PASS: regular manager cannot download reportee payslips")

        outsider_download = client.get(f"/api/payslips/download/{published['_id']}", headers=header(users["outsider"]["_id"]))
        assert_status(outsider_download, 403, "Unrelated employee payslip download")
        results.append("PASS: unrelated employee cannot download another employee's payslip")

        employee_draft_download = client.get(f"/api/payslips/download/{draft['_id']}", headers=header(users["employee"]["_id"]))
        assert_status(employee_draft_download, 403, "Employee draft payslip download")
        results.append("PASS: employee cannot download their own draft payslip")

        delegated_list = client.get("/api/payslips", headers=header(users["delegated_manager"]["_id"]))
        assert_status(delegated_list, 200, "Delegated manager payslip list")
        delegated_items = [item for item in delegated_list.get_json()["payslips"] if item.get("testTag") == RUN_TAG]
        assert_true(len(delegated_items) == 2, "Manager with payslip admin access should see the payslip archive")
        results.append("PASS: delegated manager with payslips admin access can list reportee payslips")

        delegated_download = client.get(f"/api/payslips/download/{published['_id']}", headers=header(users["delegated_manager"]["_id"]))
        assert_status(delegated_download, 200, "Delegated manager payslip download")
        results.append("PASS: delegated manager with payslips admin access can download the payslip")

        admin_list = client.get("/api/payslips", headers=header(users["admin"]["_id"]))
        assert_status(admin_list, 200, "Admin payslip list")
        admin_items = [item for item in admin_list.get_json()["payslips"] if item.get("testTag") == RUN_TAG]
        assert_true(len(admin_items) == 2, "Admin should see both draft and published payslips")
        results.append("PASS: admin can see both draft and published payslips")

        print("Payslip access control test results")
        for line in results:
            print(line)

        cleanup()


if __name__ == "__main__":
    run()
