# routes/charge_code_routes.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from config.db import mongo
from utils.access_control import require_admin_menu_access

charge_code_bp = Blueprint("charge_code_bp", __name__)


# ========================================
# SERIALIZATION HELPERS
# ========================================

def serialize_all(obj):
    """Fully recursive serializer - converts ALL ObjectIds and datetimes."""
    if isinstance(obj, list):
        return [serialize_all(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_all(v) for k, v in obj.items()}
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def clean_text(value):
    """Normalize optional text fields from JSON payloads."""
    return str(value or "").strip()


def normalize_charge_code_domain(value, default="time", allow_blank=False):
    raw = clean_text(value).lower()
    if not raw:
        return "" if allow_blank else default
    if raw not in {"time", "expense"}:
        raise ValueError("domain must be either 'time' or 'expense'")
    return raw


def build_domain_query(domain):
    if not domain:
        return {}
    if domain == "expense":
        return {"domain": "expense"}
    return {
        "$or": [
            {"domain": "time"},
            {"domain": {"$exists": False}},
            {"domain": ""},
            {"domain": None},
        ]
    }


def first_non_empty(*values):
    """Return the first value that is not None or blank after trimming."""
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        return value
    return ""


REFERENCE_CHARGE_CODES = [
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "B5IT4009"},
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "BXS12006"},
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "BXS12003"},
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "CDSVM003"},
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "CCGLS003"},
    {"type": "Chargeable", "sub_type": "", "client": "", "country": "", "description": "", "code": "CGCK4001"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "", "code": "A302005"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "Job Search / Outplacement", "code": "A304005"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "New Hire Orientation", "code": "A302505"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "Testing & Vaccinations", "code": "TESTVAC"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "Unassigned Time", "code": "A991005"},
    {"type": "Other", "sub_type": "", "client": "", "country": "", "description": "Internet Exps Max INR1000 DontChangeTime", "code": "AMKC004V"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Adoption Leave", "code": "955X06"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Bereavement Leave", "code": "955X02"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Casual leave", "code": "955X10"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Client Specific holiday", "code": "970X01"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Compensatory off", "code": "970X01"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Contingency Leave", "code": "955X05"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Earned Leave", "code": "900X00"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Leave with loss of pay", "code": "955X18"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Maternity Leave", "code": "955X04"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Optional holiday", "code": "970X03"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Other Approved Absence", "code": "955X00"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Overseas holiday", "code": "970X02"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Paternity Leave", "code": "955X08"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Public holiday", "code": "970X00"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Secondary Caregiver Leave", "code": "955X19"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Sick & Wellness Leave", "code": "950X00"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Surrogacy Leave", "code": "955X07"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Central Training - Faculty", "code": "A301020"},
    {"type": "Training/Recruiting/At", "sub_type": "Absence", "client": "", "country": "", "description": "Central Training - Participant", "code": "A301015"},
]

REFERENCE_OWNER_NAME = "naxrita"

DEPRECATED_CHARGE_CODE_CODES = {
    "123",
    "1233",
    "12345",
    "12345555",
    "NAX100",
    "1000",
}
DEPRECATED_CHARGE_CODE_VALUES = sorted(
    DEPRECATED_CHARGE_CODE_CODES | {code.lower() for code in DEPRECATED_CHARGE_CODE_CODES}
)


def is_deprecated_charge_code_code(value):
    return clean_text(value).upper() in DEPRECATED_CHARGE_CODE_CODES


def is_deprecated_charge_code(charge_code):
    if not charge_code:
        return False
    return is_deprecated_charge_code_code(charge_code.get("code"))


