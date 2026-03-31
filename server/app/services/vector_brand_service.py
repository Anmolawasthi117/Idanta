"""
Deterministic SVG generation for brand motifs, patterns, logos, and banners.

This service is used for brand identity assets where strict palette control and
high consistency matter more than open-ended image synthesis.
"""

from __future__ import annotations

import html
import math
import re
from typing import Any


def _escape(value: str) -> str:
    return html.escape(str(value or ""), quote=True)


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    value = str(hex_color or "#000000").lstrip("#")
    if len(value) != 6:
        value = "000000"
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _mix_hex(hex_a: str, hex_b: str, ratio_b: float) -> str:
    ratio = max(0.0, min(1.0, ratio_b))
    ar, ag, ab = _hex_to_rgb(hex_a)
    br, bg, bb = _hex_to_rgb(hex_b)
    mixed = (
        int(round(ar * (1 - ratio) + br * ratio)),
        int(round(ag * (1 - ratio) + bg * ratio)),
        int(round(ab * (1 - ratio) + bb * ratio)),
    )
    return "#{:02X}{:02X}{:02X}".format(*mixed)


def _contrast_color(hex_color: str) -> str:
    r, g, b = _hex_to_rgb(hex_color)
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return "#17211E" if luminance > 0.68 else "#F8F4ED"


def _palette_value(palette: dict[str, Any], key: str, fallback: str) -> str:
    value = str((palette or {}).get(key) or "").strip()
    return value if re.fullmatch(r"#[0-9A-Fa-f]{6}", value) else fallback


def _palette_tokens(palette: dict[str, Any]) -> dict[str, str]:
    primary = _palette_value(palette, "primary", "#23423F")
    secondary = _palette_value(palette, "secondary", "#C97C3A")
    accent = _palette_value(palette, "accent", "#D9B56D")
    background = _palette_value(palette, "background", _mix_hex(primary, "#FFFFFF", 0.88))
    surface = _mix_hex(background, "#FFFFFF", 0.2)
    ink = _contrast_color(background)
    soft = _mix_hex(primary, background, 0.65)
    return {
        "primary": primary,
        "secondary": secondary,
        "accent": accent,
        "background": background,
        "surface": surface,
        "ink": ink,
        "soft": soft,
    }


def _brand_initials(brand_name: str) -> str:
    parts = [part for part in re.split(r"\s+", str(brand_name or "").strip()) if part]
    if not parts:
        return "ID"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][:1] + parts[1][:1]).upper()


def _seed_from_text(*values: str) -> int:
    seed = 0
    for value in values:
        for char in str(value or ""):
            seed = (seed * 131 + ord(char)) % 1000003
    return seed


def _seed_float(seed: int, offset: int = 0) -> float:
    return ((seed + offset * 977) % 1000) / 1000.0


def _infer_motif_family(*texts: str) -> str:
    combined = " ".join(str(text or "").lower() for text in texts)
    keyword_map = {
        "floral": ["flower", "floral", "lotus", "petal", "bloom", "rosette"],
        "leaf": ["leaf", "vine", "foliage", "sprig", "branch"],
        "paisley": ["paisley", "buta", "mango", "teardrop", "curled drop"],
        "diamond": ["diamond", "rhombus", "kite", "lozenge", "geometric", "angled"],
        "wave": ["wave", "ripple", "leher", "curve", "water"],
        "lattice": ["lattice", "grid", "jaal", "mesh", "repeat net"],
        "sun": ["sun", "star", "radiant", "ray"],
        "arch": ["arch", "temple", "window", "doorway"],
        "stripe": ["stripe", "band", "line", "border"],
        "dot": ["dot", "bead", "circle", "speck"],
    }
    for family, keywords in keyword_map.items():
        if any(keyword in combined for keyword in keywords):
            return family
    return "floral"


def _has_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _motif_key(*values: str) -> str:
    return " ".join(str(value or "").strip() for value in values if str(value or "").strip()).strip()


