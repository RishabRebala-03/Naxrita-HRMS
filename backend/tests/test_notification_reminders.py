import os
import sys
from datetime import datetime, timedelta

from bson import ObjectId
from dotenv import load_dotenv


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from app import app  # noqa: E402
from config.db import mongo  # noqa: E402
from routes.leave_routes import send_leave_escalation_notification_reminders  # noqa: E402
from routes.timesheet_routes import send_timesheet_notification_reminders  # noqa: E402


RUN_TAG = "codex-notification-reminders-2026-07-06"


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}: expected {expected!r}, got {actual!r}")


def assert_status(response, expected, message):
    if response.status_code != expected:
        payload = None
        try:
            payload = response.get_json()
        except Exception:
            payload = response.data.decode("utf-8", errors="ignore")
        raise AssertionError(
            f"{message}: expected {expected}, got {response.status_code}, payload={payload}"
        )


def seed_users():
    employee_id = ObjectId()
    lead_id = ObjectId()
    admin_id = ObjectId()
    users = [
        {
            "_id": employee_id,
            "name": "Reminder Employee",
            "email": "reminder-employee@naxrita.local",
            "role": "Employee",
            "reportsTo": lead_id,
            "testTag": RUN_TAG,
        },
        {
            "_id": lead_id,
            "name": "Reminder Lead",
            "email": "reminder-lead@naxrita.local",
            "role": "Manager",
            "testTag": RUN_TAG,
        },
        {
            "_id": admin_id,
            "name": "Reminder Admin",
            "email": "reminder-admin@naxrita.local",
            "role": "Admin",
            "testTag": RUN_TAG,
        },
    ]
    mongo.db.users.insert_many(users)
    return users


def seed_escalated_leave(employee, lead):
    leave_id = ObjectId()
    now = datetime.utcnow()
    mongo.db.leaves.insert_one({
        "_id": leave_id,
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "QA",
        "leave_type": "Planned",
        "start_date": "2026-07-20",
        "end_date": "2026-07-22",
        "days": 3,
        "status": "Pending",
        "applied_on": now - timedelta(days=4),
        "escalation_level": 1,
        "current_approver_id": lead["_id"],
        "notification_reminder": {
            "kind": "leave_escalation",
            "recipient_ids": [str(lead["_id"])],
            "escalation_level": 1,
            "last_sent_at": now - timedelta(hours=30),
            "reminder_group": f"leave:{leave_id}:escalation:1",
        },
        "testTag": RUN_TAG,
    })
    return leave_id


def seed_pending_timesheet(employee, lead):
    timesheet_id = ObjectId()
    now = datetime.utcnow()
    mongo.db.timesheets.insert_one({
        "_id": timesheet_id,
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "QA",
        "period_start": "2026-07-01",
        "period_end": "2026-07-15",
        "entries": [],
        "daily_overtime": {},
        "holiday_payout": {},
        "work_schedule_by_date": {},
        "total_hours": 72,
        "work_hours": 72,
        "status": "pending_lead",
        "reporting_lead_id": lead["_id"],
        "submitted_at": now - timedelta(days=2),
        "updated_at": now - timedelta(days=2),
        "approval_history": [],
        "notification_reminder": {
            "event": "submitted",
            "mode": "pending_status",
            "recipient_id": str(lead["_id"]),
            "target": {
                "section": "timesheets",
                "timesheetId": str(timesheet_id),
                "activeView": "approvals",
                "periodStart": "2026-07-01",
                "periodEnd": "2026-07-15",
            },
            "message": f"{employee['name']} submitted a timesheet for 2026-07-01 to 2026-07-15",
            "statuses": ["pending_lead", "pending_manager"],
            "last_sent_at": now - timedelta(hours=30),
            "reminder_group": f"timesheet:{timesheet_id}:submitted:{lead['_id']}",
        },
        "testTag": RUN_TAG,
    })
    return timesheet_id


def seed_approved_timesheet(employee):
    timesheet_id = ObjectId()
    now = datetime.utcnow()
    reminder_group = f"timesheet:{timesheet_id}:approved:{employee['_id']}"
    mongo.db.timesheets.insert_one({
        "_id": timesheet_id,
        "employee_id": employee["_id"],
        "employee_name": employee["name"],
        "employee_email": employee["email"],
        "employee_department": "QA",
        "period_start": "2026-06-16",
        "period_end": "2026-06-30",
        "entries": [],
        "daily_overtime": {},
        "holiday_payout": {},
        "work_schedule_by_date": {},
        "total_hours": 81,
        "work_hours": 81,
        "status": "approved",
        "submitted_at": now - timedelta(days=6),
        "updated_at": now - timedelta(days=1),
        "approval_history": [
            {
                "stage": "lead",
                "action": "approved",
                "approver_name": "Reminder Lead",
                "timestamp": now - timedelta(days=1),
            }
        ],
        "notification_reminder": {
            "event": "approved",
            "mode": "until_read",
            "recipient_id": str(employee["_id"]),
            "target": {
                "section": "timesheets",
                "timesheetId": str(timesheet_id),
                "activeView": "entry",
                "periodStart": "2026-06-16",
                "periodEnd": "2026-06-30",
            },
            "message": "Your timesheet (2026-06-16 to 2026-06-30) has been fully approved and is now locked",
            "statuses": [],
            "last_sent_at": now - timedelta(hours=30),
            "reminder_group": reminder_group,
        },
        "testTag": RUN_TAG,
    })
    mongo.db.notifications.insert_one({
        "_id": ObjectId(),
        "user_id": employee["_id"],
        "type": "timesheet_approved",
        "message": f"{RUN_TAG} approved timesheet notification",
        "read": False,
        "createdAt": now - timedelta(hours=30),
        "related_timesheet_id": timesheet_id,
        "target": {
            "section": "timesheets",
            "timesheetId": str(timesheet_id),
            "activeView": "entry",
        },
        "reminder_group": reminder_group,
        "notification_origin": "event",
    })
    return timesheet_id, reminder_group


