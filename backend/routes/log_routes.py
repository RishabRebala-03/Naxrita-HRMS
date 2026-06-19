# log_routes.py
from flask import Blueprint, jsonify
from bson import ObjectId
from config.db import mongo
from datetime import datetime
from utils.log_utils import log_leave_action, trim_leave
from utils.access_control import require_admin_menu_access

log_bp = Blueprint("log_bp", __name__)

@log_bp.route("/leave/<leave_id>", methods=["GET"])
def get_leave_logs(leave_id):
    try:
        _, error_response = require_admin_menu_access("logs")
        if error_response:
            return error_response

        logs = list(mongo.db.leave_logs.find({
            "leave_id": ObjectId(leave_id)
        }).sort("timestamp", -1))

        for log in logs:
            log["_id"] = str(log["_id"])
            log["leave_id"] = str(log["leave_id"])

            # FIX: convert correct field
            log["employee_objectId"] = str(log.get("employee_objectId", ""))

        return jsonify(logs), 200

    except Exception as e:
        print("❌ Error in get_leave_logs:", e)
        return jsonify({"error": str(e)}), 400


@log_bp.route("/all", methods=["GET"])
def get_all_logs():
    _, error_response = require_admin_menu_access("logs")
    if error_response:
        return error_response

    logs = list(mongo.db.leave_logs.find().sort("timestamp", -1))

    for log in logs:
        log["_id"] = str(log["_id"])
        log["leave_id"] = str(log["leave_id"])
        log["employee_objectId"] = str(log.get("employee_objectId", ""))

        # Normalize timestamp
        ts = log.get("timestamp")
        if isinstance(ts, dict) and "$date" in ts:
            log["timestamp"] = ts["$date"]
        elif isinstance(ts, datetime):
            log["timestamp"] = ts.isoformat()
        else:
            log["timestamp"] = str(ts)


    return jsonify(logs), 200