def _motif_profile(title: str, description: str, variant: int) -> dict[str, Any]:
    combined = f"{title} {description}".lower()
    family = _infer_motif_family(title, description)
    seed = _seed_from_text(title, description, family, str(variant))
    return {
        "family": family,
        "seed": seed,
        "stepped": _has_any(combined, ["step", "stair", "tiered", "fort", "architectural"]),
        "nested": _has_any(combined, ["nested", "inner", "double", "layered", "concentric"]),
        "slim": _has_any(combined, ["slim", "narrow", "fine", "delicate"]),
        "broad": _has_any(combined, ["broad", "wide", "bold", "thick"]),
        "angular": _has_any(combined, ["angular", "sharp", "pointed", "geometric"]),
        "curved": _has_any(combined, ["curved", "rounded", "soft", "flowing"]),
        "dense": _has_any(combined, ["dense", "packed", "tight", "busy"]),
        "airy": _has_any(combined, ["airy", "open", "spaced", "breathing"]),
        "radial": _has_any(combined, ["radial", "circular", "sunburst", "rosette"]),
        "mirrored": _has_any(combined, ["mirrored", "symmetry", "symmetric", "balanced"]),
        "diagonal": _has_any(combined, ["diagonal", "slant", "angled"]),
        "bordered": _has_any(combined, ["border", "frame", "edge", "outline"]),
        "tall": _has_any(combined, ["tall", "elongated", "vertical", "towering"]),
        "layered": _has_any(combined, ["layered", "stacked", "double", "tiered"]),
        "pointed": _has_any(combined, ["pointed", "ogee", "arched", "spiked"]),
        "scalloped": _has_any(combined, ["scalloped", "lobed", "petalled", "ruffled"]),
        "petal": _has_any(combined, ["petal", "floral", "lotus", "rosette", "bloom"]),
        "leaflike": _has_any(combined, ["leaf", "vine", "foliage", "sprig"]),
        "dotted": _has_any(combined, ["dot", "bead", "seed", "speckled"]),
        "crosshatched": _has_any(combined, ["grid", "mesh", "jaal", "lattice", "net"]),
    }


def _logo_layout_from_variant(candidate_id: str) -> str:
    candidate = str(candidate_id or "").lower()
    if "monogram" in candidate or candidate.endswith("_5"):
        return "monogram"
    if "seal" in candidate or "badge" in candidate or candidate.endswith("_6"):
        return "seal"
    if "emblem" in candidate or candidate.endswith("_4"):
        return "emblem"
    if "script" in candidate or candidate.endswith("_3"):
        return "script"
    if "modern" in candidate or candidate.endswith("_2"):
        return "modern"
    return "serif"


def _banner_layout_from_variant(candidate_id: str) -> str:
    candidate = str(candidate_id or "").lower()
    if "2" in candidate or "pattern" in candidate:
        return "pattern"
    if "3" in candidate or "story" in candidate:
        return "story"
    return "editorial"


