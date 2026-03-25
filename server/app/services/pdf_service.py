"""
PDF generation service.
Uses Jinja2 + WeasyPrint when available and falls back to Pillow-rendered PDFs
when native WeasyPrint dependencies are missing.
"""

from __future__ import annotations

import io
import logging
import textwrap
from pathlib import Path
from typing import Any, Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image, ImageDraw, ImageFont

try:
    from weasyprint import CSS, HTML

    WEASYPRINT_AVAILABLE = True
except Exception as e:
    WEASYPRINT_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning(
        "WeasyPrint could not be loaded (GTK3 missing?): %s. Falling back to Pillow PDF rendering.",
        e,
    )

from app.core.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(settings.PDF_TEMPLATE_DIR)
_jinja_env: Environment | None = None

FALLBACK_PAGE_SIZES: dict[str, tuple[int, int]] = {
    "hang_tag_apparel.html": (413, 709),
    "hang_tag_jewelry.html": (354, 591),
    "hang_tag_pottery.html": (472, 591),
    "hang_tag_painting.html": (472, 768),
    "hang_tag_home_decor.html": (413, 650),
    "label_apparel.html": (591, 413),
    "label_jewelry.html": (472, 295),
    "label_pottery.html": (531, 354),
    "label_painting.html": (591, 413),
    "label_home_decor.html": (531, 354),
    "story_card_base.html": (620, 874),
    "certificate_auth.html": (874, 1240),
}

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/Nirmala.ttf", False),
    ("C:/Windows/Fonts/arial.ttf", False),
    ("C:/Windows/Fonts/arialbd.ttf", True),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", False),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", True),
]


def _get_jinja_env() -> Environment:
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=select_autoescape(["html", "xml"]),
        )
    return _jinja_env


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path, is_bold in FONT_CANDIDATES:
        if is_bold != bold:
            continue
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue

    for path, _ in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue

    return ImageFont.load_default()


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[int, int, int, int],
    font: ImageFont.ImageFont,
    fill: str,
    line_spacing: int = 8,
) -> int:
    x0, y0, x1, y1 = box
    max_chars = max(12, int((x1 - x0) / max(font.size * 0.58, 6)))
    lines = textwrap.wrap(text or "", width=max_chars, break_long_words=False) or [""]
    y = y0
    for line in lines:
        draw.text((x0, y), line, font=font, fill=fill)
        y += font.size + line_spacing
        if y > y1:
            break
    return y


def _draw_badge(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    bg: str,
    fg: str = "#ffffff",
) -> int:
    font = _load_font(18, bold=True)
    left, top, right, bottom = draw.textbbox((x, y), text, font=font)
    padding_x = 14
    padding_y = 8
    draw.rounded_rectangle(
        (x, y, x + (right - left) + padding_x * 2, y + (bottom - top) + padding_y * 2),
        radius=18,
        fill=bg,
    )
    draw.text((x + padding_x, y + padding_y - 2), text, font=font, fill=fg)
    return x + (right - left) + padding_x * 2 + 10


def _draw_header(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    context: Dict[str, Any],
    compact: bool = False,
) -> int:
    width, _ = image.size
    primary = context.get("primary_color", "#8B2635")
    accent = context.get("accent_color", "#C4963B")
    header_height = 130 if compact else 180
    draw.rounded_rectangle((24, 24, width - 24, header_height), radius=28, fill=primary)
    draw.line((40, header_height - 18, width - 40, header_height - 18), fill=accent, width=4)
    title_font = _load_font(28 if compact else 34, bold=True)
    subtitle_font = _load_font(18)
    draw.text((48, 48), context.get("brand_name", "Idanta Brand"), font=title_font, fill="#ffffff")
    draw.text((48, 92 if compact else 102), context.get("brand_tagline", ""), font=subtitle_font, fill="#f8ebd0")
    return header_height + 24


