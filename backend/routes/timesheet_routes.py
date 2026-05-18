# routes/timesheet_routes.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timedelta
from config.db import mongo

timesheet_bp = Blueprint("timesheet_bp", __name__)
WORKDAY_HOURS = 9.0


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


def create_notification(user_id, notification_type, message, related_timesheet_id=None):
    """Create a notification for timesheet actions."""
    try:
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        notification = {
            "user_id": user_id,
            "type": notification_type,
            "message": message,
            "read": False,
            "createdAt": datetime.utcnow(),
        }

        if related_timesheet_id:
            if isinstance(related_timesheet_id, str):
                related_timesheet_id = ObjectId(related_timesheet_id)
            notification["related_timesheet_id"] = related_timesheet_id

        mongo.db.notifications.insert_one(notification)
        print(f"✅ Timesheet notification created: {notification_type}")
    except Exception as e:
        print(f"❌ Error creating timesheet notification: {str(e)}")


def apply_employee_assignment_snapshot(timesheet_doc, employee):
    """Copy admin-managed assignment fields onto a timesheet document."""
    if not isinstance(timesheet_doc, dict) or not isinstance(employee, dict):
        return timesheet_doc

    timesheet_doc["employee_work_location"] = employee.get("workLocation", "") or ""
    timesheet_doc["employee_assigned_location"] = (
        employee.get("assignedLocation")
        or employee.get("costCenter")
        or employee.get("workLocation")
        or ""
    )
    timesheet_doc["employee_company_code"] = employee.get("companyCode", "") or ""
    timesheet_doc["employee_cost_center"] = employee.get("costCenter", "") or ""
    return timesheet_doc


def enrich_timesheet_with_employee_assignments(timesheet_doc):
    """Backfill assignment metadata for older timesheets when reading."""
    if not isinstance(timesheet_doc, dict):
        return timesheet_doc

    employee_id = timesheet_doc.get("employee_id")
    if not employee_id:
        return timesheet_doc

    if (
        timesheet_doc.get("employee_work_location")
        and timesheet_doc.get("employee_assigned_location")
        and timesheet_doc.get("employee_company_code")
    ):
        return timesheet_doc

    try:
        employee_lookup_id = employee_id if isinstance(employee_id, ObjectId) else ObjectId(employee_id)
        employee = mongo.db.users.find_one({"_id": employee_lookup_id})
        if employee:
            apply_employee_assignment_snapshot(timesheet_doc, employee)
    except Exception:
        pass

    return timesheet_doc


def validate_daily_work_hours(entries):
    """Block more than 9 submitted work hours on any single day."""
    daily_totals = {}
    for entry in entries or []:
        if entry.get("entry_type", "work") != "work":
            continue
        date_key = entry.get("date")
        if not date_key:
            continue
        try:
            hours = float(entry.get("hours") or 0)
        except (TypeError, ValueError):
            return f"Invalid hours on {date_key}"
        if hours < 0:
            return f"Hours cannot be negative on {date_key}"
        if hours > 9:
            return f"Working hours for any charge code cannot exceed 9 hours on {date_key}"
        daily_totals[date_key] = daily_totals.get(date_key, 0) + hours

    over_limit = [
        f"{date_key} ({total:g}h)"
        for date_key, total in sorted(daily_totals.items())
        if total > 9
    ]
    if over_limit:
        return "Total working hours across all charge codes cannot exceed 9 hours per day: " + ", ".join(over_limit)
    return None


def normalize_date_key(value):
    """Normalize stored datetime/string values to YYYY-MM-DD for comparisons."""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if value is None:
        return ""
    return str(value)[:10]


def is_weekday_date(date_key):
    try:
        return datetime.strptime(date_key, "%Y-%m-%d").weekday() < 5
    except Exception:
        return False


def daterange_keys(start_key, end_key):
    start = datetime.strptime(start_key, "%Y-%m-%d")
    end = datetime.strptime(end_key, "%Y-%m-%d")
    current = start
    while current <= end:
        yield current.strftime("%Y-%m-%d")
        current += timedelta(days=1)


def get_leave_code(leave_type):
    """Map leave types to short SAP-style codes for timesheets."""
    key = (leave_type or "").strip().lower()
    return {
        "planned": "PL",
        "sick": "SL",
        "optional": "OL",
        "lwp": "LWP",
        "lop": "LWP",
        "early logout": "EL",
    }.get(key, (leave_type or "LV")[:3].upper())