def _symbol_group(
    family: str,
    colors: dict[str, str],
    *,
    variant: int = 0,
    opacity: float = 1.0,
    motif_key: str = "",
) -> str:
    primary = colors["primary"]
    secondary = colors["secondary"]
    accent = colors["accent"]
    background = colors["background"]
    stroke = _mix_hex(primary, "#000000", 0.12)
    common = f'fill-opacity="{opacity}" stroke="{stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"'
    motif_signature = motif_key or family
    profile = _motif_profile(family, motif_signature, variant)
    seed = _seed_from_text(family, motif_signature, str(variant))
    twist = (_seed_float(seed, 1) - 0.5) * 18
    stretch = 0.82 + _seed_float(seed, 2) * 0.46
    inner_scale = 0.48 + _seed_float(seed, 3) * 0.22
    alt_opacity = opacity * (0.82 + _seed_float(seed, 4) * 0.14)
    detail_opacity = opacity * (0.48 + _seed_float(seed, 27) * 0.18)

    if family == "leaf":
        width = (88 if profile["slim"] else 118 if profile["broad"] else 104) + int(_seed_float(seed, 5) * 30)
        height = (160 if profile["slim"] else 134) + int(_seed_float(seed, 6) * 24)
        inner_width = int(width * 0.58)
        inner_height = int(height * 0.68)
        mirrored_leaf = (
            f'<path d="M0 -{int(height * 0.72)} C-{int(width * 0.42)} -{int(height * 0.6)} -{int(width * 0.5)} -18 0 {int(height * 0.34)} C{int(width * 0.48)} -10 {int(width * 0.42)} -{int(height * 0.62)} 0 -{int(height * 0.72)} Z" '
            f'fill="{background}" fill-opacity="{detail_opacity}" stroke="{primary}" stroke-width="5" opacity="{detail_opacity}"/>'
            if profile["mirrored"] or profile["layered"]
            else ""
        )
        return (
            f'<g transform="rotate({twist})">'
            f'<path d="M0 -{height} C{width} -{height + 10} {width + 26} -44 0 {height + 8} C-{width + 24} -44 -{width} -{height + 10} 0 -{height} Z" fill="{secondary}" {common}/>'
            f'<path d="M0 -{int(height * 0.84)} C{inner_width} -{int(height * 0.8)} {inner_width + 12} -28 0 {inner_height} C-{inner_width + 12} -28 -{inner_width} -{int(height * 0.8)} 0 -{int(height * 0.84)} Z" fill="{accent}" fill-opacity="{alt_opacity}"/>'
            f'<path d="M0 -{int(height * 0.86)} L0 {int(height * 0.8)}" stroke="{primary}" stroke-width="8" stroke-linecap="round" opacity="{opacity}"/>'
            f'<path d="M0 -16 C{int(width * 0.34)} -6 {int(width * 0.42)} 24 {int(width * 0.16)} 62" stroke="{primary}" stroke-width="6" stroke-linecap="round" opacity="{opacity * 0.58}" fill="none"/>'
            f'<path d="M0 0 C-{int(width * 0.34)} 12 -{int(width * 0.4)} 38 -{int(width * 0.1)} 74" stroke="{primary}" stroke-width="6" stroke-linecap="round" opacity="{opacity * 0.52}" fill="none"/>'
            + mirrored_leaf
            + f'</g>'
        )
    if family == "paisley":
        shoulder = (116 if profile["broad"] else 82 if profile["slim"] else 92) + int(_seed_float(seed, 7) * 24)
        nested_drop = (
            f'<path d="M-18 -82 C18 -80 36 -28 10 8 C-6 30 -10 54 -4 74 C-40 58 -50 30 -46 -4 C-42 -42 -30 -80 -18 -82 Z" fill="none" stroke="{primary}" stroke-width="6" opacity="{detail_opacity}"/>'
            if profile["nested"] or profile["layered"]
            else ""
        )
        dotted_cluster = (
            f'<circle cx="-18" cy="48" r="10" fill="{accent}" fill-opacity="{detail_opacity}"/>'
            f'<circle cx="-46" cy="78" r="8" fill="{primary}" fill-opacity="{detail_opacity}"/>'
            if profile["dotted"] or profile["dense"]
            else ""
        )
        return (
            f'<g transform="rotate({twist})">'
            f'<path d="M-18 -146 C{shoulder} -144 132 -18 52 52 C2 96 -20 130 10 176 C-84 144 -140 70 -128 -16 C-116 -94 -80 -144 -18 -146 Z" fill="{secondary}" {common}/>'
            f'<path d="M-4 -104 C62 -102 78 -28 26 14 C0 36 -12 62 0 92 C-54 70 -76 36 -70 -10 C-64 -58 -38 -104 -4 -104 Z" fill="{accent}" fill-opacity="{alt_opacity}"/>'
            f'<circle cx="20" cy="-34" r="{18 + int(_seed_float(seed, 8) * 8)}" fill="{primary}" fill-opacity="{opacity}"/>'
            f'<circle cx="44" cy="20" r="10" fill="{primary}" fill-opacity="{opacity * 0.72}"/>'
            + nested_drop
            + dotted_cluster
            + f'</g>'
        )
    if family == "diamond":
        outer = (142 if profile["stepped"] else 118) + int(_seed_float(seed, 9) * 22)
        inner = int(outer * (0.54 if profile["nested"] else inner_scale))
        outer_rx = 10 if profile["angular"] else 22
        inner_rx = 10 + int(_seed_float(seed, 11) * 8)
        step_frame = (
            f'<path d="M0 -{outer + 26} L{outer + 26} 0 L0 {outer + 26} L-{outer + 26} 0 Z" fill="none" stroke="{accent}" stroke-width="8" opacity="{detail_opacity}"/>'
            if profile["stepped"] or profile["bordered"]
            else ""
        )
        diagonal_grid = (
            f'<path d="M-{int(inner * 0.9)} -{int(inner * 0.28)} L{int(inner * 0.9)} {int(inner * 0.28)} M-{int(inner * 0.28)} -{int(inner * 0.9)} L{int(inner * 0.28)} {int(inner * 0.9)}" stroke="{primary}" stroke-width="5" opacity="{detail_opacity}"/>'
            if profile["crosshatched"] or profile["diagonal"]
            else ""
        )
        return (
            f'<g transform="rotate({twist})">'
            f'<rect x="-{outer}" y="-{outer}" width="{outer * 2}" height="{outer * 2}" rx="{outer_rx}" transform="rotate(45)" fill="{secondary}" {common}/>'
            f'<rect x="-{inner}" y="-{inner}" width="{inner * 2}" height="{inner * 2}" rx="{inner_rx}" transform="rotate(45)" fill="{accent}" fill-opacity="{alt_opacity}"/>'
            f'<path d="M0 -{outer + 10} L0 {outer + 10} M-{outer + 10} 0 L{outer + 10} 0" stroke="{primary}" stroke-width="10" opacity="{opacity}"/>'
            + (
                f'<rect x="-{int(inner * 0.58)}" y="-{int(inner * 0.58)}" width="{int(inner * 1.16)}" height="{int(inner * 1.16)}" rx="4" transform="rotate(45)" fill="none" stroke="{primary}" stroke-width="6" opacity="{opacity * 0.6}"/>'
                if profile["nested"] or profile["stepped"]
                else ""
            )
            + step_frame
            + diagonal_grid
            + f'</g>'
        )
    if family == "wave":
        spread = 130 + int(_seed_float(seed, 12) * 26)
        amp = (34 if profile["airy"] else 56 if profile["dense"] else 44) + int(_seed_float(seed, 13) * 12)
        extra_wave = (
            f'<path d="M-{spread} -4 C-{int(spread * 0.7)} -66 -{int(spread * 0.26)} -64 2 -6 C{int(spread * 0.22)} 44 {int(spread * 0.72)} 46 {spread} -4" fill="none" stroke="{background}" stroke-width="10" stroke-linecap="round" opacity="{detail_opacity}"/>'
            if profile["layered"] or profile["nested"]
            else ""
        )
        return (
            f'<g transform="rotate({twist * 0.6}) scale({stretch} 1)">'
            f'<path d="M-{spread} -{amp + 28} C-{int(spread * 0.7)} -{amp + 84} -{int(spread * 0.24)} -{amp + 86} 0 -{amp + 24} C{int(spread * 0.22)} {18 - amp} {int(spread * 0.7)} {12 - amp} {spread} -{amp + 28}" fill="none" stroke="{secondary}" stroke-width="22" stroke-linecap="round" opacity="{opacity}"/>'
            f'<path d="M-{spread} 4 C-{int(spread * 0.68)} -54 -{int(spread * 0.2)} -52 8 4 C{int(spread * 0.3)} 58 {int(spread * 0.72)} 60 {spread} 4" fill="none" stroke="{accent}" stroke-width="24" stroke-linecap="round" opacity="{alt_opacity}"/>'
            f'<path d="M-{spread} {amp + 44} C-{int(spread * 0.72)} {amp - 10} -{int(spread * 0.28)} {amp - 6} 4 {amp + 44} C{int(spread * 0.28)} {amp + 94} {int(spread * 0.72)} {amp + 92} {spread} {amp + 44}" fill="none" stroke="{primary}" stroke-width="18" stroke-linecap="round" opacity="{opacity}"/>'
            + extra_wave
            + f'</g>'
        )
    if family == "lattice":
        outer = 148 + int(_seed_float(seed, 14) * 18)
        inner = int(outer * (0.56 if profile["dense"] else 0.72 if profile["airy"] else 0.66))
        intersection_nodes = (
            f'<circle cx="0" cy="-{int(inner * 0.96)}" r="10" fill="{primary}" fill-opacity="{detail_opacity}"/>'
            f'<circle cx="{int(inner * 0.96)}" cy="0" r="10" fill="{primary}" fill-opacity="{detail_opacity}"/>'
            f'<circle cx="0" cy="{int(inner * 0.96)}" r="10" fill="{primary}" fill-opacity="{detail_opacity}"/>'
            f'<circle cx="-{int(inner * 0.96)}" cy="0" r="10" fill="{primary}" fill-opacity="{detail_opacity}"/>'
            if profile["dense"] or profile["dotted"] or profile["crosshatched"]
            else ""
        )
        return (
            f'<g transform="rotate({twist})">'
            f'<path d="M0 -{outer} L{outer} 0 L0 {outer} L-{outer} 0 Z" fill="{secondary}" {common}/>'
            f'<path d="M0 -{inner} L{inner} 0 L0 {inner} L-{inner} 0 Z" fill="{background}" stroke="{primary}" stroke-width="8" opacity="{opacity}"/>'
            f'<path d="M-{outer} 0 L0 -{outer} L{outer} 0 L0 {outer} Z" fill="none" stroke="{accent}" stroke-width="14" opacity="{opacity}"/>'
            f'<path d="M-{int(inner * 1.1)} 0 L0 -{int(inner * 1.1)} L{int(inner * 1.1)} 0 L0 {int(inner * 1.1)} Z" fill="none" stroke="{primary}" stroke-width="6" opacity="{opacity * 0.46}"/>'
            + intersection_nodes
            + f'</g>'
        )
    if family == "sun":
        rays = []
        ray_count = (14 if profile["dense"] else 8 if profile["airy"] else 10) + int(_seed_float(seed, 15) * 3)
        for index in range(ray_count):
            angle = index * (360 / ray_count) + (variant * 6)
            rays.append(
                f'<rect x="-8" y="-{164 + int(_seed_float(seed, 16) * 14)}" width="16" height="{48 + int(_seed_float(seed, 17) * 16)}" rx="8" transform="rotate({angle})" fill="{secondary}" fill-opacity="{opacity}"/>'
            )
        return (
            "".join(rays)
            + f'<circle cx="0" cy="0" r="{88 + int(_seed_float(seed, 18) * 12)}" fill="{accent}" {common}/>'
            + f'<circle cx="0" cy="0" r="{38 + int(_seed_float(seed, 19) * 12)}" fill="{primary}" fill-opacity="{opacity}"/>'
        )
    if family == "arch":
        height = (182 if profile["tall"] else 158) + int(_seed_float(seed, 20) * 20)
        arch_cap = (
            f'M-130 140 L-130 -10 C-130 -{int(height * 0.62)} -60 -{height} 0 -{height + 24} C60 -{height} 130 -{int(height * 0.62)} 130 -10 L130 140 Z'
            if profile["pointed"] or profile["angular"]
            else f'M-130 140 L-130 -10 C-130 -{int(height * 0.62)} -60 -{height} 0 -{height} C60 -{height} 130 -{int(height * 0.62)} 130 -10 L130 140 Z'
        )
        stepped_inner = (
            f'<path d="M-56 140 L-56 8 L-26 -18 L-26 -54 L0 -78 L26 -54 L26 -18 L56 8 L56 140 Z" fill="{background}" fill-opacity="{detail_opacity}" stroke="{primary}" stroke-width="6" opacity="{detail_opacity}"/>'
            if profile["stepped"] or profile["nested"]
            else ""
        )
        return (
            f'<g transform="rotate({twist * 0.35})">'
            f'<path d="{arch_cap}" fill="{secondary}" {common}/>'
            f'<path d="M-82 140 L-82 20 C-82 -34 -38 -88 0 -88 C38 -88 82 -34 82 20 L82 140 Z" fill="{accent}" fill-opacity="{alt_opacity}"/>'
            f'<path d="M0 -{int(height * 0.8)} L0 140" stroke="{primary}" stroke-width="10" opacity="{opacity}"/>'
            + stepped_inner
            + f'</g>'
        )
    if family == "stripe":
        bands = []
        colors_cycle = [secondary, accent, primary, accent, secondary]
        base_rotation = 38 if profile["diagonal"] else 18
        for index, offset in enumerate(range(-190, 180, 72)):
            bands.append(
                f'<rect x="{offset}" y="-186" width="{34 + int(_seed_float(seed, 21 + index) * 18)}" height="372" rx="18" transform="rotate({base_rotation + twist + index * 2.2})" fill="{colors_cycle[index % len(colors_cycle)]}" fill-opacity="{opacity}"/>'
            )
        return "".join(bands)
    if family == "dot":
        dots = []
        positions = [(-88, -88), (88, -88), (-88, 88), (88, 88), (0, -128), (0, 128), (-128, 0), (128, 0), (0, 0)]
        dot_colors = [secondary, accent, secondary, accent, primary, primary, primary, primary, accent]
        for (x_pos, y_pos), color in zip(positions, dot_colors):
            dots.append(f'<circle cx="{x_pos}" cy="{y_pos}" r="{16 + int(_seed_float(seed, abs(x_pos) + abs(y_pos)) * 14)}" fill="{color}" fill-opacity="{opacity}"/>')
        return "".join(dots) + f'<circle cx="0" cy="0" r="92" fill="{secondary}" {common}/><circle cx="0" cy="0" r="38" fill="{accent}" fill-opacity="{alt_opacity}"/>'

    petals = []
    petal_count = (10 if profile["radial"] else 6) + int(_seed_float(seed, 22) * 3)
    outer_y = 82 + int(_seed_float(seed, 23) * 22)
    outer_rx = (18 if profile["slim"] else 36 if profile["broad"] else 24) + int(_seed_float(seed, 24) * 10)
    outer_ry = (92 if profile["slim"] else 66) + int(_seed_float(seed, 25) * 18)
    for index in range(petal_count):
        angle = index * (360 / petal_count) + (variant * 4) + twist
        petal_color = secondary if index % 2 == 0 else accent
        petals.append(
            f'<ellipse cx="0" cy="-{outer_y}" rx="{outer_rx}" ry="{outer_ry}" transform="rotate({angle})" fill="{petal_color}" fill-opacity="{opacity}" stroke="{stroke}" stroke-width="5"/>'
        )
    inner_ring = ""
    if profile["nested"] or profile["layered"] or profile["scalloped"]:
        inner_petals = []
        inner_count = petal_count + (2 if profile["dense"] else 0)
        inner_rx = max(int(outer_rx * 0.58), 12)
        inner_ry = max(int(outer_ry * 0.48), 24)
        inner_y = max(int(outer_y * 0.58), 44)
        for index in range(inner_count):
            angle = index * (360 / inner_count) + twist * 0.7
            inner_petals.append(
                f'<ellipse cx="0" cy="-{inner_y}" rx="{inner_rx}" ry="{inner_ry}" transform="rotate({angle})" fill="{background}" fill-opacity="{detail_opacity}" stroke="{primary}" stroke-width="4" opacity="{detail_opacity}"/>'
            )
        inner_ring = "".join(inner_petals)
    return (
        "".join(petals)
        + inner_ring
        + f'<circle cx="0" cy="0" r="{34 + int(_seed_float(seed, 26) * 16)}" fill="{primary}" fill-opacity="{opacity}"/>'
    )


