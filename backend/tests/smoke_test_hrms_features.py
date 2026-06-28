import io
import os
import sys
from datetime import datetime

import openpyxl
from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402


RUN_TAG = "codex-smoke-2026-06-28"


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


def build_excel_file():
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["employee_id", "name", "month", "year", "net_salary"])
    sheet.append(["EMP-SMOKE-1", "Smoke Employee", "June", 2026, 50000])
    sheet.append(["EMP-MISSING", "Missing Employee", "June", 2026, 42000])
    sheet.append(["", "No Employee Id", "June", 2026, 41000])

    payload = io.BytesIO()
    workbook.save(payload)
    payload.seek(0)
    return payload


def seed_users():
    users = [
        {
            "_id": ObjectId(),
            "name": "Smoke Admin",
            "email": "smoke-admin@naxrita.local",
            "role": "Admin",
            "employeeId": "ADM-SMOKE-1",
            "adminMenuAccess": ["timesheets", "payslips"],
            "testTag": RUN_TAG,
        },
        {
            "_id": ObjectId(),
            "name": "Smoke Manager",
            "email": "smoke-manager@naxrita.local",
            "role": "Manager",
            "employeeId": "MGR-SMOKE-1",
            "adminMenuAccess": [],
            "testTag": RUN_TAG,
        },
        {
            "_id": ObjectId(),
            "name": "Smoke Employee",
            "email": "smoke-employee@naxrita.local",
            "role": "Employee",
            "employeeId": "EMP-SMOKE-1",
            "reportsTo": None,
            "testTag": RUN_TAG,
        },
    ]
    users[2]["reportsTo"] = users[1]["_id"]
    mongo.db.users.insert_many(users)
    return {item["role"].lower(): item for item in users}


def seed_timesheet(employee, manager):
    now = datetime.utcnow()
    doc = {
        "_id": ObjectId(),
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "QA",
        "reporting_lead_id": manager["_id"],
        "reporting_lead_name": manager["name"],
        "reporting_lead_email": manager["email"],
        "period_start": "2026-06-16",
        "period_end": "2026-06-30",
        "entries": [
            {
                "date": "2026-06-16",
                "hours": 9,
                "entry_type": "work",
                "charge_code": "SMOKE001",
                "charge_code_name": "Smoke Project",
            }
        ],
        "total_hours": 9,
        "work_hours": 9,
        "status": "pending_lead",
        "submitted_at": now,
        "updated_at": now,
        "approval_history": [],
        "testTag": RUN_TAG,
    }
    mongo.db.timesheets.insert_one(doc)
    return doc