def build_system_generated_entries(employee_id, period_start, period_end):
    """Generate locked holiday/leave entries for a timesheet period."""
    holiday_docs = list(mongo.db.holidays.find({
        "date": {"$gte": period_start, "$lte": period_end},
        "type": {"$in": ["public", "company"]},
    }))
    holiday_entries = []
    locked_dates = {}

    for holiday in holiday_docs:
        date_key = normalize_date_key(holiday.get("date"))
        holiday_entries.append({
            "_id": ObjectId(),
            "date": date_key,
            "entry_type": "holiday",
            "holiday_name": holiday.get("name"),
            "code": "PH",
            "hours": WORKDAY_HOURS,
            "description": f"Public Holiday: {holiday.get('name')}",
        })
        locked_dates[date_key] = {
            "kind": "holiday",
            "label": holiday.get("name") or "Holiday",
            "code": "PH",
        }

    leave_docs = list(mongo.db.leaves.find({
        "employee_id": employee_id,
        "status": "Approved",
        "start_date": {"$lte": period_end},
        "end_date": {"$gte": period_start},
    }))

    leave_entries = []
    for leave in leave_docs:
        effective_start = normalize_date_key(leave.get("approved_start_date") or leave.get("start_date"))
        effective_end = normalize_date_key(leave.get("approved_end_date") or leave.get("end_date"))
        if not effective_start or not effective_end:
            continue
        if effective_end < period_start or effective_start > period_end:
            continue

        leave_type = leave.get("leave_type", "Leave")
        leave_code = get_leave_code(leave_type)
        is_half_day = bool(leave.get("is_half_day"))
        leave_hours = WORKDAY_HOURS / 2 if is_half_day else WORKDAY_HOURS
        half_day_period = leave.get("half_day_period", "")

        for date_key in daterange_keys(max(effective_start, period_start), min(effective_end, period_end)):
            if not is_weekday_date(date_key):
                continue
            if date_key in locked_dates and locked_dates[date_key]["kind"] == "holiday":
                continue
            if date_key in locked_dates and locked_dates[date_key]["kind"] == "leave":
                continue

            leave_entries.append({
                "_id": ObjectId(),
                "date": date_key,
                "entry_type": "leave",
                "leave_type": leave_type,
                "leave_code": leave_code,
                "charge_code": leave_code,
                "charge_code_name": f"{leave_type} Leave",
                "hours": leave_hours,
                "description": (
                    f"{leave_type} leave"
                    + (f" ({half_day_period})" if is_half_day and half_day_period else "")
                ),
                "leave_id": leave["_id"],
                "is_half_day": is_half_day,
                "half_day_period": half_day_period if is_half_day else "",
            })
            if not is_half_day:
                locked_dates[date_key] = {
                    "kind": "leave",
                    "label": leave_type,
                    "code": leave_code,
                }

    return holiday_entries, leave_entries, locked_dates


def build_validated_timesheet_entries(employee_id, period_start, period_end, entries):
    """Validate user-entered work rows and merge system-generated leave/holiday rows."""
    holiday_entries, leave_entries, locked_dates = build_system_generated_entries(
        employee_id, period_start, period_end
    )

    validated_work_entries = []
    work_totals_by_date = {}
    system_hours_by_date = {}
    for item in leave_entries + holiday_entries:
        item_date = normalize_date_key(item.get("date"))
        if item_date:
            system_hours_by_date[item_date] = (
                system_hours_by_date.get(item_date, 0) + float(item.get("hours", 0) or 0)
            )

    for entry in entries or []:
        if entry.get("entry_type", "work") != "work":
            continue

        entry_date = normalize_date_key(entry.get("date"))
        if not entry_date:
            return None, None, "Entry date is required"

        locked = locked_dates.get(entry_date)
        if locked:
            return None, None, (
                f"{entry_date} is locked for {locked['label']} ({locked['code']}). "
                "Work hours cannot be entered on approved leave or holiday dates."
            )

        charge_code_id = entry.get("charge_code_id")
        if not charge_code_id:
            return None, None, f"Charge code required for work entry on {entry_date}"

        try:
            cc_obj_id = ObjectId(charge_code_id)
        except Exception:
            return None, None, f"Invalid charge_code_id on {entry_date}"

        assignment = mongo.db.charge_code_assignments.find_one({
            "employee_id": employee_id,
            "charge_code_id": cc_obj_id,
            "is_active": True,
        })
        if not assignment:
            return None, None, f"You don't have access to charge code {charge_code_id}"

        charge_code = mongo.db.charge_codes.find_one({"_id": cc_obj_id})
        work_hours = float(entry.get("hours") or 0)
        work_totals_by_date[entry_date] = work_totals_by_date.get(entry_date, 0) + work_hours

        validated_work_entries.append({
            "_id": ObjectId(),
            "date": entry_date,
            "entry_type": "work",
            "charge_code_id": cc_obj_id,
            "charge_code": charge_code.get("code") if charge_code else "Unknown",
            "charge_code_name": charge_code.get("name") if charge_code else "",
            "hours": work_hours,
            "description": entry.get("description", ""),
        })

    for entry_date, work_total in work_totals_by_date.items():
        total_for_date = work_total + system_hours_by_date.get(entry_date, 0)
        if total_for_date > WORKDAY_HOURS:
            return None, None, (
                f"{entry_date} has {total_for_date} total hours across all charge codes. "
                f"Maximum allowed is {WORKDAY_HOURS} hours."
            )

    merged_entries = validated_work_entries + leave_entries + holiday_entries
    total_hours = sum(float(item.get("hours", 0) or 0) for item in merged_entries)
    return merged_entries, total_hours, None