def render_motif_preview_svg(
    *,
    title: str,
    description: str,
    palette: dict[str, Any],
    visual_summary: str,
    index: int,
) -> str:
    colors = _palette_tokens(palette)
    motif_key = _motif_key(title, description, visual_summary)
    family = _infer_motif_family(title, description)
    seed = _seed_from_text(motif_key, str(index))
    overlay = _mix_hex(colors["secondary"], colors["background"], 0.78)
    ghost = _symbol_group(family, colors, variant=index + 7, opacity=0.16, motif_key=motif_key)
    hero = _symbol_group(family, colors, variant=index - 1, opacity=1.0, motif_key=motif_key)
    layout_mode = seed % 3
    if layout_mode == 1:
        hero_group = f"""
  <g opacity="0.18">
    <g transform="translate(244 786) scale(0.2) rotate(-24)">{ghost}</g>
    <g transform="translate(766 244) scale(0.18) rotate(18)">{ghost}</g>
  </g>
  <g transform="translate(460 546) scale(1.02)">
    {hero}
  </g>
  <g transform="translate(776 312) scale(0.34) rotate(10)">
    {_symbol_group(family, colors, variant=index + 2, opacity=0.42, motif_key=motif_key)}
  </g>
"""
    elif layout_mode == 2:
        hero_group = f"""
  <path d="M124 770 C248 626 368 560 512 546 C658 532 808 578 904 706" fill="none" stroke="{_mix_hex(colors['accent'], colors['background'], 0.34)}" stroke-width="10" opacity="0.58"/>
  <g opacity="0.22">
    <g transform="translate(228 234) scale(0.2) rotate(-18)">{ghost}</g>
    <g transform="translate(804 798) scale(0.2) rotate(22)">{ghost}</g>
  </g>
  <g transform="translate(512 470) scale(0.9)">
    {hero}
  </g>
"""
    else:
        hero_group = f"""
  <g opacity="0.32">
    <g transform="translate(220 218) scale(0.24) rotate(-16)">{ghost}</g>
    <g transform="translate(812 226) scale(0.18) rotate(24)">{ghost}</g>
    <g transform="translate(814 816) scale(0.22) rotate(-18)">{ghost}</g>
  </g>
  <g transform="translate(512 512)">
    {hero}
  </g>
"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="{_escape(title)} motif preview">
  <rect width="1024" height="1024" rx="56" fill="{colors['background']}"/>
  <rect x="74" y="74" width="876" height="876" rx="48" fill="{colors['surface']}" stroke="{_mix_hex(colors['primary'], colors['background'], 0.36)}" stroke-width="4"/>
  <circle cx="512" cy="512" r="318" fill="{overlay}" opacity="0.44"/>
  {hero_group}
</svg>"""


