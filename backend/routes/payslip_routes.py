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
from utils.access_control import has_admin_menu_access


payslip_bp = Blueprint("payslip_bp", __name__)

UPLOAD_HISTORY_COLLECTION = "payslip_upload_history"
PAYSLIP_COLLECTION = "payslips"
LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "company_logo.png")

METADATA_COLUMNS = {
    "employee id", "employeeid", "name", "month", "year", "bank", "bank a/c no",
    "bankaccountno", "doj", "lop days", "lopdays", "std days", "stddays",
    "worked days", "workeddays", "pf no", "pfno", "location", "department",
    "facility", "entity", "pf - uan", "pfuan", "management level", "managementlevel",
}
EARNING_ALIASES = {
    "basic": ("basic", "BASIC"),
    "hra": ("hra", "HOUSE RENT ALLOWENCE"),
    "house rent allowance": ("hra", "HOUSE RENT ALLOWENCE"),
    "conveyance": ("conveyance", "CONV C CCA"),
    "cca": ("conveyance", "CONV C CCA"),
    "conv c cca": ("conveyance", "CONV C CCA"),
}
DEDUCTION_ALIASES = {
    "pf deduction": ("pf_deduction", "PROVIDENT FUND"),
    "pfdeduction": ("pf_deduction", "PROVIDENT FUND"),
    "provident fund": ("pf_deduction", "PROVIDENT FUND"),
    "professional tax": ("professional_tax", "PROFESSIONAL TAX"),
    "professionaltax": ("professional_tax", "PROFESSIONAL TAX"),
    "income tax": ("income_tax", "Income Tax"),
    "esi": ("esi", "ESI"),
}


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
    _collection().create_index([("published", ASCENDING), ("employee_id", ASCENDING), ("year", DESCENDING), ("month_number", DESCENDING)])
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


def _normalize_column_name(value):
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def _normalize_excel_identifier(value):
    if value in (None, ""):
        return ""

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    if isinstance(value, int):
        return str(value)

    raw = str(value).strip()
    if raw.endswith(".0"):
        integer_portion = raw[:-2]
        if integer_portion.isdigit():
            return integer_portion
    return raw


def _stringify_excel_value(value):
    if value in (None, ""):
        return ""

    if isinstance(value, float) and value.is_integer():
        return str(int(value))

    if isinstance(value, int):
        return str(value)

    return str(value).strip()


def _get_excel_value(row, column_name, default=""):
    if column_name in row:
        value = row.get(column_name, default)
        return default if value is None or value == "" else value

    target = _normalize_column_name(column_name)
    for key, value in row.items():
        if _normalize_column_name(key) == target:
            return default if value is None or value == "" else value
    return default


def _money_line(label, amount, key=None):
    return {
        "key": key or _normalize_column_name(label).replace(" ", "_"),
        "label": str(label or "").strip(),
        "amount": _parse_float(amount),
    }


def _derive_pay_components(row_dict):
    headers = row_dict.get("__headers") or [key for key in row_dict.keys() if key != "__headers"]
    known_values = {}
    earning_items = []
    deduction_items = []
    section = "earnings"

    for header in headers:
        if header in (None, ""):
            continue

        label = str(header).strip()
        normalized = _normalize_column_name(label)
        compact = normalized.replace(" ", "")
        value = row_dict.get(header)
        if normalized in METADATA_COLUMNS or compact in METADATA_COLUMNS:
            continue

        alias = EARNING_ALIASES.get(normalized) or EARNING_ALIASES.get(compact)
        if alias:
            key, display_label = alias
            known_values[key] = _parse_float(value)
            earning_items.append(_money_line(display_label, value, key))
            section = "earnings"
            continue

        alias = DEDUCTION_ALIASES.get(normalized) or DEDUCTION_ALIASES.get(compact)
        if alias:
            key, display_label = alias
            known_values[key] = _parse_float(value)
            deduction_items.append(_money_line(display_label, value, key))
            section = "deductions"
            continue

        if value in (None, ""):
            continue
        amount = _parse_float(value)

        if section == "deductions":
            deduction_items.append(_money_line(label, value))
        else:
            earning_items.append(_money_line(label, value))

    return known_values, earning_items, deduction_items


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
    return mongo.db.users.find_one({"employeeId": _normalize_excel_identifier(employee_id)})


