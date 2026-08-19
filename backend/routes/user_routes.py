#user_routes.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timedelta
from config.db import mongo
import os
from utils.access_control import (
    get_admin_menu_options,
    has_admin_menu_access,
    is_full_admin,
    normalize_admin_menu_access,
    require_admin,
    require_admin_menu_access,
    resolve_requester,
)

def serialize_all(obj):
    if isinstance(obj, list):
        return [serialize_all(item) for item in obj]

    if isinstance(obj, dict):
        new_obj = {}
        for k, v in obj.items():
            new_obj[k] = serialize_all(v)
        return new_obj

    # Convert ObjectId → string
    if isinstance(obj, ObjectId):
        return str(obj)

    # Convert datetime → ISO format
    if isinstance(obj, datetime):
        return obj.isoformat()

    return obj

user_bp = Blueprint("user_bp", __name__)


def _build_photo_url(user_id, base_url):
    photo_extensions = [".png", ".jpg", ".jpeg", ".webp"]

    for ext in photo_extensions:
        photo_filename = f"{user_id}{ext}"
        photo_path = os.path.join("static", "profile_photos", photo_filename)
        if os.path.exists(photo_path):
            return f"{base_url}/static/profile_photos/{photo_filename}"

    return None


def _parse_date_value(value):
    if value in (None, "", "null"):
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None

        try:
            if len(raw) == 10 and raw.count("-") == 2:
                return datetime.strptime(raw, "%Y-%m-%d").date()
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except Exception:
            return None

    return None


def _get_last_month_window():
    today = datetime.utcnow().date()
    current_month_start = today.replace(day=1)
    last_month_end = current_month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    return last_month_start, last_month_end


def _resolve_period_window(period_start_raw=None, period_end_raw=None):
    default_start, default_end = _get_last_month_window()
    period_start = _parse_date_value(period_start_raw) or default_start
    period_end = _parse_date_value(period_end_raw) or default_end

    if period_start > period_end:
        period_start, period_end = period_end, period_start

    return period_start, period_end


def _normalize_project_assignment(assignment):
    if not isinstance(assignment, dict):
        return None

    project_id = assignment.get("projectId")
    if isinstance(project_id, ObjectId):
        project_id = str(project_id)

    start_date = assignment.get("startDate")
    end_date = assignment.get("endDate")

    return {
        "_id": str(assignment.get("_id")) if assignment.get("_id") else None,
        "projectId": project_id,
        "projectName": assignment.get("projectName") or assignment.get("name") or "",
        "startDate": start_date.isoformat() if isinstance(start_date, datetime) else start_date,
        "endDate": end_date.isoformat() if isinstance(end_date, datetime) else end_date,
        "assignedAt": assignment.get("assignedAt").isoformat() if isinstance(assignment.get("assignedAt"), datetime) else assignment.get("assignedAt"),
    }


def _get_leave_summaries_for_period(employee_ids, period_start=None, period_end=None):
    period_start, period_end = _resolve_period_window(period_start, period_end)
    summaries = {
        str(employee_id): {
            "records": 0,
            "days": 0,
            "approved_days": 0,
            "pending_records": 0,
        }
        for employee_id in employee_ids
    }

    if not employee_ids:
        return summaries, period_start, period_end

    leaves = mongo.db.leaves.find(
        {"employee_id": {"$in": employee_ids}},
        {
            "employee_id": 1,
            "start_date": 1,
            "end_date": 1,
            "status": 1,
            "is_half_day": 1,
        },
    )

    for leave in leaves:
        employee_id = str(leave.get("employee_id"))
        if employee_id not in summaries:
            continue

        leave_start = _parse_date_value(leave.get("start_date"))
        leave_end = _parse_date_value(leave.get("end_date")) or leave_start

        if not leave_start or not leave_end:
            continue

        overlap_start = max(leave_start, period_start)
        overlap_end = min(leave_end, period_end)
        if overlap_start > overlap_end:
            continue

        overlap_days = (overlap_end - overlap_start).days + 1
        if leave.get("is_half_day") and overlap_days > 0:
            overlap_days = 0.5

        summaries[employee_id]["records"] += 1
        summaries[employee_id]["days"] += overlap_days

        if leave.get("status") == "Approved":
            summaries[employee_id]["approved_days"] += overlap_days

        if leave.get("status") == "Pending":
            summaries[employee_id]["pending_records"] += 1

    return summaries, period_start, period_end


def _serialize_directory_employee(user, base_url, leave_summary, period_start, period_end):
    manager_email = ""
    reports_to = user.get("reportsTo")
    if reports_to:
        manager = None
        if isinstance(reports_to, ObjectId):
            manager = mongo.db.users.find_one({"_id": reports_to}, {"email": 1})
            reports_to = str(reports_to)
        elif isinstance(reports_to, str):
            try:
                manager = mongo.db.users.find_one({"_id": ObjectId(reports_to)}, {"email": 1})
            except Exception:
                manager = None

        if manager:
            manager_email = manager.get("email", "")

    projects = []
    for assignment in user.get("projects", []) or []:
        normalized = _normalize_project_assignment(assignment)
        if normalized:
            projects.append(normalized)

    project_names = [project["projectName"] for project in projects if project.get("projectName")]
    joining_date = user.get("dateOfJoining")

    return {
        "_id": str(user["_id"]),
        "employeeId": user.get("employeeId", ""),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "designation": user.get("designation", ""),
        "department": user.get("department", ""),
        "role": user.get("role", "Employee"),
        "shiftTimings": user.get("shiftTimings", ""),
        "employment_type": user.get("employment_type", "Employee"),
        "is_active": user.get("is_active", True),
        "workLocation": user.get("workLocation", ""),
        "companyCode": user.get("companyCode", ""),
        "costCenter": user.get("costCenter", ""),
        "dateOfJoining": joining_date.isoformat() if isinstance(joining_date, datetime) else joining_date,
        "reportsTo": reports_to,
        "reportsToEmail": user.get("reportsToEmail") or manager_email,
        "photoUrl": _build_photo_url(str(user["_id"]), base_url),
        "projects": projects,
        "projectNames": project_names,
        "leaveSummary": {
            "periodStart": period_start.isoformat(),
            "periodEnd": period_end.isoformat(),
            "records": leave_summary.get("records", 0),
            "days": leave_summary.get("days", 0),
            "approvedDays": leave_summary.get("approved_days", 0),
            "pendingRecords": leave_summary.get("pending_records", 0),
        },
        "lastMonthLeave": {
            "periodStart": period_start.isoformat(),
            "periodEnd": period_end.isoformat(),
            "records": leave_summary.get("records", 0),
            "days": leave_summary.get("days", 0),
            "approvedDays": leave_summary.get("approved_days", 0),
            "pendingRecords": leave_summary.get("pending_records", 0),
        },
    }