def render_pattern_preview_svg(
    *,
    title: str,
    description: str,
    palette: dict[str, Any],
    index: int,
) -> str:
    colors = _palette_tokens(palette)
    motif_key = _motif_key(title, description)
    family = _infer_motif_family(title, description)
    tile = _symbol_group(family, colors, variant=index, opacity=0.52, motif_key=motif_key)
    tile_secondary = _symbol_group(family, colors, variant=index + 9, opacity=0.24, motif_key=motif_key)
    tile_third = _symbol_group(family, colors, variant=index + 17, opacity=0.18, motif_key=motif_key)
    seed = _seed_from_text(motif_key, str(index))
    tile_size = 220 + (seed % 3) * 24
    stroke = _mix_hex(colors["primary"], colors["background"], 0.5)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="{_escape(title)} pattern preview">
  <defs>
    <pattern id="tile" width="{tile_size}" height="{tile_size}" patternUnits="userSpaceOnUse">
      <rect width="{tile_size}" height="{tile_size}" fill="{colors['background']}"/>
      <g transform="translate({tile_size // 2} {tile_size // 2}) scale(0.3)">
        {tile}
      </g>
      <g transform="translate({int(tile_size * 0.14)} {int(tile_size * 0.12)}) scale(0.16)">
        {tile_secondary}
      </g>
      <g transform="translate({int(tile_size * 0.82)} {int(tile_size * 0.78)}) scale(0.14)">
        {tile_third}
      </g>
    </pattern>
    <pattern id="tileOverlay" width="{tile_size}" height="{tile_size}" patternUnits="userSpaceOnUse">
      <rect width="{tile_size}" height="{tile_size}" fill="none"/>
      <path d="M0 {tile_size // 2} H{tile_size} M{tile_size // 2} 0 V{tile_size}" stroke="{_mix_hex(colors['accent'], colors['background'], 0.56)}" stroke-width="2" opacity="0.2"/>
    </pattern>
  </defs>
  <rect width="1024" height="1024" rx="56" fill="{colors['surface']}"/>
  <rect x="72" y="72" width="880" height="880" rx="42" fill="url(#tile)" stroke="{stroke}" stroke-width="6"/>
  <rect x="72" y="72" width="880" height="880" rx="42" fill="url(#tileOverlay)" opacity="0.7"/>
  <rect x="86" y="86" width="852" height="852" rx="36" fill="none" stroke="{_mix_hex(colors['accent'], colors['background'], 0.35)}" stroke-width="18" stroke-dasharray="18 22" opacity="0.55"/>
