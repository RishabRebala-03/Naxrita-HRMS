# leave_routes.py - WITH ESCALATION SYSTEM
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timedelta
import os
from config.db import mongo
from utils.log_utils import log_leave_action, trim_leave
from utils.leave_accrual import accrue_monthly_leaves
from utils.timezone import ist_today, now_ist_naive
from utils.recalculate_balances import recalculate_all_balances
from services.mail_service import (
    queue_leave_applied_emails,
    queue_leave_cancelled_email,
    queue_leave_escalated_email,
    queue_leave_modified_email,
    queue_leave_status_email,
    send_pending_leave_reminders,
)
from utils.access_control import has_admin_menu_access, is_full_admin, require_admin, resolve_requester

leave_bp = Blueprint("leave_bp", __name__)
LEAVE_NOTIFICATION_REMINDER_HOURS = 24


def serialize_all(obj):
    """Recursively convert Mongo values into JSON-safe values."""
    if isinstance(obj, list):
        return [serialize_all(item) for item in obj]
    if isinstance(obj, dict):
        return {key: serialize_all(value) for key, value in obj.items()}
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def enrich_leave_with_employee_details(leave):
    employee_id = leave.get("employee_id")
    employee_obj_id = employee_id if isinstance(employee_id, ObjectId) else None

    if not employee_obj_id and isinstance(employee_id, str) and ObjectId.is_valid(employee_id):
        employee_obj_id = ObjectId(employee_id)

    if not employee_obj_id:
        leave.setdefault("employee_name", "Unknown Employee")
        return leave

    employee = mongo.db.users.find_one({"_id": employee_obj_id})
    if not employee:
        leave.setdefault("employee_name", "Unknown Employee")
        return leave

    leave["employee_name"] = leave.get("employee_name") or employee.get("name", "Unknown Employee")
    leave["employee_email"] = leave.get("employee_email") or employee.get("email", "")
    leave["employee_designation"] = leave.get("employee_designation") or employee.get("designation", "")
    leave["employee_department"] = leave.get("employee_department") or employee.get("department", "")
    leave["employee_dateOfBirth"] = employee.get("dateOfBirth")
    return leave


def remove_tea_coffee_orders_for_leave(employee_id, start_date, end_date):
    """Delete tea/coffee orders that fall within an approved leave range."""
    if not employee_id or not start_date or not end_date:
        return 0

    result = mongo.db.tea_coffee_orders.delete_many({
        "employee_id": str(employee_id),
        "date": {
            "$gte": start_date,
            "$lte": end_date
        }
    })
    return result.deleted_count


# Import notification helper
def create_notification(
    user_id,
    notification_type,
    message,
    related_leave_id=None,
    target=None,
    meta=None,
    reminder_group=None,
    notification_origin="event",
):
    """Helper function to create notifications"""
    try:
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
            
        notification = {
            "user_id": user_id,
            "type": notification_type,
            "message": message,
            "read": False,
            "createdAt": datetime.utcnow(),
            "notification_origin": notification_origin,
        }
        
        if related_leave_id:
            if isinstance(related_leave_id, str):
                related_leave_id = ObjectId(related_leave_id)
            notification["related_leave_id"] = related_leave_id

        if target:
            notification["target"] = target
        if meta:
            notification["meta"] = meta
        if reminder_group:
            notification["reminder_group"] = reminder_group
        
        mongo.db.notifications.insert_one(notification)
        print(f"✅ Notification created: {notification_type}")
    except Exception as e:
        print(f"❌ Error creating notification: {str(e)}")


def build_leave_notification_target(leave_id, active_tab="pending"):
    return {
        "section": "leaves",
        "leaveId": str(leave_id),
        "activeTab": active_tab,
    }


def clear_leave_reminder_state(leave_id):
    mongo.db.leaves.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$unset": {
                "notification_reminder": "",
            }
        },
    )


def set_leave_escalation_reminder_state(leave_id, approver_ids, escalation_level):
    recipient_ids = [str(approver_id) for approver_id in approver_ids if approver_id]
    mongo.db.leaves.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$set": {
                "notification_reminder": {
                    "kind": "leave_escalation",
                    "recipient_ids": recipient_ids,
                    "escalation_level": escalation_level,
                    "last_sent_at": datetime.utcnow(),
                    "reminder_group": f"leave:{leave_id}:escalation:{escalation_level}",
                }
            }
        },
    )


def send_leave_escalation_notification_reminders(leave_id=None, force=False, reminder_hours=None):
    reminder_hours = int(reminder_hours or os.getenv("LEAVE_NOTIFICATION_REMINDER_HOURS", str(LEAVE_NOTIFICATION_REMINDER_HOURS)))
    query = {"status": "Pending", "escalation_level": {"$gt": 0}}
    if leave_id:
        query["_id"] = ObjectId(leave_id)

    leaves = list(mongo.db.leaves.find(query))
    now = datetime.utcnow()
    sent = 0

    for leave in leaves:
        reminder_state = leave.get("notification_reminder") or {}
        if reminder_state.get("kind") != "leave_escalation":
            continue

        last_sent_at = reminder_state.get("last_sent_at")
        if not force and last_sent_at and now - last_sent_at < timedelta(hours=reminder_hours):
            continue

        recipient_ids = reminder_state.get("recipient_ids") or []
        if not recipient_ids and leave.get("current_approver_id"):
            recipient_ids = [str(leave.get("current_approver_id"))]
        if not recipient_ids:
            continue

        leave_id_str = str(leave["_id"])
        escalation_level = leave.get("escalation_level", reminder_state.get("escalation_level", 0))
        message = (
            f"Reminder: {leave.get('employee_name', 'An employee')}'s "
            f"{leave.get('leave_type', 'leave')} request ({leave.get('start_date')} to {leave.get('end_date')}) "
            "is still awaiting action."
        )

        for recipient_id in recipient_ids:
            create_notification(
                user_id=recipient_id,
                notification_type="leave_escalated_reminder",
                message=message,
                related_leave_id=leave_id_str,
                target=build_leave_notification_target(leave_id_str, active_tab="pending"),
                meta={"escalation_level": escalation_level},
                reminder_group=f"leave:{leave_id_str}:escalation:{escalation_level}",
                notification_origin="reminder",
            )
            sent += 1

        mongo.db.leaves.update_one(
            {"_id": leave["_id"]},
            {"$set": {"notification_reminder.last_sent_at": now}},
        )

    return {"pending": len(leaves), "notifications_sent": sent, "interval_hours": reminder_hours}

def normalize_leave_type(leave_type):
    """Normalize alias leave types to the stored canonical value."""
    if not leave_type or not isinstance(leave_type, str):
        return leave_type

    normalized = leave_type.strip()
    if normalized.lower() == "lop":
        return "LWP"
    if normalized.lower() in {"comp off", "compensatory off"}:
        return "Compensatory Off"
    return normalized


def leave_type_requires_reason(leave_type):
    normalized = normalize_leave_type(leave_type)
    return isinstance(normalized, str) and normalized.lower() == "compensatory off"


def normalize_half_day_period(period):
    """Accept first/second-half aliases and normalize to morning/afternoon."""
    if not period or not isinstance(period, str):
        return ""

    key = period.strip().lower().replace("-", " ").replace("_", " ")
    mapping = {
        "morning": "morning",
        "first half": "morning",
        "afternoon": "afternoon",
        "second half": "afternoon",
    }
    return mapping.get(key, "")


def is_weekend(date_value):
    """Return True for Saturday/Sunday."""
    return date_value.weekday() >= 5


def calculate_working_leave_days(start, end):
    """Count leave days from Monday to Friday only."""
    if end < start:
        return 0

    day_count = 0
    current = start.date()
    end_date = end.date()

    while current <= end_date:
        if not is_weekend(current):
            day_count += 1
        current += timedelta(days=1)

    return day_count


def find_overlapping_leave(employee_id, start_date, end_date):
    """Return an existing active leave that overlaps the provided date range."""
    try:
        employee_obj_id = employee_id if isinstance(employee_id, ObjectId) else ObjectId(employee_id)
    except Exception:
        return None

    active_leaves = mongo.db.leaves.find({
        "employee_id": employee_obj_id,
        "status": {"$nin": ["Rejected", "Cancelled"]},
    })

    for leave in active_leaves:
        leave_start = (
            leave.get("approved_start_date")
            if leave.get("status") == "Approved" and leave.get("is_partial_approval")
            else leave.get("start_date")
        )
        leave_end = (
            leave.get("approved_end_date")
            if leave.get("status") == "Approved" and leave.get("is_partial_approval")
            else leave.get("end_date")
        )

        if not leave_start or not leave_end:
            continue

        if leave_start <= end_date and leave_end >= start_date:
            return leave

    return None


LEAVE_CANCELLATION_CUTOFF_HOURS = 48


def parse_leave_date(value):
    """Parse stored leave date values to a date-only datetime."""
    if isinstance(value, datetime):
        return datetime(value.year, value.month, value.day)
    if isinstance(value, str) and value:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d")
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return datetime(parsed.year, parsed.month, parsed.day)
            except Exception:
                return None
    return None


def get_effective_leave_start(leave):
    return parse_leave_date(leave.get("approved_start_date") or leave.get("start_date"))


def get_leave_cancellation_cutoff(leave):
    effective_start = get_effective_leave_start(leave)
    if not effective_start:
        return None
    return effective_start - timedelta(hours=LEAVE_CANCELLATION_CUTOFF_HOURS)


def employee_can_cancel_approved_leave(leave, now=None):
    cutoff = get_leave_cancellation_cutoff(leave)
    if not cutoff:
        return False
    return (now or datetime.utcnow()) <= cutoff