def cleanup_deprecated_charge_codes():
    """Hide old test charge codes from admin lists and employee assignments."""
    now = datetime.utcnow()
    deprecated_codes = list(
        mongo.db.charge_codes.find(
            {"code": {"$in": DEPRECATED_CHARGE_CODE_VALUES}},
            {"_id": 1},
        )
    )
    deprecated_ids = [item["_id"] for item in deprecated_codes]

    mongo.db.charge_codes.update_many(
        {
            "code": {"$in": DEPRECATED_CHARGE_CODE_VALUES},
            "$or": [
                {"is_active": {"$ne": False}},
                {"removed_from_portal": {"$ne": True}},
            ],
        },
        {
            "$set": {
                "is_active": False,
                "removed_from_portal": True,
                "removed_reason": "Deprecated test charge code",
                "updated_at": now,
            }
        },
    )

    assignment_filters = [{"charge_code": {"$in": DEPRECATED_CHARGE_CODE_VALUES}}]
    if deprecated_ids:
        assignment_filters.append({"charge_code_id": {"$in": deprecated_ids}})

    mongo.db.charge_code_assignments.update_many(
        {
            "$or": assignment_filters,
            "is_active": {"$ne": False},
        },
        {
            "$set": {
                "is_active": False,
                "removed_at": now,
                "removed_reason": "Deprecated test charge code",
            }
        },
    )