def create_payslip(client, admin_id, employee_id, month, year):
    response = client.post(
        "/api/payslips/generate-payslip",
        json={
            "employee_id": employee_id,
            "name": "Smoke Employee",
            "month": month,
            "year": year,
            "net_salary": 50000,
            "earnings": [{"label": "BASIC", "amount": 40000}],
            "deductions": [{"label": "PF", "amount": 1000}],
        },
        headers=header(admin_id),
    )
    assert_status(response, 200, f"Create payslip {month}-{year}")
    payload = response.get_json()
    return payload["payslip"]


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        mongo.db.users.delete_many({"testTag": RUN_TAG})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.payslips.delete_many({"testTag": RUN_TAG})
        mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})

        users = seed_users()
        admin = users["admin"]
        manager = users["manager"]
        employee = users["employee"]
        timesheet = seed_timesheet(employee, manager)

        client = app.test_client()

        results = []

        draft = create_payslip(client, admin["_id"], employee["employeeId"], "June", 2026)
        published = create_payslip(client, admin["_id"], employee["employeeId"], "May", 2026)
        mongo.db.payslips.update_many(
            {"_id": {"$in": [ObjectId(draft["_id"]), ObjectId(published["_id"])]}},
            {"$set": {"testTag": RUN_TAG}},
        )

        publish_response = client.post(
            "/api/payslips/publish",
            json={"payslip_ids": [published["_id"]]},
            headers=header(admin["_id"]),
        )
        assert_status(publish_response, 200, "Publish selected payslip")
        results.append("PASS: publish endpoint publishes selected draft payslip")

        admin_list = client.get("/api/payslips", headers=header(admin["_id"]))
        assert_status(admin_list, 200, "Admin payslip list")
        admin_items = admin_list.get_json()["payslips"]
        assert_true(len([item for item in admin_items if item.get("testTag") == RUN_TAG]) == 2, "Admin should see both smoke payslips")
        results.append("PASS: admin can see both draft and published payslips")

        employee_list_before = client.get("/api/payslips", headers=header(employee["_id"]))
        assert_status(employee_list_before, 200, "Employee payslip list")
        employee_items_before = employee_list_before.get_json()["payslips"]
        smoke_items_before = [item for item in employee_items_before if item.get("testTag") == RUN_TAG]
        assert_true(len(smoke_items_before) == 1 and smoke_items_before[0]["month"] == "May", "Employee should only see published payslip")
        results.append("PASS: employee only sees published own payslip before second publish")

        manager_list = client.get("/api/payslips", headers=header(manager["_id"]))
        assert_status(manager_list, 200, "Manager payslip list")
        manager_items = manager_list.get_json()["payslips"]
        assert_true(not any(item.get("testTag") == RUN_TAG for item in manager_items), "Manager must not see reportee payslips")
        results.append("PASS: manager cannot list reportee payslips")

        manager_download = client.get(
            f"/api/payslips/download/{published['_id']}",
            headers=header(manager["_id"]),
        )
        assert_status(manager_download, 403, "Manager payslip download must be blocked")
        results.append("PASS: manager cannot download reportee payslip directly")

        employee_download_draft = client.get(
            f"/api/payslips/download/{draft['_id']}",
            headers=header(employee["_id"]),
        )
        assert_status(employee_download_draft, 403, "Employee draft download must be blocked")
        results.append("PASS: employee cannot download own draft payslip")

        publish_draft_response = client.post(
            "/api/payslips/publish",
            json={"payslip_ids": [draft["_id"]]},
            headers=header(admin["_id"]),
        )
        assert_status(publish_draft_response, 200, "Publish second payslip")
        employee_list_after = client.get("/api/payslips", headers=header(employee["_id"]))
        assert_status(employee_list_after, 200, "Employee payslip list after publish")
        smoke_items_after = [item for item in employee_list_after.get_json()["payslips"] if item.get("testTag") == RUN_TAG]
        assert_true(len(smoke_items_after) == 2, "Employee should see both payslips after publish")
        results.append("PASS: publishing exposes payslip only to the correct employee")

        delete_response = client.post(
            "/api/payslips/bulk-delete",
            json={"payslip_ids": [draft["_id"]]},
            headers=header(admin["_id"]),
        )
        assert_status(delete_response, 200, "Bulk delete payslip")
        deleted_doc = mongo.db.payslips.find_one({"_id": ObjectId(draft["_id"])})
        assert_true(deleted_doc is None, "Bulk delete should remove selected payslip")
        results.append("PASS: bulk delete removes selected payslips")

        upload_response = client.post(
            "/api/payslips/upload-excel",
            data={"file": (build_excel_file(), "smoke_payslips.xlsx")},
            headers=header(admin["_id"]),
            content_type="multipart/form-data",
        )
        assert_status(upload_response, 200, "Upload excel parsing")
        upload_payload = upload_response.get_json()
        assert_true(upload_payload.get("failed_count") == 2, "Upload should report two failed rows")
        failed_rows = upload_payload.get("failed_rows") or []
        reasons = " ".join(row.get("reason", "") for row in failed_rows)
        assert_true("not found in HRMS" in reasons and "missing in this row" in reasons, "Upload should return layman failure reasons")
        results.append("PASS: upload parsing returns readable failed-row reasons")

        pending_response = client.get(
            f"/api/timesheets/pending/lead/{admin['_id']}",
            headers=header(admin["_id"]),
        )
        assert_status(pending_response, 200, "Admin pending lead approvals")
        pending_items = pending_response.get_json()
        assert_true(any(item.get("_id") == str(timesheet["_id"]) for item in pending_items), "Admin should see pending lead approval")
        results.append("PASS: admin can load pending lead approvals")

        approve_missing_name = client.put(
            f"/api/timesheets/approve/lead/{timesheet['_id']}",
            json={"approved_by": str(admin["_id"]), "comments": ""},
            headers=header(admin["_id"]),
        )
        assert_status(approve_missing_name, 400, "Admin approval without approver_name")
        results.append("PASS: admin approval is blocked without approver_name")

        approve_response = client.put(
            f"/api/timesheets/approve/lead/{timesheet['_id']}",
            json={
                "approved_by": str(admin["_id"]),
                "approver_name": "CEO Smoke",
                "comments": "Approved in smoke test",
            },
            headers=header(admin["_id"]),
        )
        assert_status(approve_response, 200, "Admin approval with approver_name")
        approved_doc = mongo.db.timesheets.find_one({"_id": timesheet["_id"]})
        assert_true(approved_doc.get("lead_approved_by") == "CEO Smoke", "Stored approver name should match entered admin name")
        assert_true((approved_doc.get("approval_history") or [{}])[-1].get("approver_name") == "CEO Smoke", "Approval history should store entered admin approver name")
        results.append("PASS: admin approval stores the entered approver name")

        rejection_doc = seed_timesheet(employee, manager)
        reject_missing_name = client.put(
            f"/api/timesheets/reject/lead/{rejection_doc['_id']}",
            json={
                "rejected_by": str(admin["_id"]),
                "rejection_reason": "Needs correction",
            },
            headers=header(admin["_id"]),
        )
        assert_status(reject_missing_name, 400, "Admin rejection without approver_name")
        results.append("PASS: admin rejection is blocked without approver_name")

        reject_response = client.put(
            f"/api/timesheets/reject/lead/{rejection_doc['_id']}",
            json={
                "rejected_by": str(admin["_id"]),
                "approver_name": "CEO Smoke Rejector",
                "rejection_reason": "Needs correction",
            },
            headers=header(admin["_id"]),
        )
        assert_status(reject_response, 200, "Admin rejection with approver_name")
        rejected_doc = mongo.db.timesheets.find_one({"_id": rejection_doc["_id"]})
        assert_true(rejected_doc.get("lead_rejected_by") == "CEO Smoke Rejector", "Stored rejector name should match entered admin name")
        assert_true(rejected_doc.get("rejection_reason") == "Needs correction", "Rejection reason should be persisted")
        assert_true((rejected_doc.get("approval_history") or [{}])[-1].get("approver_name") == "CEO Smoke Rejector", "Rejection history should store entered admin name")
        results.append("PASS: admin rejection stores the entered approver name and reason")

        print("Smoke test results")
        for line in results:
            print(line)

    with app.app_context():
        mongo.db.notifications.delete_many({"message": {"$regex": "smoke test|CEO Smoke|Needs correction"}})
        mongo.db.payslips.delete_many({"testTag": RUN_TAG})
        mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
        mongo.db.users.delete_many({"testTag": RUN_TAG})


if __name__ == "__main__":
    run()
