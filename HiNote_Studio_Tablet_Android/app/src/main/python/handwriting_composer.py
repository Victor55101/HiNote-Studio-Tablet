from __future__ import annotations

import copy
import json
import math
import random
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


LIST_RE = re.compile(
    r"^(?P<indent>(?:\t| {4})*)(?P<marker>•|\*|-|\d+[.)]|[A-Za-z][.)])(?P<gap>[ \t]+|$)(?P<body>.*)$"
)


@lru_cache(maxsize=1)
def _load_library_cached(path_str: str, mtime_ns: int, size: int):
    return json.loads(Path(path_str).read_text(encoding="utf-8"))


def load_library(path):
    path = Path(path).resolve()
    stat = path.stat()
    return _load_library_cached(str(path), stat.st_mtime_ns, stat.st_size)


class _Warnings(list):
    def append(self, message):
        if len(self) < 100 and message not in self:
            super().append(message)


def _base_advance(glyph, scale):
    return float(glyph.get("advance", 35.0)) * scale


def _glyph_visual_right(glyph, scale: float) -> float:
    bbox = glyph.get("bbox") or glyph.get("raw_bbox")
    if bbox and len(bbox) >= 3:
        return float(bbox[2]) * scale
    return _base_advance(glyph, scale)


def _glyph_visual_left(glyph, scale: float) -> float:
    bbox = glyph.get("bbox") or glyph.get("raw_bbox")
    if bbox and len(bbox) >= 1:
        return float(bbox[0]) * scale
    return 0.0


def _is_narrow_char(ch: str) -> bool:
    return ch in "ilIjtfr1'\".,;:!|`"


def _interletter_gap(prev_item: dict, curr_item: dict, letter_spacing: float) -> float:
    """Visible ink-to-ink gap for adjacent letters in the same word.

    V19 deliberately separates *letter spacing* from *word spacing*.
    The returned value is a visual blank gap, not an origin-to-origin advance.
    This makes narrow glyphs (i/l/t/1) behave like the rest of the alphabet
    without collapsing wider glyphs or hiding spaces between words.
    """
    prev_scale = float(prev_item.get("scale", 1.0))
    curr_scale = float(curr_item.get("scale", 1.0))
    avg_scale = (prev_scale + curr_scale) / 2.0
    prev_ch = prev_item.get("ch", "")
    curr_ch = curr_item.get("ch", "")

    # Neutral visual gap at Letras=0. The UI value now has a direct and
    # predictable effect instead of being blended with historical advances.
    gap = (4.8 + float(letter_spacing) * 0.72) * avg_scale

    # Narrow letters need only a small optical correction, never a collapse.
    if _is_narrow_char(prev_ch):
        gap -= 0.45 * avg_scale
    if _is_narrow_char(curr_ch):
        gap -= 0.45 * avg_scale

    # Closing punctuation hugs the previous glyph slightly; opening marks hug
    # the next one. After sentence punctuation we leave a touch more air.
    if curr_ch in ".,;:!?)]}>»":
        gap -= 1.15 * avg_scale
    if prev_ch in "([<{«¿¡":
        gap -= 0.85 * avg_scale
    if prev_ch in ".,;:!?":
        gap += 0.65 * avg_scale

    # Keep a safe minimum so Huawei never receives visibly colliding glyphs.
    return max(1.6 * avg_scale, min(11.0 * avg_scale, gap))


def _pair_origin_delta(prev_item: dict, curr_item: dict, visible_gap: float) -> float:
    """Origin delta needed to leave ``visible_gap`` between actual ink bounds."""
    prev_right = float(prev_item.get("visual_right", 0.0))
    curr_left = float(curr_item.get("visual_left", 0.0))
    return prev_right - curr_left + float(visible_gap)


def _new_page(page_number: int):

    return {"page_number": page_number, "placements": [], "strokes": []}


def _page_view(composition: dict, page_index: int) -> dict:
    page = composition["pages"][page_index]
    return {
        "format": "hinote-composed-page-v5-rich",
        "text": composition.get("text", ""),
        "source_glyph_library": composition.get("source_glyph_library"),
        "layout": copy.deepcopy(composition["layout"]),
        "page_number": page["page_number"],
        "placements": page["placements"],
        "strokes": page["strokes"],
        "warnings": composition.get("warnings", []),
    }


