import os
from datetime import datetime, timedelta

from bson import ObjectId

from config.db import mongo
from services.queue_service import enqueue_mail
from services.smtp_service import get_default_tenant_id, resolve_tenant_id

LEAVE_NOTIFICATION_CC = [
    "pmo.india@naxrita.com",
    "mytimeandexpenses@naxrita.com",
]


def queue_leave_applied_emails(leave_id):
    leave = _get_leave(leave_id)
    if not leave:
        return {"queued": 0, "reason": "leave_not_found"}

    employee = _get_employee_for_leave(leave)
    manager = _get_current_approver(leave, employee)
    tenant_id = resolve_tenant_id(leave, employee, manager)
    context = _leave_context(leave, employee, manager)
    recipients, cc = _leave_mail_recipients(employee, manager, leave=leave)

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=leave.get("employee_id"),
        leave_id=leave_id,
        mail_type="leave_applied",
        recipients=recipients,
        cc=cc,
        subject=f"Leave approval request: {context['employee_name']}",
        template_name="leave_applied.html",
        context={**context, "audience": "manager"},
        idempotency_key=f"{tenant_id}:leave:{leave_id}:applied:manager:v2",
    )

    return {"queued": 1 if recipients else 0}


def queue_leave_status_email(leave_id, status, remarks="", approver_name=""):
    leave = _get_leave(leave_id)
    if not leave:
        return {"queued": 0, "reason": "leave_not_found"}

    employee = _get_employee_for_leave(leave)
    approver = _get_current_approver(leave, employee)
    tenant_id = resolve_tenant_id(leave, employee, approver)
    context = _leave_context(
        leave,
        employee,
        approver,
        {
            "remarks": remarks,
            "approver_name": approver_name or leave.get("approved_by") or "Approver",
            "approved_start_date": leave.get("approved_start_date") or leave.get("start_date"),
            "approved_end_date": leave.get("approved_end_date") or leave.get("end_date"),
            "approved_days": leave.get("approved_days") or leave.get("days"),
        },
    )

    queued = 0
    recipients, cc = _leave_mail_recipients(employee, approver, leave=leave)
    normalized_status = str(status or "").lower()

    if recipients and normalized_status == "approved":
        enqueue_mail(
            tenant_id=tenant_id,
            employee_id=leave.get("employee_id"),
            leave_id=leave_id,
            mail_type="leave_approved",
            recipients=recipients,
            cc=cc,
            subject="Leave request approved",
            template_name="leave_approved.html",
            context=context,
            idempotency_key=f"{tenant_id}:leave:{leave_id}:status:approved:v2",
        )
        queued += 1
        queue_low_balance_alert_for_employee(employee, tenant_id=tenant_id)
        queued += _queue_long_duration_admin_notice(leave, employee, tenant_id, context)

    if recipients and normalized_status == "rejected":
        enqueue_mail(
            tenant_id=tenant_id,
            employee_id=leave.get("employee_id"),
            leave_id=leave_id,
            mail_type="leave_rejected",
            recipients=recipients,
            cc=cc,
            subject="Leave request rejected",
            template_name="leave_rejected.html",
            context=context,
            idempotency_key=f"{tenant_id}:leave:{leave_id}:status:rejected:v2",
        )
        queued += 1

    return {"queued": queued}


def queue_leave_cancelled_email(leave_id, cancelled_by_role="", reason=""):
    leave = _get_leave(leave_id)
    if not leave:
        return {"queued": 0, "reason": "leave_not_found"}

    employee = _get_employee_for_leave(leave)
    manager = _get_current_approver(leave, employee) or _get_reporting_manager(employee)
    tenant_id = resolve_tenant_id(leave, employee, manager)
    recipients, cc = _leave_mail_recipients(employee, manager, leave=leave)
    context = _leave_context(
        leave,
        employee,
        manager,
        {
            "cancelled_by_role": cancelled_by_role or leave.get("cancelled_by_role", ""),
            "remarks": reason or leave.get("cancellation_reason", ""),
        },
    )
    stamp = _stamp(leave.get("cancelled_on") or datetime.utcnow())

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=leave.get("employee_id"),
        leave_id=leave_id,
        mail_type="leave_cancelled",
        recipients=recipients,
        cc=cc,
        subject=f"Leave cancelled: {context['employee_name']}",
        template_name="leave_cancelled.html",
        context=context,
        idempotency_key=f"{tenant_id}:leave:{leave_id}:cancelled:{stamp}:v2",
    )
    return {"queued": 1 if recipients else 0}