def get_work_hours_total(entries):
    """Return only employee-entered working hours, excluding leave and holidays."""
    return sum(
        float(entry.get("hours", 0) or 0)
        for entry in entries or []
        if entry.get("entry_type", "work") == "work"
    )


def fit_work_entries_around_system_entries(work_entries, system_entries):
    """Remove or trim work entries that now conflict with approved leave/holidays."""
    system_hours_by_date = {}
    full_day_locked_dates = set()

    for entry in system_entries or []:
        date_key = normalize_date_key(entry.get("date"))
        if not date_key:
            continue
        hours = float(entry.get("hours", 0) or 0)
        system_hours_by_date[date_key] = system_hours_by_date.get(date_key, 0) + hours
        if hours >= WORKDAY_HOURS and entry.get("entry_type") in ("leave", "holiday"):
            full_day_locked_dates.add(date_key)

    used_by_date = {}
    adjusted = []
    for entry in work_entries or []:
        if entry.get("entry_type", "work") != "work":
            continue
        date_key = normalize_date_key(entry.get("date"))
        if not date_key or date_key in full_day_locked_dates:
            continue

        original_hours = float(entry.get("hours", 0) or 0)
        remaining = WORKDAY_HOURS - system_hours_by_date.get(date_key, 0) - used_by_date.get(date_key, 0)
        if remaining <= 0:
            continue

        adjusted_hours = min(original_hours, remaining)
        if adjusted_hours <= 0:
            continue

        updated_entry = dict(entry)
        updated_entry["date"] = date_key
        updated_entry["hours"] = adjusted_hours
        used_by_date[date_key] = used_by_date.get(date_key, 0) + adjusted_hours
        adjusted.append(updated_entry)

    return adjusted


def refresh_timesheet_system_entries(timesheet):
    """Rebuild approved leave/holiday entries for an existing timesheet."""
    if not timesheet:
        return None

    period_start = timesheet.get("period_start")
    period_end = timesheet.get("period_end")
    employee_id = timesheet.get("employee_id")
    if not all([employee_id, period_start, period_end]):
        return None

    holiday_entries, leave_entries, _ = build_system_generated_entries(
        employee_id, period_start, period_end
    )
    work_entries = [
        entry for entry in timesheet.get("entries", [])
        if entry.get("entry_type", "work") == "work"
    ]
    adjusted_work_entries = fit_work_entries_around_system_entries(
        work_entries,
        leave_entries + holiday_entries,
    )
    merged_entries = adjusted_work_entries + leave_entries + holiday_entries
    total_hours = sum(float(item.get("hours", 0) or 0) for item in merged_entries)

    return {
        "entries": merged_entries,
        "total_hours": total_hours,
        "work_hours": get_work_hours_total(merged_entries),
        "updated_at": datetime.utcnow(),
        "system_entries_refreshed_at": datetime.utcnow(),
    }


def sync_timesheets_for_approved_leave(leave_record):
    """Update overlapping timesheets after a leave is approved."""
    if not leave_record or leave_record.get("status") != "Approved":
        return 0

    employee_id = leave_record.get("employee_id")
    leave_start = normalize_date_key(
        leave_record.get("approved_start_date") or leave_record.get("start_date")
    )
    leave_end = normalize_date_key(
        leave_record.get("approved_end_date") or leave_record.get("end_date")
    )
    if not employee_id or not leave_start or not leave_end:
        return 0

    query = {
        "employee_id": employee_id,
        "period_start": {"$lte": leave_end},
        "period_end": {"$gte": leave_start},
        "status": {"$in": ["draft", "pending_lead", "pending_manager", "approved"]},
    }
    updated_count = 0
    for timesheet in mongo.db.timesheets.find(query):
        refreshed = refresh_timesheet_system_entries(timesheet)
        if not refreshed:
            continue
        mongo.db.timesheets.update_one(
            {"_id": timesheet["_id"]},
            {"$set": refreshed},
        )
        updated_count += 1

    if updated_count:
        print(f"✅ Synced {updated_count} timesheet(s) for approved leave {leave_record.get('_id')}")
    return updated_count


def refresh_timesheet_for_read(timesheet):
    """Refresh system entries before returning a timesheet to the UI."""
    refreshed = refresh_timesheet_system_entries(timesheet)
    if not refreshed:
        return timesheet

    mongo.db.timesheets.update_one(
        {"_id": timesheet["_id"]},
        {"$set": refreshed},
    )
    timesheet.update(refreshed)
    return timesheet