def _derive_employee_profile(row_dict):
    source_profile = row_dict.get("employee_profile") or {}
    return {
        "name": _stringify_excel_value(
            source_profile.get("name")
            or row_dict.get("name")
            or _get_excel_value(row_dict, "Name", "Unknown")
        ),
        "bank": _stringify_excel_value(
            source_profile.get("bank")
            or row_dict.get("bank")
            or _get_excel_value(row_dict, "Bank", "HDFC")
        ),
        "bank_account_no": _normalize_excel_identifier(
            source_profile.get("bank_account_no")
            or row_dict.get("bank_account_no")
            or
            _get_excel_value(row_dict, "Bank A/c No")
            or _get_excel_value(row_dict, "BankAccountNo", "")
        ),
        "doj": _stringify_excel_value(source_profile.get("doj") or row_dict.get("doj") or _get_excel_value(row_dict, "DOJ", "")),
        "pf_no": _normalize_excel_identifier(source_profile.get("pf_no") or row_dict.get("pf_no") or _get_excel_value(row_dict, "PF NO") or _get_excel_value(row_dict, "PFNO", "")),
        "location": _stringify_excel_value(source_profile.get("location") or row_dict.get("location") or _get_excel_value(row_dict, "Location", "Hyderabad")),
        "department": _stringify_excel_value(source_profile.get("department") or row_dict.get("department") or _get_excel_value(row_dict, "Department", "NTCI")),
        "facility": _stringify_excel_value(source_profile.get("facility") or row_dict.get("facility") or _get_excel_value(row_dict, "Facility", "Hyderabad – HDC2")),
        "entity": _stringify_excel_value(source_profile.get("entity") or row_dict.get("entity") or _get_excel_value(row_dict, "Entity", "NTCI")),
        "pf_uan": _normalize_excel_identifier(source_profile.get("pf_uan") or row_dict.get("pf_uan") or _get_excel_value(row_dict, "PF - UAN") or _get_excel_value(row_dict, "PFUAN", "")),
        "management_level": _stringify_excel_value(
            source_profile.get("management_level")
            or row_dict.get("management_level")
            or
            _get_excel_value(row_dict, "Management Level")
            or _get_excel_value(row_dict, "ManagementLevel", "11")
        ),
    }


def _build_row_data(row_dict):
    employee_id = _normalize_excel_identifier(
        _get_excel_value(row_dict, "Employee ID") or _get_excel_value(row_dict, "EmployeeID")
    )
    profile = _derive_employee_profile(row_dict)
    pay_values, earnings, deductions = _derive_pay_components(row_dict)
    gross_earnings = sum(item["amount"] for item in earnings)
    gross_deductions = sum(item["amount"] for item in deductions)
    return {
        "employee_id": employee_id,
        "name": profile["name"],
        "month": str(_get_excel_value(row_dict, "Month", "April")),
        "year": _normalize_year(_get_excel_value(row_dict, "Year", "2025")),
        "lop_days": _parse_float(_get_excel_value(row_dict, "LOP Days") or _get_excel_value(row_dict, "LOPDays")),
        "std_days": _parse_float(_get_excel_value(row_dict, "STD Days") or _get_excel_value(row_dict, "STDDays", 30)),
        "worked_days": _parse_float(_get_excel_value(row_dict, "Worked Days") or _get_excel_value(row_dict, "WorkedDays", 30)),
        "basic": pay_values.get("basic", 0),
        "hra": pay_values.get("hra", 0),
        "conveyance": pay_values.get("conveyance", 0),
        "pf_deduction": pay_values.get("pf_deduction", 0),
        "professional_tax": pay_values.get("professional_tax", 0),
        "income_tax": pay_values.get("income_tax", 0),
        "esi": pay_values.get("esi", 0),
        "earnings": earnings,
        "deductions": deductions,
        "gross_earnings": gross_earnings,
        "gross_deductions": gross_deductions,
        "net_pay": gross_earnings - gross_deductions,
        "employee_profile": profile,
        "bank": profile["bank"],
        "bank_account_no": profile["bank_account_no"],
        "doj": profile["doj"],
        "pf_no": profile["pf_no"],
        "location": profile["location"],
        "department": profile["department"],
        "facility": profile["facility"],
        "entity": profile["entity"],
        "pf_uan": profile["pf_uan"],
        "management_level": profile["management_level"],
    }