def _employee_matches_filters(employee, search_term, department, status_filter, project_filter, joined_from, joined_to, leave_filter):
    searchable_values = [
        employee.get("name", ""),
        employee.get("email", ""),
        employee.get("designation", ""),
        employee.get("department", ""),
        employee.get("reportsToEmail", ""),
        " ".join(employee.get("projectNames", [])),
    ]
    normalized_search = search_term.lower()

    matches_search = not normalized_search or any(
        normalized_search in str(value).lower() for value in searchable_values if value
    )

    matches_department = not department or employee.get("department") == department

    is_active = employee.get("is_active") is not False
    matches_status = (
        not status_filter
        or status_filter == "all"
        or (status_filter == "active" and is_active)
        or (status_filter == "inactive" and not is_active)
    )

    matches_project = (
        not project_filter
        or project_filter == "all"
        or project_filter in employee.get("projectNames", [])
    )

    joining_date = _parse_date_value(employee.get("dateOfJoining"))
    matches_joined_from = not joined_from or (joining_date and joining_date >= joined_from)
    matches_joined_to = not joined_to or (joining_date and joining_date <= joined_to)

    leave_days = employee.get("leaveSummary", {}).get("days", 0)
    matches_leave = (
        not leave_filter
        or leave_filter == "all"
        or (leave_filter == "with_leave" and leave_days > 0)
        or (leave_filter == "without_leave" and leave_days == 0)
    )

    return all(
        [
            matches_search,
            matches_department,
            matches_status,
            matches_project,
            matches_joined_from,
            matches_joined_to,
            matches_leave,
        ]
    )


def _employee_sort_value(employee, sort_by):
    if sort_by == "joining_date":
        return _parse_date_value(employee.get("dateOfJoining")) or datetime.min.date()

    if sort_by == "department":
        return (employee.get("department") or "").lower()

    if sort_by == "status":
        return 0 if employee.get("is_active") is not False else 1

    if sort_by == "last_month_leave":
        return employee.get("leaveSummary", {}).get("days", 0)

    return (employee.get("name") or "").lower()


def _serialize_access_user(user):
    return {
        "_id": str(user["_id"]),
        "employeeId": user.get("employeeId", ""),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "Employee"),
        "designation": user.get("designation", ""),
        "department": user.get("department", ""),
        "is_active": user.get("is_active", True),
        "hasFullAdminAccess": is_full_admin(user),
        "adminMenuAccess": normalize_admin_menu_access(user.get("adminMenuAccess")),
    }


def _menu_label_map():
    return {item["key"]: item["label"] for item in get_admin_menu_options()}


def _serialize_admin_access_history(item):
    labels = _menu_label_map()
    granted = item.get("granted_menus") or []
    removed = item.get("removed_menus") or []
    resulting = item.get("resulting_access") or []
    return {
        "_id": str(item.get("_id")),
        "module": "admin-access",
        "action": item.get("action", ""),
        "scope": "admin-access",
        "employee_id": str(item.get("employee_id")) if item.get("employee_id") else "",
        "employee_name": item.get("employee_name", ""),
        "employee_email": item.get("employee_email", ""),
        "employee_code": item.get("employee_code", ""),
        "role": item.get("role", ""),
        "department": item.get("department", ""),
        "designation": item.get("designation", ""),
        "granted_menus": granted,
        "granted_menu_labels": [labels.get(key, key) for key in granted],
        "removed_menus": removed,
        "removed_menu_labels": [labels.get(key, key) for key in removed],
        "resulting_access": resulting,
        "resulting_access_labels": [labels.get(key, key) for key in resulting],
        "changed_by_name": item.get("changed_by_name", ""),
        "changed_by_email": item.get("changed_by_email", ""),
        "changed_at": item.get("changed_at").isoformat() if isinstance(item.get("changed_at"), datetime) else item.get("changed_at"),
    }


def _record_admin_access_history(target_user, previous_access, next_access, requester):
    previous_set = set(previous_access or [])
    next_set = set(next_access or [])
    granted = sorted(next_set - previous_set)
    removed = sorted(previous_set - next_set)
    if not granted and not removed:
        return

    if granted and removed:
        action = "updated"
    elif granted:
        action = "granted"
    else:
        action = "removed"

    mongo.db.admin_access_history.insert_one({
        "action": action,
        "employee_id": target_user.get("_id"),
        "employee_name": target_user.get("name", ""),
        "employee_email": target_user.get("email", ""),
        "employee_code": target_user.get("employeeId", ""),
        "role": target_user.get("role", "Employee"),
        "department": target_user.get("department", ""),
        "designation": target_user.get("designation", ""),
        "granted_menus": granted,
        "removed_menus": removed,
        "resulting_access": next_access,
        "changed_by": requester.get("_id") if requester else None,
        "changed_by_name": (requester or {}).get("name", ""),
        "changed_by_email": (requester or {}).get("email", ""),
        "changed_at": datetime.utcnow(),
    })

