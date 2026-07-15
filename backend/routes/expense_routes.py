import os
import math
from uuid import uuid4

from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from werkzeug.utils import secure_filename
from config.db import mongo
from utils.access_control import has_admin_menu_access, require_admin_menu_access, resolve_requester

expense_bp = Blueprint("expense_bp", __name__)
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_FOLDER = os.path.join(BACKEND_ROOT, "static", "expense_documents")
ALLOWED_DOCUMENT_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
    "jpg", "jpeg", "png", "gif", "webp",
    "ppt", "pptx", "zip", "msg", "eml",
}
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024


def expenses_feature_enabled():
    # Expenses is a core HRMS feature and must be available to every authenticated
    # employee. Keep this helper for backwards compatibility with older callers.
    return True


def expenses_feature_disabled_response():
    return jsonify({"error": "Expenses is currently under development and temporarily unavailable."}), 503


def serialize_all(obj):
    if isinstance(obj, list):
        return [serialize_all(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_all(v) for k, v in obj.items()}
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def allowed_document(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_DOCUMENT_EXTENSIONS


def document_url(filename):
    base = request.host_url.rstrip("/")
    return f"{base}/static/expense_documents/{filename}"


def require_expense_admin_access():
    return require_admin_menu_access("timesheets")


def parse_object_id(value, field_name):
    try:
        return ObjectId(str(value))
    except Exception:
        raise ValueError(f"{field_name} is invalid")


def require_expense_requester():
    requester = resolve_requester()
    if not requester:
        return None, (jsonify({"error": "A valid requester is required"}), 401)
    return requester, None


def requester_can_admin_expenses(requester):
    return bool(requester and has_admin_menu_access(requester, "timesheets"))


def resolve_target_employee(requester, employee_id):
    target_id = parse_object_id(employee_id or requester.get("_id"), "employee_id")
    if target_id != requester.get("_id") and not requester_can_admin_expenses(requester):
        raise PermissionError("You can only manage your own expenses")
    employee = mongo.db.users.find_one({"_id": target_id})
    if not employee:
        raise LookupError("Employee not found")
    return employee


def require_expense_access(expense, requester, allow_admin=True):
    if expense.get("employee_id") == requester.get("_id"):
        return None
    if allow_admin and requester_can_admin_expenses(requester):
        return None
    return jsonify({"error": "You can only access your own expenses"}), 403


def validate_expense_date(value, field_name="expense_date"):
    value = str(value or "").strip()
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format")
    return value


def parse_positive_amount(value):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("Amount must be a valid number")
    if not math.isfinite(amount) or amount <= 0:
        raise ValueError("Amount must be greater than zero")
    return round(amount, 2)


@expense_bp.route("", methods=["GET"])
def list_expenses():
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        role = request.args.get("role", "")
        wants_admin_view = role.strip().lower() == "admin"
        if wants_admin_view and not requester_can_admin_expenses(requester):
            return jsonify({"error": "You do not have access to admin expense review"}), 403
        query = {} if wants_admin_view else {"employee_id": requester["_id"]}

        expenses = list(mongo.db.expenses.find(query).sort([("expense_date", -1), ("created_at", -1)]))
        return jsonify(serialize_all(expenses)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("", methods=["POST"])
def create_expense():
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        data = request.get_json() or {}
        expense_date = validate_expense_date(data.get("expense_date"))
        category = (data.get("category") or "").strip()
        client_code = (data.get("client_code") or "").strip()
        description = (data.get("description") or "").strip()

        amount = parse_positive_amount(data.get("amount"))
        if not category:
            return jsonify({"error": "Category is required"}), 400
        employee = resolve_target_employee(requester, data.get("employee_id"))

        now = datetime.utcnow()
        expense = {
            "employee_id": employee["_id"],
            "employee_name": employee.get("name", ""),
            "employee_email": employee.get("email", ""),
            "employee_department": employee.get("department", ""),
            "expense_date": expense_date,
            "category": category,
            "client_code": client_code,
            "description": description,
            "country": data.get("country", ""),
            "currency": data.get("currency", ""),
            "conversion_rate": data.get("conversion_rate", ""),
            "from_date": data.get("from_date", ""),
            "to_date": data.get("to_date", ""),
            "reason": data.get("reason", ""),
            "expense_type": data.get("expense_type", ""),
            "trip_type": data.get("trip_type", ""),
            "hotel_chain": data.get("hotel_chain", ""),
            "invoice_number": data.get("invoice_number", ""),
            "vendor_gst_number": data.get("vendor_gst_number", ""),
            "sgst": data.get("sgst", ""),
            "cgst_igst": data.get("cgst_igst", ""),
            "purpose": data.get("purpose", ""),
            "meals_provided": data.get("meals_provided", ""),
            "daily_base_per_diem": data.get("daily_base_per_diem", ""),
            "receipt_total": data.get("receipt_total", ""),
            "miscellaneous_expenses": data.get("miscellaneous_expenses", ""),
            "comments": data.get("comments", ""),
            "public_official_over_25": bool(data.get("public_official_over_25", False)),
            "no_vendor_gst_number": bool(data.get("no_vendor_gst_number", False)),
            "amount": amount,
            "status": "saved",
            "document": data.get("document") if isinstance(data.get("document"), dict) else None,
            "created_at": now,
            "updated_at": now,
        }
        result = mongo.db.expenses.insert_one(expense)
        expense["_id"] = result.inserted_id
        return jsonify(serialize_all(expense)), 201
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/submit", methods=["POST"])
def submit_expenses():
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        data = request.get_json() or {}
        expense_date = validate_expense_date(data.get("expense_date"))
        employee = resolve_target_employee(requester, data.get("employee_id"))

        query = {
            "employee_id": employee["_id"],
            "expense_date": expense_date,
        }
        expense_count = mongo.db.expenses.count_documents({**query, "status": "saved"})
        if expense_count == 0:
            return jsonify({"error": "No draft expenses found for the selected date"}), 404

        now = datetime.utcnow()
        result = mongo.db.expenses.update_many(
            {**query, "status": "saved"},
            {"$set": {"status": "submitted", "submitted_at": now, "updated_at": now}},
        )
        return jsonify({
            "message": "Expenses submitted successfully",
            "matched_count": expense_count,
            "modified_count": result.modified_count,
        }), 200
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>", methods=["PUT"])
def update_expense(expense_id):
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        data = request.get_json() or {}
        expense_oid = parse_object_id(expense_id, "expense_id")
        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404
        access_error = require_expense_access(expense, requester)
        if access_error:
            return access_error
        if expense.get("status", "saved") != "saved":
            return jsonify({"error": "Only draft expenses can be updated. Create a new expense if the claim was rejected."}), 400

        update_data = {"updated_at": datetime.utcnow()}

        if "expense_date" in data:
            update_data["expense_date"] = validate_expense_date(data["expense_date"])
        if "category" in data:
            category = (data.get("category") or "").strip()
            if not category:
                return jsonify({"error": "Category is required"}), 400
            update_data["category"] = category
        if "client_code" in data:
            update_data["client_code"] = (data.get("client_code") or "").strip()
        if "description" in data:
            update_data["description"] = (data.get("description") or "").strip()
        for field in [
            "country",
            "currency",
            "conversion_rate",
            "from_date",
            "to_date",
            "reason",
            "expense_type",
            "trip_type",
            "hotel_chain",
            "invoice_number",
            "vendor_gst_number",
            "sgst",
            "cgst_igst",
            "purpose",
            "meals_provided",
            "daily_base_per_diem",
            "receipt_total",
            "miscellaneous_expenses",
            "comments",
            "public_official_over_25",
            "no_vendor_gst_number",
        ]:
            if field in data:
                update_data[field] = data.get(field, "")
        if "amount" in data:
            update_data["amount"] = parse_positive_amount(data.get("amount"))
        if "document" in data and (isinstance(data.get("document"), dict) or data.get("document") is None):
            update_data["document"] = data.get("document")

        mongo.db.expenses.update_one(
            {"_id": expense_oid},
            {"$set": update_data},
        )

        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        return jsonify(serialize_all(expense)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>/approve", methods=["PUT"])
def approve_expense(expense_id):
    try:
        requester, error_response = require_expense_admin_access()
        if error_response:
            return error_response
        data = request.get_json() or {}
        approver_name = str(data.get("approver_name") or requester.get("name") or "").strip()
        approved_expense_date = str(data.get("approved_expense_date") or "").strip()
        if not approver_name:
            return jsonify({"error": "Approver name is required"}), 400
        if approved_expense_date:
            approved_expense_date = validate_expense_date(approved_expense_date, "approved_expense_date")

        expense_oid = parse_object_id(expense_id, "expense_id")
        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404
        if expense.get("status", "saved") != "submitted":
            return jsonify({"error": "Only submitted expenses can be approved"}), 400

        now = datetime.utcnow()
        mongo.db.expenses.update_one(
            {"_id": expense_oid},
            {
                "$set": {
                    "status": "approved",
                    "approved_at": now,
                    "approved_by_admin_id": requester.get("_id"),
                    "approved_by_admin_name": approver_name,
                    "approved_expense_date": approved_expense_date or expense.get("expense_date", ""),
                    "updated_at": now,
                },
                "$unset": {"rejection_comments": "", "rejected_at": "", "rejected_by_admin_id": "", "rejected_by_admin_name": ""},
            },
        )
        updated = mongo.db.expenses.find_one({"_id": expense_oid})
        return jsonify(serialize_all(updated)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>/reject", methods=["PUT"])
def reject_expense(expense_id):
    try:
        requester, error_response = require_expense_admin_access()
        if error_response:
            return error_response

        data = request.get_json() or {}
        rejection_comments = str(data.get("rejection_comments") or data.get("comments") or "").strip()
        if not rejection_comments:
            return jsonify({"error": "Rejection comments are required"}), 400

        expense_oid = parse_object_id(expense_id, "expense_id")
        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404
        if expense.get("status", "saved") != "submitted":
            return jsonify({"error": "Only submitted expenses can be rejected"}), 400

        now = datetime.utcnow()
        mongo.db.expenses.update_one(
            {"_id": expense_oid},
            {
                "$set": {
                    "status": "rejected",
                    "rejection_comments": rejection_comments,
                    "rejected_at": now,
                    "rejected_by_admin_id": requester.get("_id"),
                    "rejected_by_admin_name": requester.get("name", ""),
                    "updated_at": now,
                }
            },
        )
        updated = mongo.db.expenses.find_one({"_id": expense_oid})
        return jsonify(serialize_all(updated)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>/document", methods=["POST"])
def upload_expense_document(expense_id):
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        expense_oid = parse_object_id(expense_id, "expense_id")
        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404
        access_error = require_expense_access(expense, requester)
        if access_error:
            return access_error
        if expense.get("status", "saved") != "saved":
            return jsonify({"error": "Only draft expenses can be updated. Create a new expense if the claim was rejected."}), 400

        file = request.files.get("document")
        if not file or not file.filename:
            return jsonify({"error": "Document file is required"}), 400
        if not allowed_document(file.filename):
            return jsonify({"error": "Unsupported document format"}), 400
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        if file_size > MAX_DOCUMENT_SIZE:
            return jsonify({"error": "Document must be 10 MB or smaller"}), 413

        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        original_name = secure_filename(file.filename)
        if not original_name or "." not in original_name:
            return jsonify({"error": "Document filename is invalid"}), 400
        extension = original_name.rsplit(".", 1)[1].lower()
        stored_name = f"{expense_id}_{uuid4().hex}.{extension}"
        file_path = os.path.join(UPLOAD_FOLDER, stored_name)
        file.save(file_path)

        previous_filename = (expense.get("document") or {}).get("filename")
        if previous_filename:
            previous_path = os.path.join(UPLOAD_FOLDER, os.path.basename(previous_filename))
            if previous_path != file_path and os.path.isfile(previous_path):
                os.remove(previous_path)

        document = {
            "name": original_name,
            "filename": stored_name,
            "url": document_url(stored_name),
            "content_type": file.mimetype,
            "size": file_size,
            "uploaded_at": datetime.utcnow(),
        }
        mongo.db.expenses.update_one(
            {"_id": expense_oid},
            {"$set": {"document": document, "updated_at": datetime.utcnow()}},
        )
        return jsonify(serialize_all(document)), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    try:
        requester, error_response = require_expense_requester()
        if error_response:
            return error_response
        expense_oid = parse_object_id(expense_id, "expense_id")
        expense = mongo.db.expenses.find_one({"_id": expense_oid})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404
        access_error = require_expense_access(expense, requester)
        if access_error:
            return access_error
        if expense.get("status", "saved") != "saved":
            return jsonify({"error": "Only draft expenses can be deleted"}), 400

        result = mongo.db.expenses.delete_one({"_id": expense_oid})
        if result.deleted_count == 0:
            return jsonify({"error": "Expense not found"}), 404
        stored_name = (expense.get("document") or {}).get("filename")
        if stored_name:
            file_path = os.path.join(UPLOAD_FOLDER, os.path.basename(stored_name))
            if os.path.isfile(file_path):
                os.remove(file_path)
        return jsonify({"message": "Expense deleted successfully"}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
