from datetime import datetime
from bson import ObjectId
from config.db import mongo

def log_leave_action(leave_id, employee_id, action, performed_by,
                     old_data=None, new_data=None, remarks=""):

    # Fetch employee human-readable employeeId
    employee = mongo.db.users.find_one({"_id": ObjectId(employee_id)}, {
        "employeeId": 1,
        "name": 1,
        "email": 1,
        "department": 1,
        "designation": 1
    })

    log_entry = {
        "leave_id": ObjectId(leave_id),
        "employee_objectId": ObjectId(employee_id),    # keep real id internal
        "employeeId": employee.get("employeeId", ""),  # human readable ID
        "employee_name": employee.get("name", ""),
        "employee_email": employee.get("email", ""),
        "employee_department": employee.get("department", ""),
        "employee_designation": employee.get("designation", ""),

        "action": action,
        "performed_by": performed_by,
        "old_data": trim_leave(old_data) if old_data else None,
        "new_data": trim_leave(new_data) if new_data else None,
        "remarks": remarks,
        "timestamp": datetime.utcnow()
    }

    mongo.db.leave_logs.insert_one(log_entry)

def trim_leave(leave):
    if not leave:
        return None

    return {
        "_id": str(leave.get("_id")),   # KEEP THE ID
        "leave_type": leave.get("leave_type"),
        "start_date": leave.get("start_date"),
        "end_date": leave.get("end_date"),
        "days": leave.get("days"),
        "reason": leave.get("reason"),
        "status": leave.get("status"),
        "applied_on": leave.get("applied_on"),
        "approved_on": leave.get("approved_on"),
        "rejected_on": leave.get("rejected_on"),
        "cancelled_on": leave.get("cancelled_on"),
    }
