from datetime import datetime
from io import BytesIO
import os

import openpyxl
from bson import ObjectId
from flask import Blueprint, jsonify, request, send_file
from pymongo import ASCENDING, DESCENDING
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from werkzeug.utils import secure_filename

from config.db import mongo


payslip_bp = Blueprint("payslip_bp", __name__)

UPLOAD_HISTORY_COLLECTION = "payslip_upload_history"
PAYSLIP_COLLECTION = "payslips"
LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "company_logo.png")


def _collection():
    return mongo.db[PAYSLIP_COLLECTION]


def _history_collection():
    return mongo.db[UPLOAD_HISTORY_COLLECTION]


def _ensure_indexes():
    mongo.db.users.create_index([("employeeId", ASCENDING)], unique=True, sparse=True)
    _collection().create_index(
        [("employee_id", ASCENDING), ("month", ASCENDING), ("year", ASCENDING)],
        unique=True,
    )
    _collection().create_index([("generated_at", DESCENDING)])
    _history_collection().create_index([("uploaded_at", DESCENDING)])


def _serialize_doc(doc):
    if doc is None:
        return None

    serialized = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            serialized[key] = str(value)
        elif isinstance(value, datetime):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = value
    return serialized


def _parse_float(value):
    try:
        return float(value) if value not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


def _get_excel_value(row, column_name, default=""):
    return row.get(column_name, default) or default


def _month_number(month_name):
    months = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }
    return months.get(str(month_name or "").strip().lower(), 0)


def _normalize_year(value):
    raw = str(value or "").strip()
    return raw or str(datetime.utcnow().year)


def _find_user_by_employee_id(employee_id):
    return mongo.db.users.find_one({"employeeId": str(employee_id).strip()})


def _derive_employee_profile(row_dict):
    return {
        "name": str(_get_excel_value(row_dict, "Name", "Unknown")),
        "bank": str(_get_excel_value(row_dict, "Bank", "HDFC")),
        "bank_account_no": str(
            _get_excel_value(row_dict, "Bank A/c No")
            or _get_excel_value(row_dict, "BankAccountNo", "")
        ),
        "doj": str(_get_excel_value(row_dict, "DOJ", "")),
        "pf_no": str(_get_excel_value(row_dict, "PF NO") or _get_excel_value(row_dict, "PFNO", "")),
        "location": str(_get_excel_value(row_dict, "Location", "Hyderabad")),
        "department": str(_get_excel_value(row_dict, "Department", "NTCI")),
        "facility": str(_get_excel_value(row_dict, "Facility", "Hyderabad – HDC2")),
        "entity": str(_get_excel_value(row_dict, "Entity", "NTCI")),
        "pf_uan": str(_get_excel_value(row_dict, "PF - UAN") or _get_excel_value(row_dict, "PFUAN", "")),
        "management_level": str(
            _get_excel_value(row_dict, "Management Level")
            or _get_excel_value(row_dict, "ManagementLevel", "11")
        ),
    }


def _build_row_data(row_dict):
    employee_id = str(
        _get_excel_value(row_dict, "Employee ID") or _get_excel_value(row_dict, "EmployeeID")
    ).strip()
    return {
        "employee_id": employee_id,
        "name": str(_get_excel_value(row_dict, "Name", "Unknown")),
        "month": str(_get_excel_value(row_dict, "Month", "April")),
        "year": _normalize_year(_get_excel_value(row_dict, "Year", "2025")),
        "lop_days": _parse_float(_get_excel_value(row_dict, "LOP Days") or _get_excel_value(row_dict, "LOPDays")),
        "std_days": _parse_float(_get_excel_value(row_dict, "STD Days") or _get_excel_value(row_dict, "STDDays", 30)),
        "worked_days": _parse_float(_get_excel_value(row_dict, "Worked Days") or _get_excel_value(row_dict, "WorkedDays", 30)),
        "basic": _parse_float(_get_excel_value(row_dict, "Basic") or _get_excel_value(row_dict, "BASIC")),
        "hra": _parse_float(_get_excel_value(row_dict, "HRA") or _get_excel_value(row_dict, "House Rent Allowance")),
        "conveyance": _parse_float(_get_excel_value(row_dict, "Conveyance") or _get_excel_value(row_dict, "CCA")),
        "pf_deduction": _parse_float(
            _get_excel_value(row_dict, "PF Deduction")
            or _get_excel_value(row_dict, "PFDeduction")
            or _get_excel_value(row_dict, "Provident Fund")
        ),
        "professional_tax": _parse_float(
            _get_excel_value(row_dict, "Professional Tax") or _get_excel_value(row_dict, "ProfessionalTax")
        ),
        "esi": _parse_float(_get_excel_value(row_dict, "ESI")),
    }