def lead_can_cancel_approved_leave(leave, now=None):
    cutoff = get_leave_cancellation_cutoff(leave)
    if not cutoff:
        return False
    return (now or datetime.utcnow()) > cutoff


def get_leave_days_for_balance(leave):
    try:
        return float(leave.get("approved_days") or leave.get("days") or 0)
    except (TypeError, ValueError):
        return 0


def restore_leave_balance_for_cancelled_approval(leave):
    """Reverse the balance effect of an approved leave cancellation."""
    employee = mongo.db.users.find_one({"_id": leave["employee_id"]})
    if not employee:
        return

    leave_balance = employee.get("leaveBalance", {
        "sick": 0,
        "sickTotal": 0,
        "planned": 0,
        "plannedTotal": 0,
        "optional": 2,
        "optionalTotal": 2,
        "lwp": 0,
        "compOffUsed": 0,
    })
    leave_type = normalize_leave_type(leave.get("leave_type", "")).lower()
    days = get_leave_days_for_balance(leave)

    if leave_type in ["sick", "planned", "optional"]:
        total_key = f"{leave_type}Total"
        restored = leave_balance.get(leave_type, 0) + days
        if total_key in leave_balance:
            restored = min(restored, leave_balance.get(total_key, restored))
        leave_balance[leave_type] = restored
    elif leave_type in ["lwp", "lop", "leave with loss of pay", "leave without pay"]:
        leave_balance["lwp"] = max(0, leave_balance.get("lwp", 0) - days)
    elif leave_type == "compensatory off":
        leave_balance["compOffUsed"] = max(0, leave_balance.get("compOffUsed", 0) - days)

    mongo.db.users.update_one(
        {"_id": leave["employee_id"]},
        {"$set": {"leaveBalance": leave_balance}},
    )


def cancel_approved_leave_record(leave, leave_id, performed_by, cancelled_by_role, reason=""):
    old_data = trim_leave(leave.copy())
    restore_leave_balance_for_cancelled_approval(leave)

    update_data = {
        "status": "Cancelled",
        "cancelled_on": datetime.utcnow(),
        "cancelled_by": performed_by,
        "cancelled_by_role": cancelled_by_role,
    }
    if reason:
        update_data["cancellation_reason"] = reason

    mongo.db.leaves.update_one(
        {"_id": ObjectId(leave_id)},
        {"$set": update_data},
    )
    updated_leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})

    log_leave_action(
        leave_id=leave_id,
        employee_id=str(leave["employee_id"]),
        action="Cancelled",
        performed_by=performed_by,
        remarks=reason or f"Approved leave cancelled by {cancelled_by_role}",
        old_data=old_data,
        new_data=trim_leave(updated_leave),
    )

    try:
        from routes.timesheet_routes import sync_timesheets_for_cancelled_leave
        sync_timesheets_for_cancelled_leave(updated_leave)
    except Exception as sync_error:
        print(f"⚠️ Could not sync timesheets for cancelled leave {leave_id}: {sync_error}")

    return updated_leave


# ========== ⭐ NEW ESCALATION FUNCTION (NO EMAIL) ⭐ ==========
# FIXED escalate_leave_request function - Replace in leave_routes.py

