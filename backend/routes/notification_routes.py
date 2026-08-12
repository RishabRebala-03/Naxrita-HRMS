# notification_routes.py - WITH PROPER DATE SERIALIZATION
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from config.db import mongo

notification_bp = Blueprint("notification_bp", __name__)


def serialize_notification(notification):
    """Helper function to properly serialize notification data"""
    if not notification:
        return None

    def serialize_value(value):
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, list):
            return [serialize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: serialize_value(item) for key, item in value.items()}
        return value

    return serialize_value(notification)


# -------------------------------
# Create Notification
# -------------------------------
def create_notification(user_id, notification_type, message, related_leave_id=None):
    """
    Helper function to create a notification
    
    Args:
        user_id: ObjectId or string of the user to notify
        notification_type: Type of notification (leave_approved, leave_rejected, leave_request, etc.)
        message: Notification message
        related_leave_id: Optional ObjectId of related leave request
    """
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
        
        if related_leave_id:
            if isinstance(related_leave_id, str):
                related_leave_id = ObjectId(related_leave_id)
            notification["related_leave_id"] = related_leave_id
        
        result = mongo.db.notifications.insert_one(notification)
        print(f"✅ Notification created: {notification_type} for user {user_id}")
        return str(result.inserted_id)
    except Exception as e:
        print(f"❌ Error creating notification: {str(e)}")
        return None


# -------------------------------
# Get User Notifications
# -------------------------------
@notification_bp.route("/<user_id>", methods=["GET"])
def get_user_notifications(user_id):
    """
    Get all notifications for a user
    Returns: {notifications: [], unreadCount: int}
    """
    try:
        notifications = list(mongo.db.notifications.find({
            "user_id": ObjectId(user_id)
        }).sort("createdAt", -1))
        
        # Serialize all notifications
        serialized_notifications = []
        for notif in notifications:
            serialized = serialize_notification(notif)
            if serialized:
                serialized_notifications.append(serialized)
        
        unread_count = sum(1 for n in serialized_notifications if not n.get("read", False))
        
        return jsonify({
            "notifications": serialized_notifications,
            "unreadCount": unread_count
        }), 200
    except Exception as e:
        print(f"❌ Error fetching notifications: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Mark Notification as Read
# -------------------------------
@notification_bp.route("/mark_read/<notification_id>", methods=["PUT"])
def mark_notification_read(notification_id):
    """
    Mark a single notification as read
    """
    try:
        notification = mongo.db.notifications.find_one({"_id": ObjectId(notification_id)})
        if not notification:
            return jsonify({"message": "Notification not found or already read"}), 404

        read_at = datetime.utcnow()
        update_filter = {"_id": ObjectId(notification_id)}
        reminder_group = notification.get("reminder_group")
        if reminder_group:
            update_filter = {
                "user_id": notification.get("user_id"),
                "reminder_group": reminder_group,
                "read": False,
            }

        result = mongo.db.notifications.update_many(
            update_filter,
            {"$set": {"read": True, "readAt": read_at}}
        )

        if result.modified_count > 0:
            return jsonify({"message": "Notification marked as read"}), 200
        return jsonify({"message": "Notification not found or already read"}), 404
    except Exception as e:
        print(f"❌ Error marking notification as read: {str(e)}")
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Mark All Notifications as Read
# -------------------------------
@notification_bp.route("/mark_all_read/<user_id>", methods=["PUT"])
def mark_all_notifications_read(user_id):
    """
    Mark all notifications for a user as read
    """
    try:
        result = mongo.db.notifications.update_many(
            {"user_id": ObjectId(user_id), "read": False},
            {"$set": {"read": True, "readAt": datetime.utcnow()}}
        )
        
        return jsonify({
            "message": f"Marked {result.modified_count} notifications as read",
            "count": result.modified_count
        }), 200
    except Exception as e:
        print(f"❌ Error marking all notifications as read: {str(e)}")
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Delete Notification
# -------------------------------
@notification_bp.route("/<notification_id>", methods=["DELETE"])
def delete_notification(notification_id):
    """
    Delete a single notification
    """
    try:
        result = mongo.db.notifications.delete_one({"_id": ObjectId(notification_id)})
        
        if result.deleted_count > 0:
            return jsonify({"message": "Notification deleted"}), 200
        else:
            return jsonify({"error": "Notification not found"}), 404
    except Exception as e:
        print(f"❌ Error deleting notification: {str(e)}")
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Get Unread Count
# -------------------------------
@notification_bp.route("/unread_count/<user_id>", methods=["GET"])
def get_unread_count(user_id):
    """
    Get count of unread notifications for a user
    """
    try:
        count = mongo.db.notifications.count_documents({
            "user_id": ObjectId(user_id),
            "read": False
        })
        
        return jsonify({"unreadCount": count}), 200
    except Exception as e:
        print(f"❌ Error getting unread count: {str(e)}")
        return jsonify({"error": str(e)}), 500


# -------------------------------
# Clear All Notifications
# -------------------------------
@notification_bp.route("/clear_all/<user_id>", methods=["DELETE"])
def clear_all_notifications(user_id):
    """
    Delete all notifications for a user
    """
    try:
        result = mongo.db.notifications.delete_many({"user_id": ObjectId(user_id)})
        
        return jsonify({
            "message": f"Deleted {result.deleted_count} notifications",
            "count": result.deleted_count
        }), 200
    except Exception as e:
        print(f"❌ Error clearing notifications: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