def cleanup():
    user_ids = [user["_id"] for user in mongo.db.users.find({"testTag": RUN_TAG}, {"_id": 1})]
    if user_ids:
        mongo.db.notifications.delete_many({"user_id": {"$in": user_ids}})
    mongo.db.notifications.delete_many({"message": {"$regex": RUN_TAG}})
    mongo.db.timesheets.delete_many({"testTag": RUN_TAG})
    mongo.db.leaves.delete_many({"testTag": RUN_TAG})
    mongo.db.users.delete_many({"testTag": RUN_TAG})


def run():
    with app.app_context():
        mongo.cx.admin.command("ping")
        cleanup()
        employee, lead, _admin = seed_users()
        leave_id = seed_escalated_leave(employee, lead)
        pending_timesheet_id = seed_pending_timesheet(employee, lead)
        approved_timesheet_id, approved_group = seed_approved_timesheet(employee)

        leave_result = send_leave_escalation_notification_reminders(force=False, reminder_hours=24)
        assert_true(leave_result["notifications_sent"] >= 1, "Escalated leave reminder should create a notification")

        timesheet_result = send_timesheet_notification_reminders(force=False, reminder_hours=24)
        assert_true(timesheet_result["notifications_sent"] >= 2, "Timesheet reminder job should create pending and approved reminders")

        client = app.test_client()

        lead_notifications = client.get(f"/api/notifications/{lead['_id']}")
        assert_status(lead_notifications, 200, "Lead notifications fetch")
        lead_payload = lead_notifications.get_json()
        leave_notification = next(
            item for item in lead_payload["notifications"]
            if item.get("related_leave_id") == str(leave_id)
        )
        pending_timesheet_notification = next(
            item for item in lead_payload["notifications"]
            if item.get("related_timesheet_id") == str(pending_timesheet_id)
        )
        assert_equal(leave_notification["target"]["section"], "leaves", "Leave reminder should deep-link to leaves")
        assert_equal(leave_notification["target"]["leaveId"], str(leave_id), "Leave reminder should carry leave id")
        assert_equal(pending_timesheet_notification["target"]["section"], "timesheets", "Timesheet reminder should deep-link to timesheets")
        assert_equal(pending_timesheet_notification["target"]["timesheetId"], str(pending_timesheet_id), "Pending timesheet reminder should carry timesheet id")

        employee_notifications = client.get(f"/api/notifications/{employee['_id']}")
        assert_status(employee_notifications, 200, "Employee notifications fetch")
        employee_payload = employee_notifications.get_json()
        approved_notifications = [
            item for item in employee_payload["notifications"]
            if item.get("reminder_group") == approved_group
        ]
        assert_true(len(approved_notifications) >= 2, "Approved timesheet should have original and reminder notifications")

        mark_read_response = client.put(f"/api/notifications/mark_read/{approved_notifications[0]['_id']}")
        assert_status(mark_read_response, 200, "Mark approved reminder group as read")

        remaining_unread = mongo.db.notifications.count_documents({
            "user_id": employee["_id"],
            "reminder_group": approved_group,
            "read": False,
        })
        assert_equal(remaining_unread, 0, "Marking one reminder should mark the whole reminder group as read")

        sent_before_second_run = mongo.db.notifications.count_documents({"reminder_group": approved_group})
        second_timesheet_result = send_timesheet_notification_reminders(force=False, reminder_hours=24)
        sent_after_second_run = mongo.db.notifications.count_documents({"reminder_group": approved_group})
        assert_equal(sent_after_second_run, sent_before_second_run, "Read approved reminders should not repeat again")
        approved_timesheet = mongo.db.timesheets.find_one({"_id": approved_timesheet_id})
        assert_true("notification_reminder" not in approved_timesheet, "Read approved reminder state should be cleared")

        print("Notification reminder test results")
        print("PASS: escalated leave reminders repeat with deep-link metadata")
        print("PASS: pending timesheet reminders repeat for approvers with deep-link metadata")
        print("PASS: approved timesheet reminders repeat until read, then stop and clear the reminder state")

        cleanup()


if __name__ == "__main__":
    run()