def escalate_leave_request(leave_id):
    """Escalate leave through management hierarchy"""
    try:
        leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        if not leave or leave.get("status") != "Pending":
            print(f"   ⚠️ Leave {leave_id} not found or not pending")
            return False
        
        current_level = leave.get("escalation_level", 0)
        employee_id = leave.get("employee_id")
        
        print(f"\n🔍 Processing escalation for leave {leave_id}")
        print(f"   Current level: {current_level}")
        print(f"   Employee ID: {employee_id}")
        print(f"   Current status: {leave.get('status')}")
        
        # Get the management hierarchy
        hierarchy = get_manager_hierarchy(employee_id)
        
        print(f"   Management hierarchy ({len(hierarchy)} managers):")
        for i, mgr in enumerate(hierarchy):
            print(f"      Level {i+1}: {mgr['name']} ({mgr['_id']})")
        
        # Determine next approver
        next_approver = None
        new_level = current_level + 1
        
        if new_level <= len(hierarchy):
            # Escalate to next manager in hierarchy
            next_approver = hierarchy[new_level - 1]
            print(f"   ✅ Escalating to Level {new_level} manager: {next_approver['name']}")
        else:
            # No more managers, escalate to ALL admins
            admins = list(mongo.db.users.find({"role": "Admin"}))
            if not admins:
                print(f"   ⚠️ No admin found for escalation")
                return False
            
            # Use the first admin but notify all
            next_approver = {
                "_id": admins[0]["_id"],
                "name": admins[0].get("name", "Admin"),
                "email": admins[0].get("email", ""),
                "role": "Admin"
            }
            print(f"   ✅ Escalating to Admin: {next_approver['name']}")
        
        if not next_approver:
            print(f"   ❌ No next approver found")
            return False
        
        print(f"   📝 Setting current_approver_id to: {next_approver['_id']}")
        
        # CRITICAL: Update leave with escalation info
        escalation_data = {
            "escalation_level": new_level,
            "current_approver_id": next_approver["_id"],  # ⭐ THIS IS THE KEY FIX
            "escalated_on": datetime.utcnow(),
            "previous_approver_id": leave.get("current_approver_id")
        }
        
        history_entry = {
            "from_level": current_level,
            "to_level": new_level,
            "escalated_at": datetime.utcnow(),
            "from_approver": leave.get("current_approver_id"),
            "to_approver": next_approver["_id"],
            "to_approver_name": next_approver["name"],
            "reason": f"Approval timeout - {2 if current_level == 0 else 1} day(s) elapsed"
        }
        
        # Perform the update
        result = mongo.db.leaves.update_one(
            {"_id": ObjectId(leave_id)},
            {
                "$set": escalation_data,
                "$push": {"escalation_history": history_entry}
            }
        )
        
        print(f"   📊 Update result: matched={result.matched_count}, modified={result.modified_count}")
        
        # Verify the update
        updated_leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        print(f"   ✅ Verified current_approver_id: {updated_leave.get('current_approver_id')}")
        print(f"   ✅ Verified escalation_level: {updated_leave.get('escalation_level')}")
        print(f"   ✅ Verified status: {updated_leave.get('status')}")
        
        # Create notification for the new approver
        employee_name = leave.get("employee_name", "An employee")
        leave_type = leave.get("leave_type", "leave")
        start_date = leave.get("start_date", "")
        end_date = leave.get("end_date", "")
        days = leave.get("days", 0)
        
        notification_message = (
            f"⚠️ ESCALATED: {employee_name}'s {leave_type} request "
            f"({start_date} to {end_date}, {days} day{'s' if days != 1 else ''}) "
            f"requires your approval (escalated after timeout)"
        )
        
        create_notification(
            user_id=next_approver["_id"],
            notification_type="leave_escalated",
            message=notification_message,
            related_leave_id=leave_id,
            target=build_leave_notification_target(leave_id, active_tab="pending"),
            meta={"escalation_level": new_level},
            reminder_group=f"leave:{leave_id}:escalation:{new_level}",
        )
        
        print(f"   ✅ Notification sent to {next_approver['name']}")
        
        # If escalated to admin, notify ALL admins
        if next_approver.get("role") == "Admin":
            all_admins = list(mongo.db.users.find({"role": "Admin"}))
            for admin in all_admins:
                if admin["_id"] != next_approver["_id"]:
                    create_notification(
                        user_id=admin["_id"],
                        notification_type="leave_escalated",
                        message=notification_message,
                        related_leave_id=leave_id,
                        target=build_leave_notification_target(leave_id, active_tab="pending"),
                        meta={"escalation_level": new_level},
                        reminder_group=f"leave:{leave_id}:escalation:{new_level}",
                    )
                    print(f"   ✅ Additional notification sent to admin: {admin.get('name')}")

        reminder_recipient_ids = [next_approver["_id"]]
        if next_approver.get("role") == "Admin":
            reminder_recipient_ids = [admin["_id"] for admin in all_admins]
        set_leave_escalation_reminder_state(leave_id, reminder_recipient_ids, new_level)
        
        # Log action
        log_leave_action(
            leave_id=leave_id,
            employee_id=str(leave["employee_id"]),
            action="Escalated",
            performed_by="System",
            remarks=f"Auto-escalated to {next_approver['name']} (Level {new_level}) after timeout"
        )

        try:
            queue_leave_escalated_email(leave_id, next_approver=next_approver)
        except Exception as mail_error:
            print(f"   ⚠️ Escalation mail queue failed: {str(mail_error)}")
        
        print(f"✅ Leave {leave_id} escalated successfully to {next_approver['name']} (Level {new_level})")
        return True
        
    except Exception as e:
        print(f"❌ Escalation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False



def get_manager_hierarchy(employee_id):
    """Get the reporting hierarchy for an employee"""
    hierarchy = []
    current_id = employee_id
    
    while current_id:
        employee = mongo.db.users.find_one({"_id": ObjectId(current_id)})
        if not employee or not employee.get("reportsTo"):
            break
        
        manager_id = employee["reportsTo"]
        manager = mongo.db.users.find_one({"_id": manager_id})
        
        if manager:
            hierarchy.append({
                "_id": manager["_id"],
                "name": manager.get("name", "Unknown"),
                "email": manager.get("email", ""),
                "role": manager.get("role", "Manager")
            })
            current_id = manager_id
        else:
            break
    
    return hierarchy


def escalate_leave(leave_id):
    """Escalate leave to next level in hierarchy"""
    try:
        leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        if not leave or leave.get("status") != "Pending":
            return
        
        current_level = leave.get("escalation_level", 0)
        hierarchy = get_manager_hierarchy(leave["employee_id"])
        
        # Get all admin users as fallback
        admins = list(mongo.db.users.find({"role": "Admin"}))
        
        # Determine next approver
        next_approver = None
        new_level = current_level + 1
        
        if new_level <= len(hierarchy):
            # Escalate to next manager in hierarchy
            next_approver = hierarchy[new_level - 1]
        elif admins:
            # Escalate to admin
            next_approver = {
                "_id": admins[0]["_id"],
                "name": admins[0].get("name", "Admin"),
                "email": admins[0].get("email", ""),
                "role": "Admin"
            }
        
        if next_approver:
            # Update leave with escalation info
            mongo.db.leaves.update_one(
                {"_id": ObjectId(leave_id)},
                {
                    "$set": {
                        "escalation_level": new_level,
                        "current_approver_id": next_approver["_id"],
                        "escalated_on": datetime.utcnow(),
                        "escalation_history": leave.get("escalation_history", []) + [{
                            "level": new_level,
                            "approver_id": next_approver["_id"],
                            "approver_name": next_approver["name"],
                            "escalated_at": datetime.utcnow()
                        }]
                    }
                }
            )
            
            # Create notification for new approver
            employee_name = leave.get("employee_name", "An employee")
            leave_type = leave.get("leave_type", "leave")
            start_date = leave.get("start_date", "")
            end_date = leave.get("end_date", "")
            days = leave.get("days", 0)
            
            notification_message = f"⚠️ ESCALATED: {employee_name}'s {leave_type} request ({start_date} to {end_date}, {days} day{'s' if days != 1 else ''}) requires your approval"
            
            create_notification(
                user_id=next_approver["_id"],
                notification_type="leave_escalated",
                message=notification_message,
                related_leave_id=leave_id,
                target=build_leave_notification_target(leave_id, active_tab="pending"),
                meta={"escalation_level": new_level},
                reminder_group=f"leave:{leave_id}:escalation:{new_level}",
            )
            set_leave_escalation_reminder_state(leave_id, [next_approver["_id"]], new_level)
            
            try:
                queue_leave_escalated_email(leave_id, next_approver=next_approver)
            except Exception as email_err:
                print(f"   ⚠️ Escalation email queue failed: {str(email_err)}")
            
            log_leave_action(
                leave_id=leave_id,
                employee_id=str(leave["employee_id"]),
                action="Escalated",
                performed_by="System",
                remarks=f"Escalated to {next_approver['name']} (Level {new_level})"
            )
            
            print(f"✅ Leave {leave_id} escalated to {next_approver['name']} (Level {new_level})")
        
    except Exception as e:
        print(f"❌ Error escalating leave {leave_id}: {str(e)}")


# -------------------------------
# Get All Leaves (for Dashboard)
# -------------------------------
@leave_bp.route("/all", methods=["GET"])
def get_all_leaves():
    try:
        leaves = list(mongo.db.leaves.find())
        
        # ✅ CRITICAL: Serialize ALL ObjectIds and datetime objects
        for leave in leaves:
            enrich_leave_with_employee_details(leave)

            # Convert _id to string
            leave['_id'] = str(leave['_id'])
            
            # Convert employee_id to string and fetch employee details
            if isinstance(leave.get('employee_id'), ObjectId):
                emp_obj_id = leave['employee_id']
                leave['employee_id'] = str(emp_obj_id)
                
                # Fetch employee details
                employee = mongo.db.users.find_one({"_id": emp_obj_id})
                if employee:
                    leave['employee_name'] = employee.get('name', 'Unknown Employee')
                    leave['employee_email'] = employee.get('email', '')
                    leave['employee_designation'] = employee.get('designation', '')
                    leave['employee_department'] = employee.get('department', '')
                    
                    # Handle employee DOB
                    dob = employee.get('dateOfBirth')
                    if isinstance(dob, datetime):
                        leave['employee_dateOfBirth'] = dob.isoformat()
                    elif dob:
                        leave['employee_dateOfBirth'] = str(dob)
                    else:
                        leave['employee_dateOfBirth'] = None
            elif not leave.get('employee_name'):
                leave['employee_name'] = 'Unknown Employee'
            
            # ✅ Convert current_approver_id to string
            if isinstance(leave.get('current_approver_id'), ObjectId):
                leave['current_approver_id'] = str(leave['current_approver_id'])
            
            # ✅ Convert previous_approver_id to string
            if isinstance(leave.get('previous_approver_id'), ObjectId):
                leave['previous_approver_id'] = str(leave['previous_approver_id'])
            
            # ✅ Convert ALL datetime fields to ISO strings
            datetime_fields = [
                'applied_on', 'approved_on', 'rejected_on', 'cancelled_on',
                'escalated_on', 'start_date', 'end_date'
            ]
            
            for field in datetime_fields:
                if field in leave and isinstance(leave[field], datetime):
                    leave[field] = leave[field].isoformat()
            
            # ✅ Handle escalation_history array
            if 'escalation_history' in leave and isinstance(leave['escalation_history'], list):
                for entry in leave['escalation_history']:
                    # Convert datetime
                    if isinstance(entry.get('escalated_at'), datetime):
                        entry['escalated_at'] = entry['escalated_at'].isoformat()
                    
                    # Convert ObjectIds
                    if isinstance(entry.get('from_approver'), ObjectId):
                        entry['from_approver'] = str(entry['from_approver'])
                    if isinstance(entry.get('to_approver'), ObjectId):
                        entry['to_approver'] = str(entry['to_approver'])
                    if isinstance(entry.get('approver_id'), ObjectId):
                        entry['approver_id'] = str(entry['approver_id'])
        
        print(f"✅ Found {len(leaves)} total leaves (all serialized)")
        return jsonify(serialize_all(leaves)), 200
        
    except Exception as e:
        print(f"❌ Error fetching all leaves: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# FIXED: get_admin_pending_requests function
# Replace this function in your leave_routes.py file

@leave_bp.route("/pending/admin", methods=["GET"])
def get_admin_pending_requests():
    """Get all pending leaves that are escalated to admin level"""
    try:
        requester = resolve_requester()
        if not requester or not has_admin_menu_access(requester, "leaves"):
            return jsonify({"error": "You do not have access to the admin leave workspace"}), 403

        print(f"\n{'='*60}")
        print(f"🔍 ADMIN PENDING LEAVES REQUEST")
        print(f"{'='*60}")
        
        # Get all admin users
        admins = list(mongo.db.users.find({"role": "Admin"}))
        admin_ids = [admin["_id"] for admin in admins]
        
        print(f"✅ Found {len(admins)} admins: {[str(aid) for aid in admin_ids]}")
        
        # CRITICAL FIX: Get pending leaves with escalation_level >= 1
        # This catches leaves that have been escalated to admin
        admin_pending = list(mongo.db.leaves.find({
            "status": "Pending",
            "$or": [
                {"escalation_level": {"$gte": 1}},  # Catch escalated leaves
                {"current_approver_id": {"$in": admin_ids}}  # Or directly assigned
            ]
        }).sort("applied_on", -1))
        
        print(f"📊 Found {len(admin_pending)} admin-level pending leaves")
        
        # Debug: Print details of each leave
        for leave in admin_pending:
            print(f"   📋 Leave ID: {leave['_id']}")
            print(f"      Employee: {leave.get('employee_name')}")
            print(f"      Status: {leave.get('status')}")
            print(f"      Escalation Level: {leave.get('escalation_level', 0)}")
            print(f"      Current Approver: {leave.get('current_approver_id')}")
        
        # ✅ Serialize ALL fields
        for leave in admin_pending:
            enrich_leave_with_employee_details(leave)

            # Convert _id to string
            leave['_id'] = str(leave['_id'])
            
            # Convert employee_id to string and fetch details
            if isinstance(leave.get('employee_id'), ObjectId):
                emp_obj_id = leave['employee_id']
                leave['employee_id'] = str(emp_obj_id)
                
                # Fetch employee details including DOB
                employee = mongo.db.users.find_one({"_id": emp_obj_id})
                if employee:
                    dob = employee.get('dateOfBirth')
                    if isinstance(dob, datetime):
                        leave['employee_dateOfBirth'] = dob.isoformat()
                    elif dob:
                        leave['employee_dateOfBirth'] = str(dob)
                    else:
                        leave['employee_dateOfBirth'] = None
                    
                    # Add other employee details if not present
                    if not leave.get('employee_name'):
                        leave['employee_name'] = employee.get('name', 'Unknown')
                    if not leave.get('employee_email'):
                        leave['employee_email'] = employee.get('email', '')
                    if not leave.get('employee_designation'):
                        leave['employee_designation'] = employee.get('designation', '')
                    if not leave.get('employee_department'):
                        leave['employee_department'] = employee.get('department', '')
            
            # Convert all ObjectId fields
            if isinstance(leave.get('current_approver_id'), ObjectId):
                leave['current_approver_id'] = str(leave['current_approver_id'])
            
            if isinstance(leave.get('previous_approver_id'), ObjectId):
                leave['previous_approver_id'] = str(leave['previous_approver_id'])
            
            # Convert datetime fields
            datetime_fields = ['applied_on', 'escalated_on', 'start_date', 'end_date', 
                             'approved_on', 'rejected_on']
            for field in datetime_fields:
                if field in leave and isinstance(leave[field], datetime):
                    leave[field] = leave[field].isoformat()
            
            # Handle escalation_history array
            if 'escalation_history' in leave and isinstance(leave['escalation_history'], list):
                for entry in leave['escalation_history']:
                    if isinstance(entry.get('escalated_at'), datetime):
                        entry['escalated_at'] = entry['escalated_at'].isoformat()
                    if isinstance(entry.get('from_approver'), ObjectId):
                        entry['from_approver'] = str(entry['from_approver'])
                    if isinstance(entry.get('to_approver'), ObjectId):
                        entry['to_approver'] = str(entry['to_approver'])
        
        print(f"✅ Returning {len(admin_pending)} serialized admin pending leaves")
        print(f"{'='*60}\n")
        return jsonify(serialize_all(admin_pending)), 200
        
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ ERROR in get_admin_pending_requests")
        print(f"{'='*60}")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"{'='*60}\n")
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Get Leave History for Employee
# -------------------------------
@leave_bp.route("/history/<employee_id>", methods=["GET"])
def get_leave_history(employee_id):
    try:
        print(f"📋 Fetching leave history for employee: {employee_id}")
        
        # ✅ FIX 1: Validate ObjectId format before querying
        if not employee_id or len(employee_id) != 24:
            print(f"❌ Invalid employee_id format: {employee_id}")
            return jsonify({"error": "Invalid employee ID format"}), 400
        
        try:
            emp_obj_id = ObjectId(employee_id)
        except Exception as id_err:
            print(f"❌ Cannot convert to ObjectId: {employee_id}, Error: {str(id_err)}")
            return jsonify({"error": "Invalid employee ID"}), 400
        
        # ✅ FIX 2: Check if employee exists
        employee = mongo.db.users.find_one({"_id": emp_obj_id})
        if not employee:
            print(f"❌ Employee not found: {employee_id}")
            return jsonify({"error": "Employee not found"}), 404
        
        print(f"✅ Employee found: {employee.get('name')}")
        
        # ✅ FIX 3: Query leaves with error handling
        leaves = list(mongo.db.leaves.find({"employee_id": emp_obj_id}).sort("applied_on", -1))
        
        print(f"📊 Found {len(leaves)} leave records")
        
        # ✅ FIX 4: Comprehensive serialization
        for leave in leaves:
            enrich_leave_with_employee_details(leave)

            # Convert _id to string
            if '_id' in leave and isinstance(leave['_id'], ObjectId):
                leave['_id'] = str(leave['_id'])
            
            # Convert employee_id to string
            if 'employee_id' in leave:
                if isinstance(leave['employee_id'], ObjectId):
                    leave['employee_id'] = str(leave['employee_id'])
            
            # Convert current_approver_id to string
            if 'current_approver_id' in leave:
                if isinstance(leave['current_approver_id'], ObjectId):
                    leave['current_approver_id'] = str(leave['current_approver_id'])
            
            # Convert previous_approver_id to string
            if 'previous_approver_id' in leave:
                if isinstance(leave['previous_approver_id'], ObjectId):
                    leave['previous_approver_id'] = str(leave['previous_approver_id'])
            
            # Convert ALL datetime fields to ISO strings
            datetime_fields = [
                'applied_on', 'approved_on', 'rejected_on', 'cancelled_on',
                'escalated_on', 'start_date', 'end_date', 'approved_start_date', 'approved_end_date'
            ]
            
            for field in datetime_fields:
                if field in leave:
                    if isinstance(leave[field], datetime):
                        leave[field] = leave[field].isoformat()
                    elif isinstance(leave[field], str):
                        # Already a string, leave as is
                        pass
                    elif leave[field] is not None:
                        # Try to convert to string
                        leave[field] = str(leave[field])
            
            # Handle escalation_history array
            if 'escalation_history' in leave and isinstance(leave['escalation_history'], list):
                for entry in leave['escalation_history']:
                    # Convert datetime
                    if 'escalated_at' in entry and isinstance(entry['escalated_at'], datetime):
                        entry['escalated_at'] = entry['escalated_at'].isoformat()
                    
                    # Convert ObjectIds
                    if 'approver_id' in entry and isinstance(entry['approver_id'], ObjectId):
                        entry['approver_id'] = str(entry['approver_id'])
                    if 'from_approver' in entry and isinstance(entry['from_approver'], ObjectId):
                        entry['from_approver'] = str(entry['from_approver'])
                    if 'to_approver' in entry and isinstance(entry['to_approver'], ObjectId):
                        entry['to_approver'] = str(entry['to_approver'])
        
        print(f"✅ Successfully serialized {len(leaves)} leave records")
        return jsonify(serialize_all(leaves)), 200
        
    except Exception as e:
        print(f"❌ Error fetching leave history: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error", "details": str(e)}), 500