def _format_amount(value):
    if not value:
        return "000.00"
    return f"{float(value):,.2f}"


def _fit_text(text, max_width, font_name="Helvetica", font_size=8):
    value = str(text or "")
    if stringWidth(value, font_name, font_size) <= max_width:
        return value

    trimmed = value
    while trimmed and stringWidth(f"{trimmed}...", font_name, font_size) > max_width:
        trimmed = trimmed[:-1]
    return f"{trimmed}..." if trimmed else ""


def _build_pdf(employee, payslip):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    if os.path.exists(LOGO_PATH):
        logo = ImageReader(LOGO_PATH)
        pdf.drawImage(logo, 40, height - 80, width=140, height=50, preserveAspectRatio=True, mask="auto")

    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height - 95, "Naxrita Solutions Private Limited")

    y_position = height - 130
    purple_color = colors.HexColor("#7B3FA0")
    pdf.setFillColor(purple_color)
    pdf.rect(40, y_position, width - 80, 25, fill=True, stroke=False)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(width / 2, y_position + 8, f"Payslip For {payslip['month']} {payslip['year']}")
    pdf.setFillColor(colors.black)

    y_position -= 35

    table_data = [
        ["Employee ID", employee.get("employeeId", payslip.get("employee_id", "")), "Name", str(employee.get("name", "")).upper()],
        ["Bank", employee.get("bank", "HDFC"), "Bank A/c No", employee.get("bank_account_no", "")],
        ["DOJ", employee.get("doj", ""), "LOP Days", str(int(payslip.get("lop_days", 0)))],
        ["PF NO", employee.get("pf_no", ""), "STD Days", str(int(payslip.get("std_days", 30)))],
        ["Location", employee.get("location", "Hyderabad"), "Worked Days", str(int(payslip.get("worked_days", 30)))],
        ["Department", employee.get("department", "NTCI"), "Management Level", employee.get("management_level", "11")],
        ["Facility", employee.get("facility", "Hyderabad - HDC2"), "Entity", employee.get("entity", "NTCI")],
        ["PF - UAN", employee.get("pf_uan", ""), "", ""],
    ]

    for row_index, row in enumerate(table_data):
        table_data[row_index] = [
            _fit_text(row[0], 95, "Helvetica-Bold", 8),
            _fit_text(row[1], 125),
            _fit_text(row[2], 115, "Helvetica-Bold", 8),
            _fit_text(row[3], 125),
        ]

    detail_table = Table(table_data, colWidths=[100, 130, 120, 130])
    detail_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8),
        ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    detail_table.wrapOn(pdf, width, height)
    detail_table.drawOn(pdf, 40, y_position - 130)

    y_position -= 160
    earnings_deductions_data = [
        ["Earnings", "Amount in Rs", "Deductions", "Amount in Rs"],
        ["BASIC", _format_amount(payslip.get("basic", 0)), "PROVIDENT FUND", _format_amount(payslip.get("pf_deduction", 0))],
        ["", "", "", ""],
        ["HOUSE RENT ALLOWENCE", _format_amount(payslip.get("hra", 0)), "PROFESSIONAL TAX", _format_amount(payslip.get("professional_tax", 0))],
        ["CONV C CCA", _format_amount(payslip.get("conveyance", 0)), "ESI", _format_amount(payslip.get("esi", 0))],
        ["GROSS EARNINGS", _format_amount(payslip.get("gross_earnings", 0)), "GROSS DEDUCTIONS", _format_amount(payslip.get("gross_deductions", 0))],
        ["", "", "", ""],
        ["NET PAY", "", "", _format_amount(payslip.get("net_pay", 0))],
    ]

    earnings_table = Table(earnings_deductions_data, colWidths=[165, 75, 165, 75])
    earnings_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 5), (-1, 5), "Helvetica-Bold", 9),
        ("FONT", (0, 7), (-1, 7), "Helvetica-Bold", 9),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (2, 0), (2, -1), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "LEFT"),
        ("ALIGN", (3, 0), (3, 0), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("SPAN", (0, 7), (2, 7)),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    earnings_table.wrapOn(pdf, width, height)
    earnings_table.drawOn(pdf, 40, y_position - 160)

    y_position -= 190
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(width / 2, y_position, "**This is a computer generated payslip does not require signature and stamp.")

    pdf.save()
    buffer.seek(0)
    return buffer


def _allowed_to_access(payslip, requester):
    if not requester:
        return False

    role = str(requester.get("role", "")).strip().lower()
    requester_id = str(requester.get("_id"))
    employee_id = payslip.get("employee_id")

    if role == "admin":
        return True

    if requester.get("employeeId") == employee_id:
        return True

    if role == "manager":
        report = mongo.db.users.find_one({"employeeId": employee_id}, {"reportsTo": 1})
        return bool(report and str(report.get("reportsTo")) == requester_id)

    return False


def _create_or_get_payslip(data):
    employee_id = str(data.get("employee_id") or "").strip()
    month = str(data.get("month") or "").strip()
    year = _normalize_year(data.get("year"))

    if not employee_id or not month or not year:
        return None, "employee_id, month, and year are required", 400

    user = _find_user_by_employee_id(employee_id)
    if not user:
        return None, f"Employee with employeeId '{employee_id}' not found in HRMS", 404

    existing_payslip = _collection().find_one({"employee_id": employee_id, "month": month, "year": year})
    if existing_payslip:
        return existing_payslip, None, 200

    basic = _parse_float(data.get("basic", 0))
    hra = _parse_float(data.get("hra", 0))
    conveyance = _parse_float(data.get("conveyance", 0))
    pf_deduction = _parse_float(data.get("pf_deduction", 0))
    professional_tax = _parse_float(data.get("professional_tax", 0))
    esi = _parse_float(data.get("esi", 0))

    gross_earnings = basic + hra + conveyance
    gross_deductions = pf_deduction + professional_tax + esi
    net_pay = gross_earnings - gross_deductions

    profile = _derive_employee_profile(data)
    payslip_doc = {
        "user_id": user["_id"],
        "employee_id": employee_id,
        "employee_name": user.get("name") or profile["name"],
        "month": month,
        "month_number": _month_number(month),
        "year": year,
        "period_key": f"{year}-{_month_number(month):02d}" if _month_number(month) else f"{year}-{month}",
        "lop_days": _parse_float(data.get("lop_days", 0)),
        "std_days": _parse_float(data.get("std_days", 30)),
        "worked_days": _parse_float(data.get("worked_days", 30)),
        "basic": basic,
        "hra": hra,
        "conveyance": conveyance,
        "pf_deduction": pf_deduction,
        "professional_tax": professional_tax,
        "esi": esi,
        "gross_earnings": gross_earnings,
        "gross_deductions": gross_deductions,
        "net_pay": net_pay,
        "employee_profile": profile,
        "generated_at": datetime.utcnow(),
        "pdf_filename": f"Payslip_{employee_id}_{month}_{year}.pdf",
    }

    inserted = _collection().insert_one(payslip_doc)
    payslip_doc["_id"] = inserted.inserted_id
    return payslip_doc, None, 201


def _resolve_requester():
    user_id = (request.args.get("user_id") or request.headers.get("X-User-Id") or "").strip()
    if not user_id:
        return None

    try:
        return mongo.db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


@payslip_bp.route("/health", methods=["GET"])
def health_check():
    try:
        mongo.cx.admin.command("ping")
        _ensure_indexes()
        return jsonify({"status": "healthy", "message": "Payslip API is running", "database": "MongoDB connected"}), 200
    except Exception as exc:
        return jsonify({"status": "unhealthy", "message": "MongoDB connection failed", "error": str(exc)}), 500


@payslip_bp.route("/upload-excel", methods=["POST"])
def upload_excel():
    _ensure_indexes()

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.lower().endswith((".xlsx", ".xls")):
        return jsonify({"error": "Invalid file format. Please upload Excel file"}), 400

    try:
        workbook = openpyxl.load_workbook(file, data_only=True)
        sheet = workbook.active
        headers = [cell.value for cell in sheet[1]]

        data = []
        missing_users = []
        records_count = 0

        for row in sheet.iter_rows(min_row=2, values_only=True):
            if not any(row):
                continue

            row_dict = {headers[i]: row[i] for i in range(len(headers)) if i < len(row)}
            row_data = _build_row_data(row_dict)
            employee_id = row_data["employee_id"]
            if not employee_id:
                continue

            user = _find_user_by_employee_id(employee_id)
            if not user:
                missing_users.append(employee_id)

            data.append(row_data)
            records_count += 1

        _history_collection().insert_one(
            {
                "filename": secure_filename(file.filename),
                "records_uploaded": records_count,
                "missing_users": missing_users,
                "uploaded_at": datetime.utcnow(),
            }
        )

        return jsonify(
            {
                "success": True,
                "message": f"Successfully parsed {records_count} records",
                "data": data,
                "missing_users": sorted(set(missing_users)),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": f"Error processing file: {str(exc)}"}), 500


@payslip_bp.route("/generate-payslip", methods=["POST"])
def generate_payslip():
    _ensure_indexes()
    data = request.get_json() or {}

    try:
        payslip_doc, error_message, status_code = _create_or_get_payslip(data)
        if error_message:
            return jsonify({"error": error_message}), status_code

        message = "Payslip already exists" if status_code == 200 else "Payslip generated successfully"
        return jsonify({"success": True, "message": message, "payslip": _serialize_doc(payslip_doc)}), 200
    except Exception as exc:
        return jsonify({"error": f"Error generating payslip: {str(exc)}"}), 500


@payslip_bp.route("/bulk-store", methods=["POST"])
def bulk_store_payslips():
    _ensure_indexes()
    payload = request.get_json() or {}
    rows = payload.get("rows") or []

    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "rows is required"}), 400

    stored = []
    existing = []
    failed = []

    for row in rows:
        try:
            payslip_doc, error_message, status_code = _create_or_get_payslip(row)
            if error_message:
                failed.append({
                    "employee_id": row.get("employee_id", ""),
                    "name": row.get("name", ""),
                    "error": error_message,
                })
                continue

            serialized = _serialize_doc(payslip_doc)
            if status_code == 200:
                existing.append(serialized)
            else:
                stored.append(serialized)
        except Exception as exc:
            failed.append({
                "employee_id": row.get("employee_id", ""),
                "name": row.get("name", ""),
                "error": str(exc),
            })

    return jsonify({
        "success": True,
        "message": f"Stored {len(stored)} payslip(s), skipped {len(existing)} existing, failed {len(failed)}",
        "stored_count": len(stored),
        "existing_count": len(existing),
        "failed_count": len(failed),
        "stored": stored,
        "existing": existing,
        "failed": failed,
    }), 200


@payslip_bp.route("", methods=["GET"])
def get_visible_payslips():
    _ensure_indexes()
    requester = _resolve_requester()

    if not requester:
        return jsonify({"error": "user_id is required"}), 400

    role = str(requester.get("role", "")).strip().lower()
    items = []

    if role == "admin":
        cursor = _collection().find().sort([("year", DESCENDING), ("month_number", DESCENDING), ("generated_at", DESCENDING)])
        items = [_serialize_doc(item) for item in cursor]
    elif role == "manager":
        direct_reports = list(mongo.db.users.find({"reportsTo": requester["_id"]}, {"employeeId": 1}))
        employee_ids = [requester.get("employeeId")] + [item.get("employeeId") for item in direct_reports]
        cursor = _collection().find({"employee_id": {"$in": [emp_id for emp_id in employee_ids if emp_id]}}).sort(
            [("year", DESCENDING), ("month_number", DESCENDING), ("generated_at", DESCENDING)]
        )
        items = [_serialize_doc(item) for item in cursor]
    else:
        cursor = _collection().find({"employee_id": requester.get("employeeId")}).sort(
            [("year", DESCENDING), ("month_number", DESCENDING), ("generated_at", DESCENDING)]
        )
        items = [_serialize_doc(item) for item in cursor]

    return jsonify({"success": True, "payslips": items}), 200


@payslip_bp.route("/upload-history", methods=["GET"])
def get_upload_history():
    _ensure_indexes()
    history = list(_history_collection().find().sort("uploaded_at", DESCENDING).limit(50))
    return jsonify({"success": True, "history": [_serialize_doc(item) for item in history]}), 200


@payslip_bp.route("/download/<payslip_id>", methods=["GET"])
def download_payslip(payslip_id):
    _ensure_indexes()

    try:
        payslip = _collection().find_one({"_id": ObjectId(payslip_id)})
    except Exception:
        payslip = None

    if not payslip:
        return jsonify({"error": "Payslip not found"}), 404

    requester = _resolve_requester()
    if not requester or not _allowed_to_access(payslip, requester):
        return jsonify({"error": "You do not have permission to access this payslip"}), 403

    employee = _find_user_by_employee_id(payslip["employee_id"])
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    employee_snapshot = dict(employee)
    employee_snapshot.update(payslip.get("employee_profile") or {})

    pdf_buffer = _build_pdf(employee_snapshot, payslip)
    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=payslip.get("pdf_filename", f"Payslip_{payslip['employee_id']}.pdf"),
    )
