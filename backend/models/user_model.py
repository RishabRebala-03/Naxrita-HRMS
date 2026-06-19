from bson import ObjectId

def create_user_document(name, email, password, role, designation, department, shiftTimings, projects, reportsTo, leaveBalance):
    return {
        "name": name,
        "email": email,
        "password": password,  # hashed in production
        "role": role,
        "designation": designation,
        "department": department,
        "shiftTimings": shiftTimings,
        "projects": projects,
        "reportsTo": ObjectId(reportsTo) if reportsTo else None,
        "leaveBalance": leaveBalance,
        "adminMenuAccess": [],
        "dateOfJoining": None,
        "createdAt": None
    }