# -------------------------------
# Apply for Leave (WITH SICK LEAVE VALIDATION)
# -------------------------------
@leave_bp.route("/apply", methods=["POST"])
def apply_leave():
    try:
        data = request.get_json()
        employee_id = data.get("employee_id")
        leave_type = normalize_leave_type(data.get("leave_type"))
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        reason = data.get("reason", "")
        is_half_day = data.get("is_half_day", False)
        half_day_period = normalize_half_day_period(data.get("half_day_period", ""))

        if not all([employee_id, leave_type, start_date, end_date]):
            return jsonify({"error": "Missing required fields"}), 400
        if leave_type_requires_reason(leave_type) and not str(reason).strip():
            return jsonify({"error": "Reason is mandatory for Compensatory Off."}), 400

        requester = resolve_requester()
        if requester and str(requester.get("_id")) != str(employee_id):
            if not has_admin_menu_access(requester, "apply-behalf"):
                return jsonify({"error": "You do not have permission to apply leave on behalf of another employee"}), 403

        # Fetch employee
        employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        # 🔹 NEW: Intern leave type restriction
        employment_type = employee.get("employment_type", "Employee")
        if employment_type == "Intern":
            # Interns can apply for Sick leave, LWP, Compensatory Off, or Early Logout
            if leave_type.lower() not in ["sick", "lwp", "compensatory off", "early logout"]:
                return jsonify({
                    "error": f"Interns can only apply for Sick Leave, Leave Without Pay, Compensatory Off, or Early Logout. {leave_type} is not allowed."
                }), 403
            
            print(f"✅ INTERN {employee.get('name')} applying for {leave_type} - validation passed")

        # Convert dates
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')

        if end < start:
            return jsonify({
                "error": "End date cannot be before start date."
            }), 400
        
        # Calculate days with half-day support
        if is_half_day:
            if start_date != end_date:
                return jsonify({
                    "error": "Half-day leave can only be applied for a single day"
                }), 400
            if not half_day_period or half_day_period not in ["morning", "afternoon"]:
                return jsonify({
                    "error": "Please select half-day period (morning or afternoon)"
                }), 400
            if is_weekend(start.date()):
                return jsonify({
                    "error": "Half-day leave cannot be applied on weekends."
                }), 400
            days = 0.5
        else:
            days = calculate_working_leave_days(start, end)
            if days == 0:
                return jsonify({
                    "error": "Selected leave range has no working days. Weekends are not counted as leave."
                }), 400
        
        today = ist_today()

        # Date validation based on leave type
        if leave_type.lower() == "planned":
            days_difference = (start.date() - today).days
            if days_difference < 7:
                return jsonify({
                    "error": "Planned leave must be applied at least 7 days in advance."
                }), 400
        
        elif leave_type.lower() == "sick":
            # Sick leave: only today and tomorrow allowed
            max_sick_date = today + timedelta(days=1)
            if start.date() < today:
                return jsonify({
                    "error": f"Sick leave cannot be applied for past dates ({start_date})."
                }), 400
            if start.date() > max_sick_date:
                return jsonify({
                    "error": "Sick leave can only be applied for today or tomorrow."
                }), 400
            if end.date() > max_sick_date:
                return jsonify({
                    "error": "Sick leave end date cannot be beyond tomorrow."
                }), 400

        elif leave_type.lower() == "early logout":
            if start.date() < today:
                return jsonify({
                    "error": f"Early logout cannot be applied for past dates ({start_date})."
                }), 400

        else:
            if start.date() < today:
                return jsonify({
                    "error": f"Leave cannot be applied for past dates ({start_date})."
                }), 400
            
            if end.date() < today:
                return jsonify({
                    "error": f"End date cannot be in the past ({end_date})."
                }), 400

        # Optional leave validation
        if leave_type.lower() == "optional":
            if is_half_day:
                return jsonify({
                    "error": "Half-day leave is not allowed for optional holidays"
                }), 400

            if days != 1:
                return jsonify({
                    "error": "Optional leave can only be taken for a single optional holiday date."
                }), 400

            dob = employee.get("dateOfBirth")
            if dob:
                if isinstance(dob, str):
                    try:
                        dob = datetime.fromisoformat(dob.replace("Z", "+00:00"))
                    except:
                        dob = None

                if isinstance(dob, datetime):
                    if dob.month == start.month and dob.day == start.day:
                        print("🎉 Birthday Optional Leave Auto-Approved Day")
                    else:
                        holiday = mongo.db.holidays.find_one({
                            "date": start_date,
                            "type": "optional"
                        })
                        if not holiday:
                            return jsonify({
                                "error": f"No optional holiday on {start_date}. Cannot apply optional leave."
                            }), 400
                else:
                    holiday = mongo.db.holidays.find_one({
                        "date": start_date,
                        "type": "optional"
                    })
                    if not holiday:
                        return jsonify({
                            "error": f"No optional holiday on {start_date}. Cannot apply optional leave."
                        }), 400
            else:
                holiday = mongo.db.holidays.find_one({
                    "date": start_date,
                    "type": "optional"
                })
                if not holiday:
                    return jsonify({
                        "error": f"No optional holiday on {start_date}. Cannot apply optional leave."
                    }), 400

        # Early logout validation
        if leave_type.lower() == "early logout":
            if days != 1:
                return jsonify({
                    "error": "Early logout can only be applied for a single day."
                }), 400
            
            logout_time = data.get("logout_time", "").strip()
            if not logout_time:
                return jsonify({
                    "error": "Logout time is mandatory for early logout."
                }), 400

        # Leave balance check
        leave_balance = employee.get("leaveBalance", {
            "sick": 6, "sickTotal": 6,
            "planned": 12, "plannedTotal": 12,
            "optional": 2, "optionalTotal": 2,
            "lwp": 0,
            "compOffUsed": 0,
        })

        leave_type_key = leave_type.lower()

        if leave_type_key in ["sick", "planned", "optional"]:
            available = leave_balance.get(leave_type_key, 0)
            if days > available:
                return jsonify({
                    "error": f"Insufficient {leave_type} leave balance. Available: {available}, Requested: {days}"
                }), 400

        # Get immediate manager for initial approval
        immediate_manager_id = employee.get("reportsTo")
        if not immediate_manager_id:
            return jsonify({"error": "No reporting manager found for employee"}), 404

        # Create leave request with escalation tracking
        leave_request = {
            "employee_id": ObjectId(employee_id),
            "employee_name": employee.get("name", "Unknown"),
            "employee_email": employee.get("email", ""),
            "employee_designation": employee.get("designation", ""),
            "employee_department": employee.get("department", ""),
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days": days,
            "reason": reason,
            "logout_time": data.get("logout_time", ""),
            "is_half_day": is_half_day,
            "half_day_period": half_day_period if is_half_day else "",
            "status": "Pending",
            "applied_on": datetime.utcnow(),
            "escalation_level": 0,
            "current_approver_id": immediate_manager_id,
            "escalation_history": []
        }

        result = mongo.db.leaves.insert_one(leave_request)

        # Log submission
        log_leave_action(
            leave_id=str(result.inserted_id),
            employee_id=employee_id,
            action="Submitted",
            performed_by=employee.get("email"),
            new_data=trim_leave(leave_request)
        )

        # ✅ CREATE NOTIFICATION FOR MANAGER
        if immediate_manager_id:
            try:
                manager = mongo.db.users.find_one({"_id": ObjectId(immediate_manager_id)})
                if manager:
                    leave_desc = f"{leave_type}"
                    if is_half_day:
                        leave_desc += f" (Half-day - {half_day_period.capitalize()})"
                    
                    notification_message = f"{employee.get('name', 'An employee')} has requested {leave_desc} from {start_date} to {end_date} ({days} day{'s' if days != 1 else ''})"
                    
                    create_notification(
                        user_id=immediate_manager_id,
                        notification_type="leave_request",
                        message=notification_message,
                        related_leave_id=result.inserted_id,
                        target=build_leave_notification_target(result.inserted_id, active_tab="pending"),
                    )
                    
                    try:
                        queue_leave_applied_emails(str(result.inserted_id))
                    except Exception as email_err:
                        print(f"   ⚠️ Leave application email queue failed: {str(email_err)}")
            except Exception as mgr_err:
                print(f"   ❌ Error fetching manager: {str(mgr_err)}")

        return jsonify({
            "message": "Leave applied successfully!",
            "id": str(result.inserted_id)
        }), 201

    except Exception as e:
        print("❌ Error applying leave:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@leave_bp.route("/admin/backdated", methods=["POST"])
def apply_backdated_leave():
    try:
        requester, error_response = require_admin()
        if error_response:
            return error_response

        data = request.get_json() or {}
        employee_id = data.get("employee_id")
        leave_type = normalize_leave_type(data.get("leave_type"))
        start_date = str(data.get("start_date", "")).strip()
        end_date = str(data.get("end_date", "")).strip()
        reason = str(data.get("reason", "")).strip()
        recorded_by_name = str(data.get("recorded_by_name", "")).strip()
        is_half_day = data.get("is_half_day", False)
        half_day_period = normalize_half_day_period(data.get("half_day_period", ""))
        logout_time = str(data.get("logout_time", "")).strip()

        if not all([employee_id, leave_type, start_date, end_date, recorded_by_name]):
            return jsonify({"error": "Employee, leave type, dates, and recorded by name are mandatory"}), 400
        if leave_type_requires_reason(leave_type) and not reason:
            return jsonify({"error": "Reason is mandatory for Compensatory Off."}), 400

        employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        employment_type = employee.get("employment_type", "Employee")
        if employment_type == "Intern" and leave_type.lower() not in ["sick", "lwp", "compensatory off", "early logout"]:
            return jsonify({
                "error": f"Interns can only apply for Sick Leave, Leave Without Pay, Compensatory Off, or Early Logout. {leave_type} is not allowed."
            }), 403

        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")

        if end < start:
            return jsonify({"error": "End date cannot be before start date."}), 400

        today = ist_today()
        if end.date() >= today:
            return jsonify({
                "error": "Backdated leave regularization is only allowed for dates before today."
            }), 400

        if is_half_day:
            if start_date != end_date:
                return jsonify({"error": "Half-day leave can only be applied for a single day"}), 400
            if half_day_period not in ["morning", "afternoon"]:
                return jsonify({"error": "Please select half-day period (morning or afternoon)"}), 400
            if is_weekend(start.date()):
                return jsonify({"error": "Half-day leave cannot be applied on weekends."}), 400
            days = 0.5
        else:
            days = calculate_working_leave_days(start, end)
            if days == 0:
                return jsonify({
                    "error": "Selected leave range has no working days. Weekends are not counted as leave."
                }), 400

        if leave_type.lower() == "optional":
            if is_half_day:
                return jsonify({"error": "Half-day leave is not allowed for optional holidays"}), 400
            if days != 1:
                return jsonify({"error": "Optional leave can only be taken for a single optional holiday date."}), 400

            dob = employee.get("dateOfBirth")
            is_birthday = False
            if isinstance(dob, str):
                try:
                    dob = datetime.fromisoformat(dob.replace("Z", "+00:00"))
                except Exception:
                    dob = None

            if isinstance(dob, datetime):
                is_birthday = dob.month == start.month and dob.day == start.day

            if not is_birthday:
                holiday = mongo.db.holidays.find_one({"date": start_date, "type": "optional"})
                if not holiday:
                    return jsonify({
                        "error": f"No optional holiday on {start_date}. Cannot regularize optional leave."
                    }), 400

        if leave_type.lower() == "early logout":
            if days != 1:
                return jsonify({"error": "Early logout can only be applied for a single day."}), 400
            if not logout_time:
                return jsonify({"error": "Logout time is mandatory for early logout."}), 400

        overlapping_leave = find_overlapping_leave(employee_id, start_date, end_date)
        if overlapping_leave:
            overlap_start = overlapping_leave.get("approved_start_date") or overlapping_leave.get("start_date")
            overlap_end = overlapping_leave.get("approved_end_date") or overlapping_leave.get("end_date")
            return jsonify({
                "error": (
                    f"A {overlapping_leave.get('status', 'recorded')} leave already exists for this employee "
                    f"between {overlap_start} and {overlap_end}."
                )
            }), 400

        leave_balance = employee.get("leaveBalance", {
            "sick": 6, "sickTotal": 6,
            "planned": 12, "plannedTotal": 12,
            "optional": 2, "optionalTotal": 2,
            "lwp": 0,
            "compOffUsed": 0,
        })

        leave_type_key = leave_type.lower()
        if leave_type_key in ["sick", "planned", "optional"]:
            available = leave_balance.get(leave_type_key, 0)
            if days > available:
                return jsonify({
                    "error": f"Insufficient {leave_type} leave balance. Available: {available}, Requested: {days}"
                }), 400

        timestamp = datetime.utcnow()
        leave_request = {
            "employee_id": ObjectId(employee_id),
            "employee_name": employee.get("name", "Unknown"),
            "employee_email": employee.get("email", ""),
            "employee_designation": employee.get("designation", ""),
            "employee_department": employee.get("department", ""),
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days": days,
            "approved_days": days,
            "reason": reason,
            "logout_time": logout_time,
            "is_half_day": is_half_day,
            "half_day_period": half_day_period if is_half_day else "",
            "status": "Approved",
            "applied_on": timestamp,
            "approved_on": timestamp,
            "approved_by": recorded_by_name,
            "recorded_by_name": recorded_by_name,
            "recorded_by_user_id": requester["_id"],
            "recorded_by_email": requester.get("email", ""),
            "recorded_on": timestamp,
            "entry_mode": "backdated_regularization",
            "escalation_level": 0,
            "current_approver_id": requester["_id"],
            "escalation_history": []
        }

        result = mongo.db.leaves.insert_one(leave_request)
        leave_request["_id"] = result.inserted_id

        if leave_type_key in ["sick", "planned", "optional"]:
            leave_balance[leave_type_key] = leave_balance.get(leave_type_key, 0) - days
        elif leave_type_key in ["lwp", "lop", "leave without pay", "leave with loss of pay"]:
            leave_balance["lwp"] = leave_balance.get("lwp", 0) + days
        elif leave_type_key == "compensatory off":
            leave_balance["compOffUsed"] = leave_balance.get("compOffUsed", 0) + days

        mongo.db.users.update_one(
            {"_id": ObjectId(employee_id)},
            {"$set": {"leaveBalance": leave_balance}}
        )

        removed_orders = 0
        synced_timesheets = 0
        if leave_type_key != "early logout" and not is_half_day:
            removed_orders = remove_tea_coffee_orders_for_leave(employee_id, start_date, end_date)

        try:
            from routes.timesheet_routes import sync_timesheets_for_approved_leave
            synced_timesheets = sync_timesheets_for_approved_leave(leave_request)
        except Exception as sync_error:
            print(f"⚠️ Could not sync timesheets for backdated leave {result.inserted_id}: {sync_error}")

        create_notification(
            user_id=leave_request["employee_id"],
            notification_type="leave_approved",
            message=(
                f"A backdated {leave_type} record ({start_date} to {end_date}) "
                f"was regularized by {recorded_by_name}."
            ),
            related_leave_id=result.inserted_id,
            target=build_leave_notification_target(result.inserted_id, active_tab="my-leaves"),
        )

        requester_email = requester.get("email", "")
        remarks = "Backdated leave regularization recorded by " + recorded_by_name
        if requester_email:
            remarks += f" via {requester_email}"

        log_leave_action(
            leave_id=str(result.inserted_id),
            employee_id=employee_id,
            action="Admin Regularized",
            performed_by=recorded_by_name,
            remarks=remarks,
            new_data=trim_leave(leave_request)
        )

        response_message = "Backdated leave record created successfully."
        if removed_orders:
            response_message += f" {removed_orders} tea/coffee order(s) were discarded for the approved leave dates."
        if synced_timesheets:
            response_message += f" {synced_timesheets} overlapping timesheet(s) were refreshed."

        return jsonify({
            "message": response_message,
            "id": str(result.inserted_id),
        }), 201

    except Exception as e:
        print("❌ Error applying backdated leave:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================
# ✅ LOOPHOLE FIX: update_leave now enforces all type-specific
#    date rules — same as apply_leave — so employees cannot
#    bypass the 7-day planned rule (or sick date rules) by
#    editing an existing request.
# ============================================================
@leave_bp.route("/update/<leave_id>", methods=["PUT"])
def update_leave(leave_id):
    data = request.get_json()

    leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404

    if leave.get("status") != "Pending":
        return jsonify({"error": "Only pending leaves can be edited"}), 400

    # ✅ LOOPHOLE FIX: Fetch employee to enforce intern restrictions on edit too
    employee = mongo.db.users.find_one({"_id": leave["employee_id"]})
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    employment_type = employee.get("employment_type", "Employee")
    new_leave_type = normalize_leave_type(data.get("leave_type", leave["leave_type"]))

    # ✅ LOOPHOLE FIX: Interns cannot switch to restricted leave types via edit
    if employment_type == "Intern":
        if new_leave_type.lower() not in ["sick", "lwp", "compensatory off", "early logout"]:
            return jsonify({
                "error": f"Interns can only have Sick Leave, Leave Without Pay, Compensatory Off, or Early Logout. {new_leave_type} is not allowed."
            }), 403

    if leave_type_requires_reason(new_leave_type) and not str(data.get("reason", "")).strip():
        return jsonify({"error": "Reason is mandatory for Compensatory Off."}), 400

    start = datetime.strptime(data["start_date"], "%Y-%m-%d")
    end = datetime.strptime(data["end_date"], "%Y-%m-%d")

    if end < start:
        return jsonify({
            "error": "End date cannot be before start date."
        }), 400
    
    is_half_day = data.get("is_half_day", False)
    half_day_period = normalize_half_day_period(data.get("half_day_period", ""))
    
    if is_half_day:
        if data["start_date"] != data["end_date"]:
            return jsonify({
                "error": "Half-day leave can only be applied for a single day"
            }), 400
        if not half_day_period or half_day_period not in ["morning", "afternoon"]:
            return jsonify({
                "error": "Please select half-day period (morning or afternoon)"
            }), 400
        if is_weekend(start.date()):
            return jsonify({
                "error": "Half-day leave cannot be applied on weekends."
            }), 400
        days = 0.5
    else:
        days = calculate_working_leave_days(start, end)
        if days == 0:
            return jsonify({
                "error": "Selected leave range has no working days. Weekends are not counted as leave."
            }), 400

    today = ist_today()

    # ✅ LOOPHOLE FIX: Full type-specific date validation (mirrors apply_leave)
    if new_leave_type.lower() == "planned":
        days_difference = (start.date() - today).days
        if days_difference < 7:
            return jsonify({
                "error": "Planned leave must be applied at least 7 days in advance."
            }), 400

    elif new_leave_type.lower() == "sick":
        max_sick_date = today + timedelta(days=1)
        if start.date() < today:
            return jsonify({
                "error": f"Sick leave cannot be applied for past dates ({data['start_date']})."
            }), 400
        if start.date() > max_sick_date:
            return jsonify({
                "error": "Sick leave can only be applied for today or tomorrow."
            }), 400
        if end.date() > max_sick_date:
            return jsonify({
                "error": "Sick leave end date cannot be beyond tomorrow."
            }), 400

    elif new_leave_type.lower() == "early logout":
        if start.date() < today:
            return jsonify({
                "error": f"Early logout cannot be applied for past dates ({data['start_date']})."
            }), 400
        if days != 1:
            return jsonify({
                "error": "Early logout can only be applied for a single day."
            }), 400
        logout_time = data.get("logout_time", "").strip()
        if not logout_time:
            return jsonify({
                "error": "Logout time is mandatory for early logout."
            }), 400

    else:
        # LWP and any other types — just block past dates
        if start.date() < today:
            return jsonify({
                "error": f"Cannot apply leave for past dates. ({data['start_date']}) already passed."
            }), 400
        if end.date() < today:
            return jsonify({
                "error": "End date cannot be before today."
            }), 400

    # ✅ LOOPHOLE FIX: Optional leave rules on edit
    if new_leave_type.lower() == "optional":
        if is_half_day:
            return jsonify({
                "error": "Half-day leave is not allowed for optional holidays"
            }), 400
        if days != 1:
            return jsonify({
                "error": "Optional leave can only be taken for a single optional holiday date."
            }), 400
        dob = employee.get("dateOfBirth")
        is_birthday = False
        if dob:
            if isinstance(dob, str):
                try:
                    dob = datetime.fromisoformat(dob.replace("Z", "+00:00"))
                except:
                    dob = None
            if isinstance(dob, datetime):
                is_birthday = (dob.month == start.month and dob.day == start.day)
        if not is_birthday:
            holiday = mongo.db.holidays.find_one({"date": data["start_date"], "type": "optional"})
            if not holiday:
                return jsonify({
                    "error": f"No optional holiday on {data['start_date']}. Cannot apply optional leave."
                }), 400

    old_data = leave.copy()

    mongo.db.leaves.update_one(
        {"_id": ObjectId(leave_id)},
        {
            "$set": {
                "leave_type": new_leave_type,
                "start_date": data["start_date"],
                "end_date": data["end_date"],
                "reason": data.get("reason", ""),
                "logout_time": data.get("logout_time", ""),
                "is_half_day": is_half_day,
                "half_day_period": half_day_period if is_half_day else "",
                "days": days,
                "modified_on": datetime.utcnow(),
            }
        }
    )

    new_data = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})

    log_leave_action(
        leave_id=leave_id,
        employee_id=str(leave["employee_id"]),
        action="Edited",
        performed_by=leave.get("employee_email", "Unknown"),
        old_data=trim_leave(old_data),
        new_data=trim_leave(new_data)
    )

    try:
        queue_leave_modified_email(leave_id)
    except Exception as mail_error:
        print(f"⚠️ Leave modified email queue failed: {str(mail_error)}")

    return jsonify({"message": "Leave updated successfully"}), 200