</svg>"""


def _text_logo_lockup(
    *,
    brand_name: str,
    tagline: str,
    colors: dict[str, str],
    layout: str,
) -> str:
    if layout == "script":
        family = "'Brush Script MT', Georgia, serif"
        size = 108
        letter_spacing = "1"
        style = 'font-style="italic"'
    elif layout == "modern":
        family = "'Trebuchet MS', Arial, sans-serif"
        size = 92
        letter_spacing = "2"
        style = 'font-weight="700"'
    else:
        family = "Georgia, 'Times New Roman', serif"
        size = 102
        letter_spacing = "1"
        style = 'font-weight="700"'
    return (
        f'<text x="512" y="656" text-anchor="middle" font-family="{family}" font-size="{size}" letter-spacing="{letter_spacing}" fill="{colors["ink"]}" {style}>{_escape(brand_name)}</text>'
        + (
            f'<text x="512" y="724" text-anchor="middle" font-family="\'Trebuchet MS\', Arial, sans-serif" font-size="28" letter-spacing="4" fill="{_mix_hex(colors["ink"], colors["background"], 0.35)}">{_escape(tagline)}</text>'
            if str(tagline or "").strip()
            else ""
        )
    )


def render_logo_svg(
    *,
    brand_name: str,
    tagline: str,
    palette: dict[str, Any],
    motif_name: str,
    motif_description: str,
    candidate_id: str,
    sample_summary: str = "",
) -> str:
    colors = _palette_tokens(palette)
    layout = _logo_layout_from_variant(candidate_id)
    family = _infer_motif_family(motif_name, motif_description)
    motif_key = _motif_key(motif_name, motif_description)
    border = _mix_hex(colors["primary"], colors["background"], 0.48)
    initials = _brand_initials(brand_name)
    ornament_opacity = 0.24 if "restrain" in sample_summary.lower() else 0.34
    motif_group = _symbol_group(family, colors, variant=len(candidate_id), opacity=1.0, motif_key=motif_key)
    subtle_group = _symbol_group(family, colors, variant=len(candidate_id) + 2, opacity=ornament_opacity, motif_key=motif_key)

    if layout == "modern":
        content = f"""
  <g transform="translate(276 430) scale(0.46)">
    {motif_group}
  </g>
  <rect x="380" y="298" width="8" height="246" rx="4" fill="{colors['accent']}"/>
  <text x="432" y="430" font-family="'Trebuchet MS', Arial, sans-serif" font-size="96" font-weight="800" letter-spacing="4" fill="{colors['ink']}">{_escape(brand_name.upper())}</text>
  <text x="434" y="492" font-family="'Trebuchet MS', Arial, sans-serif" font-size="28" letter-spacing="5" fill="{_mix_hex(colors['ink'], colors['background'], 0.35)}">{_escape(tagline)}</text>