def page_view(composition: dict, page_index: int) -> dict:
    return _page_view(composition, page_index)


def _grid_step_from_library(lib: dict) -> float:
    coord = lib.get("coordinate_system", {})
    gy = coord.get("grid_dy")
    if gy:
        return float(gy) / 2.0
    gx = coord.get("grid_dx")
    if gx:
        return float(gx) / 2.0
    return 59.5


def _indent_level(indent: str) -> int:
    tabs = indent.count("\t")
    spaces = len(indent.replace("\t", ""))
    return tabs + spaces // 4


def _style_from_marker(marker: str) -> str:
    if marker == "•":
        return "bullet"
    if marker == "-":
        return "dash"
    if marker == "*":
        return "asterisk"
    if marker and marker[0].isdigit():
        return "num_paren" if marker.endswith(")") else "num_dot"
    if marker and marker[0].isalpha():
        prefix = "alpha_upper" if marker[0].isupper() else "alpha_lower"
        return prefix + ("_paren" if marker.endswith(")") else "_dot")
    return "plain"


def document_from_plain_text(text: str, scale: float = 1.0) -> dict:
    paragraphs = []
    default_ink = {"color": "#000000", "opacity": 100.0}
    for line in text.split("\n"):
        m = LIST_RE.match(line)
        if m:
            marker = m.group("marker")
            body = m.group("body")
            paragraphs.append({
                "segments": [{"text": body, "scale": float(scale), **default_ink}],
                "list": {
                    "marker": marker,
                    "style": _style_from_marker(marker),
                    "level": _indent_level(m.group("indent")),
                    "marker_scale": float(scale),
                    "marker_color": "#000000",
                    "marker_opacity": 100.0,
                },
            })
        else:
            paragraphs.append({"segments": [{"text": line, "scale": float(scale), **default_ink}], "list": None})
    if not paragraphs:
        paragraphs = [{"segments": [{"text": "", "scale": float(scale), **default_ink}], "list": None}]
    return {"paragraphs": paragraphs, "plain_text": text}


def _normalize_hex_color(value: str | None) -> str:
    raw = str(value or "#000000").strip()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in raw):
        return "#000000"
    return "#" + raw.upper()


def _flatten_segments(segments: list[dict], base_scale: float) -> list[dict]:
    for seg in segments or []:
        seg_scale = max(0.35, float(seg.get("scale", 1.0)) * base_scale)
        color = _normalize_hex_color(seg.get("color", "#000000"))
        opacity = max(1.0, min(100.0, float(seg.get("opacity", 100.0))))
        for ch in unicodedata.normalize("NFC", str(seg.get("text", ""))):
            yield {"ch": ch, "scale": seg_scale, "color": color, "opacity": opacity}


def _choose_char_items(chars: list[dict], glyphs: dict, rng: random.Random, word_spacing: float, warnings: list[str]):
    for c in chars:
        ch = c["ch"]
        scale = c["scale"]
        color = _normalize_hex_color(c.get("color", "#000000"))
        opacity = max(1.0, min(100.0, float(c.get("opacity", 100.0))))
        if ch == "\t":
            yield {"kind": "space", "ch": ch, "scale": scale, "width": word_spacing * scale * 4.0, "color": color, "opacity": opacity}
        elif ch.isspace():
            yield {"kind": "space", "ch": ch, "scale": scale, "width": word_spacing * scale, "color": color, "opacity": opacity}
        else:
            variants = glyphs.get(ch)
            if not variants:
                warnings.append(f"Sin glifo para {ch!r}; se dejó espacio.")
                yield {"kind": "space", "ch": ch, "scale": scale, "width": 28.0 * scale, "color": color, "opacity": opacity}
                continue
            variant_index = rng.randrange(len(variants))
            glyph = variants[variant_index]
            yield {
                "kind": "glyph",
                "ch": ch,
                "scale": scale,
                "variant": variant_index,
                "glyph": glyph,
                "advance": _base_advance(glyph, scale),
                "visual_left": _glyph_visual_left(glyph, scale),
                "visual_right": _glyph_visual_right(glyph, scale),
                "color": color,
                "opacity": opacity,
            }


