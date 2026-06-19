from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from config.db import mongo
from utils.access_control import require_admin_menu_access

project_bp = Blueprint("project_bp", __name__)

def serialize_project(obj):
    """Convert ObjectId and datetime to serializable formats"""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: serialize_project(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_project(item) for item in obj]
    return obj

@project_bp.route("/create", methods=["POST"])
def create_project():
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        data = request.get_json()
        
        # Validate required fields
        required = ["projectId", "title", "startDate"]
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"{field} is required"}), 400
        
        # Check if projectId already exists
        existing = mongo.db.projects.find_one({"projectId": data["projectId"]})
        if existing:
            return jsonify({"error": "Project ID already exists"}), 400
        
        # Parse dates
        # Parse dates - handle both YYYY-MM-DD and ISO formats
        try:
            start_raw = data["startDate"]
            # Try YYYY-MM-DD format first (from date input)
            if len(start_raw) == 10 and start_raw.count('-') == 2:
                start_date = datetime.strptime(start_raw, "%Y-%m-%d")
            else:
                # Fallback to ISO format
                start_date = datetime.fromisoformat(start_raw.replace('Z', '+00:00'))
            
            end_date = None
            if data.get("endDate"):
                end_raw = data["endDate"]
                # Try YYYY-MM-DD format first (from date input)
                if len(end_raw) == 10 and end_raw.count('-') == 2:
                    end_date = datetime.strptime(end_raw, "%Y-%m-%d")
                else:
                    # Fallback to ISO format
                    end_date = datetime.fromisoformat(end_raw.replace('Z', '+00:00'))
        except Exception as e:
            print(f"❌ Error parsing dates: {e}")
            print(f"   startDate: {data.get('startDate')}")
            print(f"   endDate: {data.get('endDate')}")
            return jsonify({"error": f"Invalid date format: {str(e)}"}), 400
        
        project = {
            "projectId": data["projectId"],
            "title": data["title"],
            "startDate": start_date,
            "endDate": end_date,
            "description": data.get("description", ""),
            "status": "Active",
            "createdAt": datetime.utcnow(),
            "team": []
        }
        
        result = mongo.db.projects.insert_one(project)
        project["_id"] = result.inserted_id
        
        return jsonify({
            "message": "Project created successfully",
            "project": serialize_project(project)
        }), 201
        
    except Exception as e:
        print(f"❌ Error creating project: {str(e)}")
        return jsonify({"error": str(e)}), 500

@project_bp.route("/", methods=["GET"])
def get_all_projects():
    try:
        projects = list(mongo.db.projects.find())
        return jsonify(serialize_project(projects)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@project_bp.route("/<project_id>", methods=["GET"])
def get_project(project_id):
    try:
        project = mongo.db.projects.find_one({"_id": ObjectId(project_id)})
        if not project:
            return jsonify({"error": "Project not found"}), 404
        return jsonify(serialize_project(project)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@project_bp.route("/<project_id>", methods=["PUT"])
def update_project(project_id):
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        data = request.get_json()
        update_data = {}
        
        if "title" in data:
            update_data["title"] = data["title"]
        if "description" in data:
            update_data["description"] = data["description"]
        if "status" in data:
            update_data["status"] = data["status"]
            
        if "startDate" in data:
            start_raw = data["startDate"]
            if len(start_raw) == 10 and start_raw.count('-') == 2:
                update_data["startDate"] = datetime.strptime(start_raw, "%Y-%m-%d")
            else:
                update_data["startDate"] = datetime.fromisoformat(start_raw.replace('Z', '+00:00'))

        if "endDate" in data:
            if data["endDate"]:
                end_raw = data["endDate"]
                if len(end_raw) == 10 and end_raw.count('-') == 2:
                    update_data["endDate"] = datetime.strptime(end_raw, "%Y-%m-%d")
                else:
                    update_data["endDate"] = datetime.fromisoformat(end_raw.replace('Z', '+00:00'))
            else:
                update_data["endDate"] = None
        
        result = mongo.db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            return jsonify({"error": "Project not found or no changes"}), 404
        
        return jsonify({"message": "Project updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@project_bp.route("/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    try:
        _, error_response = require_admin_menu_access("projects")
        if error_response:
            return error_response

        # Remove project from all users first
        mongo.db.users.update_many(
            {"projects.projectId": ObjectId(project_id)},
            {"$pull": {"projects": {"projectId": ObjectId(project_id)}}}
        )
        
        # Delete the project
        result = mongo.db.projects.delete_one({"_id": ObjectId(project_id)})
        
        if result.deleted_count == 0:
            return jsonify({"error": "Project not found"}), 404
        
        return jsonify({"message": "Project deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