"""
    elif layout == "script":
        content = f"""
  <g transform="translate(512 336) scale(0.34)">
    {motif_group}
  </g>
  {_text_logo_lockup(brand_name=brand_name, tagline=tagline, colors=colors, layout=layout)}
"""
    elif layout == "emblem":
        content = f"""
  <circle cx="512" cy="362" r="180" fill="{colors['surface']}" stroke="{border}" stroke-width="10"/>
  <g transform="translate(512 362) scale(0.42)">
    {motif_group}
  </g>
  {_text_logo_lockup(brand_name=brand_name, tagline=tagline, colors=colors, layout='serif')}
"""
    elif layout == "monogram":
        content = f"""
  <rect x="274" y="194" width="476" height="332" rx="48" fill="{colors['surface']}" stroke="{border}" stroke-width="10"/>
  <g transform="translate(512 360) scale(0.28)">
    {subtle_group}
  </g>
  <text x="512" y="392" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="154" font-weight="800" fill="{colors['primary']}">{_escape(initials)}</text>
  {_text_logo_lockup(brand_name=brand_name, tagline=tagline, colors=colors, layout='modern')}
"""
    elif layout == "seal":
        content = f"""
  <circle cx="512" cy="344" r="190" fill="{colors['surface']}" stroke="{colors['primary']}" stroke-width="12"/>
  <circle cx="512" cy="344" r="158" fill="none" stroke="{colors['accent']}" stroke-width="10" stroke-dasharray="10 16"/>
  <g transform="translate(512 344) scale(0.36)">
    {motif_group}
  </g>
  <text x="512" y="614" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="88" font-weight="700" fill="{colors['ink']}">{_escape(brand_name)}</text>
  <text x="512" y="674" text-anchor="middle" font-family="'Trebuchet MS', Arial, sans-serif" font-size="24" letter-spacing="5" fill="{_mix_hex(colors['ink'], colors['background'], 0.35)}">{_escape(tagline)}</text>
"""
    else:
        content = f"""
  <g transform="translate(512 330) scale(0.38)">
    {motif_group}
  </g>
  {_text_logo_lockup(brand_name=brand_name, tagline=tagline, colors=colors, layout='serif')}
