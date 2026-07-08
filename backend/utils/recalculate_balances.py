from datetime import datetime
from config.db import mongo

def recalculate_all_balances():
    """
    One-time script to recalculate leave balances for all existing employees
    based on their joining dates
    """
    try:
        print("🔄 Starting balance recalculation for all employees...")
        
        # Get all employees
        employees = mongo.db.users.find({})
        
        updated_count = 0
        skipped_count = 0
        
        for employee in employees:
            join_date = employee.get("dateOfJoining")
            
            if not join_date:
                print(f"  ⚠️  Skipping {employee.get('name')} - No joining date")
                skipped_count += 1
                continue
            
            # Calculate months employed
            today = datetime.utcnow()
            if isinstance(join_date, str):
                join_dt = datetime.fromisoformat(join_date.replace('Z', '+00:00'))
            else:
                join_dt = join_date
                
                months_employed = (today.year - join_dt.year) * 12 + (today.month - join_dt.month) + 1

            # 🔹 NEW: Fortnight rule – if joined after 15th, don't count joining month
            if join_dt.day > 15:
                months_employed -= 1
                if months_employed < 0:
                    months_employed = 0

            # Calculate accrued balances
            planned_balance = months_employed * 1.0
            sick_balance = months_employed * 0.5

            
            # Update employee
            new_balance = {
                "sick": sick_balance,
                "sickTotal": sick_balance,
                "planned": planned_balance,
                "plannedTotal": planned_balance,
                "optional": 2,
                "optionalTotal": 2,
                "lwp": employee.get("leaveBalance", {}).get("lwp", 0),  # Preserve existing LWP
                "compOffUsed": employee.get("leaveBalance", {}).get("compOffUsed", 0),
                "lastAccrualDate": today.replace(day=1)
            }
            
            mongo.db.users.update_one(
                {"_id": employee["_id"]},
                {"$set": {"leaveBalance": new_balance}}
            )
            
            updated_count += 1
            print(f"  ✅ Updated {employee.get('name')}: Sick={sick_balance}, Planned={planned_balance} ({months_employed} months)")
        
        print(f"\n✅ Recalculation complete!")
        print(f"   Updated: {updated_count} employees")
        print(f"   Skipped: {skipped_count} employees (no joining date)")
        
        return {"success": True, "updated": updated_count, "skipped": skipped_count}
        
    except Exception as e:
        print(f"❌ Error during recalculation: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # Run directly for testing
    from app import app
    with app.app_context():
        recalculate_all_balances()
