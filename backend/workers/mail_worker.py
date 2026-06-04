import logging
import os
import threading
import time

from services.queue_service import claim_next_mail, mark_mail_failed, mark_mail_sent
from services.smtp_service import get_active_mail_settings, send_mail
from services.template_service import render_email_template


logger = logging.getLogger("hrms.mail.worker")


def process_mail_queue_once(batch_size=None):
    batch_size = int(batch_size or os.getenv("MAIL_WORKER_BATCH_SIZE", "10"))
    processed = 0
    sent = 0
    failed = 0

    for _ in range(batch_size):
        log = claim_next_mail()
        if not log:
            break

        processed += 1
        try:
            settings = get_active_mail_settings(log.get("tenant_id"))
            html_content = render_email_template(
                log.get("template_name") or "leave_applied.html",
                log.get("context") or {},
            )
            send_mail(
                settings=settings,
                recipients=log.get("recipients") or [],
                cc=log.get("cc") or [],
                subject=log.get("subject") or "Naxrita Labs HRMS Notification",
                html_content=html_content,
            )
            mark_mail_sent(log["_id"])
            sent += 1
        except Exception as exc:
            failed += 1
            mark_mail_failed(log, exc)

    if processed:
        logger.info(
            "mail.worker.processed processed=%s sent=%s failed=%s",
            processed,
            sent,
            failed,
        )

    return {"processed": processed, "sent": sent, "failed": failed}


def run_mail_worker_forever(app=None, poll_seconds=None):
    poll_seconds = int(poll_seconds or os.getenv("MAIL_WORKER_POLL_SECONDS", "15"))

    while True:
        if app:
            with app.app_context():
                process_mail_queue_once()
        else:
            process_mail_queue_once()
        time.sleep(poll_seconds)


def start_mail_worker(app):
    if os.getenv("MAIL_WORKER_AUTOSTART", "false").lower() != "true":
        return None

    thread = threading.Thread(
        target=run_mail_worker_forever,
        kwargs={"app": app},
        name="hrms-mail-worker",
        daemon=True,
    )
    thread.start()
    logger.info("mail.worker.started")
    return thread