def queue_leave_modified_email(leave_id):
    leave = _get_leave(leave_id)
    if not leave:
        return {"queued": 0, "reason": "leave_not_found"}

    employee = _get_employee_for_leave(leave)
    approver = _get_current_approver(leave, employee)
    tenant_id = resolve_tenant_id(leave, employee, approver)
    recipients, cc = _leave_mail_recipients(employee, approver, leave=leave)
    stamp = _stamp(leave.get("modified_on") or datetime.utcnow())

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=leave.get("employee_id"),
        leave_id=leave_id,
        mail_type="leave_modified",
        recipients=recipients,
        cc=cc,
        subject=f"Leave request modified: {leave.get('employee_name', 'Employee')}",
        template_name="leave_modified.html",
        context=_leave_context(leave, employee, approver),
        idempotency_key=f"{tenant_id}:leave:{leave_id}:modified:{stamp}:v2",
    )
    return {"queued": 1 if recipients else 0}


def queue_leave_escalated_email(leave_id, next_approver=None):
    leave = _get_leave(leave_id)
    if not leave:
        return {"queued": 0, "reason": "leave_not_found"}

    employee = _get_employee_for_leave(leave)
    approver = next_approver or _get_current_approver(leave, employee)
    tenant_id = resolve_tenant_id(leave, employee, approver)
    recipients, cc = _leave_mail_recipients(employee, approver, include_fallback_approver=True, leave=leave)

    context = _leave_context(
        leave,
        employee,
        approver,
        {
            "escalation_level": leave.get("escalation_level", 0),
            "approver_name": (approver or {}).get("name", "Approver"),
        },
    )
    approver_id = str((approver or {}).get("_id") or leave.get("current_approver_id") or "")

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=leave.get("employee_id"),
        leave_id=leave_id,
        mail_type="leave_escalated",
        recipients=recipients,
        cc=cc,
        subject=f"Escalated leave approval: {context['employee_name']}",
        template_name="leave_escalated.html",
        context=context,
        idempotency_key=f"{tenant_id}:leave:{leave_id}:escalated:{context['escalation_level']}:{approver_id}:v2",
    )
    return {"queued": 1 if recipients else 0}


def send_pending_leave_reminders(tenant_id=None, leave_id=None, force=False, reminder_hours=None):
    tenant_id = tenant_id or get_default_tenant_id()
    reminder_hours = int(reminder_hours or os.getenv("LEAVE_REMINDER_INTERVAL_HOURS", "24"))
    now = datetime.utcnow()
    query = _with_tenant_scope({"status": "Pending"}, tenant_id)
    if leave_id:
        query["_id"] = _as_object_id(leave_id)

    leaves = list(mongo.db.leaves.find(query))
    queued = 0
    skipped = 0

    for leave in leaves:
        last_sent = leave.get("last_reminder_email_at")
        if not force and isinstance(last_sent, datetime):
            if now - last_sent < timedelta(hours=reminder_hours):
                skipped += 1
                continue

        employee = _get_employee_for_leave(leave)
        approver = _get_current_approver(leave, employee)
        resolved_tenant_id = resolve_tenant_id(leave, employee, approver)
        if tenant_id and resolved_tenant_id != tenant_id and tenant_id != get_default_tenant_id():
            skipped += 1
            continue

        recipients, cc = _leave_mail_recipients(employee, approver, include_fallback_approver=True, leave=leave)
        bucket = int(now.timestamp() // (reminder_hours * 3600))
        enqueue_mail(
            tenant_id=resolved_tenant_id,
            employee_id=leave.get("employee_id"),
            leave_id=str(leave["_id"]),
            mail_type="leave_reminder",
            recipients=recipients,
            cc=cc,
            subject=f"Reminder: pending leave approval for {leave.get('employee_name', 'Employee')}",
            template_name="leave_reminder.html",
            context=_leave_context(leave, employee, approver),
            idempotency_key=f"{resolved_tenant_id}:leave:{str(leave['_id'])}:reminder:{bucket}:v2",
        )
        mongo.db.leaves.update_one(
            {"_id": leave["_id"]},
            {
                "$set": {"last_reminder_email_at": now},
                "$inc": {"mail_reminder_count": 1},
            },
        )
        queued += 1 if recipients else 0

    return {"queued": queued, "skipped": skipped, "total_pending": len(leaves)}


def send_low_balance_alerts(tenant_id=None, employee_id=None, force=False):
    tenant_id = tenant_id or get_default_tenant_id()
    if employee_id:
        users = [mongo.db.users.find_one({"_id": _as_object_id(employee_id)})]
    else:
        query = _with_tenant_scope(
            {"role": {"$ne": "Admin"}, "is_active": {"$ne": False}},
            tenant_id,
        )
        users = list(mongo.db.users.find(query))

    queued = 0
    for user in [item for item in users if item]:
        queued += queue_low_balance_alert_for_employee(user, tenant_id=resolve_tenant_id(user), force=force)
    return {"queued": queued, "checked": len([item for item in users if item])}


def queue_low_balance_alert_for_employee(employee, tenant_id=None, force=False):
    if not employee or not employee.get("email"):
        return 0

    tenant_id = tenant_id or resolve_tenant_id(employee)
    threshold = float(os.getenv("LOW_LEAVE_BALANCE_THRESHOLD", "2"))
    balance = employee.get("leaveBalance") or {}
    paid_balance = float(balance.get("sick", 0) or 0) + float(balance.get("planned", 0) or 0)
    if paid_balance > threshold and not force:
        return 0

    today_key = datetime.utcnow().strftime("%Y-%m-%d")
    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=employee.get("_id"),
        leave_id=None,
        mail_type="leave_balance_low",
        recipients=[employee.get("email")],
        subject="Leave balance alert",
        template_name="low_balance.html",
        context={
            "employee_name": employee.get("name", "Employee"),
            "employee_email": employee.get("email", ""),
            "leave_balance": balance,
            "paid_balance": paid_balance,
            "threshold": threshold,
        },
        idempotency_key=f"{tenant_id}:employee:{str(employee.get('_id'))}:low-balance:{today_key}:v1",
    )
    return 1