@user_bp.route("/add_user", methods=["POST"])
def add_user():
    try:
        _, error_response = require_admin_menu_access("add")
        if error_response:
            return error_response

        data = request.get_json()
        print("\n📩 Received data:", data)

        # ✅ Ensure employeeId is provided
        if not data.get("employeeId"):
            return jsonify({"error": "employeeId is required"}), 400

        # ✅ Check if employeeId already exists
        existing = mongo.db.users.find_one({"employeeId": data["employeeId"]})
        if existing:
            return jsonify({"error": "Employee ID already exists"}), 400

        reports_to_email = data.get("reportsToEmail")

        # Manager linkage logic
        if reports_to_email:
            manager = mongo.db.users.find_one({"email": reports_to_email})
            if manager:
                data["reportsTo"] = manager["_id"]
            else:
                print(f"⚠️ Manager {reports_to_email} not found, auto-creating...")
                manager_id = mongo.db.users.insert_one({
                    "employeeId": f"AUTO-MGR-{int(datetime.utcnow().timestamp())}",
                    "name": reports_to_email.split("@")[0].capitalize(),
                    "email": reports_to_email,
                    "password": "autocreated",
                    "role": "Manager",
                    "designation": "Auto-created Manager",
                    "department": "General",
                    "shiftTimings": "09:00 - 18:00",
                    "projects": [],
                    "leaveBalance": {
                        "sick": 6,
                        "sickTotal": 6,
                        "planned": 12,
                        "plannedTotal": 12,
                        "optional": 2,
                        "optionalTotal": 2,
                        "lwp": 0
                    },
                    "adminMenuAccess": [],
                    "dateOfJoining": datetime.utcnow(),
                    "dateOfBirth": None,
                    "createdAt": datetime.utcnow()
                }).inserted_id
                data["reportsTo"] = manager_id

        data.pop("reportsToEmail", None)
        data["is_active"] = bool(data.get("is_active", True))
        data["createdAt"] = datetime.utcnow()
        data["adminMenuAccess"] = normalize_admin_menu_access(data.get("adminMenuAccess"))

        # Handle joining date safely - STORE IT FIRST
        joining_date_for_accrual = None
        try:
            if "dateOfJoining" in data and data["dateOfJoining"]:
                parsed_doj = datetime.fromisoformat(data["dateOfJoining"].replace('Z', '+00:00'))
                data["dateOfJoining"] = parsed_doj
                joining_date_for_accrual = parsed_doj
            else:
                data["dateOfJoining"] = datetime.utcnow()
                joining_date_for_accrual = datetime.utcnow()
        except Exception:
            data["dateOfJoining"] = datetime.utcnow()
            joining_date_for_accrual = datetime.utcnow()

        # Handle date of birth safely
        try:
            if "dateOfBirth" in data and data["dateOfBirth"]:
                data["dateOfBirth"] = datetime.fromisoformat(data["dateOfBirth"].replace('Z', '+00:00'))
            else:
                data["dateOfBirth"] = None
        except Exception:
            data["dateOfBirth"] = None

        # Calculate leave balance based on joining date - USE THE STORED VALUE
        join_dt = joining_date_for_accrual if joining_date_for_accrual else datetime.utcnow()

        # Calculate months since joining (including current month)
        today = datetime.utcnow()
        months_employed = (today.year - join_dt.year) * 12 + (today.month - join_dt.month) + 1

        # 🔹 NEW: Fortnight rule – if joined after 15th, don't count joining month
        if join_dt.day > 15:
            months_employed -= 1
            if months_employed < 0:
                months_employed = 0

        # Accrual rates: 1 planned per month, 0.5 sick per month
        planned_balance = months_employed * 1.0
        sick_balance = months_employed * 0.5

        #data on this indent
        # 🔹 NEW: Check employment type for intern-specific leave allocation
        employment_type = data.get("employment_type", "Employee")

        if employment_type == "Intern":
            # Interns get ONLY sick leave (no planned/optional)
            data["leaveBalance"] = {
                "sick": sick_balance,
                "sickTotal": sick_balance,
                "planned": 0,
                "plannedTotal": 0,
                "optional": 0,
                "optionalTotal": 0,
                "lwp": 0,
                "lastAccrualDate": today.replace(day=1)
            }
            print(f"✅ INTERN leave balance: Sick={sick_balance} only (Months employed: {months_employed})")
        else:
            # Regular employees get full leave allocation
            data["leaveBalance"] = {
                "sick": sick_balance,
                "sickTotal": sick_balance,
                "planned": planned_balance,
                "plannedTotal": planned_balance,
                "optional": 2,
                "optionalTotal": 2,
                "lwp": 0,
                "lastAccrualDate": today.replace(day=1)
            }
            print(f"✅ EMPLOYEE leave balance: Sick={sick_balance}, Planned={planned_balance} (Months employed: {months_employed})")
        # 👆👆👆 LEAVE BALANCE CALCULATION ENDS HERE 👆👆👆

        # ✅ Insert user (employeeId is now required in data)
        mongo.db.users.insert_one(data)
        return jsonify({"message": "User added successfully!", "employeeId": data["employeeId"]}), 201

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# -------------------------------
# Get All Users (Read)
# -------------------------------
@user_bp.route("/", methods=["GET"])
def get_users():
    try:
        users = list(mongo.db.users.find())
        for user in users:
            user["_id"] = str(user["_id"])
            user["is_active"] = user.get("is_active", True)
            user["adminMenuAccess"] = normalize_admin_menu_access(user.get("adminMenuAccess"))

            # ✅ BUILD PHOTO URL
            base = request.host_url.rstrip("/")
            user_id_str = str(user["_id"])
            photo_url = None

            photo_extensions = ['.png', '.jpg', '.jpeg', '.webp']
            for ext in photo_extensions:
                photo_filename = f"{user_id_str}{ext}"
                photo_path = os.path.join("static", "profile_photos", photo_filename)
                if os.path.exists(photo_path):
                    photo_url = f"{base}/static/profile_photos/{photo_filename}"
                    break

            user["photoUrl"] = photo_url
            
            # Convert reportsTo ObjectId to reportsToEmail string
            if "reportsTo" in user and user["reportsTo"]:
                if isinstance(user["reportsTo"], ObjectId):
                    # Find the manager and get their email
                    manager = mongo.db.users.find_one({"_id": user["reportsTo"]})
                    if manager:
                        user["reportsToEmail"] = manager["email"]
                    user["reportsTo"] = str(user["reportsTo"])
                elif isinstance(user["reportsTo"], str):
                    # Already converted, find manager by string ID
                    try:
                        manager = mongo.db.users.find_one({"_id": ObjectId(user["reportsTo"])})
                        if manager:
                            user["reportsToEmail"] = manager["email"]
                    except:
                        pass

            # Convert peopleLead ObjectId to peopleLeadEmail string
            if "peopleLead" in user and user["peopleLead"]:
                if isinstance(user["peopleLead"], ObjectId):
                    people_lead = mongo.db.users.find_one({"_id": user["peopleLead"]})
                    if people_lead:
                        user["peopleLeadEmail"] = people_lead["email"]
                    user["peopleLead"] = str(user["peopleLead"])
                elif isinstance(user["peopleLead"], str):
                    try:
                        people_lead = mongo.db.users.find_one({"_id": ObjectId(user["peopleLead"])})
                        if people_lead:
                            user["peopleLeadEmail"] = people_lead["email"]
                    except:
                        pass
            
        return jsonify(serialize_all(users)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Admin: Get All Employees (exclude Admins)
# -------------------------------
@user_bp.route("/get_all_employees", methods=["GET"])
def get_all_employees():
    try:
        requester = resolve_requester()
        if not requester:
            return jsonify({"error": "A valid requester is required"}), 401

        if not (
            is_full_admin(requester)
            or has_admin_menu_access(requester, "apply-behalf")
            or has_admin_menu_access(requester, "projects")
            or has_admin_menu_access(requester, "timesheets")
        ):
            return jsonify({"error": "You do not have access to this employee list"}), 403

        employees = list(mongo.db.users.find({"role": {"$ne": "Admin"}}))  # Exclude Admins

        for emp in employees:
            emp["is_active"] = emp.get("is_active", True)
            emp["adminMenuAccess"] = normalize_admin_menu_access(emp.get("adminMenuAccess"))
            # ✅ BUILD PHOTO URL
            base = request.host_url.rstrip("/")
            emp_id_str = str(emp["_id"])
            photo_url = None

            photo_extensions = ['.png', '.jpg', '.jpeg', '.webp']
            for ext in photo_extensions:
                photo_filename = f"{emp_id_str}{ext}"
                photo_path = os.path.join("static", "profile_photos", photo_filename)
                if os.path.exists(photo_path):
                    photo_url = f"{base}/static/profile_photos/{photo_filename}"
                    break

            emp["photoUrl"] = photo_url
                
            if "reportsTo" in emp and isinstance(emp["reportsTo"], ObjectId):
                emp["reportsTo"] = str(emp["reportsTo"])

        return jsonify(serialize_all(employees)), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@user_bp.route("/access-management", methods=["GET"])
def get_access_management_data():
    try:
        _, error_response = require_admin()
        if error_response:
            return error_response

        users = list(mongo.db.users.find({}, {
            "employeeId": 1,
            "name": 1,
            "email": 1,
            "role": 1,
            "designation": 1,
            "department": 1,
            "is_active": 1,
            "adminMenuAccess": 1,
        }).sort("name", 1))
        history = list(mongo.db.admin_access_history.find().sort("changed_at", -1).limit(100))

        return jsonify({
            "options": get_admin_menu_options(),
            "users": [_serialize_access_user(user) for user in users],
            "history": [_serialize_admin_access_history(item) for item in history],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@user_bp.route("/access-management/<user_id>", methods=["PUT"])
def update_access_management(user_id):
    try:
        requester, error_response = require_admin()
        if error_response:
            return error_response

        data = request.get_json() or {}
        next_access = normalize_admin_menu_access(data.get("adminMenuAccess"))

        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"error": "User not found"}), 404

        if is_full_admin(user):
            return jsonify({"error": "Full admin accounts already have complete access"}), 400

        previous_access = normalize_admin_menu_access(user.get("adminMenuAccess"))

        mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "adminMenuAccess": next_access,
                    "accessManagementUpdatedAt": datetime.utcnow(),
                    "accessManagementUpdatedBy": requester["_id"],
                }
            },
        )
        _record_admin_access_history(user, previous_access, next_access, requester)

        updated_user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        history = list(mongo.db.admin_access_history.find().sort("changed_at", -1).limit(100))
        return jsonify({
            "message": "Access updated successfully",
            "user": _serialize_access_user(updated_user),
            "history": [_serialize_admin_access_history(item) for item in history],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@user_bp.route("/directory", methods=["GET"])
def get_employee_directory():
    """Directory API contract for employee and leave-aware listing."""
    try:
        scope = (request.args.get("scope") or "all").strip().lower()
        manager_email = (request.args.get("manager_email") or "").strip()
        include_admins = (request.args.get("include_admins") or "false").strip().lower() == "true"
        search_term = (request.args.get("search") or "").strip()
        department = (request.args.get("department") or "").strip()
        status_filter = (request.args.get("status") or "all").strip().lower()
        project_filter = (request.args.get("project") or "").strip()
        leave_filter = (request.args.get("leave_last_month") or "all").strip().lower()
        joined_from = _parse_date_value(request.args.get("joined_from"))
        joined_to = _parse_date_value(request.args.get("joined_to"))
        period_start_raw = request.args.get("period_start")
        period_end_raw = request.args.get("period_end")
        sort_by = (request.args.get("sort_by") or "name").strip().lower()
        sort_order = (request.args.get("sort_order") or "asc").strip().lower()
        requester = resolve_requester()

        if scope == "all":
            if not requester:
                return jsonify({"error": "A valid requester is required"}), 401
            if not has_admin_menu_access(requester, "employees"):
                return jsonify({"error": "You do not have access to the enterprise directory"}), 403

        query = {}
        if not include_admins:
            query["role"] = {"$ne": "Admin"}

        if scope == "manager":
            if not manager_email:
                return jsonify({"error": "manager_email is required for manager scope"}), 400

            manager = mongo.db.users.find_one({"email": manager_email})
            if not manager:
                return jsonify(
                    {
                        "items": [],
                        "meta": {
                            "scope": scope,
                            "scope_records": 0,
                            "filtered_records": 0,
                            "active_filtered_records": 0,
                            "available_filters": {
                                "departments": [],
                                "projects": [],
                            },
                            "applied_filters": {
                                "search": search_term,
                                "department": department or "all",
                                "status": status_filter,
                                "project": project_filter or "all",
                                "joined_from": request.args.get("joined_from") or "",
                                "joined_to": request.args.get("joined_to") or "",
                                "leave_last_month": leave_filter,
                                "period_start": _resolve_period_window(period_start_raw, period_end_raw)[0].isoformat(),
                                "period_end": _resolve_period_window(period_start_raw, period_end_raw)[1].isoformat(),
                                "sort_by": sort_by,
                                "sort_order": sort_order,
                            },
                        },
                    }
                ), 200

            query["reportsTo"] = manager["_id"]

        employees = list(mongo.db.users.find(query))
        base_url = request.host_url.rstrip("/")
        leave_summaries, period_start, period_end = _get_leave_summaries_for_period(
            [employee["_id"] for employee in employees],
            period_start_raw,
            period_end_raw,
        )

        scope_items = [
            _serialize_directory_employee(
                employee,
                base_url,
                leave_summaries.get(str(employee["_id"]), {}),
                period_start,
                period_end,
            )
            for employee in employees
        ]

        available_departments = sorted(
            {item["department"] for item in scope_items if item.get("department")}
        )
        available_projects = sorted(
            {
                project_name
                for item in scope_items
                for project_name in item.get("projectNames", [])
                if project_name
            }
        )

        filtered_items = [
            item
            for item in scope_items
            if _employee_matches_filters(
                item,
                search_term,
                department,
                status_filter,
                project_filter,
                joined_from,
                joined_to,
                leave_filter,
            )
        ]

        reverse = sort_order == "desc"
        filtered_items.sort(key=lambda item: _employee_sort_value(item, sort_by), reverse=reverse)

        active_filtered_records = sum(
            1 for item in filtered_items if item.get("is_active") is not False
        )

        return jsonify(
            {
                "items": filtered_items,
                "meta": {
                    "scope": scope,
                    "scope_records": len(scope_items),
                    "filtered_records": len(filtered_items),
                    "active_filtered_records": active_filtered_records,
                    "available_filters": {
                        "departments": available_departments,
                        "projects": available_projects,
                    },
                    "last_month_window": {
                        "start": period_start.isoformat(),
                        "end": period_end.isoformat(),
                    },
                    "period_window": {
                        "start": period_start.isoformat(),
                        "end": period_end.isoformat(),
                    },
                    "applied_filters": {
                        "search": search_term,
                        "department": department or "all",
                        "status": status_filter,
                        "project": project_filter or "all",
                        "joined_from": request.args.get("joined_from") or "",
                        "joined_to": request.args.get("joined_to") or "",
                        "leave_last_month": leave_filter,
                        "period_start": period_start.isoformat(),
                        "period_end": period_end.isoformat(),
                        "sort_by": sort_by,
                        "sort_order": sort_order,
                    },
                },
            }
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

# -------------------------------
# Get Single User by ID
# -------------------------------
@user_bp.route("/<user_id>", methods=["GET"])
def get_user(user_id):
    try:
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        # BUILD PHOTO URL
        base = request.host_url.rstrip("/")
        user_id_str = str(user["_id"])
        photo_url = None

        photo_extensions = ['.png', '.jpg', '.jpeg', '.webp']
        for ext in photo_extensions:
            photo_filename = f"{user_id_str}{ext}"
            photo_path = os.path.join("static", "profile_photos", photo_filename)
            if os.path.exists(photo_path):
                photo_url = f"{base}/static/profile_photos/{photo_filename}"
                break

        user["photoUrl"] = photo_url
        user["is_active"] = user.get("is_active", True)
        user["adminMenuAccess"] = normalize_admin_menu_access(user.get("adminMenuAccess"))

        # Convert reportsTo ObjectId to reportsToEmail string
        if "reportsTo" in user and user["reportsTo"]:
            if isinstance(user["reportsTo"], ObjectId):
                manager = mongo.db.users.find_one({"_id": user["reportsTo"]})
                if manager:
                    user["reportsToEmail"] = manager["email"]
                user["reportsTo"] = str(user["reportsTo"])
            elif isinstance(user["reportsTo"], str):
                try:
                    manager = mongo.db.users.find_one({"_id": ObjectId(user["reportsTo"])})
                    if manager:
                        user["reportsToEmail"] = manager["email"]
                except:
                    pass

        # ✅ NEW: Convert peopleLead ObjectId to peopleLeadEmail string
        if "peopleLead" in user and user["peopleLead"]:
            if isinstance(user["peopleLead"], ObjectId):
                people_lead = mongo.db.users.find_one({"_id": user["peopleLead"]})
                if people_lead:
                    user["peopleLeadEmail"] = people_lead["email"]
                user["peopleLead"] = str(user["peopleLead"])
            elif isinstance(user["peopleLead"], str):
                try:
                    people_lead = mongo.db.users.find_one({"_id": ObjectId(user["peopleLead"])})
                    if people_lead:
                        user["peopleLeadEmail"] = people_lead["email"]
                except:
                    pass

        # --- FIX: Convert project ObjectIds to strings ---
        if "projects" in user and isinstance(user["projects"], list):
            for proj in user["projects"]:
                if "_id" in proj and isinstance(proj["_id"], ObjectId):
                    proj["_id"] = str(proj["_id"])
        
        return jsonify(serialize_all(user)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Get Manager by Employee ID
# -------------------------------
@user_bp.route("/get_manager/<employee_id>", methods=["GET"])
def get_manager(employee_id):
    try:
        employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
        if not employee or "reportsTo" not in employee:
            return jsonify({"error": "Employee or manager not found"}), 404

        manager = mongo.db.users.find_one({"_id": employee["reportsTo"]})
        if not manager:
            return jsonify([]), 200  # Return empty array instead of error

        manager["_id"] = str(manager["_id"])
        return jsonify(manager), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------
# PROJECT MANAGEMENT ROUTES (CLEAN + FIXED)
# ------------------------------------------
@user_bp.route("/assign_project/<user_id>", methods=["POST"])
def assign_project(user_id):
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        data = request.get_json()
        project_id = data.get("projectId")
        start_raw = data.get("startDate")
        end_raw = data.get("endDate")
        
        if not project_id or not start_raw:
            return jsonify({"error": "Project ID and start date required"}), 400
        
        # Verify project exists
        project = mongo.db.projects.find_one({"_id": ObjectId(project_id)})
        if not project:
            return jsonify({"error": "Project not found"}), 404
        
        # Parse dates
        # Parse dates - handle both YYYY-MM-DD and ISO formats
        try:
            # Try YYYY-MM-DD format first (from date input)
            if len(start_raw) == 10 and start_raw.count('-') == 2:
                start = datetime.strptime(start_raw, "%Y-%m-%d")
            else:
                # Fallback to ISO format
                start = datetime.fromisoformat(start_raw.replace('Z', '+00:00'))
        except Exception as e:
            print(f"❌ Error parsing start date '{start_raw}': {e}")
            return jsonify({"error": f"Invalid start date format: {start_raw}"}), 400

        end = None
        if end_raw:
            try:
                # Try YYYY-MM-DD format first (from date input)
                if len(end_raw) == 10 and end_raw.count('-') == 2:
                    end = datetime.strptime(end_raw, "%Y-%m-%d")
                else:
                    # Fallback to ISO format
                    end = datetime.fromisoformat(end_raw.replace('Z', '+00:00'))
            except Exception as e:
                print(f"⚠️ Could not parse end date '{end_raw}': {e}")
                end = None
        
        # Check if already assigned
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if user and "projects" in user:
            for proj in user["projects"]:
                if str(proj.get("projectId")) == project_id:
                    return jsonify({"error": "Project already assigned to this user"}), 400
        
        assignment = {
            "_id": ObjectId(),
            "projectId": ObjectId(project_id),
            "projectName": project["title"],
            "startDate": start,
            "endDate": end,
            "assignedAt": datetime.utcnow()
        }
        
        mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$push": {"projects": assignment}}
        )
        
        return jsonify({
            "message": "Project assigned successfully",
            "assignment": serialize_all(assignment)
        }), 200
        
    except Exception as e:
        print(f"❌ Error assigning project: {str(e)}")
        return jsonify({"error": str(e)}), 500

@user_bp.route("/update_project/<user_id>/<assignment_id>", methods=["PUT"])
def update_project_assignment(user_id, assignment_id):
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        data = request.get_json()
        
        update_fields = {}
        if "startDate" in data:
            start_raw = data["startDate"]
            try:
                if len(start_raw) == 10 and start_raw.count('-') == 2:
                    update_fields["projects.$.startDate"] = datetime.strptime(start_raw, "%Y-%m-%d")
                else:
                    update_fields["projects.$.startDate"] = datetime.fromisoformat(
                        start_raw.replace('Z', '+00:00')
                    )
            except Exception as e:
                print(f"❌ Error parsing start date: {e}")
                return jsonify({"error": "Invalid start date format"}), 400

        if "endDate" in data:
            if data["endDate"]:
                end_raw = data["endDate"]
                try:
                    if len(end_raw) == 10 and end_raw.count('-') == 2:
                        update_fields["projects.$.endDate"] = datetime.strptime(end_raw, "%Y-%m-%d")
                    else:
                        update_fields["projects.$.endDate"] = datetime.fromisoformat(
                            end_raw.replace('Z', '+00:00')
                        )
                except Exception as e:
                    print(f"❌ Error parsing end date: {e}")
                    return jsonify({"error": "Invalid end date format"}), 400
            else:
                update_fields["projects.$.endDate"] = None
        
        result = mongo.db.users.update_one(
            {"_id": ObjectId(user_id), "projects._id": ObjectId(assignment_id)},
            {"$set": update_fields}
        )
        
        if result.modified_count == 0:
            return jsonify({"error": "Assignment not found or no changes"}), 404
        
        return jsonify({"message": "Project assignment updated"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@user_bp.route("/delete_project/<user_id>/<assignment_id>", methods=["DELETE"])
def delete_project_assignment(user_id, assignment_id):
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        result = mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$pull": {"projects": {"_id": ObjectId(assignment_id)}}}
        )
        
        if result.modified_count == 0:
            return jsonify({"error": "Assignment not found"}), 404
        
        return jsonify({"message": "Project assignment removed"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------------------------------
# Update User (PUT) - MERGED FUNCTION with DOB support
# -------------------------------
# Replace the ENTIRE update_user function in user_routes.py with this:

@user_bp.route("/update_user/<user_id>", methods=["PUT"])
def update_user(user_id):
    try:
        data = request.get_json()
        print(f"🛠 Updating user {user_id} with RAW data:", data)

        requester = resolve_requester()
        if not requester:
            return jsonify({"error": "A valid requester is required"}), 401

        requester_id = str(requester["_id"])
        is_self_update = requester_id == user_id
        requester_is_admin = is_full_admin(requester)

        if not (is_self_update or requester_is_admin):
            return jsonify({"error": "You do not have permission to update this profile"}), 403

        # Check if user exists
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"error": "User not found"}), 404

        update_data = {}

        if not requester_is_admin:
            restricted_fields = {
                "role",
                "leaveBalance",
                "projects",
                "adminMenuAccess",
                "reportsToEmail",
                "peopleLeadEmail",
                "department",
                "designation",
                "employment_type",
                "companyCode",
                "costCenter",
                "workLocation",
                "shiftTimings",
            }
            if any(field in data for field in restricted_fields):
                return jsonify({"error": "You do not have permission to update restricted fields"}), 403

        # Handle password change separately with verification
        if "password" in data:
            if not is_self_update and not requester_is_admin:
                return jsonify({"error": "You do not have permission to change another user's password"}), 403

            current_password = data.get("currentPassword")
            
            if current_password:
                if user.get("password") != current_password:
                    return jsonify({"error": "Current password is incorrect"}), 400
            
            update_data["password"] = data["password"]
            data.pop("currentPassword", None)
            data.pop("password", None)

        # Handle reportsToEmail linkage update
        if "reportsToEmail" in data:
            if data["reportsToEmail"]:
                manager = mongo.db.users.find_one({"email": data["reportsToEmail"]})
                if manager:
                    update_data["reportsTo"] = manager["_id"]
                else:
                    return jsonify({"error": "Manager not found with provided email"}), 404
            else:
                update_data["reportsTo"] = None
            data.pop("reportsToEmail", None)

        # Handle peopleLeadEmail linkage update
        if "peopleLeadEmail" in data:
            ple = data["peopleLeadEmail"]

            if ple:
                people_lead = mongo.db.users.find_one({"email": ple})
                if people_lead:
                    update_data["peopleLead"] = people_lead["_id"]
                    update_data["peopleLeadEmail"] = ple
                else:
                    update_data["peopleLeadEmail"] = ple
            else:
                update_data["peopleLead"] = None
                update_data["peopleLeadEmail"] = ""
            
            data.pop("peopleLeadEmail", None)

        # ✅ CRITICAL FIX: Parse dates with proper validation
        if "dateOfJoining" in data:
            doj = data["dateOfJoining"]
            print(f"📅 Processing dateOfJoining: '{doj}' (type: {type(doj)})")
            
            if doj is None or doj == "" or doj == "null":
                print("⚠️ dateOfJoining is empty, setting to None")
                update_data["dateOfJoining"] = None
            elif isinstance(doj, str) and doj.strip():
                try:
                    # Try YYYY-MM-DD format first
                    parsed_date = datetime.strptime(doj.strip(), "%Y-%m-%d")
                    update_data["dateOfJoining"] = parsed_date
                    print(f"✅ Parsed dateOfJoining (YYYY-MM-DD): {update_data['dateOfJoining']}")
                except ValueError:
                    try:
                        # Fallback to ISO format
                        parsed_date = datetime.fromisoformat(doj.replace('Z', '+00:00'))
                        update_data["dateOfJoining"] = parsed_date
                        print(f"✅ Parsed dateOfJoining (ISO): {update_data['dateOfJoining']}")
                    except Exception as e:
                        print(f"❌ Failed to parse dateOfJoining: {doj}, Error: {e}")
                        # Don't update this field if parsing fails
            data.pop("dateOfJoining", None)

        if "dateOfBirth" in data:
            dob = data["dateOfBirth"]
            print(f"📅 Processing dateOfBirth: '{dob}' (type: {type(dob)})")
            
            if dob is None or dob == "" or dob == "null":
                print("⚠️ dateOfBirth is empty, setting to None")
                update_data["dateOfBirth"] = None
            elif isinstance(dob, str) and dob.strip():
                try:
                    # Try YYYY-MM-DD format first
                    parsed_date = datetime.strptime(dob.strip(), "%Y-%m-%d")
                    update_data["dateOfBirth"] = parsed_date
                    print(f"✅ Parsed dateOfBirth (YYYY-MM-DD): {update_data['dateOfBirth']}")
                except ValueError:
                    try:
                        # Fallback to ISO format
                        parsed_date = datetime.fromisoformat(dob.replace('Z', '+00:00'))
                        update_data["dateOfBirth"] = parsed_date
                        print(f"✅ Parsed dateOfBirth (ISO): {update_data['dateOfBirth']}")
                    except Exception as e:
                        print(f"❌ Failed to parse dateOfBirth: {dob}, Error: {e}")
                        # Don't update this field if parsing fails
            data.pop("dateOfBirth", None)

        # Fields that can be updated (REMOVED dateOfJoining and dateOfBirth from here)
        allowed_fields = [
            "name", "email", "designation", "department", "shiftTimings",
            "projects", "role", "leaveBalance", "workLocation", "assignedLocation",
            "companyCode", "costCenter", "employment_type"
        ]

        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]

        if not update_data:
            return jsonify({"error": "No valid fields to update"}), 400

        # If email is being updated, check it's not already taken
        if "email" in update_data and update_data["email"] != user.get("email"):
            existing = mongo.db.users.find_one({
                "email": update_data["email"],
                "_id": {"$ne": ObjectId(user_id)}
            })
            if existing:
                return jsonify({"error": "Email already in use"}), 400

        # ✅ DEBUG: Print what's being saved
        print(f"\n📝 Final update_data being saved to MongoDB:")
        for key, value in update_data.items():
            print(f"   {key}: {value} (type: {type(value)})")

        # Update the user
        result = mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            print(f"✅ User {user_id} updated successfully - {result.modified_count} field(s) modified")
            
            # Verify the update
            updated_user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            print(f"🔍 Verification - dateOfBirth in DB: {updated_user.get('dateOfBirth')}")
            print(f"🔍 Verification - dateOfJoining in DB: {updated_user.get('dateOfJoining')}")
            
            return jsonify({"message": "User updated successfully"}), 200
        else:
            print(f"⚠️ No changes made to user {user_id} - check if data is identical to existing")
            return jsonify({"message": "No changes made"}), 200

    except Exception as e:
        import traceback
        print(f"❌ Error updating user: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Delete User (DELETE)
# -------------------------------
@user_bp.route("/delete_user/<user_id>", methods=["DELETE"])
def delete_user(user_id):
    try:
        _, error_response = require_admin()
        if error_response:
            return error_response

        result = mongo.db.users.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 0:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Admin: Activate / Deactivate User
# -------------------------------
@user_bp.route("/set_active/<user_id>", methods=["PUT"])
def set_user_active_status(user_id):
    try:
        _, error_response = require_admin_menu_access("employees")
        if error_response:
            return error_response

        data = request.get_json() or {}
        is_active = data.get("is_active")

        if not isinstance(is_active, bool):
            return jsonify({"error": "is_active must be true or false"}), 400

        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"error": "User not found"}), 404

        mongo.db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_active": is_active}}
        )

        return jsonify({
            "message": f"User marked as {'active' if is_active else 'inactive'} successfully",
            "user_id": user_id,
            "is_active": is_active
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Get Employees under a Manager (by Manager Email)
# -------------------------------
# Replace the get_employees_by_manager function in user_routes.py (around line 257)

# Replace ONLY the get_employees_by_manager function in user_routes.py

@user_bp.route("/get_employees_by_manager/<manager_email>", methods=["GET"])
def get_employees_by_manager(manager_email):
    try:
        print(f"\n{'='*60}")
        print(f"🔍 GET EMPLOYEES BY MANAGER REQUEST")
        print(f"{'='*60}")
        print(f"Manager email: {manager_email}")
        
        # Step 1: Find the manager by email
        manager = mongo.db.users.find_one({"email": manager_email})
        if not manager:
            print(f"❌ Manager not found: {manager_email}")
            return jsonify([]), 200
        
        manager_id = manager["_id"]
        print(f"✅ Found manager: {manager.get('name')} (ID: {manager_id})")
        
        # Step 2: Find all employees reporting to this manager
        # FIXED: Use only ObjectId comparison, not email
        employees = list(mongo.db.users.find({
            "reportsTo": manager_id,
            "role": {"$ne": "Admin"}  # Exclude admins from employee list
        }))
        
        print(f"📊 Found {len(employees)} employees")
        
        # Step 3: Serialize FIRST
        serialized_employees = serialize_all(employees)
        print(f"✅ Serialization complete")
        
        # Step 4: Add photo URLs to the ALREADY SERIALIZED data
        base = request.host_url.rstrip("/")
        for emp in serialized_employees:
            emp_id_str = emp["_id"]  # Now it's a string
            photo_url = None
            
            photo_extensions = ['.png', '.jpg', '.jpeg', '.webp']
            for ext in photo_extensions:
                photo_filename = f"{emp_id_str}{ext}"
                photo_path = os.path.join("static", "profile_photos", photo_filename)
                if os.path.exists(photo_path):
                    photo_url = f"{base}/static/profile_photos/{photo_filename}"
                    break
            
            emp["photoUrl"] = photo_url
            
            # Ensure reportsToEmail is set
            if not emp.get("reportsToEmail"):
                emp["reportsToEmail"] = manager_email
            
            print(f"   👤 {emp.get('name')} - ID: {emp_id_str} - Photo: {'✓' if photo_url else '✗'}")
        
        print(f"✅ Returning {len(serialized_employees)} serialized employees")
        print(f"{'='*60}\n")
        
        return jsonify(serialized_employees), 200
        
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ ERROR in get_employees_by_manager")
        print(f"{'='*60}")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"{'='*60}\n")
        return jsonify([]), 200


# -------------------------------
# Upload Profile Photo
# -------------------------------
@user_bp.route("/upload_photo/<user_id>", methods=["POST"])
def upload_photo(user_id):
    try:
        print("📸 Upload request received for", user_id)

        requester = resolve_requester()
        if not requester:
            return jsonify({"error": "A valid requester is required"}), 401

        if str(requester["_id"]) != user_id and not is_full_admin(requester):
            return jsonify({"error": "You do not have permission to update this photo"}), 403

        if "photo" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["photo"]

        # Validate extension
        allowed_ext = {"png", "jpg", "jpeg", "webp"}
        ext = file.filename.rsplit(".", 1)[-1].lower()

        if ext not in allowed_ext:
            return jsonify({"error": "Invalid file type. Only PNG/JPG/WEBP allowed"}), 400

        # Generate filename
        filename = f"{user_id}.{ext}"

        # Create uploads folder if missing
        import os
        upload_folder = os.path.join("static", "profile_photos")
        os.makedirs(upload_folder, exist_ok=True)

        # Save file
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)

        # Save path in DB
        # Save filename in DB (not the full path)
        # Save filename in DB
        mongo.db.users.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"photoFilename": filename}}
        )

        # Build the photo URL
        base = request.host_url.rstrip("/")
        photo_url = f"{base}/static/profile_photos/{filename}"

        print("✅ Photo uploaded:", photo_url)
        return jsonify({"message": "Photo uploaded successfully", "url": photo_url})

    except Exception as e:
        print("❌ Upload error:", str(e))
        return jsonify({"error": str(e)}), 500

