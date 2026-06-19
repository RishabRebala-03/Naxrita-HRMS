from flask import Blueprint, request, jsonify
from bson import ObjectId
from config.db import mongo
import os
from utils.access_control import normalize_admin_menu_access

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        # Find user by email
        user = mongo.db.users.find_one({"email": email})
        
        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        # Block inactive users from logging in
        if user.get("is_active", True) is False:
            return jsonify({
                "error": "Your account is inactive. Please contact HR/Admin to reactivate your account."
            }), 403

        # Check password
        if user.get("password") != password:
            return jsonify({"error": "Invalid email or password"}), 401

        # Restrict admin access
        if email == "admin@firm.com":
            if user.get("role") != "Admin":
                return jsonify({"error": "Access denied. This account is not an Admin."}), 403

        # Build photo URL
        photo_url = None
        base = request.host_url.rstrip("/")
        user_id_str = str(user["_id"])

        # Check for photo with various extensions
        photo_extensions = ['.png', '.jpg', '.jpeg', '.webp']
        for ext in photo_extensions:
            photo_filename = f"{user_id_str}{ext}"
            photo_path = os.path.join("static", "profile_photos", photo_filename)
            
            if os.path.exists(photo_path):
                photo_url = f"{base}/static/profile_photos/{photo_filename}"
                print(f"✅ Found photo: {photo_url}")
                break

        if not photo_url and user.get("photoFilename"):
            # Fallback to photoFilename field if it exists
            photo_url = f"{base}/static/profile_photos/{user['photoFilename']}"
        elif not photo_url and user.get("profilePhoto"):
            # Fallback to profilePhoto field
            profile_photo = user.get("profilePhoto")
            if profile_photo.startswith("/static"):
                photo_url = f"{base}{profile_photo}"

        print(f"🔍 Final photoUrl for {user.get('name')}: {photo_url}")

        # Return user info (excluding password)
        user_data = {
            "id": str(user["_id"]),
            "name": user.get("name", ""),
            "email": user["email"],
            "role": user.get("role", "Employee"),
            "designation": user.get("designation", ""),
            "department": user.get("department", ""),
            "is_active": user.get("is_active", True),
            "adminMenuAccess": normalize_admin_menu_access(user.get("adminMenuAccess")),
            "photoUrl": photo_url   # 👈 ADD THIS
        }

        return jsonify({
            "message": "Login successful",
            "user": user_data
        }), 200

    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route("/test", methods=["GET"])
def test():
    try:
        return jsonify({
            "message": "Server is running successfully.........."
        }), 200
    except Exception as e:
        print(f"❌ Test error: {str(e)}")
        return jsonify({"Internal server error...."}), 500
