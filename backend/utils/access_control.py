from flask import jsonify, request
from bson import ObjectId

from config.db import mongo


ASSIGNABLE_ADMIN_MENU_OPTIONS = [
    {
        "key": "leaves",
        "label": "Admin Leaves",
        "description": "Open the admin leave approval workspace and escalation queue.",
    },
    {
        "key": "employees",
        "label": "Employees",
        "description": "View the enterprise employee directory and activation controls.",
    },
    {
        "key": "add",
        "label": "Employee Setup",
        "description": "Create new employee records without granting full admin rights.",
    },
    {
        "key": "holidays",
        "label": "Holiday Calendar",
        "description": "Manage company holiday records and related calendar updates.",
    },
    {
        "key": "apply-behalf",
        "label": "Apply on Behalf",
        "description": "Submit leave requests for employees who need admin assistance.",
    },
    {
        "key": "projects",
        "label": "Projects",
        "description": "Open the project oversight workspace and manage project records.",
    },
    {
        "key": "timesheets",
        "label": "Admin Timesheets",
        "description": "Open timesheet review, admin expenses, and assignment controls.",
    },
    {
        "key": "payslips",
        "label": "Admin Payslips",
        "description": "Upload, review, edit, and manage payslips from the admin workspace.",
    },
    {
        "key": "mail",
        "label": "Mail Admin",
        "description": "Manage SMTP settings, test mail flow, and review delivery logs.",
    },
    {
        "key": "logs",
        "label": "Audit Logs",
        "description": "Review leave and workflow audit activity.",
    },
]

ASSIGNABLE_ADMIN_MENU_KEYS = {item["key"] for item in ASSIGNABLE_ADMIN_MENU_OPTIONS}
NON_DELEGABLE_ADMIN_MENU_KEYS = {"access-management"}


def normalize_admin_menu_access(values):
    normalized = []
    seen = set()

    for value in values or []:
        key = str(value or "").strip()
        if not key or key in seen or key not in ASSIGNABLE_ADMIN_MENU_KEYS:
            continue
        normalized.append(key)
        seen.add(key)

    return normalized


def get_admin_menu_options():
    return [dict(item) for item in ASSIGNABLE_ADMIN_MENU_OPTIONS]


def is_full_admin(user):
    return bool(user and str(user.get("role", "")).strip().lower() == "admin")


def has_admin_menu_access(user, menu_key):
    if is_full_admin(user):
        return True

    if menu_key in NON_DELEGABLE_ADMIN_MENU_KEYS:
        return False

    return menu_key in normalize_admin_menu_access(user.get("adminMenuAccess") if user else [])


def resolve_requester():
    user_id = (
        request.headers.get("X-User-Id")
        or request.args.get("user_id")
        or ""
    ).strip()

    if not user_id:
        return None

    try:
        return mongo.db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


def require_admin():
    requester = resolve_requester()
    if not requester:
        return None, (jsonify({"error": "A valid requester is required"}), 401)

    if not is_full_admin(requester):
        return requester, (jsonify({"error": "Only full admins can perform this action"}), 403)

    return requester, None


def require_admin_menu_access(menu_key):
    requester = resolve_requester()
    if not requester:
        return None, (jsonify({"error": "A valid requester is required"}), 401)

    if not has_admin_menu_access(requester, menu_key):
        return requester, (
            jsonify({"error": f"You do not have access to the {menu_key} admin workspace"}),
            403,
        )

    return requester, None