def _tokenize_items(items: list[dict]) -> list[list[dict]]:
    if not items:
        return []
    tokens = []
    current = [items[0]]
    current_space = items[0]["kind"] == "space"
    for item in items[1:]:
        is_space = item["kind"] == "space"
        if is_space == current_space:
            current.append(item)
        else:
            tokens.append(current)
            current = [item]
            current_space = is_space
    tokens.append(current)
    return tokens


def _sequence_metrics(items: list[dict], letter_spacing: float) -> tuple[float, float, float]:
    """Return logical/visual extents using real visible gaps.

    Crucially, a space is measured from the *right edge of the previous ink* to
    the *left edge of the next ink*. Older versions advanced only from the
    previous glyph origin, which made a 26-unit word space visually disappear.
    """
    origin_x = 0.0
    visual_left = 0.0
    visual_right = 0.0
    seen = False
    prev_glyph = None
    pending_space = 0.0

    for item in items:
        if item["kind"] == "space":
            pending_space += float(item["width"])
            continue

        if prev_glyph is None:
            # Leading spaces remain meaningful.
            origin_x += pending_space
        else:
            if pending_space > 0.0:
                gap = pending_space
            else:
                gap = _interletter_gap(prev_glyph, item, letter_spacing)
            origin_x += _pair_origin_delta(prev_glyph, item, gap)
        pending_space = 0.0

        left = origin_x + float(item["visual_left"])
        right = origin_x + float(item["visual_right"])
        if not seen:
            visual_left, visual_right = left, right
            seen = True
        else:
            visual_left = min(visual_left, left)
            visual_right = max(visual_right, right)
        prev_glyph = item

    if not seen:
        return pending_space, 0.0, pending_space

    # Trailing spaces extend the logical line but not the visible ink.
    logical_right = max(visual_right, origin_x + float(prev_glyph.get("visual_right", 0.0))) + pending_space
    return logical_right, visual_left, visual_right

def _token_width(token: list[dict], letter_spacing: float) -> float:
    if not token:
        return 0.0
    if token[0]["kind"] == "space":
        return sum(float(i["width"]) for i in token)
    logical, _left, visual_right = _sequence_metrics(token, letter_spacing)
    return max(logical, visual_right)


def _trim_trailing_spaces(items: list[dict]) -> list[dict]:
    out = list(items)
    while out and out[-1]["kind"] == "space":
        out.pop()
    return out


def _layout_paragraph_lines(items, first_x, continuation_x, right_limit, letter_spacing):
    """Greedy wrapping using real ink bounds, buffering at most a line of a word."""
    current, word = [], []
    pending_space = None
    start_x, first = first_x, True
    long_word = False
    emitted = False
    def fits(sequence, x):
        return x + _sequence_metrics(sequence, letter_spacing)[2] <= right_limit
    def flush():
        nonlocal current, start_x, first, emitted
        line = {"items": current, "start_x": start_x, "first": first}
        current, start_x, first, emitted = [], continuation_x, False, True
        return line
    def place_word():
        nonlocal current, word, pending_space
        candidate = current + ([pending_space] if current and pending_space else []) + word
        if current and not fits(candidate, start_x):
            yield flush()
            candidate = word
        current = candidate
        word, pending_space = [], None
    for item in items:
        if item["kind"] == "space":
            if word:
                yield from place_word()
            long_word = False
            if current:
                if pending_space is None:
                    pending_space = dict(item)
                else:
                    pending_space["width"] += item["width"]
            continue
        if long_word:
            if current and not fits(current + [item], start_x):
                yield flush()
            current.append(item)
            continue
        word.append(item)
        if not fits(word, continuation_x):
            if current:
                yield flush()
            pending_space = None
            for letter in word:
                if current and not fits(current + [letter], start_x):
                    yield flush()
                current.append(letter)
            word = []
            long_word = True
    if word:
        yield from place_word()
    if current or not emitted:
        yield flush()


