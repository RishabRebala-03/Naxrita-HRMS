import base64
import hashlib
import logging
import os
import smtplib
import ssl
import unicodedata
from datetime import datetime
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from bson import ObjectId

from config.db import mongo
from models.mail_settings import (
    PASSWORD_PLACEHOLDER,
    build_mail_settings_document,
    serialize_mail_settings,
)

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:  # pragma: no cover - dependency is declared in requirements.
    Fernet = None
    InvalidToken = Exception


logger = logging.getLogger("hrms.mail.smtp")

DEFAULT_TENANT_ID = os.getenv("DEFAULT_TENANT_ID", "naxrita-labs")
DEFAULT_SMTP_PROVIDER = "gmail"
DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = 587
DEFAULT_SMTP_USER = "noreply.naxrita@gmail.com"
DEFAULT_FROM_EMAIL = "noreply.naxrita@gmail.com"
DEFAULT_FROM_NAME = "Naxrita HRMS"


class MailConfigurationError(RuntimeError):
    pass


def get_default_tenant_id():
    return DEFAULT_TENANT_ID


def resolve_tenant_id(*documents):
    for document in documents:
        if isinstance(document, dict) and document.get("tenant_id"):
            return str(document["tenant_id"])
    return DEFAULT_TENANT_ID


def _tenant_filter(tenant_id):
    if tenant_id == DEFAULT_TENANT_ID:
        return {
            "$or": [
                {"tenant_id": tenant_id},
                {"tenant_id": {"$exists": False}},
                {"tenant_id": None},
            ]
        }
    return {"tenant_id": tenant_id}


def _get_fernet():
    if Fernet is None:
        raise MailConfigurationError(
            "cryptography is required for SMTP credential encryption"
        )

    configured_key = os.getenv("MAIL_ENCRYPTION_KEY", "").strip()
    if configured_key:
        try:
            return Fernet(configured_key.encode("utf-8"))
        except Exception:
            pass

    secret = (
        configured_key
        or os.getenv("SECRET_KEY")
        or os.getenv("APP_SECRET_KEY")
        or os.getenv("FLASK_SECRET_KEY")
        or "change-me-before-production"
    )
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(derived_key)


def encrypt_secret(value):
    if not value:
        return ""
    token = _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"enc:v1:{token}"


def decrypt_secret(value):
    if not value:
        return ""
    if not isinstance(value, str):
        return ""
    if not value.startswith("enc:v1:"):
        return value

    token = value.replace("enc:v1:", "", 1)
    try:
        return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise MailConfigurationError("SMTP password cannot be decrypted") from exc