"""

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="{_escape(brand_name)} logo">
  <rect width="1024" height="1024" rx="52" fill="{colors['background']}"/>
  <g opacity="{ornament_opacity}">
    <g transform="translate(170 172) scale(0.18)">{subtle_group}</g>
    <g transform="translate(852 180) scale(0.14) rotate(18)">{subtle_group}</g>
    <g transform="translate(858 842) scale(0.16) rotate(-22)">{subtle_group}</g>
  </g>
  <rect x="72" y="72" width="880" height="880" rx="44" fill="none" stroke="{border}" stroke-width="4"/>
  {content}
</svg>"""


def render_banner_svg(
    *,
    brand_name: str,
    tagline: str,
    palette: dict[str, Any],
    motif_name: str,
    motif_description: str,
    candidate_id: str,
) -> str:
    colors = _palette_tokens(palette)
    layout = _banner_layout_from_variant(candidate_id)
    family = _infer_motif_family(motif_name, motif_description)
    motif_key = _motif_key(motif_name, motif_description)
    motif_tile = _symbol_group(family, colors, variant=len(candidate_id), opacity=0.3, motif_key=motif_key)
    motif_tile_alt = _symbol_group(family, colors, variant=len(candidate_id) + 3, opacity=0.18, motif_key=motif_key)
    title_family = "Georgia, 'Times New Roman', serif" if layout != "story" else "'Trebuchet MS', Arial, sans-serif"
    title_size = "92" if layout == "editorial" else "86" if layout == "pattern" else "80"
    tagline_text = (
        f'<text x="160" y="564" font-family="\'Trebuchet MS\', Arial, sans-serif" font-size="28" letter-spacing="4" fill="{_mix_hex(colors["ink"], colors["background"], 0.24)}">{_escape(tagline)}</text>'
        if str(tagline or "").strip()
        else ""
    )

    if layout == "pattern":
        content = f"""
  <rect x="56" y="56" width="1424" height="656" rx="40" fill="none" stroke="{_mix_hex(colors['accent'], colors['background'], 0.22)}" stroke-width="10"/>
  <rect x="126" y="126" width="1284" height="516" rx="26" fill="none" stroke="{_mix_hex(colors['primary'], colors['background'], 0.42)}" stroke-width="3"/>
  <g opacity="0.72">
    <g transform="translate(1178 384) scale(0.62)">{motif_tile}</g>
    <g transform="translate(1326 204) scale(0.32)">{motif_tile_alt}</g>
    <g transform="translate(1330 564) scale(0.32)">{motif_tile_alt}</g>
  </g>
  <text x="160" y="304" font-family="{title_family}" font-size="{title_size}" font-weight="700" fill="{colors['ink']}">{_escape(brand_name)}</text>
  {tagline_text}
  <path d="M160 350 H620" stroke="{colors['accent']}" stroke-width="6" opacity="0.74"/>
"""
    elif layout == "story":
        content = f"""
  <rect x="0" y="440" width="1536" height="328" fill="{_mix_hex(colors['secondary'], colors['background'], 0.5)}"/>
  <g opacity="0.65">
    <g transform="translate(1188 250) scale(0.66)">{motif_tile}</g>
    <g transform="translate(1332 518) scale(0.44)">{motif_tile_alt}</g>
  </g>
  <text x="160" y="212" font-family="{title_family}" font-size="{title_size}" font-weight="700" fill="{colors['ink']}">{_escape(brand_name)}</text>
  {tagline_text}
  <text x="160" y="640" font-family="'Trebuchet MS', Arial, sans-serif" font-size="28" letter-spacing="4" fill="{_mix_hex(colors['ink'], colors['background'], 0.2)}">Image-derived motif continuity across the brand world</text>
"""
    else:
        content = f"""
  <g opacity="0.5">
    <g transform="translate(1170 354) scale(0.72)">{motif_tile}</g>
    <g transform="translate(1342 160) scale(0.24)">{motif_tile_alt}</g>
    <g transform="translate(1358 586) scale(0.24)">{motif_tile_alt}</g>
  </g>
  <text x="150" y="262" font-family="{title_family}" font-size="{title_size}" font-weight="700" fill="{colors['ink']}">{_escape(brand_name)}</text>
  {tagline_text}
  <path d="M150 308 C262 278 356 274 468 308" fill="none" stroke="{colors['accent']}" stroke-width="7" opacity="0.62"/>
"""

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="768" viewBox="0 0 1536 768" role="img" aria-label="{_escape(brand_name)} banner">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{colors['background']}"/>
      <stop offset="100%" stop-color="{_mix_hex(colors['surface'], colors['secondary'], 0.18)}"/>
    </linearGradient>
  </defs>
  <rect width="1536" height="768" rx="42" fill="url(#bg)"/>
  <rect x="38" y="38" width="1460" height="692" rx="34" fill="none" stroke="{_mix_hex(colors['primary'], colors['background'], 0.6)}" stroke-width="4"/>
  {content}
</svg>"""