def _fallback_sections(template_name: str, context: Dict[str, Any]) -> list[str]:
    material = context.get("material") or context.get("fabric_type") or context.get("material_primary") or "Not specified"
    size_line = ", ".join(context.get("sizes_available", []) or []) or "Free Size"
    lines: dict[str, list[str]] = {
        "hang_tag_apparel.html": [
            f"Product: {context.get('product_name', '')}",
            f"Price: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Fabric: {context.get('fabric_type') or material}",
            f"Sizes: {size_line}",
            f"Wash Care: {context.get('wash_care') or context.get('care_instructions') or 'Handle gently'}",
            f"Technique: {context.get('print_technique') or context.get('motif_used') or 'Handmade process'}",
            f"Dye: {context.get('dye_type') or 'Not specified'}",
            f"Care: {context.get('care_instructions') or 'Store clean and dry.'}",
        ],
        "hang_tag_jewelry.html": [
            f"Product: {context.get('product_name', '')}",
            f"Jewelry Type: {context.get('jewelry_type') or 'Artisan jewelry'}",
            f"Price: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Base: {context.get('metal_or_base') or material}",
            f"Inlay: {context.get('stone_or_inlay') or 'Plain'}",
            f"Sizes: {size_line}",
            f"Set: {context.get('pair_or_set') or 'single'}",
            f"Best For: {context.get('occasion') or 'general'}",
        ],
        "hang_tag_pottery.html": [
            f"Product: {context.get('product_name', '')}",
            f"Pottery Type: {context.get('pottery_type') or 'Decorative piece'}",
            f"Price: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Finish: {context.get('finish_type') or 'Hand-finished'}",
            f"Capacity: {context.get('capacity_ml') or 'N/A'} ml",
            f"Food Safe: {'Yes' if context.get('is_food_safe') else 'Decorative only'}",
            f"Fragile: {'Yes' if context.get('fragility_note', True) else 'No'}",
            f"Care: {context.get('care_instructions') or 'Keep dry and handle carefully.'}",
        ],
        "hang_tag_painting.html": [
            f"Artwork: {context.get('product_name', context.get('art_style', 'Painting'))}",
            f"Style: {context.get('art_style') or 'Traditional painting'}",
            f"Medium: {context.get('medium') or 'Mixed media'}",
            f"Surface: {context.get('surface') or 'Canvas'}",
            f"Dimensions: {context.get('width_cm') or '?'} x {context.get('height_cm') or '?'} cm",
            f"Artist: {context.get('artisan_name') or 'Artisan'}",
            f"Original: {'Yes' if context.get('is_original', True) else 'Print'}",
            f"Story: {context.get('story_excerpt_en') or context.get('listing_excerpt') or ''}",
        ],
        "hang_tag_home_decor.html": [
            f"Product: {context.get('product_name', '')}",
            f"Decor Type: {context.get('decor_type') or 'Home decor'}",
            f"Price: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Material: {context.get('material_primary') or material}",
            f"Dimensions: {context.get('width_cm') or '?'} x {context.get('height_cm') or '?'} x {context.get('depth_cm') or '?'}",
            f"Assembly: {'Required' if context.get('assembly_required') else 'Not required'}",
            f"Indoor/Outdoor: {context.get('indoor_outdoor') or 'indoor'}",
            f"Care: {context.get('care_instructions') or 'Keep clean and dry.'}",
        ],
        "label_apparel.html": [
            f"{context.get('product_name', '')}",
            f"MRP: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Fabric: {context.get('fabric_type') or material}",
            f"Sizes: {size_line}",
            f"Wash Care: {context.get('wash_care') or context.get('care_instructions') or 'Handle gently'}",
            "Barcode: ____________",
        ],
        "label_jewelry.html": [
            f"{context.get('product_name', '')}",
            f"MRP: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Type: {context.get('jewelry_type') or 'Jewelry'}",
            f"Material: {context.get('metal_or_base') or material}",
            f"Occasion: {context.get('occasion') or 'general'}",
            "Barcode: ____________",
        ],
        "label_pottery.html": [
            f"{context.get('product_name', '')}",
            f"MRP: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Finish: {context.get('finish_type') or 'Hand-finished'}",
            f"Capacity: {context.get('capacity_ml') or 'N/A'} ml",
            f"Use: {'Food Safe' if context.get('is_food_safe') else 'Decorative only'}",
            "Barcode: ____________",
        ],
        "label_painting.html": [
            f"{context.get('product_name', context.get('art_style', 'Painting'))}",
            f"Artist: {context.get('artisan_name') or 'Artisan'}",
            f"Medium: {context.get('medium') or 'Mixed media'}",
            f"Size: {context.get('width_cm') or '?'} x {context.get('height_cm') or '?'} cm",
            f"Type: {'Original' if context.get('is_original', True) else 'Print'}",
            "Barcode: ____________",
        ],
        "label_home_decor.html": [
            f"{context.get('product_name', '')}",
            f"MRP: Rs. {int(float(context.get('price_mrp', 0) or 0))}",
            f"Material: {context.get('material_primary') or material}",
            f"Dimensions: {context.get('width_cm') or '?'} x {context.get('height_cm') or '?'} x {context.get('depth_cm') or '?'}",
            f"Assembly: {'Yes' if context.get('assembly_required') else 'No'}",
            "Barcode: ____________",
        ],
        "story_card_base.html": [
            "Our Story",
            context.get("story_excerpt_en") or "",
            context.get("story_excerpt_hi") or "",
            f"{context.get('product_name', '')} - {context.get('product_material_sentence') or material}",
            f"Made with love in {context.get('region', 'India')}",
            f"WhatsApp: {context.get('whatsapp_number') or 'Available on request'}",
        ],
        "certificate_auth.html": [
            "Certificate of Authenticity",
            f"Brand: {context.get('brand_name', '')}",
            f"Artist: {context.get('artisan_name') or 'Artisan'}",
            f"Style: {context.get('art_style') or 'Painting'}",
            f"Medium: {context.get('medium') or 'Mixed media'}",
            f"Surface: {context.get('surface') or 'Canvas'}",
            f"Dimensions: {context.get('width_cm') or '?'} x {context.get('height_cm') or '?'} cm",
            context.get("listing_excerpt") or "",
            "This is an original hand-crafted artwork.",
        ],
    }
    return lines.get(template_name, [context.get("brand_name", "Idanta"), context.get("product_name", "")])