def _env_settings(tenant_id):
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("MAIL_SERVER") or DEFAULT_SMTP_HOST
    smtp_user = os.getenv("SMTP_USER") or os.getenv("MAIL_USERNAME") or DEFAULT_SMTP_USER
    smtp_password = os.getenv("SMTP_PASSWORD") or os.getenv("MAIL_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or os.getenv("MAIL_SENDER") or DEFAULT_FROM_EMAIL

    if not smtp_host or not from_email or not smtp_password:
        return None

    return {
        "tenant_id": tenant_id,
        "provider": os.getenv("SMTP_PROVIDER", DEFAULT_SMTP_PROVIDER),
        "smtp_host": _sanitize_mail_text(smtp_host),
        "smtp_port": int(os.getenv("SMTP_PORT", str(DEFAULT_SMTP_PORT))),
        "smtp_user": _sanitize_mail_text(smtp_user or ""),
        "smtp_password": _sanitize_mail_text(smtp_password or ""),
        "encryption": _sanitize_mail_text(os.getenv("SMTP_ENCRYPTION", "starttls")),
        "from_email": _sanitize_mail_text(from_email),
        "from_name": _sanitize_mail_text(os.getenv("SMTP_FROM_NAME", DEFAULT_FROM_NAME)),
        "is_active": os.getenv("MAIL_ENABLED", "true").lower() == "true",
        "source": "env",
    }


def get_active_mail_settings(tenant_id=None):
    tenant_id = tenant_id or DEFAULT_TENANT_ID
    query = {"is_active": True}
    query.update(_tenant_filter(tenant_id))

    settings = mongo.db.mail_settings.find_one(query, sort=[("updated_at", -1)])
    if settings:
        settings = dict(settings)
        settings["smtp_host"] = _sanitize_mail_text(settings.get("smtp_host"))
        settings["smtp_user"] = _sanitize_mail_text(settings.get("smtp_user"))
        settings["smtp_password"] = _sanitize_mail_text(decrypt_secret(settings.get("smtp_password", "")))
        settings["encryption"] = _sanitize_mail_text(settings.get("encryption"))
        settings["from_email"] = _sanitize_mail_text(settings.get("from_email"))
        settings["from_name"] = _sanitize_mail_text(settings.get("from_name"))
        settings["source"] = "database"
        return settings

    settings = _env_settings(tenant_id)
    if settings:
        return settings

    raise MailConfigurationError("Active SMTP settings are not configured")


def get_masked_mail_settings(tenant_id=None):
    tenant_id = tenant_id or DEFAULT_TENANT_ID
    query = {}
    query.update(_tenant_filter(tenant_id))
    settings = mongo.db.mail_settings.find_one(query, sort=[("updated_at", -1)])
    if not settings:
        settings = _env_settings(tenant_id)
        if not settings:
            return None
    return serialize_mail_settings(settings, include_password=False)


def save_mail_settings(data, tenant_id=None):
    tenant_id = tenant_id or data.get("tenant_id") or DEFAULT_TENANT_ID
    data = dict(data or {})
    data["tenant_id"] = tenant_id

    existing = mongo.db.mail_settings.find_one(_tenant_filter(tenant_id), sort=[("updated_at", -1)])
    raw_password = data.get("smtp_password")
    encrypted_password = None
    if raw_password and raw_password != PASSWORD_PLACEHOLDER:
        encrypted_password = encrypt_secret(raw_password)

    update_doc = build_mail_settings_document(data, encrypted_password=encrypted_password)
    if encrypted_password is None and existing and existing.get("smtp_password"):
        update_doc["smtp_password"] = existing["smtp_password"]

    if data.get("validate_connection"):
        validation_settings = dict(update_doc)
        validation_settings["smtp_password"] = decrypt_secret(validation_settings.get("smtp_password", ""))
        validate_smtp_connection(validation_settings)
        update_doc["last_validated_at"] = datetime.utcnow()
        update_doc["validation_status"] = "passed"
        update_doc["validation_error"] = ""

    if existing:
        mongo.db.mail_settings.update_one(
            {"_id": existing["_id"]},
            {"$set": update_doc},
        )
        saved = mongo.db.mail_settings.find_one({"_id": existing["_id"]})
    else:
        update_doc["created_at"] = datetime.utcnow()
        inserted_id = mongo.db.mail_settings.insert_one(update_doc).inserted_id
        saved = mongo.db.mail_settings.find_one({"_id": inserted_id})

    return serialize_mail_settings(saved, include_password=False)


def validate_smtp_connection(settings):
    if not settings or not settings.get("smtp_host"):
        raise MailConfigurationError("SMTP host is required")
    if not settings.get("from_email"):
        raise MailConfigurationError("From email is required")

    server = _connect(settings)
    try:
        smtp_user = _sanitize_mail_text(settings.get("smtp_user"))
        smtp_password = _sanitize_mail_text(settings.get("smtp_password"))
        if smtp_user and smtp_password:
            try:
                server.login(smtp_user, smtp_password)
            except Exception as exc:
                raise MailConfigurationError(f"SMTP login failed: {exc}") from exc
    finally:
        try:
            server.quit()
        except Exception:
            server.close()

    return True


def _sanitize_mail_text(value):
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    return text.replace("\xa0", " ").strip()


def _header_value(value):
    sanitized = _sanitize_mail_text(value)
    if not sanitized:
        return ""
    return Header(sanitized, "utf-8").encode()


def send_mail(settings, recipients, subject, html_content, cc=None, text_content=None):
    recipients = _normalize_addresses(recipients)
    cc = _normalize_addresses(cc)
    if not recipients:
        raise MailConfigurationError("At least one recipient is required")

    if not settings.get("is_active", True):
        raise MailConfigurationError("SMTP settings are disabled")

    from_email = _sanitize_mail_text(settings.get("from_email") or settings.get("smtp_user"))
    from_name = _sanitize_mail_text(settings.get("from_name") or "Naxrita HRMS")
    subject = _sanitize_mail_text(subject)
    html_content = _sanitize_mail_text(html_content)
    text_content = _sanitize_mail_text(text_content) if text_content is not None else None
    if not from_email:
        raise MailConfigurationError("From email is required")

    message = MIMEMultipart("alternative")
    message["Subject"] = _header_value(subject)
    message["From"] = formataddr((_header_value(from_name), from_email))
    message["To"] = ", ".join(recipients)
    if cc:
        message["Cc"] = ", ".join(cc)

    if text_content:
        message.attach(MIMEText(text_content, "plain", "utf-8"))
    message.attach(MIMEText(html_content, "html", "utf-8"))

    server = _connect(settings)
    try:
        smtp_user = _sanitize_mail_text(settings.get("smtp_user"))
        smtp_password = _sanitize_mail_text(settings.get("smtp_password"))
        if smtp_user and smtp_password:
            try:
                server.login(smtp_user, smtp_password)
            except Exception as exc:
                raise MailConfigurationError(f"SMTP login failed: {exc}") from exc
        try:
            server.sendmail(from_email, recipients + cc, message.as_string())
        except Exception as exc:
            raise MailConfigurationError(f"SMTP send failed: {exc}") from exc
    finally:
        try:
            server.quit()
        except Exception:
            server.close()

    logger.info(
        "mail.sent smtp_host=%s recipients=%s cc=%s",
        settings.get("smtp_host"),
        [_mask_email(item) for item in recipients],
        [_mask_email(item) for item in cc],
    )
    return True


def health_check(tenant_id=None):
    settings = get_active_mail_settings(tenant_id)
    validate_smtp_connection(settings)
    return {
        "status": "healthy",
        "tenant_id": tenant_id or settings.get("tenant_id") or DEFAULT_TENANT_ID,
        "smtp_host": settings.get("smtp_host"),
        "from_email": _mask_email(settings.get("from_email", "")),
        "checked_at": datetime.utcnow().isoformat(),
    }


def _connect(settings):
    host = settings.get("smtp_host")
    port = int(settings.get("smtp_port") or 587)
    encryption = str(settings.get("encryption") or "starttls").lower()
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "30"))

    if encryption == "ssl":
        return smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context())

    server = smtplib.SMTP(host, port, timeout=timeout)
    server.ehlo()
    if encryption in {"starttls", "tls"}:
        server.starttls(context=ssl.create_default_context())
        server.ehlo()
    return server


def _normalize_addresses(value):
    if not value:
        return []
    if isinstance(value, str):
        value = value.split(",")
    normalized = []
    seen = set()
    for item in value:
        address = _sanitize_mail_text(item)
        if not address:
            continue
        key = address.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(address)
    return normalized


def _mask_email(email):
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = f"{local[:1]}*"
    else:
        masked_local = f"{local[:2]}***{local[-1:]}"
    return f"{masked_local}@{domain}"