# ========================================
# CREATE / SUBMIT TIMESHEET
# ========================================

@timesheet_bp.route("/create", methods=["POST"])
def create_timesheet():
    try:
        data = request.get_json()
        employee_id  = data.get("employee_id")
        period_start = data.get("period_start")
        period_end   = data.get("period_end")
        entries      = data.get("entries", [])

        if not all([employee_id, period_start, period_end]):
            return jsonify({"error": "Missing required fields: employee_id, period_start, period_end"}), 400

        limit_error = validate_daily_work_hours(entries)
        if limit_error:
            return jsonify({"error": limit_error}), 400

        try:
            emp_obj_id = ObjectId(employee_id)
        except Exception:
            return jsonify({"error": "Invalid employee_id format"}), 400

        employee = mongo.db.users.find_one({"_id": emp_obj_id})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        existing = mongo.db.timesheets.find_one({
            "employee_id": emp_obj_id,
            "period_start": period_start,
            "period_end":   period_end,
        })
        if existing and existing.get("status") == "approved":
            return jsonify({
                "error": "This timesheet has already been approved and is locked."
            }), 400

        reporting_lead_id = employee.get("reportsTo")
        if not reporting_lead_id:
            return jsonify({"error": "No reporting lead found for employee"}), 404

        validated_entries, total_hours, entry_error = build_validated_timesheet_entries(
            emp_obj_id, period_start, period_end, entries
        )
        if entry_error:
            return jsonify({"error": entry_error}), 400

        now = datetime.utcnow()
        timesheet = {
            "employee_id":         emp_obj_id,
            "employee_name":       employee.get("name"),
            "employee_email":      employee.get("email"),
            "employee_department": employee.get("department", ""),
            "period_start":        period_start,
            "period_end":          period_end,
            "entries":             validated_entries,
            "total_hours":         total_hours,
            "work_hours":          get_work_hours_total(validated_entries),
            "status":              "pending_lead",
            "reporting_lead_id":   reporting_lead_id,
            "manager_id":          employee.get("peopleLead"),
            "created_at":          now,
            "updated_at":          now,
            "submitted_at":        now,
            "approval_history":    [],
        }
        apply_employee_assignment_snapshot(timesheet, employee)

        if existing:
            mongo.db.timesheets.update_one({"_id": existing["_id"]}, {"$set": timesheet})
            timesheet_id = existing["_id"]
        else:
            result = mongo.db.timesheets.insert_one(timesheet)
            timesheet_id = result.inserted_id

        # Notify the reporting lead
        reporting_lead = mongo.db.users.find_one({"_id": reporting_lead_id})
        if reporting_lead:
            msg = (
                f"{employee.get('name')} submitted a timesheet for "
                f"{period_start} to {period_end} ({total_hours}h)"
            )
            create_notification(
                user_id=reporting_lead_id,
                notification_type="timesheet_submitted",
                message=msg,
                related_timesheet_id=timesheet_id,
            )

        return jsonify({
            "message": "Timesheet submitted successfully",
            "timesheet_id": str(timesheet_id),
            "total_hours": total_hours,
        }), 201

    except Exception as e:
        print(f"❌ Error creating timesheet: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# UPDATE TIMESHEET ENTRIES (draft / recalled)
# ========================================

@timesheet_bp.route("/update/<timesheet_id>", methods=["PUT"])
def update_timesheet(timesheet_id):
    """Update entries on a draft or recalled timesheet before re-submitting."""
    try:
        data = request.get_json()
        entries = data.get("entries", [])

        limit_error = validate_daily_work_hours(entries)
        if limit_error:
            return jsonify({"error": limit_error}), 400

        ts = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not ts:
            return jsonify({"error": "Timesheet not found"}), 404
        if ts.get("status") not in ("draft", "rejected_by_lead", "rejected_by_manager"):
            return jsonify({"error": "Only draft or rejected timesheets can be updated"}), 400

        validated_entries, total_hours, entry_error = build_validated_timesheet_entries(
            ts["employee_id"],
            ts.get("period_start"),
            ts.get("period_end"),
            entries,
        )
        if entry_error:
            return jsonify({"error": entry_error}), 400

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {"$set": {
                "entries":     validated_entries,
                "total_hours": total_hours,
                "work_hours":  get_work_hours_total(validated_entries),
                "updated_at":  datetime.utcnow(),
            }}
        )
        return jsonify({"message": "Timesheet updated", "total_hours": total_hours}), 200

    except Exception as e:
        print(f"❌ Error updating timesheet: {str(e)}")
        return jsonify({"error": str(e)}), 500