def send_daily_leave_summary(tenant_id=None):
    tenant_id = tenant_id or get_default_tenant_id()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    admin_emails = _admin_emails(tenant_id)
    if not admin_emails:
        return {"queued": 0, "reason": "no_admin_recipients"}

    pending_count = mongo.db.leaves.count_documents(
        _with_tenant_scope({"status": "Pending"}, tenant_id)
    )
    approved_today = list(
        mongo.db.leaves.find(
            _with_tenant_scope(
                {
                    "status": "Approved",
                    "approved_on": {
                        "$gte": datetime.utcnow().replace(
                            hour=0, minute=0, second=0, microsecond=0
                        )
                    },
                },
                tenant_id,
            )
        )
    )
    on_leave_today = list(
        mongo.db.leaves.find(
            _with_tenant_scope(
                {
                    "status": "Approved",
                    "start_date": {"$lte": today},
                    "end_date": {"$gte": today},
                },
                tenant_id,
            )
        )
    )

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=None,
        leave_id=None,
        mail_type="daily_leave_summary",
        recipients=admin_emails,
        subject=f"Daily leave summary - {today}",
        template_name="daily_summary.html",
        context={
            "summary_date": today,
            "pending_count": pending_count,
            "approved_today_count": len(approved_today),
            "on_leave_today_count": len(on_leave_today),
            "approved_today": [_leave_summary_row(item) for item in approved_today[:20]],
            "on_leave_today": [_leave_summary_row(item) for item in on_leave_today[:20]],
        },
        idempotency_key=f"{tenant_id}:daily-summary:{today}:v1",
    )
    return {"queued": 1, "recipients": len(admin_emails)}


def _queue_long_duration_admin_notice(leave, employee, tenant_id, context):
    threshold = float(os.getenv("LEAVE_LONG_DURATION_THRESHOLD_DAYS", "3"))
    days = float(leave.get("approved_days") or leave.get("days") or 0)
    if days <= threshold:
        return 0

    admins = _admin_emails(tenant_id)
    if not admins:
        return 0

    enqueue_mail(
        tenant_id=tenant_id,
        employee_id=leave.get("employee_id"),
        leave_id=str(leave["_id"]),
        mail_type="leave_long_duration_admin_notice",
        recipients=admins,
        subject=f"Long leave approved: {employee.get('name', 'Employee') if employee else 'Employee'}",
        template_name="leave_approved.html",
        context={**context, "audience": "admin", "threshold": threshold},
        idempotency_key=f"{tenant_id}:leave:{str(leave['_id'])}:long-duration-admin:v1",
    )
    return 1


def _leave_context(leave, employee=None, approver=None, extra=None):
    employee = employee or {}
    approver = approver or {}
    leave_id = str(leave.get("_id", ""))
    portal_url = os.getenv("FRONTEND_URL") or os.getenv("APP_URL") or "https://me.naxrita.com"
    return {
        "leave_id": leave_id,
        "recipient_name": approver.get("name") or employee.get("name") or "there",
        "employee_name": leave.get("employee_name") or employee.get("name") or "Employee",
        "employee_email": employee.get("email") or leave.get("employee_email", ""),
        "employee_id": employee.get("employeeId", ""),
        "employee_department": employee.get("department") or leave.get("employee_department", ""),
        "employee_designation": employee.get("designation") or leave.get("employee_designation", ""),
        "manager_name": approver.get("name", "Approver"),
        "manager_email": approver.get("email", ""),
        "leave_type": leave.get("leave_type", "Leave"),
        "start_date": leave.get("start_date"),
        "end_date": leave.get("end_date"),
        "days": leave.get("approved_days") or leave.get("days", 0),
        "reason": leave.get("reason") or "Not provided",
        "status": leave.get("status", "Pending"),
        "is_half_day": leave.get("is_half_day", False),
        "half_day_period": leave.get("half_day_period", ""),
        "portal_url": portal_url,
        "hrms_leaves_url": f"{portal_url}/?section=leaves",
        "approval_url": f"{portal_url}/?section=leaves&leaveId={leave_id}",
        "generated_at": datetime.utcnow(),
        **(extra or {}),
    }