# -------------------------------
# Cancel Leave (Employee) - WITH NOTIFICATION
# -------------------------------
@leave_bp.route("/cancel/<leave_id>", methods=["PUT"])
def cancel_leave(leave_id):
    try:
        print(f"🔍 Cancel request for leave: {leave_id}")
        data = request.get_json(silent=True) or {}

        obj_id = ObjectId(leave_id)
        leave = mongo.db.leaves.find_one({"_id": obj_id})

        if not leave:
            return jsonify({"error": "Leave request not found"}), 404

        if leave.get("status") == "Approved":
            if not employee_can_cancel_approved_leave(leave):
                cutoff = get_leave_cancellation_cutoff(leave)
                cutoff_text = cutoff.strftime("%Y-%m-%d %H:%M UTC") if cutoff else "the 48-hour cutoff"
                return jsonify({
                    "error": (
                        "Approved leave can be cancelled by the employee only until "
                        f"{cutoff_text}. Please contact your lead to cancel this leave."
                    )
                }), 400

            cancelled_by = (
                data.get("cancelled_by")
                or leave.get("employee_email")
                or leave.get("employee_name")
                or "Employee"
            )
            updated_leave = cancel_approved_leave_record(
                leave=leave,
                leave_id=leave_id,
                performed_by=cancelled_by,
                cancelled_by_role="employee",
                reason=data.get("reason", ""),
            )

            current_approver_id = leave.get("current_approver_id")
            if current_approver_id:
                create_notification(
                    user_id=current_approver_id,
                    notification_type="leave_cancelled",
                    message=(
                        f"{leave.get('employee_name', 'An employee')} cancelled their approved "
                        f"{leave.get('leave_type', 'leave')} request "
                        f"({leave.get('start_date')} to {leave.get('end_date')})"
                    ),
                    related_leave_id=leave_id,
                    target=build_leave_notification_target(leave_id, active_tab="pending"),
                )
            clear_leave_reminder_state(leave_id)

            try:
                queue_leave_cancelled_email(
                    leave_id,
                    cancelled_by_role="employee",
                    reason=data.get("reason", ""),
                )
            except Exception as mail_error:
                print(f"⚠️ Leave cancellation email queue failed: {str(mail_error)}")

            print("✅ Approved leave cancelled by employee")
            return jsonify({
                "message": "Approved leave cancelled successfully",
                "leave_id": str(updated_leave["_id"]) if updated_leave else leave_id,
            }), 200

        if leave.get("status") != "Pending":
            return jsonify({"error": "Only pending or eligible approved leave requests can be cancelled"}), 400

        mongo.db.leaves.update_one(
            {"_id": obj_id},
            {"$set": {
                "status": "Cancelled",
                "cancelled_on": datetime.utcnow()
            }}
        )

        log_leave_action(
            leave_id=leave_id,
            employee_id=str(leave["employee_id"]),
            action="Cancelled",
            performed_by=leave["employee_email"]
        )

        # ✅ NOTIFY CURRENT APPROVER ABOUT CANCELLATION
        current_approver_id = leave.get("current_approver_id")
        if current_approver_id:
            notification_message = f"{leave.get('employee_name', 'An employee')} cancelled their {leave.get('leave_type', 'leave')} request ({leave.get('start_date')} to {leave.get('end_date')})"
            
            create_notification(
                user_id=current_approver_id,
                notification_type="leave_cancelled",
                message=notification_message,
                related_leave_id=leave_id,
                target=build_leave_notification_target(leave_id, active_tab="pending"),
            )
        clear_leave_reminder_state(leave_id)

        try:
            queue_leave_cancelled_email(
                leave_id,
                cancelled_by_role="employee",
                reason=data.get("reason", ""),
            )
        except Exception as mail_error:
            print(f"⚠️ Leave cancellation email queue failed: {str(mail_error)}")

        print("✅ Leave cancelled successfully")
        return jsonify({"message": "Leave cancelled successfully"}), 200

    except Exception as e:
        print("❌ Cancel error:", str(e))
        return jsonify({"error": str(e)}), 500