def _line_max_scale(items: list[dict], marker_scale: float | None = None) -> float:
    values = [float(i.get("scale", 1.0)) for i in items if i.get("kind") == "glyph"]
    if marker_scale:
        values.append(float(marker_scale))
    return max(values) if values else 1.0


def _rows_for_scale(scale: float, minimum_rows: int, auto_line_spacing: bool) -> int:
    rows = max(1, int(minimum_rows))
    if not auto_line_spacing:
        return rows
    if scale > 1.75:
        return max(rows, 3)
    if scale > 1.35:
        return max(rows, 2)
    return rows


def _place_glyph_sequence(
    sequence: list[dict],
    x: float,
    baseline_y: float,
    page: dict,
    placement_y_offsets: dict,
    letter_spacing: float,
    jitter_x: float,
    jitter_y: float,
    rng: random.Random,
):
    origin_x = float(x)
    prev_glyph = None
    pending_space = 0.0

    for item in sequence:
        if item["kind"] == "space":
            pending_space += float(item["width"])
            continue

        if prev_glyph is None:
            origin_x += pending_space
        else:
            gap = pending_space if pending_space > 0.0 else _interletter_gap(prev_glyph, item, letter_spacing)
            origin_x += _pair_origin_delta(prev_glyph, item, gap)
        pending_space = 0.0

        ch = item["ch"]
        scale = item["scale"]
        glyph = item["glyph"]
        dx = rng.uniform(-jitter_x, jitter_x) * scale if jitter_x else 0.0
        dy = rng.uniform(-jitter_y, jitter_y) * scale if jitter_y else 0.0
        glyph_x = origin_x + dx
        y_offset = float(placement_y_offsets.get(ch, 0.0)) * scale
        glyph_baseline = baseline_y + dy + y_offset

        page["placements"].append({
            "char": ch,
            "variant": item["variant"],
            "x": glyph_x,
            "baseline_y": glyph_baseline,
            "advance": item["advance"],
            "scale": scale,
            "color": item.get("color", "#000000"),
            "opacity": float(item.get("opacity", 100.0)),
        })

        for source_stroke in glyph["strokes"]:
            points = []
            for p in source_stroke["points"]:
                points.append({
                    "x": float(glyph_x + p["x"] * scale),
                    "y": float(glyph_baseline + p["y"] * scale),
                    "t": int(p.get("dt", p.get("t", 0))),
                    "pressure": float(p["pressure"]),
                    "extra1": float(p["extra1"]),
                    "extra2": float(p["extra2"]),
                    "extra3": float(p["extra3"]),
                    "state": int(p["state"]),
                    "index": float(p["index"]),
                })
            page["strokes"].append({
                "char": ch,
                "variant": item["variant"],
                "source_stroke": source_stroke.get("source_stroke"),
                "header_hex": source_stroke.get("header_hex"),
                "metadata_hex": source_stroke.get("metadata_hex"),
                "point_header_hex": source_stroke.get("point_header_hex"),
                "color": item.get("color", "#000000"),
                "opacity": float(item.get("opacity", 100.0)),
                "points": points,
            })

        prev_glyph = item

    if prev_glyph is None:
        return origin_x + pending_space
    return max(origin_x + float(prev_glyph.get("visual_right", 0.0)) + pending_space, x)


def _canonicalize_pencilengine_strokes(page: dict) -> None:
    """Make every generated PencilEngine record a self-contained valid stroke.

    Huawei sometimes splits one handwritten pen stroke into several internal
    records. Calibration fragments can therefore begin with state=6 and index
    15, 20, ... . Reusing those fragments verbatim works in our matplotlib
    preview but Huawei may treat them as a continuation of a non-existent
    previous record, which is exactly what caused thin ``l`` strokes to vanish
    and multi-part ``Y`` glyphs to be clipped.

    Generated notes have no reason to preserve those chunk boundaries, so each
    output record is normalized to begin/end cleanly and uses a local index.
    Geometry, pressure, tilt/extras, color and opacity are untouched.
    """
    for stroke in page.get("strokes", []):
        pts = stroke.get("points", [])
        n = len(pts)
        if not n:
            continue
        for i, pt in enumerate(pts):
            pt["index"] = float(i)
            if n == 1:
                pt["state"] = 4
            elif i == 0:
                pt["state"] = 4
            elif i == n - 1:
                pt["state"] = 5
            else:
                pt["state"] = 6


