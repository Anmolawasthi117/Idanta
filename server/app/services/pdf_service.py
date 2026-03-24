"""
PDF generation service.
Uses Jinja2 for template rendering and WeasyPrint for HTML→PDF conversion.
"""

import logging
import os
from pathlib import Path
from typing import Dict, Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except Exception as e:
    WEASYPRINT_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning(f"WeasyPrint could not be loaded (GTK3 missing?): {e}. PDF generation will be disabled.")

from app.core.config import settings

logger = logging.getLogger(__name__)

# Resolve template directory relative to the project root
TEMPLATE_DIR = Path(settings.PDF_TEMPLATE_DIR)

_jinja_env: Environment | None = None


def _get_jinja_env() -> Environment:
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=select_autoescape(["html", "xml"]),
        )
    return _jinja_env


def render_pdf(template_name: str, context: Dict[str, Any]) -> bytes:
    """
    Render an HTML template with the given context and convert to PDF bytes.

    :param template_name: Filename within data/pdf_templates/, e.g. 'hang_tag.html'
    :param context: Template variables dict.
    :returns: PDF file as bytes (or empty bytes if WeasyPrint is unavailable).
    :raises RuntimeError: On template or PDF generation failure.
    """
    if not WEASYPRINT_AVAILABLE:
        logger.warning(f"Skipping PDF render for '{template_name}' as WeasyPrint is unavailable.")
        return b""

    try:
        env = _get_jinja_env()
        template = env.get_template(template_name)
        html_string = template.render(**context)

        css_path = TEMPLATE_DIR / "style.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None

        pdf_bytes = HTML(string=html_string, base_url=str(TEMPLATE_DIR)).write_pdf(
            stylesheets=[css] if css else None
        )
        logger.info(f"Generated PDF from template '{template_name}'")
        return pdf_bytes

    except Exception as e:
        logger.error(f"PDF generation failed for template '{template_name}': {e}")
        raise RuntimeError(f"PDF generation failed: {e}") from e
