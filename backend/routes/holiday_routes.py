# routes/holiday_routes.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from config.db import mongo  # ⬅️ match your other routes
from utils.access_control import require_admin_menu_access

holiday_bp = Blueprint("holiday_bp", __name__)

def _to_doc(h):
    h["_id"] = str(h["_id"])
    return h

@holiday_bp.get("/")
def list_holidays():
    # Optional filters: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    start = request.args.get("start")
    end = request.args.get("end")
    q = {}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end

    items = list(mongo.db.holidays.find(q).sort("date", 1))
    return jsonify([_to_doc(i) for i in items]), 200

@holiday_bp.post("/add")
def add_holiday():
    _, error_response = require_admin_menu_access("holidays")
    if error_response:
        return error_response

    data = request.get_json() or {}
    if not data.get("name") or not data.get("date"):
        return jsonify({"error": "name and date are required"}), 400

    doc = {
        "name": data["name"].strip(),
        "date": data["date"],                    # "YYYY-MM-DD"
        "type": data.get("type", "company"),     # national | regional | company
        "region": data.get("region", ""),
        "is_optional": bool(data.get("is_optional", False)),
        "description": data.get("description", ""),
        "created_on": datetime.utcnow().isoformat(),
        "updated_on": datetime.utcnow().isoformat(),
    }
    _id = mongo.db.holidays.insert_one(doc).inserted_id
    doc["_id"] = str(_id)
    return jsonify(doc), 201

@holiday_bp.put("/update/<hid>")
def update_holiday(hid):
    try:
        _, error_response = require_admin_menu_access("holidays")
        if error_response:
            return error_response

        _id = ObjectId(hid)
    except Exception:
        return jsonify({"error": "invalid id"}), 400

    data = request.get_json() or {}
    data["updated_on"] = datetime.utcnow().isoformat()
    mongo.db.holidays.update_one({"_id": _id}, {"$set": data})

    doc = mongo.db.holidays.find_one({"_id": _id})
    if not doc:
        return jsonify({"error": "not found"}), 404
    return jsonify(_to_doc(doc)), 200

@holiday_bp.delete("/delete/<hid>")
def delete_holiday(hid):
    try:
        _, error_response = require_admin_menu_access("holidays")
        if error_response:
            return error_response

        _id = ObjectId(hid)
    except Exception:
        return jsonify({"error": "invalid id"}), 400

    mongo.db.holidays.delete_one({"_id": _id})
    return jsonify({"ok": True}), 200

# ✅ NEW ENDPOINT: Sync all existing public holidays
@holiday_bp.post("/sync_tea_coffee_blocks")
def sync_all_public_holidays():
    """
    One-time sync to block tea/coffee for all existing public holidays.
    Useful for initial setup or fixing any inconsistencies.
    """
    try:
        _, error_response = require_admin_menu_access("holidays")
        if error_response:
            return error_response

        # Get all public holidays
        public_holidays = list(mongo.db.holidays.find({"type": "public"}))
        
        blocked_count = 0
        for holiday in public_holidays:
            date = holiday.get("date")
            name = holiday.get("name")
            
            # Check if already blocked
            existing = mongo.db.tea_coffee_blocked_dates.find_one({"date": date})
            if not existing:
                mongo.db.tea_coffee_blocked_dates.insert_one({
                    "date": date,
                    "reason": f"Public Holiday: {name}",
                    "blocked_at": datetime.utcnow(),
                    "auto_blocked": True
                })
                # Cancel existing orders
                mongo.db.tea_coffee_orders.delete_many({"date": date})
                blocked_count += 1
        
        return jsonify({
            "message": f"Synced {blocked_count} public holidays to tea/coffee blocked dates",
            "total_public_holidays": len(public_holidays),
            "newly_blocked": blocked_count
        }), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