def compose_document(

    library_path,
    document: dict,
    *,
    seed=12345,
    page_width=1000.0,
    page_height=1600.0,
    margin_left=80.0,
    margin_right=80.0,
    margin_top=115.0,
    margin_bottom=55.0,
    base_scale=1.0,
    line_grid_rows=1,
    letter_spacing=0.0,
    word_spacing=26.0,
    jitter_x=0.12,
    jitter_y=0.0,
    snap_to_grid=True,
    grid_step=None,
    wrap_tolerance=5.0,
    list_indent_squares=1,
    auto_line_spacing=True,
    page_sink=None,
    check_cancelled=None,
    max_pages=500,
):
    """Compose a rich document into Huawei PencilEngine-ready stroke geometry.

    A segment scale of 1.0 means exactly the calibration handwriting size.
    List markers are centered inside grid cells; ``list_indent_squares`` is the
    number of blank grid cells to leave before the marker cell.
    """
    lib = load_library(library_path)
    glyphs = lib["glyphs"]
    placement_y_offsets = lib.get("placement_y_offsets", {})
    grid_step = float(grid_step if grid_step is not None else _grid_step_from_library(lib))
    line_grid_rows = max(1, int(line_grid_rows))
    list_indent_squares = max(0, int(list_indent_squares))
    base_scale = max(0.35, float(base_scale))

    rng = random.Random(seed)
    warnings = _Warnings()
    pages = []
    current_page = _new_page(1)
    glyph_rng = random.Random(seed)
    check = check_cancelled or (lambda: None)
    baseline_y = float(margin_top)
    bottom_limit = float(page_height) - float(margin_bottom)

    def page():
        return current_page
    def finish_page():
        check()
        _canonicalize_pencilengine_strokes(current_page)
        if page_sink is None:
            pages.append(current_page)
        else:
            page_sink(current_page)
    def new_page():
        nonlocal baseline_y, current_page
        if current_page["page_number"] >= max_pages:
            raise ValueError(f"El documento supera {max_pages} páginas; divídelo en notas más pequeñas.")
        finish_page()
        current_page = _new_page(current_page["page_number"] + 1)
        baseline_y = float(margin_top)

    paragraphs = document.get("paragraphs", [])
    if not paragraphs:
        paragraphs = [{"segments": [{"text": "", "scale": 1.0}], "list": None}]

    for para in paragraphs:
        check()
        list_info = para.get("list") or None
        chars = _flatten_segments(para.get("segments", []), base_scale)
        items = _choose_char_items(chars, glyphs, glyph_rng, float(word_spacing), warnings)

        marker_items = []
        marker_scale = 1.0 * base_scale
        level = 0
        if list_info:
            level = min(6, max(0, int(list_info.get("level", 0))))
            marker_scale = max(0.35, float(list_info.get("marker_scale", 1.0)) * base_scale)
            marker_color = _normalize_hex_color(list_info.get("marker_color", "#000000"))
            marker_opacity = max(1.0, min(100.0, float(list_info.get("marker_opacity", 100.0))))
            marker_chars = [{"ch": ch, "scale": marker_scale, "color": marker_color, "opacity": marker_opacity} for ch in str(list_info.get("marker", "•"))]
            marker_items = list(_choose_char_items(marker_chars, glyphs, glyph_rng, float(word_spacing), warnings))

            # V13: each logical list group can carry its own base indentation.
            # This lets one numbered list start at square 0 while an independent
            # bullet list starts at square 1, without moving all lists together.
            para_indent = max(0, int(list_info.get("base_indent_squares", list_indent_squares)))
            marker_center = (para_indent + level + 0.5) * grid_step
            body_start_x = (para_indent + level + 1.0) * grid_step + 14.0
            first_x = body_start_x
            continuation_x = body_start_x
        else:
            marker_center = None
            first_x = float(margin_left)
            continuation_x = float(margin_left)

        right_limit = float(page_width) - float(margin_right) + float(wrap_tolerance) - 4.0
        lines = _layout_paragraph_lines(items, first_x, continuation_x, right_limit, float(letter_spacing))

        for line_idx, line in enumerate(lines):
            check()
            max_scale = _line_max_scale(line["items"], marker_scale if list_info and line_idx == 0 else None)
            rows = _rows_for_scale(max_scale, line_grid_rows, auto_line_spacing)

            descender = max((
                ((i["glyph"].get("bbox") or i["glyph"].get("raw_bbox") or [0, 0, 0, 0])[3]
                 + float(placement_y_offsets.get(i["ch"], 0))) * i["scale"]
                for i in line["items"] + (marker_items if line_idx == 0 else [])
                if i["kind"] == "glyph"
            ), default=0.0)
            if baseline_y + max(0.0, descender) > bottom_limit:
                new_page()

            if list_info and line_idx == 0 and marker_items:
                _logical, marker_left, marker_right = _sequence_metrics(marker_items, float(letter_spacing))
                marker_visual_width = marker_right - marker_left
                marker_x = float(marker_center) - marker_visual_width / 2.0 - marker_left
                _place_glyph_sequence(
                    marker_items,
                    marker_x,
                    baseline_y,
                    page(),
                    placement_y_offsets,
                    float(letter_spacing),
                    jitter_x,
                    jitter_y,
                    rng,
                )

            _place_glyph_sequence(
                line["items"],
                line["start_x"],
                baseline_y,
                page(),
                placement_y_offsets,
                float(letter_spacing),
                jitter_x,
                jitter_y,
                rng,
            )

            baseline_y += grid_step * rows if snap_to_grid else grid_step * rows

    finish_page()

    composition = {
        "format": "hinote-composed-strokes-v5-rich",
        "text": document.get("plain_text", ""),
        "source_glyph_library": str(library_path),
        "layout": {
            "page_width": page_width,
            "page_height": page_height,
            "margin_left": margin_left,
            "margin_right": margin_right,
            "margin_top": margin_top,
            "margin_bottom": margin_bottom,
            "base_scale": base_scale,
            "line_grid_rows": line_grid_rows,
            "letter_spacing": letter_spacing,
            "word_spacing": word_spacing,
            "seed": seed,
            "jitter_x": jitter_x,
            "jitter_y": jitter_y,
            "snap_to_grid": snap_to_grid,
            "grid_step": grid_step,
            "wrap_tolerance": wrap_tolerance,
            "list_indent_squares": list_indent_squares,
            "auto_line_spacing": auto_line_spacing,
        },
        "page_count": current_page["page_number"],
        "pages": pages,
        "warnings": warnings,
    }
    if page_sink is None and len(pages) == 1:
        composition["placements"] = pages[0]["placements"]
        composition["strokes"] = pages[0]["strokes"]
    return composition


