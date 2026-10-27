"""Local glyph transport and export of the exact live editor geometry.

Only character references cross the bridge, never user-provided stroke binaries.
Original point metadata and pressures are recovered from the active calibration.
"""
import math
import random
from pathlib import Path
import calibration
from handwriting_composer import (_flatten_segments, _source_offsets,
    _choose_char_items, _place_glyph_sequence, _canonicalize_pencilengine_strokes,
    _grid_step_from_library)
from pencilengine_width import native_width


def live_library(project, identity="original"):
    library, fallback, revision = calibration.resolve(Path(project), identity)
    return {"profile": identity, "revision": revision, "fallback": sorted(fallback),
        "grid": _grid_step_from_library(library),
        "offsets": library.get("placement_y_offsets", {}),
        "glyphs": {ch: [{"bbox": g.get("bbox") or g.get("raw_bbox"),
            "advance": g.get("advance", 35),
            "strokes": [[native_width(s), [[p["x"], p["y"], p["pressure"]] for p in s["points"]]]
                for s in g["strokes"]]} for g in variants]
            for ch, variants in library["glyphs"].items()}}


def compose_live(document, library, settings, sink, check):
    plan = document["pro_layout"]
    if not isinstance(plan, dict) or plan.get("format") != "hinote-live-v1":
        raise ValueError("La composición Pro no es válida")
    pages = plan.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 500:
        raise ValueError("La nota Pro admite de 1 a 500 páginas")
    expected, warnings = {}, []
    paragraphs = document["paragraphs"]
    rng = random.Random(0)
    for index, para in enumerate(paragraphs):
        if para.get("type") not in (None, "text"):
            raise ValueError("Utiliza la vista clásica para los objetos de esta nota")
        segments = para.get("segments", [])
        source = zip(_choose_char_items(_flatten_segments(segments, 1), library["glyphs"], rng,
            settings["word_spacing"], warnings), _source_offsets(segments))
        for item, offset in source:
            if item["kind"] == "glyph": expected[index, offset] = item
        info = para.get("list") or {}
        if info and not info.get("hide_marker"):
            segments = [{"text": info.get("marker", "•"), "scale": info.get("marker_scale", 1),
                "color": info.get("marker_color", "#000000"), "opacity": info.get("marker_opacity", 100),
                "thickness": info.get("marker_thickness", 0), **{k: info.get("marker_"+k, False)
                    for k in ("bold", "italic", "underline")}}]
            source = zip(_choose_char_items(_flatten_segments(segments, 1), library["glyphs"], rng,
                settings["word_spacing"], warnings), _source_offsets(segments))
            for item, offset in source:
                if item["kind"] == "glyph": expected[index, -offset-1] = item
    for number, entries in enumerate(pages, 1):
        check()
        if not isinstance(entries, list): raise ValueError("Página Pro inválida")
        page = {"page_number": number, "strokes": [], "placements": [],
            "source_end": {"line": len(paragraphs), "offset": 0}}
        for entry in entries:
            check()
            if not isinstance(entry, list) or len(entry) != 5: raise ValueError("Glifo Pro inválido")
            p, offset, variant, x, baseline = entry
            if any(type(v) is not int for v in (p, offset, variant)):
                raise ValueError("Referencia Pro inválida")
            item = expected.pop((p, offset), None)
            if item is None: raise ValueError("El texto cambió; vuelve a generar el documento")
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in (x, baseline)):
                raise ValueError("Coordenadas Pro inválidas")
            if not -100 <= x <= 1100 or not -100 <= baseline <= 1700:
                raise ValueError("El trazo está fuera de la página")
            variants = library["glyphs"][item["ch"]]
            if not 0 <= variant < len(variants): raise ValueError("Variante Pro inválida")
            item.update(variant=variant, glyph=variants[variant])
            # x and baseline already include italic bounds, script and offsets.
            item["baseline_shift"] = 0
            item["visual_left"] = (item["glyph"].get("bbox") or [0,0,0,0])[0]*item["scale"]
            item["visual_right"] = (item["glyph"].get("bbox") or [0,0,0,0])[2]*item["scale"]
            _place_glyph_sequence([item], x, baseline, page, {}, 0, 0, 0, rng)
        _canonicalize_pencilengine_strokes(page)
        sink(page)
    if expected: raise ValueError("La composición Pro está incompleta")
    return {"page_count": len(pages), "layout": {"page_width": 1000, "page_height": 1600,
        "grid_step": _grid_step_from_library(library), "engine": "hinote-live-v1"}, "warnings": warnings}
