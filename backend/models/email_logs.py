from datetime import datetime
from bson import ObjectId


EMAIL_LOG_STATUSES = {
    "queued",
    "processing",
    "retrying",
    "sent",
    "failed",
    "skipped",
}


def serialize_email_log(log):
    if not log:
        return None

    serialized = dict(log)
    for key, value in list(serialized.items()):
        if isinstance(value, ObjectId):
            serialized[key] = str(value)
        elif isinstance(value, datetime):
            serialized[key] = value.isoformat()
        elif isinstance(value, list):
            serialized[key] = [
                str(item) if isinstance(item, ObjectId) else item
                for item in value
            ]
        elif isinstance(value, dict):
            serialized[key] = _serialize_nested(value)

    return serialized


def _serialize_nested(value):
    result = {}
    for nested_key, nested_value in value.items():
        if isinstance(nested_value, ObjectId):
            result[nested_key] = str(nested_value)
        elif isinstance(nested_value, datetime):
            result[nested_key] = nested_value.isoformat()
        elif isinstance(nested_value, dict):
            result[nested_key] = _serialize_nested(nested_value)
        elif isinstance(nested_value, list):
            result[nested_key] = [
                _serialize_nested(item) if isinstance(item, dict) else item
                for item in nested_value
            ]
        else:
            result[nested_key] = nested_value
    return result


def build_email_log_document(
    tenant_id,
    employee_id,
    leave_id,
    mail_type,
    recipients,
    cc=None,
    status="queued",
    retry_count=0,
    error_message="",
):
    now = datetime.utcnow()
    return {
        "tenant_id": tenant_id,
        "employee_id": str(employee_id) if employee_id else None,
        "leave_id": str(leave_id) if leave_id else None,
        "mail_type": mail_type,
        "recipients": recipients or [],
        "cc": cc or [],
        "status": status,
        "retry_count": retry_count,
        "error_message": error_message,
        "created_at": now,
        "sent_at": None,
    }