@leave_bp.route("/cancel_by_lead/<leave_id>", methods=["PUT"])
def cancel_leave_by_lead(leave_id):
    try:
        data = request.get_json() or {}
        lead_id = data.get("lead_id")
        lead_email = data.get("lead_email")
        reason = (data.get("reason") or "").strip()

        leave = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        if not leave:
            return jsonify({"error": "Leave request not found"}), 404
        if leave.get("status") != "Approved":
            return jsonify({"error": "Only approved leaves can be cancelled by lead"}), 400
        if not lead_can_cancel_approved_leave(leave):
            return jsonify({
                "error": "Lead cancellation is available only after the employee 48-hour cancellation window has passed"
            }), 400

        lead = None
        if lead_id:
            try:
                lead = mongo.db.users.find_one({"_id": ObjectId(lead_id)})
            except Exception:
                lead = None
        if not lead and lead_email:
            lead = mongo.db.users.find_one({"email": lead_email})
        if not lead:
            return jsonify({"error": "Lead user not found"}), 404

        employee = mongo.db.users.find_one({"_id": leave["employee_id"]})
        reporting_lead_id = employee.get("reportsTo") if employee else None
        current_approver_id = leave.get("current_approver_id")
        is_admin = lead.get("role") == "Admin"
        is_reporting_lead = reporting_lead_id and str(reporting_lead_id) == str(lead["_id"])
        is_current_approver = current_approver_id and str(current_approver_id) == str(lead["_id"])

        if not (is_admin or is_reporting_lead or is_current_approver):
            return jsonify({"error": "Only the reporting lead or admin can cancel this approved leave"}), 403

        performed_by = lead.get("name") or lead.get("email") or "Lead"
        updated_leave = cancel_approved_leave_record(
            leave=leave,
            leave_id=leave_id,
            performed_by=performed_by,
            cancelled_by_role="lead",
            reason=reason,
        )

        create_notification(
            user_id=leave["employee_id"],
            notification_type="leave_cancelled",
            message=(
                f"Your approved {leave.get('leave_type', 'leave')} request "
                f"({leave.get('start_date')} to {leave.get('end_date')}) was cancelled by {performed_by}"
            ),
            related_leave_id=leave_id,
            target=build_leave_notification_target(leave_id, active_tab="my-leaves"),
        )
        clear_leave_reminder_state(leave_id)

        try:
            queue_leave_cancelled_email(
                leave_id,
                cancelled_by_role="lead",
                reason=reason,
            )
        except Exception as mail_error:
            print(f"⚠️ Lead cancellation email queue failed: {str(mail_error)}")

        return jsonify({
            "message": "Approved leave cancelled by lead successfully",
            "leave_id": str(updated_leave["_id"]) if updated_leave else leave_id,
        }), 200

    except Exception as e:
        print("❌ Lead cancel error:", str(e))
        return jsonify({"error": str(e)}), 500