def _render_fallback_pdf(template_name: str, context: Dict[str, Any]) -> bytes:
    width, height = FALLBACK_PAGE_SIZES.get(template_name, (620, 874))
    image = Image.new("RGB", (width, height), color=context.get("background_color", "#F7F2EA"))
    draw = ImageDraw.Draw(image)

    primary = context.get("primary_color", "#8B2635")
    accent = context.get("accent_color", "#C4963B")
    header_y = _draw_header(image, draw, context, compact=template_name.startswith("label_"))

    if context.get("gi_tag"):
        _draw_badge(draw, 36, header_y, context.get("gi_tag_name") or "GI Craft", primary)
        header_y += 56

    if template_name == "certificate_auth.html":
        draw.rounded_rectangle((20, 20, width - 20, height - 20), radius=32, outline=accent, width=6)

    title_font = _load_font(26 if template_name.startswith("label_") else 30, bold=True)
    body_font = _load_font(20)
    small_font = _load_font(18)

    y = header_y
    for index, line in enumerate(_fallback_sections(template_name, context)):
        font = title_font if index == 0 and template_name in {"story_card_base.html", "certificate_auth.html"} else body_font
        y = _draw_wrapped(draw, line, (36, y, width - 36, height - 100), font=font, fill=primary if index == 0 else "#222222")
        y += 10

    if template_name.startswith("hang_tag_") and context.get("brand_tagline"):
        footer_y = height - 70
        draw.line((36, footer_y - 12, width - 36, footer_y - 12), fill=accent, width=3)
        draw.text((36, footer_y), context.get("brand_tagline", ""), font=small_font, fill="#555555")

    if template_name.startswith("label_"):
        draw.rounded_rectangle((36, height - 96, width - 36, height - 40), radius=18, outline=accent, width=3)
        draw.text((54, height - 82), context.get("brand_tagline", "") or "Barcode", font=small_font, fill="#666666")

    buffer = io.BytesIO()
    image.save(buffer, format="PDF", resolution=150.0)
    logger.info("Generated fallback PDF for template '%s'", template_name)
    return buffer.getvalue()


def render_pdf(template_name: str, context: Dict[str, Any]) -> bytes:
    """
    Render an HTML template with the given context and convert to PDF bytes.
    Falls back to a Pillow-rendered printable PDF when WeasyPrint is unavailable.
    """
    if not WEASYPRINT_AVAILABLE:
        return _render_fallback_pdf(template_name, context)

    try:
        env = _get_jinja_env()
        template = env.get_template(template_name)
        html_string = template.render(**context)

        css_path = TEMPLATE_DIR / "style.css"
        css = CSS(filename=str(css_path)) if css_path.exists() else None

        pdf_bytes = HTML(string=html_string, base_url=str(TEMPLATE_DIR)).write_pdf(
            stylesheets=[css] if css else None
        )
        logger.info("Generated PDF from template '%s'", template_name)
        return pdf_bytes

    except Exception as e:
        logger.warning(
            "WeasyPrint PDF generation failed for '%s': %s. Falling back to Pillow PDF.",
            template_name,
            e,
        )
        return _render_fallback_pdf(template_name, context)