# Add this route temporarily at the bottom of user_routes.py
@user_bp.route("/admin/fix_reportees", methods=["POST"])
def admin_fix_reportees():
    """
    Admin route to fix all employees missing reportsToEmail
    """
    try:
        employees_to_fix = list(mongo.db.users.find({
            "reportsTo": {"$exists": True, "$ne": None},
            "$or": [
                {"reportsToEmail": {"$exists": False}},
                {"reportsToEmail": None},
                {"reportsToEmail": ""}
            ]
        }))
        
        print(f"🔍 Found {len(employees_to_fix)} employees to fix")
        
        fixed_count = 0
        for emp in employees_to_fix:
            manager = mongo.db.users.find_one({"_id": emp["reportsTo"]})
            if manager and manager.get("email"):
                result = mongo.db.users.update_one(
                    {"_id": emp["_id"]},
                    {"$set": {"reportsToEmail": manager["email"]}}
                )
                if result.modified_count > 0:
                    fixed_count += 1
                    print(f"✅ Fixed: {emp.get('name')} → {manager['email']}")
        
        return jsonify({
            "message": f"Fixed {fixed_count} employees",
            "fixed": fixed_count,
            "total": len(employees_to_fix)
        }), 200
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@user_bp.route("/admin/migrate_employment_type", methods=["POST"])
def migrate_employment_type():
    """
    ONE-TIME migration to add employment_type field to all users
    Call this endpoint once: POST http://your-server/api/users/admin/migrate_employment_type
    """
    try:
        print("\n" + "="*60)
        print("🔄 MIGRATION: Adding employment_type field")
        print("="*60)
        
        # Count total users
        total_users = mongo.db.users.count_documents({})
        print(f"📊 Total users in database: {total_users}")
        
        # Update users WITHOUT employment_type field
        # Set to "Employee" by default (you can manually change interns later)
        result = mongo.db.users.update_many(
            {
                "$or": [
                    {"employment_type": {"$exists": False}},
                    {"employment_type": None},
                    {"employment_type": ""}
                ]
            },
            {
                "$set": {
                    "employment_type": "Employee"
                }
            }
        )
        
        print(f"✅ Updated {result.modified_count} users → Employee")
        
        # Verify results
        employee_count = mongo.db.users.count_documents({"employment_type": "Employee"})
        intern_count = mongo.db.users.count_documents({"employment_type": "Intern"})
        
        print(f"\n📋 Final counts:")
        print(f"   Employees: {employee_count}")
        print(f"   Interns: {intern_count}")
        print(f"   Total: {employee_count + intern_count}")
        print("="*60 + "\n")
        
        return jsonify({
            "success": True,
            "message": f"Updated {result.modified_count} users with employment_type=Employee",
            "modified": result.modified_count,
            "employees": employee_count,
            "interns": intern_count
        }), 200
        
    except Exception as e:
        print(f"❌ Migration error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