def _format_amount(value):
    if not value:
        return "000.00"
    return f"{float(value):,.2f}"


def _format_plain_number(value):
    numeric_value = _parse_float(value)
    return str(int(numeric_value)) if numeric_value.is_integer() else str(numeric_value).rstrip("0").rstrip(".")


def _fit_text(text, max_width, font_name="Helvetica", font_size=8):
    value = str(text or "")
    if stringWidth(value, font_name, font_size) <= max_width:
        return value

    trimmed = value
    while trimmed and stringWidth(f"{trimmed}...", font_name, font_size) > max_width:
        trimmed = trimmed[:-1]
    return f"{trimmed}..." if trimmed else ""


def _resolve_profile_value(employee, keys, default=""):
    for key in keys:
        value = employee.get(key)
        if value not in (None, ""):
            if key in {"employeeId", "employee_id", "bank_account_no", "bankAccountNo", "pf_no", "pfNo", "pf_uan", "pfUan"}:
                return _normalize_excel_identifier(value)
            return _stringify_excel_value(value)
    return default


def _merge_profile(existing_profile, incoming_profile):
    merged = dict(existing_profile or {})
    for key, value in (incoming_profile or {}).items():
        if value not in (None, ""):
            merged[key] = value
    return merged


def _build_pdf(employee, payslip):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 65
    grey_fill = colors.HexColor("#D9D9D9")
    purple_color = colors.HexColor("#7030A0")
    border_color = colors.black
    y_position = height - 120
    detail_table_height = 17 + 18 + (18 * 8)
    detail_table_top = y_position - 180 + detail_table_height
    logo_width = 135
    logo_height = 20
    logo_header_gap = 12

    if os.path.exists(LOGO_PATH):
        logo = ImageReader(LOGO_PATH)
        pdf.drawImage(
            logo,
            left,
            detail_table_top + logo_header_gap,
            width=logo_width,
            height=logo_height,
            preserveAspectRatio=True,
            mask="auto",
        )

    table_data = [
        ["Naxrita Solutions Private Limited", "", "", ""],
        [f"Payslip For {payslip['month']} {payslip['year']}", "", "", ""],
        ["Employee ID", _resolve_profile_value(employee, ["employeeId", "employee_id"], payslip.get("employee_id", "")), "Name", _resolve_profile_value(employee, ["name"], "").upper()],
        ["Bank", _resolve_profile_value(employee, ["bank"], "HDFC"), "Bank A/c No", _resolve_profile_value(employee, ["bank_account_no", "bankAccountNo"], "")],
        ["DOJ", _resolve_profile_value(employee, ["doj"], ""), "LOP Days", _format_plain_number(payslip.get("lop_days", 0))],
        ["PF NO", _resolve_profile_value(employee, ["pf_no", "pfNo"], ""), "STD Days", _format_plain_number(payslip.get("std_days", 30))],
        ["Location", _resolve_profile_value(employee, ["location"], "Hyderabad"), "Worked Days", _format_plain_number(payslip.get("worked_days", 30))],
        ["Department", _resolve_profile_value(employee, ["department"], "NTCI"), "Management Level", _resolve_profile_value(employee, ["management_level", "managementLevel"], "11")],
        ["Facility", _resolve_profile_value(employee, ["facility"], "Hyderabad - HDC2"), "Entity", _resolve_profile_value(employee, ["entity"], "NTCI")],
        ["PF - UAN", _resolve_profile_value(employee, ["pf_uan", "pfUan"], ""), "", ""],
    ]

    for row_index, row in enumerate(table_data[2:], start=2):
        table_data[row_index] = [
            _fit_text(row[0], 95, "Helvetica-Bold", 8),
            _fit_text(row[1], 125),
            _fit_text(row[2], 115, "Helvetica-Bold", 8),
            _fit_text(row[3], 125),
        ]

    detail_table = Table(table_data, colWidths=[110, 130, 105, 120], rowHeights=[17, 18] + [18] * 8)
    detail_table.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("SPAN", (0, 1), (-1, 1)),
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (-1, 1), "Helvetica-Bold", 9),
        ("FONT", (0, 2), (0, -1), "Helvetica-Bold", 8),
        ("FONT", (2, 2), (2, -1), "Helvetica-Bold", 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("ALIGN", (0, 1), (-1, 1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, border_color),
        ("BACKGROUND", (0, 0), (-1, 0), purple_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 2), (0, -1), grey_fill),
        ("BACKGROUND", (2, 2), (2, -1), grey_fill),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), purple_color),
        ("BACKGROUND", (0, 2), (0, -1), grey_fill),
        ("BACKGROUND", (2, 2), (2, -1), grey_fill),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    detail_table.wrapOn(pdf, width, height)
    detail_table.drawOn(pdf, left, y_position - 180)

    earnings = payslip.get("earnings") or [
        _money_line("BASIC", payslip.get("basic", 0), "basic"),
        _money_line("HOUSE RENT ALLOWENCE", payslip.get("hra", 0), "hra"),
        _money_line("CONV C CCA", payslip.get("conveyance", 0), "conveyance"),
    ]
    deductions = payslip.get("deductions") or [
        _money_line("PROVIDENT FUND", payslip.get("pf_deduction", 0), "pf_deduction"),
        _money_line("PROFESSIONAL TAX", payslip.get("professional_tax", 0), "professional_tax"),
        _money_line("Income Tax", payslip.get("income_tax", 0), "income_tax"),
        _money_line("ESI", payslip.get("esi", 0), "esi"),
    ]
    row_count = max(len(earnings), len(deductions), 3)
    earnings_deductions_data = [["Earnings", "Amount in Rs", "Deductions", "Amount in Rs"]]
    for index in range(row_count):
        earning = earnings[index] if index < len(earnings) else {"label": "", "amount": 0}
        deduction = deductions[index] if index < len(deductions) else {"label": "", "amount": 0}
        earnings_deductions_data.append([
            earning.get("label", ""),
            _format_amount(earning.get("amount", 0)) if earning.get("label") else "",
            deduction.get("label", ""),
            _format_amount(deduction.get("amount", 0)) if deduction.get("label") else "",
        ])
    gross_row = len(earnings_deductions_data)
    earnings_deductions_data.append([
        "GROSS EARNINGS",
        _format_amount(payslip.get("gross_earnings", 0)),
        "GROSS DEDUCTIONS",
        _format_amount(payslip.get("gross_deductions", 0)),
    ])
    net_row = len(earnings_deductions_data)
    earnings_deductions_data.append(["NET PAY", "", _format_amount(payslip.get("net_pay", 0)), ""])

    earnings_table = Table(earnings_deductions_data, colWidths=[138, 95, 138, 94], rowHeights=[14] + [22] * row_count + [22, 22])
    earnings_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, gross_row), (-1, gross_row), "Helvetica-Bold", 9),
        ("FONT", (0, net_row), (-1, net_row), "Helvetica-Bold", 9),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (2, 0), (2, -1), "LEFT"),
        ("ALIGN", (0, net_row), (1, net_row), "RIGHT"),
        ("ALIGN", (2, net_row), (3, net_row), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, border_color),
        ("INNERGRID", (0, 0), (-1, 0), 0.5, border_color),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, border_color),
        ("LINEAFTER", (1, 0), (1, -1), 0.5, border_color),
        ("LINEAFTER", (2, 0), (2, -1), 0.5, border_color),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, border_color),
        ("LINEABOVE", (0, gross_row), (-1, gross_row), 0.5, border_color),
        ("LINEBELOW", (0, gross_row), (-1, gross_row), 0.5, border_color),
        ("LINEBELOW", (0, net_row), (-1, net_row), 0.5, border_color),
        ("BACKGROUND", (0, 0), (-1, 0), grey_fill),
        ("SPAN", (0, net_row), (1, net_row)),
        ("SPAN", (2, net_row), (3, net_row)),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    earnings_table.wrapOn(pdf, width, height)
    earnings_table.drawOn(pdf, left, y_position - 345)

    pdf.setFont("Helvetica", 8)
    pdf.drawString(left + 45, y_position - 405, "**This is a computer-generated payslip does not require signature and stamp.")

    pdf.save()
    buffer.seek(0)
    return buffer


