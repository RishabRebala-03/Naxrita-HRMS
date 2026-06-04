import os
from email_service import EmailService  # provides the class

# Legacy compatibility only. New leave mail uses services/mail_service.py.
EMAIL_USERNAME = os.getenv("MAIL_USERNAME") or os.getenv("SMTP_USER", "")
EMAIL_PASSWORD = os.getenv("MAIL_PASSWORD") or os.getenv("SMTP_PASSWORD", "")
EMAIL_SENDER   = os.getenv("MAIL_SENDER") or os.getenv("SMTP_FROM_EMAIL") or EMAIL_USERNAME

# ---- Outlook SMTP ----
SMTP_SERVER = os.getenv("SMTP_HOST", "smtp.office365.com")
SMTP_PORT   = int(os.getenv("SMTP_PORT", "587"))
USE_TLS     = True
USE_SSL     = False
TIMEOUT_SEC = 30

# ---- Export a ready-to-use service instance ----
email_service = EmailService(
    smtp_server=SMTP_SERVER,
    smtp_port=SMTP_PORT,
    sender_email=EMAIL_SENDER,
    sender_password=EMAIL_PASSWORD,
    timeout=TIMEOUT_SEC,
)
