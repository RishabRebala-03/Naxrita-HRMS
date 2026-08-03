#utils/leave_accural.py
from datetime import datetime
from config.db import mongo
from utils.timezone import month_start_ist, now_ist

def accrue_monthly_leaves():
    """
    Runs on the 1st of every month to credit leaves
    1 day planned + 0.5 days sick per employee.
    Year-end carry-forward is responsible for applying the planned-leave cap.
    """
    try:
        today = now_ist()
        first_of_month = month_start_ist(today).replace(tzinfo=None)
        
        # Include employees unless they are explicitly marked inactive. This
        # preserves support for older records that do not have is_active yet.
        employees = mongo.db.users.find({
            "role": "Employee",
            "is_active": {"$ne": False}
        })
        
        updated_count = 0
        for employee in employees:
            leave_balance = employee.get("leaveBalance", {})
            last_accrual = leave_balance.get("lastAccrualDate")
            
            # Skip if already accrued this month
            if last_accrual and isinstance(last_accrual, datetime):
                if last_accrual.year == today.year and last_accrual.month == today.month:
                    continue
            
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
            # Skip employees who have not joined yet
            if join_date.date() > today.date():
                print(f"⏭️ Skipping {employee.get('name')} – joining date is in the future")
                continue

            # Apply fortnight rule only in the employee's joining month
            if (
                join_date.year == today.year
                and join_date.month == today.month
                and join_date.day > 15
            ):
                print(
                    f"⏭️ Skipping {employee.get('name')} – "
                    f"joined after the 15th of the current month"
                )
                continue
            # 🔹 END fortnight check
            
            # Level-based accrual system
            employee_level = employee.get("level", 0)
            
            if employee_level == 14:
                leave_balance["sick"] = leave_balance.get("sick", 0) + 1.0
                leave_balance["sickTotal"] = leave_balance.get("sickTotal", 0) + 1.0

                print(f"✅ Level 14 - {employee.get('name')}: Credited 1 sick leave")

            else:
                leave_balance["planned"] = leave_balance.get("planned", 0) + 1.0
                leave_balance["plannedTotal"] = (
                    leave_balance.get("plannedTotal", 0) + 1.0
                )
                leave_balance["sick"] = leave_balance.get("sick", 0) + 0.5
                leave_balance["sickTotal"] = (
                    leave_balance.get("sickTotal", 0) + 0.5
                )

            leave_balance["lastAccrualDate"] = first_of_month
            leave_balance["lastAccrualMonth"] = today.strftime("%Y-%m")
            
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
