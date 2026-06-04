import hashlib
import json
import logging
import os
from datetime import datetime, timedelta

from bson import ObjectId
from pymongo import ASCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError

from config.db import mongo
from models.email_logs import build_email_log_document, serialize_email_log
from services.smtp_service import get_default_tenant_id


logger = logging.getLogger("hrms.mail.queue")

MAIL_QUEUE_STATUSES = ["queued", "retrying"]


def ensure_mail_indexes():
    mongo.db.email_logs.create_index([("tenant_id", ASCENDING), ("status", ASCENDING)])
    mongo.db.email_logs.create_index([("next_attempt_at", ASCENDING)])
    mongo.db.email_logs.create_index([("leave_id", ASCENDING), ("mail_type", ASCENDING)])
    mongo.db.email_logs.create_index("idempotency_key", unique=True, sparse=True)
    mongo.db.mail_settings.create_index([("tenant_id", ASCENDING), ("is_active", ASCENDING)])


def enqueue_mail(
    tenant_id=None,
    employee_id=None,
    leave_id=None,
    mail_type="general",
    recipients=None,
    cc=None,
    subject="",
    template_name="",
    context=None,
    idempotency_key=None,
    metadata=None,
):
    tenant_id = tenant_id or get_default_tenant_id()
    recipients = _normalize_addresses(recipients)
    cc = _normalize_addresses(cc)
    now = datetime.utcnow()

    if not idempotency_key:
        idempotency_key = _build_idempotency_key(
            tenant_id, employee_id, leave_id, mail_type, recipients, cc, subject
        )

    existing = mongo.db.email_logs.find_one({"idempotency_key": idempotency_key})
    if existing:
        return existing

    status = "queued" if recipients else "skipped"
    error_message = "" if recipients else "No recipients resolved"
    document = build_email_log_document(
        tenant_id=tenant_id,
        employee_id=employee_id,
        leave_id=leave_id,
        mail_type=mail_type,
        recipients=recipients,
        cc=cc,
        status=status,
        retry_count=0,
        error_message=error_message,
    )
    document.update(
        {
            "subject": subject,
            "template_name": template_name,
            "context": _json_safe(context or {}),
            "metadata": _json_safe(metadata or {}),
            "idempotency_key": idempotency_key,
            "attempt_count": 0,
            "max_attempts": int(os.getenv("MAIL_QUEUE_MAX_ATTEMPTS", "3")),
            "next_attempt_at": now,
            "updated_at": now,
        }
    )

    try:
        inserted_id = mongo.db.email_logs.insert_one(document).inserted_id
        queued = mongo.db.email_logs.find_one({"_id": inserted_id})
        logger.info(
            "mail.queued tenant_id=%s mail_type=%s leave_id=%s",
            tenant_id,
            mail_type,
            leave_id,
        )
        return queued
    except DuplicateKeyError:
        return mongo.db.email_logs.find_one({"idempotency_key": idempotency_key})


def claim_next_mail():
    now = datetime.utcnow()
    return mongo.db.email_logs.find_one_and_update(
        {
            "status": {"$in": MAIL_QUEUE_STATUSES},
            "$or": [
                {"next_attempt_at": {"$lte": now}},
                {"next_attempt_at": {"$exists": False}},
            ],
        },
        {
            "$set": {
                "status": "processing",
                "processing_started_at": now,
                "updated_at": now,
            },
            "$inc": {"attempt_count": 1},
        },
        sort=[("created_at", ASCENDING)],
        return_document=ReturnDocument.AFTER,
    )


def mark_mail_sent(log_id):
    mongo.db.email_logs.update_one(
        {"_id": _as_object_id(log_id)},
        {
            "$set": {
                "status": "sent",
                "sent_at": datetime.utcnow(),
                "error_message": "",
                "updated_at": datetime.utcnow(),
            }
        },
    )


def mark_mail_failed(log, error_message):
    retry_count = int(log.get("retry_count") or 0) + 1
    max_attempts = int(log.get("max_attempts") or os.getenv("MAIL_QUEUE_MAX_ATTEMPTS", "3"))
    status = "failed" if retry_count >= max_attempts else "retrying"
    next_attempt_at = None

    if status == "retrying":
        base_seconds = int(os.getenv("MAIL_RETRY_BASE_SECONDS", "60"))
        max_seconds = int(os.getenv("MAIL_RETRY_MAX_SECONDS", "1800"))
        delay = min(max_seconds, base_seconds * (2 ** (retry_count - 1)))
        next_attempt_at = datetime.utcnow() + timedelta(seconds=delay)

    update = {
        "status": status,
        "retry_count": retry_count,
        "error_message": str(error_message)[:1000],
        "updated_at": datetime.utcnow(),
    }
    if next_attempt_at:
        update["next_attempt_at"] = next_attempt_at

    mongo.db.email_logs.update_one({"_id": log["_id"]}, {"$set": update})
    logger.warning(
        "mail.%s log_id=%s retry_count=%s error=%s",
        status,
        str(log.get("_id")),
        retry_count,
        str(error_message)[:200],
    )


def retry_mail(log_id, tenant_id=None):
    query = {"_id": _as_object_id(log_id)}
    if tenant_id:
        query["tenant_id"] = tenant_id

    result = mongo.db.email_logs.update_one(
        query,
        {
            "$set": {
                "status": "queued",
                "retry_count": 0,
                "next_attempt_at": datetime.utcnow(),
                "error_message": "",
                "updated_at": datetime.utcnow(),
            }
        },
    )
    return result.modified_count


def retry_failed_mails(tenant_id=None):
    query = {"status": "failed"}
    if tenant_id:
        query["tenant_id"] = tenant_id

    result = mongo.db.email_logs.update_many(
        query,
        {
            "$set": {
                "status": "queued",
                "retry_count": 0,
                "next_attempt_at": datetime.utcnow(),
                "error_message": "",
                "updated_at": datetime.utcnow(),
            }
        },
    )
    return result.modified_count


def list_mail_logs(tenant_id=None, status=None, limit=100):
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if status:
        query["status"] = status

    logs = list(
        mongo.db.email_logs.find(query)
        .sort("created_at", -1)
        .limit(min(int(limit or 100), 500))
    )
    return [serialize_email_log(log) for log in logs]


def _build_idempotency_key(*parts):
    raw = json.dumps(_json_safe(parts), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalize_addresses(value):
    if not value:
        return []
    if isinstance(value, str):
        value = value.split(",")

    normalized = []
    seen = set()
    for item in value:
        address = str(item or "").strip()
        if not address:
            continue
        key = address.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(address)
    return normalized


def _json_safe(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _as_object_id(value):
    return value if isinstance(value, ObjectId) else ObjectId(value)