@leave_bp.route("/balance/<employee_id>", methods=["GET"])
def get_leave_balance(employee_id):
    try:
        requester = resolve_requester()
        if requester and str(requester.get("_id")) != str(employee_id):
            if not (is_full_admin(requester) or has_admin_menu_access(requester, "apply-behalf")):
                return jsonify({"error": "You do not have permission to view this leave balance"}), 403

        employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)})
        if not employee:
            return jsonify({"error": "Employee not found"}), 404

        leave_balance = employee.get("leaveBalance", {
            "sick": 0,
            "sickTotal": 0,
            "planned": 0,
            "plannedTotal": 0,
            "optional": 2,
            "optionalTotal": 2,
            "lwp": 0,
            "compOffUsed": 0,
        })
        
        join_date = employee.get("dateOfJoining")
        if join_date:
            today = now_ist_naive()
            months = (today.year - join_date.year) * 12 + (today.month - join_date.month) + 1
            leave_balance["monthsEmployed"] = months
            leave_balance["accrualRate"] = {"planned": "1.0/month", "sick": "0.5/month"}
        
        if "sickTotal" not in leave_balance:
            leave_balance["sickTotal"] = 0
        if "plannedTotal" not in leave_balance:
            leave_balance["plannedTotal"] = 0
        if "optionalTotal" not in leave_balance:
            leave_balance["optionalTotal"] = 2
        if "compOffUsed" not in leave_balance:
            leave_balance["compOffUsed"] = 0
            
        return jsonify(leave_balance), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

        
