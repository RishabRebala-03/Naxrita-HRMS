from datetime import datetime

from flask import Blueprint, jsonify, request

from services.queue_service import (
    enqueue_mail,
    list_mail_logs,
    retry_failed_mails,
    retry_mail,
)
from services.smtp_service import (
    get_default_tenant_id,
    get_masked_mail_settings,
    health_check,
    save_mail_settings,
    send_mail,
    get_active_mail_settings,
)
from services.template_service import render_email_template
from workers.mail_worker import process_mail_queue_once
from utils.access_control import require_admin_menu_access


mail_bp = Blueprint("mail_bp", __name__)


@mail_bp.route("/test", methods=["POST"])
def send_test_mail():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        data = request.get_json() or {}
        tenant_id = _tenant_id(data)
        to_email = data.get("to_email") or data.get("email")
        if not to_email:
            return jsonify({"error": "to_email is required"}), 400

        context = {
            "recipient_email": to_email,
            "sent_at": datetime.utcnow(),
        }
        log = enqueue_mail(
            tenant_id=tenant_id,
            employee_id=None,
            leave_id=None,
            mail_type="smtp_test",
            recipients=[to_email],
            subject="Naxrita HRMS test mail",
            template_name="test_mail.html",
            context=context,
            idempotency_key=f"{tenant_id}:smtp-test:{to_email}:{datetime.utcnow().timestamp()}",
        )

        settings = get_active_mail_settings(tenant_id)
        html_content = render_email_template("test_mail.html", context)
        try:
            send_mail(
                settings=settings,
                recipients=[to_email],
                subject="Naxrita HRMS test mail",
                html_content=html_content,
            )
            from services.queue_service import mark_mail_sent

            mark_mail_sent(log["_id"])
            return jsonify({"message": "Test mail sent successfully", "log_id": str(log["_id"])}), 200
        except Exception as mail_error:
            from services.queue_service import mark_mail_failed

            mark_mail_failed(log, mail_error)
            return jsonify({"error": str(mail_error), "log_id": str(log["_id"])}), 500

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@mail_bp.route("/logs", methods=["GET"])
def get_mail_logs():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        tenant_id = _tenant_id()
        status = request.args.get("status")
        limit = request.args.get("limit", 100)
        return jsonify(list_mail_logs(tenant_id=tenant_id, status=status, limit=limit)), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@mail_bp.route("/settings", methods=["GET"])
def get_mail_settings():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        tenant_id = _tenant_id()
        settings = get_masked_mail_settings(tenant_id)
        return jsonify(settings or {}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@mail_bp.route("/settings", methods=["PUT"])
def update_mail_settings():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        data = request.get_json() or {}
        tenant_id = _tenant_id(data)
        settings = save_mail_settings(data, tenant_id=tenant_id)
        return jsonify({"message": "SMTP settings saved", "settings": settings}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@mail_bp.route("/retry", methods=["POST"])
def retry_failed_mail():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        data = request.get_json() or {}
        tenant_id = _tenant_id(data)
        if data.get("retry_all"):
            modified = retry_failed_mails(tenant_id=tenant_id)
        elif data.get("log_id"):
            modified = retry_mail(data["log_id"], tenant_id=tenant_id)
        else:
            return jsonify({"error": "log_id or retry_all is required"}), 400

        if data.get("process_now"):
            process_mail_queue_once()

        return jsonify({"message": "Mail retry queued", "modified": modified}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@mail_bp.route("/health", methods=["GET"])
def mail_health():
    try:
        _, error_response = require_admin_menu_access("mail")
        if error_response:
            return error_response

        return jsonify(health_check(_tenant_id())), 200
    except Exception as exc:
        return jsonify({"status": "unhealthy", "error": str(exc)}), 503


def _tenant_id(data=None):
    data = data or {}
    return (
        request.headers.get("X-Tenant-ID")
        or request.args.get("tenant_id")
        or data.get("tenant_id")
        or get_default_tenant_id()
    )
