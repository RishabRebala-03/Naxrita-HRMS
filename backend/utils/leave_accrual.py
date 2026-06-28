#utils/leave_accural.py
from datetime import datetime
from config.db import mongo
from utils.timezone import month_start_ist, now_ist

def accrue_monthly_leaves():
    """
    Runs on the 1st of every month to credit leaves
    1 day planned + 0.5 days sick per employee
    Planned leaves are capped at 12
    """
    try:
        today = now_ist()
        first_of_month = month_start_ist(today).replace(tzinfo=None)
        
        # Find all active employees
        employees = mongo.db.users.find({})
        
        updated_count = 0
        for employee in employees:
            leave_balance = employee.get("leaveBalance", {})
            last_accrual = leave_balance.get("lastAccrualDate")
            
            # Skip if already accrued this month
            if last_accrual and isinstance(last_accrual, datetime):
                if last_accrual.year == today.year and last_accrual.month == today.month:
                    continue
            
            # 🔹 Fortnight rule – only credit if joined on or before 15th
            join_date = employee.get("dateOfJoining")
            if not join_date:
                # No joining date → skip crediting to be safe
                print(f"⏭️ Skipping {employee.get('name')} – no dateOfJoining")
                continue
            if isinstance(join_date, str):
                try:
                    join_date = datetime.fromisoformat(join_date.replace("Z", "+00:00"))
                except Exception:
                    print(f"⏭️ Skipping {employee.get('name')} – invalid dateOfJoining format")
                    continue
            if join_date.day > 15:
                print(f"⏭️ Skipping {employee.get('name')} – joined after 15th")
                continue
            # 🔹 END fortnight check
            
            # ⭐ CHANGE 2: Credit new leaves WITH CAPPING          
            # ⭐ NEW: Level-based accrual system
            employee_level = employee.get("level", 0)
            
            if employee_level == 14:
                # Level 14: Only 1 sick leave per month (no planned/optional)
                leave_balance["sick"] = leave_balance.get("sick", 0) + 1.0
                leave_balance["sickTotal"] = leave_balance.get("sickTotal", 0) + 1.0
                leave_balance["lastAccrualDate"] = first_of_month
                
                print(f"✅ Level 14 - {employee.get('name')}: Credited 1 sick leave")
            else:
                # Other levels: Normal accrual (0.5 sick + 1 planned, capped at 12)
                planned_current = leave_balance.get("planned", 0) + 1.0
                planned_capped = min(planned_current, 12)  # Cap at 12
                
                leave_balance["planned"] = planned_capped
                leave_balance["plannedTotal"] = leave_balance.get("plannedTotal", 0) + 1.0
                leave_balance["sick"] = leave_balance.get("sick", 0) + 0.5
                leave_balance["sickTotal"] = leave_balance.get("sickTotal", 0) + 0.5
                leave_balance["lastAccrualDate"] = first_of_month
                
                if planned_current > 12:
                    print(f"⚠️ {employee.get('name')} planned leave capped at 12 (would have been {planned_current})")
            
            # Update employee
            mongo.db.users.update_one(
                {"_id": employee["_id"]},
                {"$set": {"leaveBalance": leave_balance}}
            )
            updated_count += 1
        
        print(f"✅ Accrued leaves for {updated_count} employees")
        return {"success": True, "updated": updated_count}
        
    except Exception as e:
        print(f"❌ Accrual error: {str(e)}")
        return {"success": False, "error": str(e)}
