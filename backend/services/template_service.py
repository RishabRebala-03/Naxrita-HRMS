import os
from datetime import datetime

from jinja2 import Environment, FileSystemLoader, select_autoescape


TEMPLATE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "templates")
)


def _format_date(value):
    if not value:
        return "N/A"
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y")
    if isinstance(value, str):
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").strftime("%d %b %Y")
        except Exception:
            return value
    return str(value)


env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)
env.filters["date_label"] = _format_date


def render_email_template(template_name, context=None):
    context = dict(context or {})
    context.setdefault(
        "portal_url",
        os.getenv("FRONTEND_URL") or os.getenv("APP_URL") or "http://localhost:3000",
    )
    context.setdefault("company_name", "Naxrita Labs")
    context.setdefault("generated_at", datetime.utcnow())
    template = env.get_template(template_name)
    return template.render(**context)