@timesheet_bp.route("/save_draft", methods=["POST"])
def save_timesheet_draft():
    """Create or update a draft timesheet without submitting it for approval."""
    try:
        data = request.get_json() or {}
        employee_id = data.get("employee_id")
        period_start = data.get("period_start")
        period_end = data.get("period_end")
        entries = data.get("entries", [])

        if not all([employee_id, period_start, period_end]):
            return jsonify({"error": "Missing required fields: employee_id, period_start, period_end"}), 400

        limit_error = validate_daily_work_hours(entries)
        if limit_error:
            return jsonify({"error": limit_error}), 400

        try:
            emp_obj_id = ObjectId(employee_id)
        except Exception:
            return jsonify({"error": "Invalid employee_id format"}), 400

        employee = mongo.db.users.find_one({"_id": emp_obj_id})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        existing = mongo.db.timesheets.find_one({
            "employee_id": emp_obj_id,
            "period_start": period_start,
            "period_end": period_end,
        })
        if existing and existing.get("status") in ("approved", "pending_lead", "pending_manager"):
            return jsonify({"error": "Submitted or approved timesheets cannot be saved as drafts"}), 400

        validated_entries, total_hours, entry_error = build_validated_timesheet_entries(
            emp_obj_id, period_start, period_end, entries
        )
        if entry_error:
            return jsonify({"error": entry_error}), 400
        now = datetime.utcnow()
        draft = {
            "employee_id": emp_obj_id,
            "employee_name": employee.get("name"),
            "employee_email": employee.get("email"),
            "employee_department": employee.get("department", ""),
            "period_start": period_start,
            "period_end": period_end,
            "entries": validated_entries,
            "total_hours": total_hours,
            "work_hours": get_work_hours_total(validated_entries),
            "status": "draft",
            "reporting_lead_id": employee.get("reportsTo"),
            "manager_id": employee.get("peopleLead"),
            "updated_at": now,
            "approval_history": existing.get("approval_history", []) if existing else [],
        }
        apply_employee_assignment_snapshot(draft, employee)

        if existing:
            mongo.db.timesheets.update_one({"_id": existing["_id"]}, {"$set": draft})
            timesheet_id = existing["_id"]
        else:
            draft["created_at"] = now
            result = mongo.db.timesheets.insert_one(draft)
            timesheet_id = result.inserted_id

        return jsonify({
            "message": "Draft saved successfully",
            "timesheet_id": str(timesheet_id),
            "total_hours": total_hours,
        }), 200

    except Exception as e:
        print(f"❌ Error saving draft: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@timesheet_bp.route("/delete/<timesheet_id>", methods=["DELETE"])
def delete_timesheet(timesheet_id):
    """Delete an editable timesheet."""
    try:
        ts = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not ts:
            return jsonify({"error": "Timesheet not found"}), 404
        if ts.get("status") in ("approved", "pending_lead", "pending_manager"):
            return jsonify({"error": "Submitted or approved timesheets cannot be deleted"}), 400

        mongo.db.timesheets.delete_one({"_id": ObjectId(timesheet_id)})
        return jsonify({"message": "Timesheet deleted successfully"}), 200

    except Exception as e:
        print(f"❌ Error deleting timesheet: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# SUBMIT EXISTING TIMESHEET
# ========================================

@timesheet_bp.route("/submit/<timesheet_id>", methods=["PUT"])
def submit_timesheet(timesheet_id):
    """Submit a draft/rejected timesheet into the approval queue."""
    try:
        ts = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not ts:
            return jsonify({"error": "Timesheet not found"}), 404
        if ts.get("status") == "approved":
            return jsonify({"error": "Timesheet is already approved"}), 400

        limit_error = validate_daily_work_hours(ts.get("entries", []))
        if limit_error:
            return jsonify({"error": limit_error}), 400

        work_entries = [
            entry for entry in (ts.get("entries") or [])
            if entry.get("entry_type", "work") == "work"
        ]
        validated_entries, total_hours, entry_error = build_validated_timesheet_entries(
            ts["employee_id"],
            ts.get("period_start"),
            ts.get("period_end"),
            work_entries,
        )
        if entry_error:
            return jsonify({"error": entry_error}), 400

        now = datetime.utcnow()
        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {"$set": {
                "entries":       validated_entries,
                "total_hours":   total_hours,
                "work_hours":    get_work_hours_total(validated_entries),
                "status":       "pending_lead",
                "submitted_at": now,
                "updated_at":   now,
            }}
        )

        # Notify reporting lead
        if ts.get("reporting_lead_id"):
            employee_name = ts.get("employee_name", "An employee")
            create_notification(
                user_id=ts["reporting_lead_id"],
                notification_type="timesheet_submitted",
                message=(
                    f"{employee_name} submitted a timesheet for "
                    f"{ts.get('period_start')} to {ts.get('period_end')}"
                ),
                related_timesheet_id=timesheet_id,
            )

        return jsonify({
            "message":     "Timesheet submitted",
            "total_hours": total_hours,
        }), 200

    except Exception as e:
        print(f"❌ Error submitting timesheet: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# RECALL TIMESHEET (Employee retracts for editing)
# ========================================

@timesheet_bp.route("/recall/<timesheet_id>", methods=["PUT"])
def recall_timesheet(timesheet_id):
    try:
        ts = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not ts:
            return jsonify({"error": "Timesheet not found"}), 404

        if ts.get("status") == "approved":
            return jsonify({"error": "Cannot recall an approved timesheet"}), 400

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {"$set": {
                "status":     "draft",
                "updated_at": datetime.utcnow(),
            }}
        )
        print(f"✅ Timesheet {timesheet_id} recalled to draft")
        return jsonify({"message": "Timesheet recalled to draft"}), 200

    except Exception as e:
        print(f"❌ Error recalling timesheet: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET EMPLOYEE'S TIMESHEETS
# ========================================

@timesheet_bp.route("/employee/<employee_id>", methods=["GET"])
def get_employee_timesheets(employee_id):
    try:
        if not employee_id or len(employee_id) != 24:
            return jsonify({"error": "Invalid employee_id format"}), 400

        timesheets = list(
            mongo.db.timesheets.find({"employee_id": ObjectId(employee_id)}).sort("period_start", -1)
        )
        timesheets = [refresh_timesheet_for_read(ts) for ts in timesheets]
        timesheets = [enrich_timesheet_with_employee_assignments(ts) for ts in timesheets]
        return jsonify(serialize_all(timesheets)), 200

    except Exception as e:
        print(f"❌ Error fetching employee timesheets: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET PENDING TIMESHEETS FOR LEAD
# ========================================

@timesheet_bp.route("/pending/lead/<user_id>", methods=["GET"])
def get_pending_for_lead(user_id):
    try:
        timesheets = list(
            mongo.db.timesheets.find({
                "reporting_lead_id": ObjectId(user_id),
                "status": "pending_lead",
            }).sort("submitted_at", -1)
        )
        timesheets = [refresh_timesheet_for_read(ts) for ts in timesheets]
        timesheets = [enrich_timesheet_with_employee_assignments(ts) for ts in timesheets]
        return jsonify(serialize_all(timesheets)), 200

    except Exception as e:
        print(f"❌ Error fetching pending timesheets for lead: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET PENDING TIMESHEETS FOR MANAGER
# KEPT for backwards compatibility — always returns empty list now
# ========================================

@timesheet_bp.route("/pending/manager/<user_id>", methods=["GET"])
def get_pending_for_manager(user_id):
    return jsonify([]), 200


# ========================================
# LEAD APPROVAL — grants full approval
# ========================================

@timesheet_bp.route("/approve/lead/<timesheet_id>", methods=["PUT"])
def lead_approve_timesheet(timesheet_id):
    try:
        data        = request.get_json()
        approved_by = data.get("approved_by")
        comments    = data.get("comments", "")

        if not approved_by:
            return jsonify({"error": "approved_by is required"}), 400

        timesheet = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not timesheet:
            return jsonify({"error": "Timesheet not found"}), 404
        if timesheet.get("status") != "pending_lead":
            return jsonify({"error": "Timesheet is not pending lead approval"}), 400

        approver = mongo.db.users.find_one({"_id": ObjectId(approved_by)})
        if not approver:
            return jsonify({"error": "Approver not found"}), 404

        approval_entry = {
            "stage":         "lead",
            "action":        "approved",
            "approver_id":   ObjectId(approved_by),
            "approver_name": approver.get("name"),
            "comments":      comments,
            "timestamp":     datetime.utcnow(),
        }

        now = datetime.utcnow()
        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {
                "$set": {
                    "status":             "approved",
                    "lead_approved_at":   now,
                    "lead_approved_by":   approver.get("name"),
                    "is_locked":          True,
                    "updated_at":         now,
                },
                "$push": {"approval_history": approval_entry},
            },
        )

        create_notification(
            user_id=timesheet["employee_id"],
            notification_type="timesheet_approved",
            message=(
                f"Your timesheet ({timesheet.get('period_start')} to {timesheet.get('period_end')}) "
                f"has been approved by your lead and is now locked"
            ),
            related_timesheet_id=timesheet_id,
        )

        print(f"✅ Timesheet {timesheet_id} fully approved by lead {approver.get('name')}")
        return jsonify({"message": "Timesheet approved"}), 200

    except Exception as e:
        print(f"❌ Error in lead approval: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# LEAD REJECTION
# ========================================

@timesheet_bp.route("/reject/lead/<timesheet_id>", methods=["PUT"])
def lead_reject_timesheet(timesheet_id):
    try:
        data             = request.get_json()
        rejected_by      = data.get("rejected_by")
        rejection_reason = data.get("rejection_reason", "").strip()

        if not rejection_reason:
            return jsonify({"error": "Rejection reason is required"}), 400
        if not rejected_by:
            return jsonify({"error": "rejected_by is required"}), 400

        timesheet = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not timesheet:
            return jsonify({"error": "Timesheet not found"}), 404
        if timesheet.get("status") != "pending_lead":
            return jsonify({"error": "Timesheet is not pending lead approval"}), 400

        rejector = mongo.db.users.find_one({"_id": ObjectId(rejected_by)})
        if not rejector:
            return jsonify({"error": "Rejector not found"}), 404

        rejection_entry = {
            "stage":         "lead",
            "action":        "rejected",
            "approver_id":   ObjectId(rejected_by),
            "approver_name": rejector.get("name"),
            "comments":      rejection_reason,
            "timestamp":     datetime.utcnow(),
        }

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {
                "$set": {
                    "status":           "rejected_by_lead",
                    "lead_rejected_at": datetime.utcnow(),
                    "lead_rejected_by": rejector.get("name"),
                    "rejection_reason": rejection_reason,
                    "updated_at":       datetime.utcnow(),
                },
                "$push": {"approval_history": rejection_entry},
            },
        )

        create_notification(
            user_id=timesheet["employee_id"],
            notification_type="timesheet_rejected",
            message=(
                f"Your timesheet ({timesheet.get('period_start')} to {timesheet.get('period_end')}) "
                f"was rejected by your lead. Reason: {rejection_reason}"
            ),
            related_timesheet_id=timesheet_id,
        )

        return jsonify({"message": "Timesheet rejected by lead"}), 200

    except Exception as e:
        print(f"❌ Error in lead rejection: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# MANAGER APPROVAL — KEPT for backwards compatibility only
# ========================================

@timesheet_bp.route("/approve/manager/<timesheet_id>", methods=["PUT"])
def manager_approve_timesheet(timesheet_id):
    try:
        data        = request.get_json()
        approved_by = data.get("approved_by")
        comments    = data.get("comments", "")

        if not approved_by:
            return jsonify({"error": "approved_by is required"}), 400

        timesheet = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not timesheet:
            return jsonify({"error": "Timesheet not found"}), 404
        if timesheet.get("status") != "pending_manager":
            return jsonify({"error": "Timesheet is not pending manager approval"}), 400

        approver = mongo.db.users.find_one({"_id": ObjectId(approved_by)})
        if not approver:
            return jsonify({"error": "Approver not found"}), 404

        approval_entry = {
            "stage":         "manager",
            "action":        "approved",
            "approver_id":   ObjectId(approved_by),
            "approver_name": approver.get("name"),
            "comments":      comments,
            "timestamp":     datetime.utcnow(),
        }

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {
                "$set": {
                    "status":              "approved",
                    "manager_approved_at": datetime.utcnow(),
                    "manager_approved_by": approver.get("name"),
                    "updated_at":          datetime.utcnow(),
                    "is_locked":           True,
                },
                "$push": {"approval_history": approval_entry},
            },
        )

        create_notification(
            user_id=timesheet["employee_id"],
            notification_type="timesheet_approved",
            message=(
                f"Your timesheet ({timesheet.get('period_start')} to {timesheet.get('period_end')}) "
                f"has been fully approved and is now locked"
            ),
            related_timesheet_id=timesheet_id,
        )

        return jsonify({"message": "Timesheet fully approved"}), 200

    except Exception as e:
        print(f"❌ Error in manager approval: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# MANAGER REJECTION — KEPT for backwards compatibility only
# ========================================

@timesheet_bp.route("/reject/manager/<timesheet_id>", methods=["PUT"])
def manager_reject_timesheet(timesheet_id):
    try:
        data             = request.get_json()
        rejected_by      = data.get("rejected_by")
        rejection_reason = data.get("rejection_reason", "").strip()

        if not rejection_reason:
            return jsonify({"error": "Rejection reason is required"}), 400
        if not rejected_by:
            return jsonify({"error": "rejected_by is required"}), 400

        timesheet = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not timesheet:
            return jsonify({"error": "Timesheet not found"}), 404
        if timesheet.get("status") != "pending_manager":
            return jsonify({"error": "Timesheet is not pending manager approval"}), 400

        rejector = mongo.db.users.find_one({"_id": ObjectId(rejected_by)})
        if not rejector:
            return jsonify({"error": "Rejector not found"}), 404

        rejection_entry = {
            "stage":         "manager",
            "action":        "rejected",
            "approver_id":   ObjectId(rejected_by),
            "approver_name": rejector.get("name"),
            "comments":      rejection_reason,
            "timestamp":     datetime.utcnow(),
        }

        mongo.db.timesheets.update_one(
            {"_id": ObjectId(timesheet_id)},
            {
                "$set": {
                    "status":              "rejected_by_manager",
                    "manager_rejected_at": datetime.utcnow(),
                    "manager_rejected_by": rejector.get("name"),
                    "rejection_reason":    rejection_reason,
                    "updated_at":          datetime.utcnow(),
                },
                "$push": {"approval_history": rejection_entry},
            },
        )

        create_notification(
            user_id=timesheet["employee_id"],
            notification_type="timesheet_rejected",
            message=(
                f"Your timesheet ({timesheet.get('period_start')} to {timesheet.get('period_end')}) "
                f"was rejected by manager. Reason: {rejection_reason}"
            ),
            related_timesheet_id=timesheet_id,
        )

        return jsonify({"message": "Timesheet rejected by manager"}), 200

    except Exception as e:
        print(f"❌ Error in manager rejection: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========================================
# GET ALL TIMESHEETS (ADMIN)
# ========================================

@timesheet_bp.route("/all", methods=["GET"])
def get_all_timesheets():
    try:
        timesheets = list(mongo.db.timesheets.find().sort("submitted_at", -1))

        result = []
        for ts in timesheets:
            ts = refresh_timesheet_for_read(ts)
            ts = enrich_timesheet_with_employee_assignments(ts)
            ts = serialize_all(ts)
            employee_id = ts.get("employee_id")
            if employee_id and (not ts.get("employee_name") or not ts.get("employee_department")):
                try:
                    emp = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
                    if emp:
                        ts["employee_name"]       = ts.get("employee_name") or emp.get("name", "")
                        ts["employee_email"]      = ts.get("employee_email") or emp.get("email", "")
                        ts["employee_department"] = emp.get("department", "")
                except Exception:
                    pass

            reporting_lead_id = ts.get("reporting_lead_id")
            if reporting_lead_id and (not ts.get("reporting_lead_name") or not ts.get("reporting_lead_email")):
                try:
                    reporting_lead = mongo.db.users.find_one({"_id": ObjectId(reporting_lead_id)})
                    if reporting_lead:
                        ts["reporting_lead_name"] = reporting_lead.get("name", "")
                        ts["reporting_lead_email"] = reporting_lead.get("email", "")
                except Exception:
                    pass
            result.append(ts)

        return jsonify(result), 200

    except Exception as e:
        print(f"❌ Error in /all: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# AUTO-POPULATE HOLIDAYS FOR PERIOD
# ========================================

@timesheet_bp.route("/populate_holidays", methods=["POST"])
def populate_holidays():
    try:
        data         = request.get_json()
        period_start = data.get("period_start")
        period_end   = data.get("period_end")

        if not period_start or not period_end:
            return jsonify({"error": "period_start and period_end are required"}), 400

        holidays = list(mongo.db.holidays.find({
            "date": {"$gte": period_start, "$lte": period_end},
            "type": {"$in": ["public", "company"]},
        }))

        holiday_entries = [
            {
                "date":         h["date"],
                "entry_type":   "holiday",
                "holiday_name": h.get("name"),
                "hours":        WORKDAY_HOURS,
                "code":         "PH",
                "description":  f"Public Holiday: {h.get('name')}",
            }
            for h in holidays
        ]

        return jsonify({"holidays": holiday_entries, "count": len(holiday_entries)}), 200

    except Exception as e:
        print(f"❌ Error populating holidays: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET TEAM TIMESHEETS
# ========================================

@timesheet_bp.route("/team/<manager_email>", methods=["GET"])
def get_team_timesheets(manager_email):
    try:
        manager = mongo.db.users.find_one({"email": manager_email})
        if not manager:
            return jsonify([]), 200

        employees = list(mongo.db.users.find({
            "reportsTo": manager["_id"],
            "role":      {"$ne": "Admin"},
        }))

        all_ts = []
        for emp in employees:
            ts_list = list(mongo.db.timesheets.find({"employee_id": emp["_id"]}).sort("period_start", -1))
            all_ts.extend(ts_list)

        all_ts = [refresh_timesheet_for_read(ts) for ts in all_ts]
        all_ts = [enrich_timesheet_with_employee_assignments(ts) for ts in all_ts]
        return jsonify(serialize_all(all_ts)), 200

    except Exception as e:
        print(f"❌ Error fetching team timesheets: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========================================
# GET SINGLE TIMESHEET BY ID
# ========================================

@timesheet_bp.route("/<timesheet_id>", methods=["GET"])
def get_timesheet(timesheet_id):
    try:
        ts = mongo.db.timesheets.find_one({"_id": ObjectId(timesheet_id)})
        if not ts:
            return jsonify({"error": "Timesheet not found"}), 404
        ts = refresh_timesheet_for_read(ts)
        ts = enrich_timesheet_with_employee_assignments(ts)
        return jsonify(serialize_all(ts)), 200

    except Exception as e:
        print(f"❌ Error fetching timesheet: {str(e)}")
        return jsonify({"error": str(e)}), 500
