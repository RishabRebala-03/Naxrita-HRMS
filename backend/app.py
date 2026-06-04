# app.py - UPDATED WITH TIMESHEET ROUTES
from flask import Flask, request, jsonify
from config.db import init_db
from routes.user_routes import user_bp
from routes.leave_routes import leave_bp  
from routes.auth_routes import auth_bp
from routes.holiday_routes import holiday_bp  
from routes.log_routes import log_bp
from apscheduler.schedulers.background import BackgroundScheduler
from utils.leave_accrual import accrue_monthly_leaves
from utils.year_end_reset import reset_sick_leaves_new_year 
from routes.tea_coffee_routes import tea_coffee_bp
from flask_cors import CORS 
from routes.notification_routes import notification_bp
from routes.project_routes import project_bp
from routes.timesheet_routes import timesheet_bp  # ⭐ NEW
from routes.charge_code_routes import charge_code_bp  # ⭐ NEW
from routes.expense_routes import expense_bp
from routes.payslip_routes import payslip_bp
from routes.mail_routes import mail_bp
from services.queue_service import ensure_mail_indexes
from services.mail_service import (
    send_daily_leave_summary,
    send_low_balance_alerts,
    send_pending_leave_reminders,
)
from workers.mail_worker import process_mail_queue_once, start_mail_worker
import requests
import os

app = Flask(__name__, static_url_path="/static", static_folder="static")

# ✅ UPDATED CORS CONFIGURATION FOR LOCALHOST
CORS(app, 
     resources={r"/api/*": {
         "origins": [
             "http://localhost:3000",
             "http://127.0.0.1:3000",
             "https://me.naxrita.com",
             "http://me.naxrita.com"
         ],
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "supports_credentials": True
     }})

@app.before_request
def before_all_requests():
    print(f"\n📥 Incoming {request.method} request to {request.path}")
    print(f"   Origin: {request.headers.get('Origin')}")
    # Handle OPTIONS preflight
    if request.method == 'OPTIONS':
        print("✅ Handling OPTIONS/preflight request")
        response = jsonify({'status': 'ok'})
        origin = request.headers.get('Origin')
        # Allow localhost and 127.0.0.1
        if origin in ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://me.naxrita.com']:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

@app.after_request
def after_request(response):
    print(f"📤 Sending response with status {response.status_code}")
    origin = request.headers.get('Origin')
    # Allow localhost and 127.0.0.1
    if origin in ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://me.naxrita.com']:
        response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# Initialize MongoDB
init_db(app)

# Register routes
app.register_blueprint(user_bp, url_prefix="/api/users")
app.register_blueprint(leave_bp, url_prefix="/api/leaves")
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(holiday_bp, url_prefix="/api/holidays")
app.register_blueprint(log_bp, url_prefix="/api/logs")
app.register_blueprint(tea_coffee_bp, url_prefix="/api/tea_coffee")
app.register_blueprint(notification_bp, url_prefix="/api/notifications")
app.register_blueprint(project_bp, url_prefix="/api/projects")
app.register_blueprint(timesheet_bp, url_prefix="/api/timesheets")  # ⭐ NEW
app.register_blueprint(charge_code_bp, url_prefix="/api/charge_codes")  # ⭐ NEW
app.register_blueprint(expense_bp, url_prefix="/api/expenses")
app.register_blueprint(payslip_bp, url_prefix="/api/payslips")
app.register_blueprint(mail_bp, url_prefix="/api/mail")
app.register_blueprint(mail_bp, url_prefix="/mail", name="mail_public_bp")


@app.route("/leave/send-reminder", methods=["POST"])
def send_leave_reminder_public_alias():
    from routes.leave_routes import send_leave_reminder
    return send_leave_reminder()

with app.app_context():
    ensure_mail_indexes()
    start_mail_worker(app)

# ✅ UPDATED ESCALATION FUNCTION - USE LOCALHOST
def check_leave_escalations():
    """Call the escalation check endpoint"""
    try:
        print("\n🔔 Running scheduled escalation check...")
        response = requests.post('http://localhost:5000/api/leaves/check_escalations')
        
        if response.status_code == 200:
            data = response.json()
            escalated = data.get('escalated_count', 0)
            total = data.get('total_pending', 0)
            
            print(f"✅ Escalation check completed:")
            print(f"   - Total pending leaves: {total}")
            print(f"   - Escalated to admin: {escalated}")
        else:
            print(f"⚠️ Escalation check failed with status: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Escalation check error: {str(e)}")


def process_mail_queue_job():
    """Process queued emails without blocking leave workflow requests."""
    try:
        with app.app_context():
            process_mail_queue_once()
    except Exception as e:
        print(f"❌ Mail queue processor error: {str(e)}")


def send_leave_reminder_emails_job():
    """Queue reminder emails for pending leave approvals."""
    try:
        with app.app_context():
            result = send_pending_leave_reminders(force=False)
            print(f"✅ Leave reminder mail job completed: {result}")
    except Exception as e:
        print(f"❌ Leave reminder mail job error: {str(e)}")


def send_low_balance_alerts_job():
    """Queue low leave balance alerts for employees."""
    try:
        with app.app_context():
            result = send_low_balance_alerts(force=False)
            print(f"✅ Low balance mail job completed: {result}")
    except Exception as e:
        print(f"❌ Low balance mail job error: {str(e)}")


def send_daily_leave_summary_job():
    """Queue daily leave summary for admins."""
    try:
        with app.app_context():
            result = send_daily_leave_summary()
            print(f"✅ Daily leave summary mail job completed: {result}")
    except Exception as e:
        print(f"❌ Daily leave summary mail job error: {str(e)}")