def compose_text(
    library_path,
    text,
    *,
    seed=12345,
    page_width=1000.0,
    page_height=1600.0,
    margin_left=80.0,
    margin_right=80.0,
    margin_top=115.0,
    margin_bottom=55.0,
    scale=1.0,
    line_height=None,
    line_grid_rows=1,
    letter_spacing=0.0,
    word_spacing=26.0,
    jitter_x=0.12,
    jitter_y=0.0,
    snap_to_grid=True,
    grid_step=None,
    wrap_tolerance=5.0,
    list_indent_squares=1,
    auto_line_spacing=True,
):
    document = document_from_plain_text(text, scale=1.0)
    return compose_document(
        library_path,
        document,
        seed=seed,
        page_width=page_width,
        page_height=page_height,
        margin_left=margin_left,
        margin_right=margin_right,
        margin_top=margin_top,
        margin_bottom=margin_bottom,
        base_scale=scale,
        line_grid_rows=line_grid_rows,
        letter_spacing=letter_spacing,
        word_spacing=word_spacing,
        jitter_x=jitter_x,
        jitter_y=jitter_y,
        snap_to_grid=snap_to_grid,
        grid_step=grid_step,
        wrap_tolerance=wrap_tolerance,
        list_indent_squares=list_indent_squares,
        auto_line_spacing=auto_line_spacing,
    )


def save_composition(composition, output):
    Path(output).write_text(json.dumps(composition, ensure_ascii=False, indent=2), encoding="utf-8")