def ensure_reference_charge_codes():
    """Seed the workbook reference codes so admins can assign them by real DB id."""
    cleanup_deprecated_charge_codes()
    now = datetime.utcnow()
    for index, item in enumerate(REFERENCE_CHARGE_CODES):
        reference_key = f"sheet2-{index + 2}-{item['code']}"
        description = item["description"]
        mongo.db.charge_codes.update_one(
            {"reference_key": reference_key},
            {
                "$set": {
                    "code": item["code"],
                    "name": description or item["code"],
                    "domain": "time",
                    "description": description,
                    "project_name": "",
                    "type": item["type"],
                    "sub_type": item["sub_type"],
                    "client": item["client"],
                    "country": item["country"],
                    "is_active": True,
                    "is_reference": True,
                    "reference_key": reference_key,
                    "owner_name": REFERENCE_OWNER_NAME,
                    "owner_email": "",
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )


# ========================================
# CREATE CHARGE CODE (ADMIN)
# ========================================

@charge_code_bp.route("/create", methods=["POST"])
def create_charge_code():
    """
    Create a new charge code (admin only).
    Body: {
        code:        str  (e.g. "PROJ-001"),
        name:        str,
        description: str,
        project_name:str,
        is_active:   bool,
        created_by:  str  (user_id)
    }
    """
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        data         = request.get_json() or {}
        code         = clean_text(data.get("code")).upper()
        name         = clean_text(data.get("name"))
        description  = clean_text(data.get("description"))
        project_name = clean_text(data.get("project_name"))
        charge_type  = clean_text(data.get("type", data.get("charge_type", "")))
        sub_type     = clean_text(data.get("sub_type", data.get("subtype", data.get("subType", ""))))
        client       = clean_text(data.get("client"))
        country      = clean_text(data.get("country", data.get("country_region", "")))
        is_active    = bool(data.get("is_active", True))
        created_by   = data.get("created_by")
        owner_id     = data.get("owner_id")
        domain       = normalize_charge_code_domain(data.get("domain"), default="time")

        if not all([code, name, created_by]):
            return jsonify({"error": "code, name, and created_by are required"}), 400
        if is_deprecated_charge_code_code(code):
            return jsonify({"error": "This test charge code has been removed from the portal"}), 400

        try:
            creator_id = ObjectId(created_by)
        except Exception:
            return jsonify({"error": "Invalid created_by format"}), 400

        # Verify creator exists and is Admin
        creator = mongo.db.users.find_one({"_id": creator_id})
        if not creator:
            return jsonify({"error": "Creator user not found"}), 404
        if str(creator.get("role", "")).lower() != "admin":
            return jsonify({"error": "Only admins can create charge codes"}), 403

        owner = creator
        if owner_id:
            try:
                owner_obj_id = ObjectId(owner_id)
            except Exception:
                return jsonify({"error": "Invalid owner_id format"}), 400
            owner = mongo.db.users.find_one({"_id": owner_obj_id})
            if not owner:
                return jsonify({"error": "Charge code owner not found"}), 404

        # Duplicate code check
        existing = mongo.db.charge_codes.find_one({"code": code})
        if existing:
            return jsonify({"error": f"Charge code '{code}' already exists"}), 400

        charge_code = {
            "code":         code,
            "name":         name,
            "description":  description,
            "project_name": project_name,
            "type":         charge_type,
            "sub_type":     sub_type,
            "client":       client,
            "country":      country,
            "domain":       domain,
            "is_active":    is_active,
            "created_by":   creator_id,
            "owner_id":     owner["_id"],
            "owner_name":   owner.get("name", ""),
            "owner_email":  owner.get("email", ""),
            "created_at":   datetime.utcnow(),
            "updated_at":   datetime.utcnow(),
        }

        result = mongo.db.charge_codes.insert_one(charge_code)
        print(f"✅ Charge code created: {code} by {creator.get('name')}")

        return jsonify({
            "message":        "Charge code created successfully",
            "charge_code_id": str(result.inserted_id),
            "code":           code,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Error creating charge code: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# GET ALL CHARGE CODES
# ========================================

@charge_code_bp.route("/all", methods=["GET"])
def get_all_charge_codes():
    """Get all charge codes. Optional: ?active_only=true&domain=time|expense"""
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        ensure_reference_charge_codes()
        active_only = request.args.get("active_only", "false").lower() == "true"
        domain = normalize_charge_code_domain(request.args.get("domain"), allow_blank=True)
        query = {"code": {"$nin": DEPRECATED_CHARGE_CODE_VALUES}}
        query.update(build_domain_query(domain))
        if active_only:
            query["is_active"] = True
        codes = list(mongo.db.charge_codes.find(query).sort("code", 1))
        for code in codes:
            owner_id = first_non_empty(code.get("owner_id"), code.get("created_by"))
            if not owner_id:
                continue
            try:
                owner_obj_id = owner_id if isinstance(owner_id, ObjectId) else ObjectId(owner_id)
                owner = mongo.db.users.find_one({"_id": owner_obj_id})
                if owner:
                    code["owner_id"] = owner_obj_id
                    code["owner_name"] = code.get("owner_name") or owner.get("name", "")
                    code["owner_email"] = code.get("owner_email") or owner.get("email", "")
            except Exception:
                continue
        return jsonify(serialize_all(codes)), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Error fetching charge codes: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# UPDATE CHARGE CODE
# ========================================

@charge_code_bp.route("/update/<charge_code_id>", methods=["PUT"])
def update_charge_code(charge_code_id):
    """
    Update a charge code.
    Body: { name, description, project_name, type, sub_type, client, country, owner_id, is_active }
    """
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        data = request.get_json() or {}

        try:
            cc_obj_id = ObjectId(charge_code_id)
        except Exception:
            return jsonify({"error": "Invalid charge_code_id format"}), 400

        charge_code = mongo.db.charge_codes.find_one({"_id": cc_obj_id})
        if not charge_code:
            return jsonify({"error": "Charge code not found"}), 404

        update_data = {"updated_at": datetime.utcnow()}

        if "name" in data:
            update_data["name"] = clean_text(data["name"])
        if "description" in data:
            update_data["description"] = clean_text(data["description"])
        if "project_name" in data:
            update_data["project_name"] = clean_text(data["project_name"])
        if "type" in data:
            update_data["type"] = clean_text(data["type"])
        if "charge_type" in data:
            update_data["type"] = clean_text(data["charge_type"])
        if "sub_type" in data:
            update_data["sub_type"] = clean_text(data["sub_type"])
        if "subtype" in data:
            update_data["sub_type"] = clean_text(data["subtype"])
        if "subType" in data:
            update_data["sub_type"] = clean_text(data["subType"])
        if "client" in data:
            update_data["client"] = clean_text(data["client"])
        if "country" in data:
            update_data["country"] = clean_text(data["country"])
        if "country_region" in data:
            update_data["country"] = clean_text(data["country_region"])
        if "domain" in data:
            update_data["domain"] = normalize_charge_code_domain(data.get("domain"), default="time")
        if "owner_id" in data:
            owner_value = data.get("owner_id")
            if owner_value:
                try:
                    owner_obj_id = ObjectId(owner_value)
                except Exception:
                    return jsonify({"error": "Invalid owner_id format"}), 400
                owner = mongo.db.users.find_one({"_id": owner_obj_id})
                if not owner:
                    return jsonify({"error": "Charge code owner not found"}), 404
                update_data["owner_id"] = owner_obj_id
                update_data["owner_name"] = owner.get("name", "")
                update_data["owner_email"] = owner.get("email", "")
            else:
                update_data["owner_id"] = None
                update_data["owner_name"] = ""
                update_data["owner_email"] = ""
        if "is_active" in data:
            update_data["is_active"] = bool(data["is_active"])

        mongo.db.charge_codes.update_one({"_id": cc_obj_id}, {"$set": update_data})
        print(f"✅ Charge code {charge_code_id} updated")

        return jsonify({"message": "Charge code updated successfully"}), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Error updating charge code: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# DELETE CHARGE CODE
# ========================================

@charge_code_bp.route("/delete/<charge_code_id>", methods=["DELETE"])
def delete_charge_code(charge_code_id):
    """Delete a charge code (only if not currently assigned)."""
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        try:
            cc_obj_id = ObjectId(charge_code_id)
        except Exception:
            return jsonify({"error": "Invalid charge_code_id format"}), 400

        in_use = mongo.db.charge_code_assignments.find_one({
            "charge_code_id": cc_obj_id,
            "is_active":      True,
        })
        if in_use:
            return jsonify({
                "error": "Cannot delete a charge code that is currently assigned to employees"
            }), 400

        result = mongo.db.charge_codes.delete_one({"_id": cc_obj_id})
        if result.deleted_count == 0:
            return jsonify({"error": "Charge code not found"}), 404

        print(f"✅ Charge code {charge_code_id} deleted")
        return jsonify({"message": "Charge code deleted successfully"}), 200

    except Exception as e:
        print(f"❌ Error deleting charge code: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# ASSIGN CHARGE CODE(S) TO EMPLOYEE
# ========================================

@charge_code_bp.route("/assign", methods=["POST"])
def assign_charge_code():
    """
    Assign one or more charge codes to an employee.
    Body: {
        employee_id:     str,
        charge_code_ids: [str],
        assigned_by:     str  (user_id),
        start_date:      "YYYY-MM-DD"  (optional),
        end_date:        "YYYY-MM-DD"  (optional)
    }
    """
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        cleanup_deprecated_charge_codes()
        data            = request.get_json() or {}
        employee_id     = data.get("employee_id")
        charge_code_ids = data.get("charge_code_ids", [])
        assigned_by     = data.get("assigned_by")
        start_date      = data.get("start_date")
        end_date        = data.get("end_date")

        if not employee_id:
            return jsonify({"error": "employee_id is required"}), 400
        if not charge_code_ids or not isinstance(charge_code_ids, list):
            return jsonify({"error": "charge_code_ids must be a non-empty list"}), 400
        if not assigned_by:
            return jsonify({"error": "assigned_by is required"}), 400

        # Validate employee
        try:
            emp_obj_id = ObjectId(employee_id)
        except Exception:
            return jsonify({"error": "Invalid employee_id format"}), 400

        employee = mongo.db.users.find_one({"_id": emp_obj_id})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        # Validate assigner role
        try:
            assigner_obj_id = ObjectId(assigned_by)
        except Exception:
            return jsonify({"error": "Invalid assigned_by format"}), 400

        admin = mongo.db.users.find_one({"_id": assigner_obj_id})
        if not admin or str(admin.get("role", "")).lower() not in ["admin", "manager"]:
            return jsonify({"error": "Only admins or managers can assign charge codes"}), 403

        assigned_codes = []

        for cc_id in charge_code_ids:
            try:
                cc_obj_id = ObjectId(cc_id)
            except Exception:
                print(f"⚠️ Skipping invalid charge_code_id: {cc_id}")
                continue

            charge_code = mongo.db.charge_codes.find_one({"_id": cc_obj_id})
            if not charge_code:
                print(f"⚠️ Charge code not found: {cc_id}")
                continue
            if is_deprecated_charge_code(charge_code):
                print(f"⚠️ Skipping removed test charge code: {charge_code.get('code')}")
                continue

            # Skip if already assigned
            existing = mongo.db.charge_code_assignments.find_one({
                "employee_id":    emp_obj_id,
                "charge_code_id": cc_obj_id,
                "is_active":      True,
            })
            if existing:
                print(f"ℹ️ Already assigned: {charge_code.get('code')} → {employee.get('name')}")
                assigned_codes.append({
                    "assignment_id": str(existing["_id"]),
                    "code": charge_code.get("code"),
                    "already_assigned": True,
                })
                continue

            inactive = mongo.db.charge_code_assignments.find_one({
                "employee_id": emp_obj_id,
                "charge_code_id": cc_obj_id,
                "is_active": False,
            })
            if inactive:
                mongo.db.charge_code_assignments.update_one(
                    {"_id": inactive["_id"]},
                    {"$set": {
                        "employee_name": employee.get("name"),
                        "charge_code": charge_code.get("code"),
                        "charge_code_name": charge_code.get("name"),
                        "description": charge_code.get("description", ""),
                        "project_name": charge_code.get("project_name", ""),
                        "type": charge_code.get("type", ""),
                        "sub_type": charge_code.get("sub_type", ""),
                        "client": charge_code.get("client", ""),
                        "country": charge_code.get("country", ""),
                        "domain": charge_code.get("domain", "time"),
                        "owner_name": charge_code.get("owner_name", ""),
                        "owner_email": charge_code.get("owner_email", ""),
                        "assigned_by": assigner_obj_id,
                        "assigned_at": datetime.utcnow(),
                        "is_active": True,
                    }, "$unset": {"removed_at": ""}},
                )
                assigned_codes.append({
                    "assignment_id": str(inactive["_id"]),
                    "code": charge_code.get("code"),
                    "reactivated": True,
                })
                continue

            assignment = {
                "employee_id":      emp_obj_id,
                "employee_name":    employee.get("name"),
                "charge_code_id":   cc_obj_id,
                "charge_code":      charge_code.get("code"),
                "charge_code_name": charge_code.get("name"),
                "description":      charge_code.get("description", ""),
                "project_name":     charge_code.get("project_name", ""),
                "type":             charge_code.get("type", ""),
                "sub_type":         charge_code.get("sub_type", ""),
                "client":           charge_code.get("client", ""),
                "country":          charge_code.get("country", ""),
                "domain":           charge_code.get("domain", "time"),
                "owner_name":       charge_code.get("owner_name", ""),
                "owner_email":      charge_code.get("owner_email", ""),
                "assigned_by":      assigner_obj_id,
                "assigned_at":      datetime.utcnow(),
                "is_active":        True,
            }

            if start_date:
                assignment["start_date"] = start_date
            if end_date:
                assignment["end_date"] = end_date

            result = mongo.db.charge_code_assignments.insert_one(assignment)
            assigned_codes.append({
                "assignment_id": str(result.inserted_id),
                "code":          charge_code.get("code"),
            })
            print(f"✅ Assigned {charge_code.get('code')} → {employee.get('name')}")

        return jsonify({
            "message":     f"Assigned {len(assigned_codes)} charge code(s) successfully",
            "assignments": assigned_codes,
        }), 201

    except Exception as e:
        print(f"❌ Error assigning charge code: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# GET EMPLOYEE'S ASSIGNED CHARGE CODES
# ========================================

@charge_code_bp.route("/employee/<employee_id>", methods=["GET"])
def get_employee_charge_codes(employee_id):
    """
    Get all charge codes assigned to an employee.
    Returns the dropdown-friendly format used by the timesheet grid.
    Optional: ?active_only=true (default true)
    Optional: ?include_existing=true (default true) includes active existing charge codes
              even when they are not explicitly assigned to the employee.
    """
    try:
        ensure_reference_charge_codes()
        if not employee_id or len(employee_id) != 24:
            return jsonify({"error": "Invalid employee_id format"}), 400

        active_only = request.args.get("active_only", "true").lower() == "true"
        include_existing = request.args.get("include_existing", "true").lower() == "true"
        domain = normalize_charge_code_domain(request.args.get("domain"), allow_blank=True)

        query = {"employee_id": ObjectId(employee_id)}
        if active_only:
            query["is_active"] = True
        query.update(build_domain_query(domain))

        assignments = list(mongo.db.charge_code_assignments.find(query))

        result = []
        seen_charge_code_ids = set()
        for assignment in assignments:
            charge_code = mongo.db.charge_codes.find_one({
                "_id":       assignment["charge_code_id"],
                "is_active": True,
            })
            if is_deprecated_charge_code(charge_code):
                continue
            if charge_code:
                result.append({
                    "_id":              str(assignment["_id"]),
                    "charge_code_id":   str(charge_code["_id"]),
                    "charge_code":      charge_code.get("code"),
                    "charge_code_name": charge_code.get("name"),
                    "description":      first_non_empty(assignment.get("description"), charge_code.get("description")),
                    "project_name":     first_non_empty(assignment.get("project_name"), charge_code.get("project_name")),
                    "type":             first_non_empty(assignment.get("type"), charge_code.get("type")),
                    "sub_type":         first_non_empty(assignment.get("sub_type"), charge_code.get("sub_type")),
                    "client":           first_non_empty(assignment.get("client"), charge_code.get("client")),
                    "country":          first_non_empty(assignment.get("country"), charge_code.get("country")),
                    "domain":           first_non_empty(assignment.get("domain"), charge_code.get("domain"), "time"),
                    "owner_name":       first_non_empty(assignment.get("owner_name"), charge_code.get("owner_name")),
                    "owner_email":      first_non_empty(assignment.get("owner_email"), charge_code.get("owner_email")),
                })
                seen_charge_code_ids.add(str(charge_code["_id"]))

        if include_existing:
            existing_query = {"code": {"$nin": DEPRECATED_CHARGE_CODE_VALUES}}
            existing_query.update(build_domain_query(domain))
            if active_only:
                existing_query["is_active"] = True
            existing_codes = list(mongo.db.charge_codes.find(existing_query).sort("code", 1))
            for charge_code in existing_codes:
                charge_code_id = str(charge_code["_id"])
                if charge_code_id in seen_charge_code_ids or is_deprecated_charge_code(charge_code):
                    continue
                result.append({
                    "_id":              charge_code_id,
                    "charge_code_id":   charge_code_id,
                    "charge_code":      charge_code.get("code"),
                    "charge_code_name": charge_code.get("name"),
                    "description":      charge_code.get("description", ""),
                    "project_name":     charge_code.get("project_name", ""),
                    "type":             charge_code.get("type", ""),
                    "sub_type":         charge_code.get("sub_type", ""),
                    "client":           charge_code.get("client", ""),
                    "country":          charge_code.get("country", ""),
                    "domain":           charge_code.get("domain", "time"),
                    "owner_name":       charge_code.get("owner_name", ""),
                    "owner_email":      charge_code.get("owner_email", ""),
                    "source":           "existing",
                })
                seen_charge_code_ids.add(charge_code_id)

        print(f"✅ Found {len(result)} charge codes for employee {employee_id}")
        return jsonify(result), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Error fetching employee charge codes: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET ALL ASSIGNMENTS (ADMIN)
# ========================================

@charge_code_bp.route("/assignments/all", methods=["GET"])
def get_all_assignments():
    """Get all charge code assignments (admin view)."""
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        cleanup_deprecated_charge_codes()
        domain = normalize_charge_code_domain(request.args.get("domain"), allow_blank=True)
        query = {
            "charge_code": {"$nin": DEPRECATED_CHARGE_CODE_VALUES},
        }
        query.update(build_domain_query(domain))
        assignments = list(mongo.db.charge_code_assignments.find(query).sort("assigned_at", -1))
        return jsonify(serialize_all(assignments)), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Error fetching all assignments: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# REMOVE CHARGE CODE FROM EMPLOYEE (SOFT DELETE)
# ========================================

@charge_code_bp.route("/remove/<assignment_id>", methods=["DELETE"])
def remove_charge_code_assignment(assignment_id):
    """Soft-delete a charge code assignment (marks is_active = False)."""
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        try:
            assign_obj_id = ObjectId(assignment_id)
        except Exception:
            return jsonify({"error": "Invalid assignment_id format"}), 400

        assignment = mongo.db.charge_code_assignments.find_one({"_id": assign_obj_id})
        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        mongo.db.charge_code_assignments.update_one(
            {"_id": assign_obj_id},
            {"$set": {"is_active": False, "removed_at": datetime.utcnow()}},
        )

        print(f"✅ Assignment {assignment_id} removed (soft delete)")
        return jsonify({"message": "Charge code assignment removed successfully"}), 200

    except Exception as e:
        print(f"❌ Error removing assignment: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# BULK ASSIGN CHARGE CODES
# ========================================

@charge_code_bp.route("/bulk_assign", methods=["POST"])
def bulk_assign_charge_codes():
    """
    Bulk-assign the same charge code(s) to multiple employees.
    Body: {
        employee_ids:    [str],
        charge_code_ids: [str],
        assigned_by:     str  (user_id)
    }
    """
    try:
        _, error_response = require_admin_menu_access("timesheets")
        if error_response:
            return error_response

        cleanup_deprecated_charge_codes()
        data            = request.get_json() or {}
        employee_ids    = data.get("employee_ids", [])
        charge_code_ids = data.get("charge_code_ids", [])
        assigned_by     = data.get("assigned_by")

        if not all([employee_ids, charge_code_ids, assigned_by]):
            return jsonify({"error": "employee_ids, charge_code_ids, and assigned_by are required"}), 400

        admin = mongo.db.users.find_one({"_id": ObjectId(assigned_by)})
        if not admin or str(admin.get("role", "")).lower() not in ["admin", "manager"]:
            return jsonify({"error": "Only admins or managers can bulk-assign charge codes"}), 403

        total_assigned = 0

        for emp_id in employee_ids:
            try:
                emp_obj_id = ObjectId(emp_id)
            except Exception:
                continue

            employee = mongo.db.users.find_one({"_id": emp_obj_id})
            if not employee:
                continue

            for cc_id in charge_code_ids:
                try:
                    cc_obj_id = ObjectId(cc_id)
                except Exception:
                    continue

                charge_code = mongo.db.charge_codes.find_one({"_id": cc_obj_id})
                if not charge_code:
                    continue
                if is_deprecated_charge_code(charge_code):
                    continue

                existing = mongo.db.charge_code_assignments.find_one({
                    "employee_id":    emp_obj_id,
                    "charge_code_id": cc_obj_id,
                    "is_active":      True,
                })
                if existing:
                    continue

                mongo.db.charge_code_assignments.insert_one({
                    "employee_id":      emp_obj_id,
                    "employee_name":    employee.get("name"),
                    "charge_code_id":   cc_obj_id,
                    "charge_code":      charge_code.get("code"),
                    "charge_code_name": charge_code.get("name"),
                    "description":      charge_code.get("description", ""),
                    "project_name":     charge_code.get("project_name", ""),
                    "type":             charge_code.get("type", ""),
                    "sub_type":         charge_code.get("sub_type", ""),
                    "client":           charge_code.get("client", ""),
                    "country":          charge_code.get("country", ""),
                    "domain":           charge_code.get("domain", "time"),
                    "owner_name":       charge_code.get("owner_name", ""),
                    "owner_email":      charge_code.get("owner_email", ""),
                    "assigned_by":      ObjectId(assigned_by),
                    "assigned_at":      datetime.utcnow(),
                    "is_active":        True,
                })
                total_assigned += 1

        print(f"✅ Bulk assignment complete: {total_assigned} new assignments")
        return jsonify({
            "message":        "Bulk assignment completed",
            "total_assigned": total_assigned,
        }), 201

    except Exception as e:
        print(f"❌ Error in bulk assignment: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