# =============================================================================
# INITIALIZE SCHEDULER WITH ALL JOBS
# =============================================================================
scheduler = BackgroundScheduler()

# 1. Monthly leave accrual (1st of every month at 12:01 AM)
scheduler.add_job(
    func=accrue_monthly_leaves, 
    trigger="cron", 
    day=1, 
    hour=0, 
    minute=1,
    id="monthly_accrual"
)

# 2. Year-end sick leave reset (January 1st at midnight)
scheduler.add_job(
    func=reset_sick_leaves_new_year, 
    trigger="cron", 
    month=1, 
    day=1, 
    hour=0, 
    minute=0,
    id="yearly_reset"
)

# 3. ⭐ ESCALATION CHECK - DAILY AT 9 AM
scheduler.add_job(
    func=check_leave_escalations, 
    trigger="cron",
    hour=9,
    minute=0,
    id="daily_escalation"
)

# 4. Mail queue processor
scheduler.add_job(
    func=process_mail_queue_job,
    trigger="interval",
    seconds=int(os.getenv("MAIL_QUEUE_POLL_SECONDS", "60")),
    id="mail_queue_processor"
)

# 5. Pending leave approval reminders
scheduler.add_job(
    func=send_leave_reminder_emails_job,
    trigger="interval",
    hours=int(os.getenv("LEAVE_REMINDER_INTERVAL_HOURS", "24")),
    id="leave_mail_reminders"
)

# 6. Low balance alerts
scheduler.add_job(
    func=send_low_balance_alerts_job,
    trigger="cron",
    hour=int(os.getenv("LOW_BALANCE_ALERT_HOUR", "10")),
    minute=0,
    id="low_balance_mail_alerts"
)

# 7. Daily leave summary
scheduler.add_job(
    func=send_daily_leave_summary_job,
    trigger="cron",
    hour=int(os.getenv("DAILY_LEAVE_SUMMARY_HOUR", "18")),
    minute=0,
    id="daily_leave_summary_mail"
)

# Start the scheduler
scheduler.start()

print("\n" + "="*80)
print("✅ SCHEDULER STARTED WITH 7 AUTOMATED JOBS")
print("="*80)
print("\n📋 SCHEDULED JOBS:")
print("-" * 80)
print("1️⃣  MONTHLY LEAVE ACCRUAL")
print("    Schedule: 1st of every month at 12:01 AM")
print("    Function: Accrue sick (0.5) and planned (1.0) leaves for all employees")
print()
print("2️⃣  YEAR-END SICK LEAVE RESET")
print("    Schedule: January 1st at 12:00 AM")
print("    Function: Reset unused sick leaves for new year")
print()
print("3️⃣  ⭐ LEAVE ESCALATION CHECK")
print("    Schedule: Every day at 9:00 AM")
print("    Function: Escalate pending leaves after 2-day timeout")
print("    Logic:")
print("      - Level 0 (Manager): Wait 2 days → Escalate to Admin")
print("      - Level 1 (Admin): Final approval (no further escalation)")
print()
print("4️⃣  MAIL QUEUE PROCESSOR")
print("    Schedule: Every MAIL_QUEUE_POLL_SECONDS seconds")
print("    Function: Send queued emails with retry/backoff")
print()
print("5️⃣  PENDING APPROVAL REMINDERS")
print("    Schedule: Every LEAVE_REMINDER_INTERVAL_HOURS hours")
print("    Function: Queue reminder emails for pending approvals")
print()
print("6️⃣  LOW BALANCE ALERTS")
print("    Schedule: Daily at LOW_BALANCE_ALERT_HOUR")
print("    Function: Queue employee low leave balance alerts")
print()
print("7️⃣  DAILY LEAVE SUMMARY")
print("    Schedule: Daily at DAILY_LEAVE_SUMMARY_HOUR")
print("    Function: Queue daily admin leave summary")
print("-" * 80)
print()

print("\n" + "="*80)
print("✅ NEW ROUTES REGISTERED:")
print("="*80)
print("📊 TIMESHEET ROUTES (/api/timesheets)")
print("   - POST   /create              → Submit timesheet")
print("   - GET    /employee/<id>       → Get employee's timesheets")
print("   - GET    /pending/lead/<id>   → Pending for lead approval")
print("   - GET    /pending/manager/<id>→ Pending for manager approval")
print("   - PUT    /approve/lead/<id>   → Lead approves")
print("   - PUT    /reject/lead/<id>    → Lead rejects")
print("   - PUT    /approve/manager/<id>→ Manager approves (final)")
print("   - PUT    /reject/manager/<id> → Manager rejects")
print("   - GET    /all                 → All timesheets (admin)")
print("   - POST   /populate_holidays   → Auto-populate public holidays")
print()
print("🏷️  CHARGE CODE ROUTES (/api/charge_codes)")
print("   - POST   /create              → Create charge code (admin)")
print("   - GET    /all                 → List all charge codes")
print("   - PUT    /update/<id>         → Update charge code")
print("   - DELETE /delete/<id>         → Delete charge code")
print("   - POST   /assign              → Assign codes to employee")
print("   - GET    /employee/<id>       → Employee's assigned codes")
print("   - GET    /assignments/all     → All assignments (admin)")
print("   - DELETE /remove/<id>         → Remove assignment")
print("   - POST   /bulk_assign         → Bulk assign to multiple employees")
print("="*80 + "\n")

if __name__ == "__main__":
    try:
        print("🚀 Starting Flask application on http://localhost:5000")
        print("="*80 + "\n")
        app.run(debug=True, host='127.0.0.1', port=5000)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        print("\n✅ Scheduler shutdown complete")
        print("👋 Application stopped gracefully")
