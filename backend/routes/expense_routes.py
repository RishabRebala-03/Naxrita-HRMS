import os
from uuid import uuid4

from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from werkzeug.utils import secure_filename
from config.db import mongo
from utils.access_control import has_admin_menu_access, resolve_requester

expense_bp = Blueprint("expense_bp", __name__)
UPLOAD_FOLDER = os.path.join("static", "expense_documents")
ALLOWED_DOCUMENT_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
    "jpg", "jpeg", "png", "gif", "webp",
    "ppt", "pptx", "zip", "msg", "eml",
}


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


@expense_bp.route("", methods=["GET"])
def list_expenses():
    try:
        employee_id = request.args.get("employee_id")
        role = request.args.get("role", "")
        query = {}
        requester = resolve_requester()
        has_admin_expense_access = bool(
            requester and (
                str(requester.get("role", "")).strip().lower() == "admin"
                or has_admin_menu_access(requester, "timesheets")
            )
        )

        if role.lower() == "admin" and not has_admin_expense_access:
            return jsonify({"error": "You do not have access to admin expense review"}), 403

        if employee_id and role.lower() != "admin":
            query["employee_id"] = ObjectId(employee_id)

        expenses = list(mongo.db.expenses.find(query).sort("expense_date", -1))
        return jsonify(serialize_all(expenses)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("", methods=["POST"])
def create_expense():
    try:
        data = request.get_json() or {}
        employee_id = data.get("employee_id")
        expense_date = data.get("expense_date")
        category = (data.get("category") or "").strip()
        client_code = (data.get("client_code") or "").strip()
        description = (data.get("description") or "").strip()

        try:
            amount = float(data.get("amount") or 0)
        except (TypeError, ValueError):
            return jsonify({"error": "Amount must be a valid number"}), 400

        if not employee_id or not expense_date or not category or amount <= 0:
            return jsonify({"error": "employee_id, expense_date, category, and positive amount are required"}), 400

        employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        now = datetime.utcnow()
        expense = {
            "employee_id": ObjectId(employee_id),
            "employee_name": employee.get("name", ""),
            "employee_email": employee.get("email", ""),
            "employee_department": employee.get("department", ""),
            "expense_date": expense_date,
            "category": category,
            "client_code": client_code,
            "description": description,
            "amount": round(amount, 2),
            "status": "saved",
            "document": data.get("document") if isinstance(data.get("document"), dict) else None,
            "created_at": now,
            "updated_at": now,
        }
        result = mongo.db.expenses.insert_one(expense)
        expense["_id"] = result.inserted_id
        return jsonify(serialize_all(expense)), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>", methods=["PUT"])
def update_expense(expense_id):
    try:
        data = request.get_json() or {}
        update_data = {"updated_at": datetime.utcnow()}

        if "expense_date" in data:
            update_data["expense_date"] = data["expense_date"]
        if "category" in data:
            update_data["category"] = (data.get("category") or "").strip()
        if "client_code" in data:
            update_data["client_code"] = (data.get("client_code") or "").strip()
        if "description" in data:
            update_data["description"] = (data.get("description") or "").strip()
        if "amount" in data:
            try:
                amount = float(data.get("amount") or 0)
            except (TypeError, ValueError):
                return jsonify({"error": "Amount must be a valid number"}), 400
            if amount <= 0:
                return jsonify({"error": "Amount must be greater than zero"}), 400
            update_data["amount"] = round(amount, 2)
        if "document" in data and (isinstance(data.get("document"), dict) or data.get("document") is None):
            update_data["document"] = data.get("document")

        result = mongo.db.expenses.update_one(
            {"_id": ObjectId(expense_id)},
            {"$set": update_data},
        )
        if result.matched_count == 0:
            return jsonify({"error": "Expense not found"}), 404

        expense = mongo.db.expenses.find_one({"_id": ObjectId(expense_id)})
        return jsonify(serialize_all(expense)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>/document", methods=["POST"])
def upload_expense_document(expense_id):
    try:
        expense = mongo.db.expenses.find_one({"_id": ObjectId(expense_id)})
        if not expense:
            return jsonify({"error": "Expense not found"}), 404

        file = request.files.get("document")
        if not file or not file.filename:
            return jsonify({"error": "Document file is required"}), 400
        if not allowed_document(file.filename):
            return jsonify({"error": "Unsupported document format"}), 400

        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        original_name = secure_filename(file.filename)
        extension = original_name.rsplit(".", 1)[1].lower()
        stored_name = f"{expense_id}_{uuid4().hex}.{extension}"
        file_path = os.path.join(UPLOAD_FOLDER, stored_name)
        file.save(file_path)

        document = {
            "name": original_name,
            "filename": stored_name,
            "url": document_url(stored_name),
            "content_type": file.mimetype,
            "size": os.path.getsize(file_path),
            "uploaded_at": datetime.utcnow(),
        }
        mongo.db.expenses.update_one(
            {"_id": ObjectId(expense_id)},
            {"$set": {"document": document, "updated_at": datetime.utcnow()}},
        )
        return jsonify(serialize_all(document)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@expense_bp.route("/<expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    try:
        result = mongo.db.expenses.delete_one({"_id": ObjectId(expense_id)})
        if result.deleted_count == 0:
            return jsonify({"error": "Expense not found"}), 404
        return jsonify({"message": "Expense deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