def _allowed_to_access(payslip, requester):
    if not requester:
        return False

    employee_id = payslip.get("employee_id")

    if _is_admin_requester(requester):
        return True

    if requester.get("employeeId") == employee_id:
        return bool(payslip.get("published"))

    return False


def _is_admin_requester(requester):
    return bool(requester and has_admin_menu_access(requester, "payslips"))


def _normalize_line_items(items):
    normalized = []
    for item in items or []:
        label = _stringify_excel_value(item.get("label"))
        if not label:
            continue
        normalized.append(_money_line(label, item.get("amount", 0), item.get("key")))
    return normalized


def _create_or_get_payslip(data):
    employee_id = _normalize_excel_identifier(data.get("employee_id"))
    month = str(data.get("month") or "").strip()
    year = _normalize_year(data.get("year"))

    if not employee_id or not month or not year:
        return None, "employee_id, month, and year are required", 400

    user = _find_user_by_employee_id(employee_id)
    if not user:
        return None, f"Employee with employeeId '{employee_id}' not found in HRMS", 404

    earnings = data.get("earnings") or [
        _money_line("BASIC", data.get("basic", 0), "basic"),
        _money_line("HOUSE RENT ALLOWENCE", data.get("hra", 0), "hra"),
        _money_line("CONV C CCA", data.get("conveyance", 0), "conveyance"),
    ]
    deductions = data.get("deductions") or [
        _money_line("PROVIDENT FUND", data.get("pf_deduction", 0), "pf_deduction"),
        _money_line("PROFESSIONAL TAX", data.get("professional_tax", 0), "professional_tax"),
        _money_line("Income Tax", data.get("income_tax", 0), "income_tax"),
        _money_line("ESI", data.get("esi", 0), "esi"),
    ]
    earnings = [_money_line(item.get("label"), item.get("amount"), item.get("key")) for item in earnings if item.get("label")]
    deductions = [_money_line(item.get("label"), item.get("amount"), item.get("key")) for item in deductions if item.get("label")]

    basic = next((item["amount"] for item in earnings if item.get("key") == "basic"), _parse_float(data.get("basic", 0)))
    hra = next((item["amount"] for item in earnings if item.get("key") == "hra"), _parse_float(data.get("hra", 0)))
    conveyance = next((item["amount"] for item in earnings if item.get("key") == "conveyance"), _parse_float(data.get("conveyance", 0)))
    pf_deduction = next((item["amount"] for item in deductions if item.get("key") == "pf_deduction"), _parse_float(data.get("pf_deduction", 0)))
    professional_tax = next((item["amount"] for item in deductions if item.get("key") == "professional_tax"), _parse_float(data.get("professional_tax", 0)))
    income_tax = next((item["amount"] for item in deductions if item.get("key") == "income_tax"), _parse_float(data.get("income_tax", 0)))
    esi = next((item["amount"] for item in deductions if item.get("key") == "esi"), _parse_float(data.get("esi", 0)))

    gross_earnings = sum(item["amount"] for item in earnings)
    gross_deductions = sum(item["amount"] for item in deductions)
    net_pay = gross_earnings - gross_deductions

    profile = _derive_employee_profile(data)

    existing_payslip = _collection().find_one({"employee_id": employee_id, "month": month, "year": year})
    if existing_payslip:
        merged_profile = _merge_profile(existing_payslip.get("employee_profile"), profile)
        refresh_fields = {
            "employee_name": user.get("name") or merged_profile.get("name") or existing_payslip.get("employee_name", ""),
            "lop_days": _parse_float(data.get("lop_days", existing_payslip.get("lop_days", 0))),
            "std_days": _parse_float(data.get("std_days", existing_payslip.get("std_days", 30))),
            "worked_days": _parse_float(data.get("worked_days", existing_payslip.get("worked_days", 30))),
            "basic": basic,
            "hra": hra,
            "conveyance": conveyance,
            "pf_deduction": pf_deduction,
            "professional_tax": professional_tax,
            "income_tax": income_tax,
            "esi": esi,
            "earnings": earnings,
            "deductions": deductions,
            "gross_earnings": gross_earnings,
            "gross_deductions": gross_deductions,
            "net_pay": net_pay,
            "employee_profile": merged_profile,
            "pdf_filename": f"Payslip_{employee_id}_{month}_{year}.pdf",
            "published": bool(existing_payslip.get("published", False)),
            "published_at": existing_payslip.get("published_at"),
            "published_by": existing_payslip.get("published_by"),
        }
        _collection().update_one({"_id": existing_payslip["_id"]}, {"$set": refresh_fields})
        existing_payslip.update(refresh_fields)
        return existing_payslip, None, 200

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
        "income_tax": income_tax,
        "esi": esi,
        "earnings": earnings,
        "deductions": deductions,
        "gross_earnings": gross_earnings,
        "gross_deductions": gross_deductions,
        "net_pay": net_pay,
        "employee_profile": profile,
        "generated_at": datetime.utcnow(),
        "pdf_filename": f"Payslip_{employee_id}_{month}_{year}.pdf",
        "published": False,
        "published_at": None,
        "published_by": None,
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
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only payslip admins can upload payslip sheets"}), 403

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
        failed_rows = []
        records_count = 0

        for row_index, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
            if not any(row):
                continue

            row_dict = {headers[i]: row[i] for i in range(len(headers)) if i < len(row) and headers[i] not in (None, "")}
            row_dict["__headers"] = [header for header in headers if header not in (None, "")]
            row_data = _build_row_data(row_dict)
            employee_id = row_data["employee_id"]
            if not employee_id:
                failed_rows.append({
                    "row_number": row_index,
                    "employee_id": "",
                    "employee_name": row_data.get("name", ""),
                    "reason": "Employee ID is missing in this row.",
                })
                continue

            user = _find_user_by_employee_id(employee_id)
            if not user:
                missing_users.append(employee_id)
                failed_rows.append({
                    "row_number": row_index,
                    "employee_id": employee_id,
                    "employee_name": row_data.get("name", ""),
                    "reason": f"Employee ID {employee_id} was not found in HRMS.",
                })
                continue

            data.append(row_data)
            records_count += 1

        _history_collection().insert_one(
            {
                "filename": secure_filename(file.filename),
                "records_uploaded": records_count,
                "failed_rows_count": len(failed_rows),
                "failed_rows": failed_rows[:100],
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
                "failed_rows": failed_rows,
                "failed_count": len(failed_rows),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": f"Error processing file: {str(exc)}"}), 500


@payslip_bp.route("/generate-payslip", methods=["POST"])
def generate_payslip():
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only payslip admins can generate payslips"}), 403
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
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only payslip admins can store payslips"}), 403
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

    if _is_admin_requester(requester):
        cursor = _collection().find().sort([("year", DESCENDING), ("month_number", DESCENDING), ("generated_at", DESCENDING)])
        items = [_serialize_doc(item) for item in cursor]
    else:
        cursor = _collection().find({"employee_id": requester.get("employeeId"), "published": True}).sort(
            [("year", DESCENDING), ("month_number", DESCENDING), ("generated_at", DESCENDING)]
        )
        items = [_serialize_doc(item) for item in cursor]

    return jsonify({"success": True, "payslips": items}), 200


@payslip_bp.route("/upload-history", methods=["GET"])
def get_upload_history():
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only payslip admins can view upload history"}), 403
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
    employee_snapshot = _merge_profile(employee_snapshot, payslip.get("employee_profile") or {})
    employee_snapshot["employee_id"] = payslip.get("employee_id", employee_snapshot.get("employee_id", ""))

    pdf_buffer = _build_pdf(employee_snapshot, payslip)
    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=payslip.get("pdf_filename", f"Payslip_{payslip['employee_id']}.pdf"),
    )


@payslip_bp.route("/<payslip_id>", methods=["PUT"])
def update_payslip(payslip_id):
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only admins can edit payslips"}), 403

    try:
        payslip = _collection().find_one({"_id": ObjectId(payslip_id)})
    except Exception:
        payslip = None

    if not payslip:
        return jsonify({"error": "Payslip not found"}), 404

    payload = request.get_json() or {}
    employee_id = _normalize_excel_identifier(payload.get("employee_id") or payslip.get("employee_id"))
    month = _stringify_excel_value(payload.get("month") or payslip.get("month"))
    year = _normalize_year(payload.get("year") or payslip.get("year"))

    if not employee_id or not month or not year:
        return jsonify({"error": "employee_id, month, and year are required"}), 400

    user = _find_user_by_employee_id(employee_id)
    if not user:
        return jsonify({"error": f"Employee with employeeId '{employee_id}' not found in HRMS"}), 404

    duplicate = _collection().find_one({
        "_id": {"$ne": payslip["_id"]},
        "employee_id": employee_id,
        "month": month,
        "year": year,
    })
    if duplicate:
        return jsonify({"error": "Another payslip already exists for this employee and period"}), 409

    merged_source = {
        **(payslip.get("employee_profile") or {}),
        **payslip,
        **payload,
    }
    profile = _derive_employee_profile(merged_source)
    earnings = _normalize_line_items(payload.get("earnings") or payslip.get("earnings") or [])
    deductions = _normalize_line_items(payload.get("deductions") or payslip.get("deductions") or [])

    if not earnings:
        earnings = [
            _money_line("BASIC", payload.get("basic", payslip.get("basic", 0)), "basic"),
            _money_line("HOUSE RENT ALLOWENCE", payload.get("hra", payslip.get("hra", 0)), "hra"),
            _money_line("CONV C CCA", payload.get("conveyance", payslip.get("conveyance", 0)), "conveyance"),
        ]
    if not deductions:
        deductions = [
            _money_line("PROVIDENT FUND", payload.get("pf_deduction", payslip.get("pf_deduction", 0)), "pf_deduction"),
            _money_line("PROFESSIONAL TAX", payload.get("professional_tax", payslip.get("professional_tax", 0)), "professional_tax"),
            _money_line("Income Tax", payload.get("income_tax", payslip.get("income_tax", 0)), "income_tax"),
            _money_line("ESI", payload.get("esi", payslip.get("esi", 0)), "esi"),
        ]

    basic = next((item["amount"] for item in earnings if item.get("key") == "basic"), _parse_float(payload.get("basic", payslip.get("basic", 0))))
    hra = next((item["amount"] for item in earnings if item.get("key") == "hra"), _parse_float(payload.get("hra", payslip.get("hra", 0))))
    conveyance = next((item["amount"] for item in earnings if item.get("key") == "conveyance"), _parse_float(payload.get("conveyance", payslip.get("conveyance", 0))))
    pf_deduction = next((item["amount"] for item in deductions if item.get("key") == "pf_deduction"), _parse_float(payload.get("pf_deduction", payslip.get("pf_deduction", 0))))
    professional_tax = next((item["amount"] for item in deductions if item.get("key") == "professional_tax"), _parse_float(payload.get("professional_tax", payslip.get("professional_tax", 0))))
    income_tax = next((item["amount"] for item in deductions if item.get("key") == "income_tax"), _parse_float(payload.get("income_tax", payslip.get("income_tax", 0))))
    esi = next((item["amount"] for item in deductions if item.get("key") == "esi"), _parse_float(payload.get("esi", payslip.get("esi", 0))))
    gross_earnings = sum(item["amount"] for item in earnings)
    gross_deductions = sum(item["amount"] for item in deductions)
    net_pay = gross_earnings - gross_deductions
    month_number = _month_number(month)

    update_fields = {
        "employee_id": employee_id,
        "employee_name": user.get("name") or profile.get("name") or payslip.get("employee_name", ""),
        "month": month,
        "month_number": month_number,
        "year": year,
        "period_key": f"{year}-{month_number:02d}" if month_number else f"{year}-{month}",
        "lop_days": _parse_float(payload.get("lop_days", payslip.get("lop_days", 0))),
        "std_days": _parse_float(payload.get("std_days", payslip.get("std_days", 30))),
        "worked_days": _parse_float(payload.get("worked_days", payslip.get("worked_days", 30))),
        "basic": basic,
        "hra": hra,
        "conveyance": conveyance,
        "pf_deduction": pf_deduction,
        "professional_tax": professional_tax,
        "income_tax": income_tax,
        "esi": esi,
        "earnings": earnings,
        "deductions": deductions,
        "gross_earnings": gross_earnings,
        "gross_deductions": gross_deductions,
        "net_pay": net_pay,
        "employee_profile": profile,
        "pdf_filename": f"Payslip_{employee_id}_{month}_{year}.pdf",
        "published": bool(payslip.get("published", False)),
        "published_at": payslip.get("published_at"),
        "published_by": payslip.get("published_by"),
    }

    _collection().update_one({"_id": payslip["_id"]}, {"$set": update_fields})
    payslip.update(update_fields)
    return jsonify({"success": True, "message": "Payslip updated successfully", "payslip": _serialize_doc(payslip)}), 200


@payslip_bp.route("/<payslip_id>", methods=["DELETE"])
def delete_payslip(payslip_id):
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only admins can delete payslips"}), 403

    try:
        result = _collection().delete_one({"_id": ObjectId(payslip_id)})
    except Exception:
        result = None

    if not result or result.deleted_count == 0:
        return jsonify({"error": "Payslip not found"}), 404

    return jsonify({"success": True, "message": "Payslip deleted successfully"}), 200


@payslip_bp.route("/bulk-delete", methods=["POST"])
def bulk_delete_payslips():
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only admins can delete payslips"}), 403

    payload = request.get_json() or {}
    payslip_ids = payload.get("payslip_ids") or []
    if not isinstance(payslip_ids, list) or not payslip_ids:
        return jsonify({"error": "payslip_ids is required"}), 400

    object_ids = []
    invalid_ids = []
    for payslip_id in payslip_ids:
        try:
            object_ids.append(ObjectId(str(payslip_id)))
        except Exception:
            invalid_ids.append(str(payslip_id))

    if not object_ids:
        return jsonify({"error": "No valid payslip ids were provided"}), 400

    result = _collection().delete_many({"_id": {"$in": object_ids}})
    return jsonify({
        "success": True,
        "message": f"Deleted {result.deleted_count} payslip(s).",
        "deleted_count": result.deleted_count,
        "invalid_ids": invalid_ids,
    }), 200


@payslip_bp.route("/publish", methods=["POST"])
def publish_payslips():
    _ensure_indexes()
    requester = _resolve_requester()
    if not _is_admin_requester(requester):
        return jsonify({"error": "Only admins can publish payslips"}), 403

    payload = request.get_json() or {}
    payslip_ids = payload.get("payslip_ids") or []
    publish_all = bool(payload.get("publish_all"))
    query = {"published": {"$ne": True}}

    if publish_all:
        pass
    else:
        if not isinstance(payslip_ids, list) or not payslip_ids:
            return jsonify({"error": "Select at least one payslip to publish"}), 400
        object_ids = []
        invalid_ids = []
        for payslip_id in payslip_ids:
            try:
                object_ids.append(ObjectId(str(payslip_id)))
            except Exception:
                invalid_ids.append(str(payslip_id))
        if not object_ids:
            return jsonify({"error": "No valid payslip ids were provided"}), 400
        query["_id"] = {"$in": object_ids}
    published_at = datetime.utcnow()
    result = _collection().update_many(query, {"$set": {
        "published": True,
        "published_at": published_at,
        "published_by": requester["_id"],
    }})

    response = {
        "success": True,
        "message": f"Published {result.modified_count} payslip(s).",
        "published_count": result.modified_count,
    }
    if not publish_all:
        response["invalid_ids"] = invalid_ids
    return jsonify(response), 200
