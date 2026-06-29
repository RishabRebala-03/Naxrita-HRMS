from datetime import datetime
from bson import ObjectId


PASSWORD_PLACEHOLDER = "********"

SUPPORTED_SMTP_PROVIDERS = {
    "gmail": {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "encryption": "starttls",
    },
    "outlook": {
        "smtp_host": "smtp-mail.outlook.com",
        "smtp_port": 587,
        "encryption": "starttls",
    },
    "office365": {
        "smtp_host": "smtp.office365.com",
        "smtp_port": 587,
        "encryption": "starttls",
    },
}


def serialize_mail_settings(settings, include_password=False):
    if not settings:
        return None

    serialized = dict(settings)
    if isinstance(serialized.get("_id"), ObjectId):
        serialized["_id"] = str(serialized["_id"])

    for field in ["created_at", "updated_at", "last_validated_at"]:
        if isinstance(serialized.get(field), datetime):
            serialized[field] = serialized[field].isoformat()

    if "smtp_password" in serialized and not include_password:
        serialized["smtp_password"] = PASSWORD_PLACEHOLDER if serialized["smtp_password"] else ""

    return serialized


def _clean_mail_setting(value, fallback=""):
    text = str(value if value not in (None, "") else fallback)
    return text.replace("\xa0", " ").strip()


def build_mail_settings_document(data, encrypted_password=None):
    now = datetime.utcnow()
    smtp_user = _clean_mail_setting(data.get("smtp_user"), "noreply.naxrita@gmail.com")
    doc = {
        "tenant_id": data.get("tenant_id"),
        "provider": _clean_mail_setting(data.get("provider", "gmail"), "gmail"),
        "smtp_host": _clean_mail_setting(data.get("smtp_host", "smtp.gmail.com"), "smtp.gmail.com"),
        "smtp_port": int(data.get("smtp_port") or 587),
        "smtp_user": smtp_user,
        "encryption": _clean_mail_setting(data.get("encryption", "starttls"), "starttls"),
        "from_email": _clean_mail_setting(data.get("from_email"), "noreply.naxrita@gmail.com"),
        "from_name": _clean_mail_setting(data.get("from_name", "Naxrita HRMS"), "Naxrita HRMS"),
        "is_active": bool(data.get("is_active", True)),
        "updated_at": now,
    }
    if encrypted_password is not None:
        doc["smtp_password"] = encrypted_password
    return doc