def _leave_summary_row(leave):
    return {
        "employee_name": leave.get("employee_name", "Employee"),
        "leave_type": leave.get("leave_type", "Leave"),
        "start_date": leave.get("start_date", ""),
        "end_date": leave.get("end_date", ""),
        "days": leave.get("approved_days") or leave.get("days") or 0,
        "status": leave.get("status", ""),
    }


def _get_leave(leave_id):
    try:
        return mongo.db.leaves.find_one({"_id": _as_object_id(leave_id)})
    except Exception:
        return None


def _get_employee_for_leave(leave):
    employee_id = leave.get("employee_id") if leave else None
    if not employee_id:
        return None
    try:
        return mongo.db.users.find_one({"_id": _as_object_id(employee_id)})
    except Exception:
        return None


def _get_current_approver(leave, employee=None):
    approver_id = leave.get("current_approver_id") if leave else None
    if not approver_id and employee:
        approver_id = employee.get("reportsTo")
    if not approver_id:
        return None
    try:
        return mongo.db.users.find_one({"_id": _as_object_id(approver_id)})
    except Exception:
        return None


def _get_reporting_manager(employee):
    if not employee or not employee.get("reportsTo"):
        return None
    try:
        return mongo.db.users.find_one({"_id": _as_object_id(employee.get("reportsTo"))})
    except Exception:
        if employee.get("reportsToEmail"):
            return mongo.db.users.find_one({"email": employee.get("reportsToEmail")})
    return None


def _approval_chain_emails(employee, current_approver, tenant_id):
    emails = []
    if current_approver and current_approver.get("email"):
        emails.append(current_approver.get("email"))

    seen_ids = set()
    manager = _get_reporting_manager(employee)
    while manager and str(manager.get("_id")) not in seen_ids:
        seen_ids.add(str(manager.get("_id")))
        if manager.get("email"):
            emails.append(manager.get("email"))
        manager = _get_reporting_manager(manager)

    return _dedupe(emails)


def _leave_mail_recipients(employee, approver=None, include_fallback_approver=False, leave=None):
    assigned_workflow = (leave or {}).get("leave_workflow_preferences") or {}
    if assigned_workflow.get("routing_mode") == "assigned":
        assigned_ids = list(assigned_workflow.get("approver_ids") or []) + list(assigned_workflow.get("notifier_ids") or [])
        selected_users = mongo.db.users.find({"_id": {"$in": [_as_object_id(item) for item in assigned_ids]}})
        recipients = _dedupe([item.get("email") for item in selected_users if item.get("email")])
        return recipients, [address for address in _dedupe(LEAVE_NOTIFICATION_CC) if address.lower() not in {item.lower() for item in recipients}]

    reporting_lead = _get_reporting_manager(employee)
    recipients = []

    if reporting_lead and reporting_lead.get("email"):
        recipients.append(reporting_lead.get("email"))

    if include_fallback_approver and approver and approver.get("email"):
        recipients.append(approver.get("email"))

    cc = _dedupe(LEAVE_NOTIFICATION_CC)
    recipients = _dedupe(recipients)
    cc = [address for address in cc if address.lower() not in {item.lower() for item in recipients}]
    return recipients, cc


def _admin_emails(tenant_id):
    query = _with_tenant_scope({"role": "Admin"}, tenant_id)
    admins = mongo.db.users.find(query, {"email": 1})
    return _dedupe([admin.get("email") for admin in admins if admin.get("email")])


def _with_tenant_scope(query, tenant_id):
    tenant_id = tenant_id or get_default_tenant_id()
    if tenant_id == get_default_tenant_id():
        scope = {
            "$or": [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        }
    else:
        scope = {"tenant_id": tenant_id}

    if "$or" in scope:
        return {"$and": [query, scope]}
    return {**query, **scope}


def _dedupe(values):
    result = []
    seen = set()
    for value in values or []:
        item = str(value or "").strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _as_object_id(value):
    return value if isinstance(value, ObjectId) else ObjectId(str(value))


def _stamp(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value or "")