@leave_bp.route("/pending/<user_email>", methods=["GET"])
def get_pending_requests(user_email):
    try:
        print(f"\n🔍 Fetching pending requests for: {user_email}")
        
        user = mongo.db.users.find_one({"email": user_email})
        if not user:
            print(f"❌ User not found with email: {user_email}")
            return jsonify({"error": "User not found"}), 404

        print(f"✅ User found: {user.get('name')} (Role: {user.get('role')})")

        # Get leaves where this user is the current approver
        pending_leaves = list(mongo.db.leaves.find({
            "current_approver_id": user["_id"],
            "status": "Pending"
        }).sort("applied_on", -1))

        for leave in pending_leaves:
            enrich_leave_with_employee_details(leave)

            # Convert _id to string
            leave['_id'] = str(leave['_id'])
            
            # Convert employee_id to string
            if isinstance(leave.get('employee_id'), ObjectId):
                emp_obj_id = leave['employee_id']
                leave['employee_id'] = str(emp_obj_id)
                
                # Fetch employee details
                employee = mongo.db.users.find_one({"_id": emp_obj_id})
                if employee:
                    leave['employee_dateOfBirth'] = employee.get('dateOfBirth')
                    # Convert dateOfBirth to ISO string if it's a datetime
                    if isinstance(leave.get('employee_dateOfBirth'), datetime):
                        leave['employee_dateOfBirth'] = leave['employee_dateOfBirth'].isoformat()
            
            # Convert current_approver_id to string
            if isinstance(leave.get('current_approver_id'), ObjectId):
                leave['current_approver_id'] = str(leave['current_approver_id'])
            
            # Convert previous_approver_id to string
            if isinstance(leave.get('previous_approver_id'), ObjectId):
                leave['previous_approver_id'] = str(leave['previous_approver_id'])
            
            # Convert dates to ISO string format
            if isinstance(leave.get('applied_on'), datetime):
                leave['applied_on'] = leave['applied_on'].isoformat()
            
            if isinstance(leave.get('escalated_on'), datetime):
                leave['escalated_on'] = leave['escalated_on'].isoformat()
            
            if isinstance(leave.get('approved_on'), datetime):
                leave['approved_on'] = leave['approved_on'].isoformat()
            
            if isinstance(leave.get('rejected_on'), datetime):
                leave['rejected_on'] = leave['rejected_on'].isoformat()
            
            # Handle escalation_history array
            if 'escalation_history' in leave and isinstance(leave['escalation_history'], list):
                for entry in leave['escalation_history']:
                    if isinstance(entry.get('escalated_at'), datetime):
                        entry['escalated_at'] = entry['escalated_at'].isoformat()
                    if isinstance(entry.get('from_approver'), ObjectId):
                        entry['from_approver'] = str(entry['from_approver'])
                    if isinstance(entry.get('to_approver'), ObjectId):
                        entry['to_approver'] = str(entry['to_approver'])

        print(f"✅ Returning {len(pending_leaves)} pending requests for {user_email}")
        return jsonify(serialize_all(pending_leaves)), 200
        
    except Exception as e:
        print(f"❌ Error fetching pending requests: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@leave_bp.route("/update_status/<leave_id>", methods=["PUT"])
def update_leave_status(leave_id):
    try:
        data = request.get_json()
        requester = resolve_requester()
        if not requester:
            return jsonify({"error": "A valid requester is required"}), 401
        status = data.get("status")
        rejection_reason = data.get("rejection_reason", "")
        approved_by = data.get("approved_by", "")
        
        approved_start_date = data.get("approved_start_date")
        approved_end_date = data.get("approved_end_date")
        is_partial = data.get("is_partial", False)

        if status not in ["Approved", "Rejected"]:
            return jsonify({"error": "Invalid status"}), 400

        if status == "Rejected" and not rejection_reason.strip():
            return jsonify({"error": "Rejection reason is mandatory"}), 400

        if status == "Approved" and not approved_by.strip():
            return jsonify({"error": "Approver name is mandatory"}), 400

        leave_record = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        if not leave_record:
            return jsonify({"error": "Leave record not found"}), 404

        current_approver_id = leave_record.get("current_approver_id")
        requester_id = str(requester["_id"]) if requester else ""
        is_admin_leave_reviewer = bool(requester and has_admin_menu_access(requester, "leaves"))
        is_current_approver = bool(current_approver_id and str(current_approver_id) == requester_id)

        if not (is_admin_leave_reviewer or is_current_approver):
            return jsonify({"error": "You do not have permission to update this leave request"}), 403

        old_trimmed = trim_leave(leave_record)

        update_data = {"status": status}

        if status == "Rejected":
            update_data["rejection_reason"] = rejection_reason
            update_data["rejected_on"] = datetime.utcnow()

        elif status == "Approved":
            update_data["approved_by"] = approved_by
            update_data["approved_on"] = datetime.utcnow()
            
            if is_partial and approved_start_date and approved_end_date:
                update_data["is_partial_approval"] = True
                update_data["approved_start_date"] = approved_start_date
                update_data["approved_end_date"] = approved_end_date
                update_data["original_start_date"] = leave_record["start_date"]
                update_data["original_end_date"] = leave_record["end_date"]
                update_data["original_days"] = leave_record["days"]
                
                approved_start = datetime.strptime(approved_start_date, '%Y-%m-%d')
                approved_end = datetime.strptime(approved_end_date, '%Y-%m-%d')
                if approved_end < approved_start:
                    return jsonify({"error": "Approved end date cannot be before approved start date"}), 400
                approved_days = calculate_working_leave_days(approved_start, approved_end)
                if approved_days == 0:
                    return jsonify({
                        "error": "Approved leave range has no working days. Weekends are not counted as leave."
                    }), 400
                update_data["approved_days"] = approved_days
            else:
                update_data["is_partial_approval"] = False
                update_data["approved_days"] = leave_record["days"]

        mongo.db.leaves.update_one(
            {"_id": ObjectId(leave_id)},
            {"$set": update_data}
        )

        updated_record = mongo.db.leaves.find_one({"_id": ObjectId(leave_id)})
        new_trimmed = trim_leave(updated_record)

        remarks = rejection_reason if status == "Rejected" else "Leave approved"
        if status == "Approved" and is_partial:
            remarks = f"Partially approved: {approved_start_date} to {approved_end_date}"
        
        log_leave_action(
            leave_id=leave_id,
            employee_id=str(leave_record["employee_id"]),
            action=status,
            performed_by=approved_by if status == "Approved" else (approved_by or "Manager"),
            remarks=remarks,
            old_data=old_trimmed,
            new_data=new_trimmed
        )

        # ✅ CREATE NOTIFICATION FOR EMPLOYEE
        if status == "Approved":
            notification_message = f"Your {leave_record.get('leave_type', 'leave')} request ({leave_record.get('start_date')} to {leave_record.get('end_date')}) has been approved by {approved_by}"
            create_notification(
                user_id=leave_record["employee_id"],
                notification_type="leave_approved",
                message=notification_message,
                related_leave_id=leave_id,
                target=build_leave_notification_target(leave_id, active_tab="my-leaves"),
            )
            clear_leave_reminder_state(leave_id)
        elif status == "Rejected":
            notification_message = f"Your {leave_record.get('leave_type', 'leave')} request ({leave_record.get('start_date')} to {leave_record.get('end_date')}) has been rejected. Reason: {rejection_reason}"
            create_notification(
                user_id=leave_record["employee_id"],
                notification_type="leave_rejected",
                message=notification_message,
                related_leave_id=leave_id,
                target=build_leave_notification_target(leave_id, active_tab="my-leaves"),
            )
            clear_leave_reminder_state(leave_id)

        removed_orders = 0
        synced_timesheets = 0

        if status == "Approved":
            employee = mongo.db.users.find_one({"_id": leave_record["employee_id"]})
            if employee:
                leave_balance = employee.get("leaveBalance", {
                    "sick": 6,
                    "sickTotal": 6,
                    "planned": 12,
                    "plannedTotal": 12,
                    "optional": 2,
                    "optionalTotal": 2,
                    "lwp": 0,
                    "compOffUsed": 0,
                })

                leave_type = normalize_leave_type(leave_record.get("leave_type", "")).lower()
                days = update_data.get("approved_days", leave_record.get("days", 1))

                if leave_type in ["sick", "planned", "optional"]:
                    available = leave_balance.get(leave_type, 0)
                    if available >= days:
                        leave_balance[leave_type] = available - days
                    else:
                        leave_balance["lwp"] = leave_balance.get("lwp", 0) + days
                elif leave_type in ["lwp", "lop"]:
                    leave_balance["lwp"] = leave_balance.get("lwp", 0) + days
                elif leave_type == "compensatory off":
                    leave_balance["compOffUsed"] = leave_balance.get("compOffUsed", 0) + days

                mongo.db.users.update_one(
                    {"_id": leave_record["employee_id"]},
                    {"$set": {"leaveBalance": leave_balance}}
                )

            approved_leave_type = normalize_leave_type(leave_record.get("leave_type", ""))
            is_half_day_leave = leave_record.get("is_half_day", False)

            if approved_leave_type.lower() != "early logout" and not is_half_day_leave:
                approved_range_start = update_data.get("approved_start_date", leave_record.get("start_date"))
                approved_range_end = update_data.get("approved_end_date", leave_record.get("end_date"))
                removed_orders = remove_tea_coffee_orders_for_leave(
                    leave_record["employee_id"],
                    approved_range_start,
                    approved_range_end
                )

                if removed_orders:
                    print(
                        f"☕ Removed {removed_orders} tea/coffee order(s) for employee "
                        f"{leave_record.get('employee_name', 'Unknown')} due to approved leave "
                        f"from {approved_range_start} to {approved_range_end}"
                    )
            try:
                from routes.timesheet_routes import sync_timesheets_for_approved_leave
                synced_timesheets = sync_timesheets_for_approved_leave(updated_record)
            except Exception as sync_error:
                print(f"⚠️ Could not sync timesheets for approved leave {leave_id}: {sync_error}")

        try:
            queue_leave_status_email(
                leave_id,
                status=status,
                remarks=rejection_reason,
                approver_name=approved_by,
            )
        except Exception as mail_error:
            print(f"⚠️ Leave status email queue failed: {str(mail_error)}")

        response_message = f"Leave {status.lower()} successfully!"
        if status == "Approved" and removed_orders:
            response_message += f" {removed_orders} tea/coffee order(s) were discarded for the approved leave dates."
        if status == "Approved" and synced_timesheets:
            response_message += f" {synced_timesheets} timesheet(s) were updated."

        return jsonify({"message": response_message}), 200

    except Exception as e:
        print("❌ Error updating leave status:", str(e))
        return jsonify({"error": str(e)}), 500
    

@leave_bp.route("/accrue_monthly", methods=["POST"])
def trigger_monthly_accrual():
    try:
        result = accrue_monthly_leaves()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@leave_bp.route("/recalculate_all_balances", methods=["POST"])
def trigger_recalculate_balances():
    try:
        result = recalculate_all_balances()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@leave_bp.route("/send-reminder", methods=["POST"])
def send_leave_reminder():
    try:
        data = request.get_json(silent=True) or {}
        result = send_pending_leave_reminders(
            tenant_id=data.get("tenant_id"),
            leave_id=data.get("leave_id"),
            force=bool(data.get("force", True)),
            reminder_hours=data.get("hours"),
        )
        return jsonify(result), 200
    except Exception as e:
        print(f"❌ Error sending leave reminders: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ========== ⭐ NEW ESCALATION CHECK ENDPOINT ⭐ ==========
@leave_bp.route("/check_escalations", methods=["POST"])
def check_escalations():
    """Check pending leaves and escalate if needed"""
    try:
        pending_leaves = list(mongo.db.leaves.find({"status": "Pending"}))
        escalated_count = 0
        current_time = now_ist_naive()
        
        print(f"\n🔍 Checking {len(pending_leaves)} pending leaves for escalation...")
        
        for leave in pending_leaves:
            escalation_level = leave.get("escalation_level", 0)
            employee_name = leave.get("employee_name", "Unknown")
            
            # Get the reference date (either last escalation or initial application)
            reference_date = leave.get("escalated_on") if leave.get("escalated_on") else leave.get("applied_on")
            
            if not reference_date:
                continue
            
            # Calculate days pending
            days_pending = (current_time - reference_date).days
            
            # Escalation logic:
            # Level 0 (immediate manager): Wait 2 days
            # Level 1+ (higher managers/admin): Wait 1 day
            should_escalate = False
            
            if escalation_level == 0 and days_pending >= 2:
                should_escalate = True
                print(f"   ⏰ Level 0: {employee_name} pending for {days_pending} days - escalating...")
            elif escalation_level > 0 and days_pending >= 1:
                should_escalate = True
                print(f"   ⏰ Level {escalation_level}: {employee_name} pending for {days_pending} days - escalating...")
            
            if should_escalate:
                leave_id = str(leave["_id"])
                if escalate_leave_request(leave_id):
                    escalated_count += 1
        
        print(f"✅ Escalation check completed: {escalated_count} leaves escalated")
        
        return jsonify({
            "message": "Escalation check completed",
            "total_pending": len(pending_leaves),
            "escalated_count": escalated_count
        }), 200
        
    except Exception as e:
        print(f"❌ Error in escalation check: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
