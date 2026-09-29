"""Grid-aligned tables. Only one row of glyphs is planned at a time.

The 40px grid in Huawei's 675px thumbnail is independent of handwriting profiles.
Rows are indivisible; an over-height row is reported, never clipped or discarded.
"""
import math
import random
import re
import struct
import uuid

GRID = 40.0 / .675
HALF = GRID / 2
MAX_ROWS = 200
MAX_COLUMNS = 12


def number(value, low, high):
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError("Medida de tabla fuera de rango")
    return value


def half(value, low, high):
    value = number(value, low, high)
    if abs(value * 2 - round(value * 2)) > .00001:
        raise ValueError("Usa medidas de tabla en pasos de medio cuadro")
    return value


def validate_table(table):
    if not isinstance(table, dict) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", str(table.get("id", ""))):
        raise ValueError("Identificador de tabla inválido")
    widths, rows = table.get("widths"), table.get("rows")
    if not isinstance(widths, list) or not 1 <= len(widths) <= MAX_COLUMNS:
        raise ValueError("Cada tabla admite de 1 a 12 columnas")
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_ROWS:
        raise ValueError("Cada tabla admite de 1 a 200 filas")
    table["widths"] = [half(w, 1, 15.5) for w in widths]
    table["left"] = half(table.get("left", 1), .5, 15)
    if sum(table["widths"]) + table["left"] > 16.00001:
        raise ValueError("La tabla sale del ancho de la hoja; reduce las columnas o la sangría")
    table["gap"] = half(table.get("gap", 0), 0, 10)
    if table.get("mode", "standard") not in ("standard", "compact"):
        raise ValueError("Modo de escritura de tabla inválido")
    table["mode"] = table.get("mode", "standard")
    table["border"] = int(number(table.get("border", 2), 1, 10))
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", table.get("color", "#000000")):
        raise ValueError("Color de borde inválido")
    for row in rows:
        row["height"] = half(row.get("height", 1), .5, 25)
        if not isinstance(row.get("cells"), list) or len(row["cells"]) != len(widths):
            raise ValueError("Faltan celdas en una fila de la tabla")
        for cell in row["cells"]:
            if cell.get("align", "left") not in ("left", "center", "right") or cell.get("valign", "top") not in ("top", "middle", "bottom"):
                raise ValueError("Alineación de celda inválida")
            cell["size"] = number(cell.get("size", 0), 0, .73)
            if 0 < cell["size"] < .5:
                raise ValueError("El tamaño mínimo de tabla es 50 %")
    return table


def cell_segments(table):
    for row in table["rows"]:
        for cell in row["cells"]:
            yield from cell.get("segments", [])


def border_stroke(coords, table, rectangle=False):
    # Fixed native type-2 segment fields observed in the user's table sample.
    head = bytearray(48)
    struct.pack_into(">III", head, 0, 48, 0, 65536)
    meta = bytearray(116)
    struct.pack_into(">I", meta, 16, 0x01000000)
    struct.pack_into(">I", meta, 20, 7 if rectangle else 0)
    struct.pack_into(">I", meta, 68, 12)
    struct.pack_into(">f", meta, 96, table.get("border", 2) / 3)
    struct.pack_into(">I", meta, 104, 0x0040a000)
    points = [{"x": x, "y": y, "t": 0, "pressure": .98692 if rectangle else .88251,
               "extra1": 0., "extra2": 0., "extra3": .2, "state": 4, "index": float(i)}
              for i, (x, y) in enumerate(coords)]
    return {"header_hex": head.hex(), "metadata_hex": meta.hex(),
            "point_header_hex": struct.pack(">IIIII", 2, len(points), 36, 0, 0).hex(),
            "points": points, "color": table.get("color", "#000000"), "opacity": 100,
            "native_segment": True, "shape": "rectangle" if rectangle else "line", "id": uuid.uuid4().hex}


def _scaled_lines(cell, size, width, lib, seed, word_spacing, letter_spacing, warnings, check):
    from handwriting_composer import _flatten_segments, _choose_char_items, _layout_paragraph_lines, _sequence_metrics
    # Reselect the same variants on each fit attempt; never redraw random letters.
    rng = random.Random(seed)
    paragraphs = [[]]
    for seg in cell.get("segments", []):
        pieces = seg["text"].replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for i, piece in enumerate(pieces):
            if i: paragraphs.append([])
            paragraphs[-1].append({**seg, "text": piece, "scale": 1})
    result = []
    offsets = lib.get("placement_y_offsets", {})
    for segments in paragraphs:
        check()
        def normalized_items():
            for item in _choose_char_items(_flatten_segments(segments, size), lib["glyphs"], rng, word_spacing, warnings):
                if item["kind"] == "glyph":
                    item["origin_shift"] = -item["visual_left"]
                    item["visual_right"] -= item["visual_left"]
                    item["visual_left"] = 0
                yield item
        items = normalized_items()
        for line in _layout_paragraph_lines(items, 0, 0, width, letter_spacing):
            check()
            glyphs = [i for i in line["items"] if i["kind"] == "glyph"]
            tops, bottoms = [], []
            for item in glyphs:
                # Use actual ink, not a font or an assumed character advance.
                ys = [p["y"] for s in item["glyph"]["strokes"] for p in s["points"]]
                offset = float(offsets.get(item["ch"], 0))
                tops.append((min(ys) + offset) * size)
                bottoms.append((max(ys) + offset) * size)
                item["width_scale"] = size
            top, bottom = min(tops, default=-18 * size), max(bottoms, default=0)
            logical, left, right = _sequence_metrics(line["items"], letter_spacing)
            if right - min(0, left) > width + .01:
                return None
            baseline = max(0, -top) if not result else result[-1]["baseline"] + HALF
            # Keep two baseline slots per square. Whole-line bounding boxes can
            # overlap for a descender and an accent at different x coordinates;
            # that is not a reason to insert a blank half-square between lines.
            if baseline + max(0, bottom) > 25 * GRID:
                # The entire row must fit a page. Stop planning huge cells early;
                # Compacta can retry smaller sizes before composition reports it.
                return {"lines": [], "height": 26 * GRID, "size": size}
            result.append({**line, "baseline": baseline, "top": top, "bottom": bottom,
                           "left": left, "right": right, "size": size})
    return {"lines": result, "height": max((l["baseline"] + max(0, l["bottom"]) for l in result), default=0), "size": size}


def plan_row(table, row, lib, row_index, seed, word_spacing, letter_spacing, warnings, check):
    padding = GRID * .08 + table.get("border", 2) * .3
    minimum = row["height"] * GRID
    plans = []
    for col, (cell, squares) in enumerate(zip(row["cells"], table["widths"])):
        check()
        explicit = cell.get("size", 0)
        sizes = [explicit] if explicit else ([.73] if table["mode"] == "standard" else [.65, .60, .55, .50])
        plan = None
        for size in sizes:
            plan = _scaled_lines(cell, size, squares * GRID - 2 * padding, lib,
                                 seed + row_index * 977 + col, word_spacing, letter_spacing, warnings, check)
            if plan and plan["height"] + 2 * padding <= minimum + .001: break
        if plan is None:
            raise ValueError(f"Tabla: la celda {row_index+1}, {col+1} es demasiado estrecha. Amplía la columna o usa Compacta.")
        plans.append({**plan, "cell": cell})
    height = max(minimum, max(p["height"] for p in plans) + 2 * padding)
    height = math.ceil((height - .00001) / HALF) * HALF
    return {"index": row_index, "height": height, "cells": plans, "padding": padding}


def draw_row(table, row, y, page, lib, letter_spacing, rng):
    from handwriting_composer import _place_glyph_sequence
    x = table["left"] * GRID
    for squares, plan in zip(table["widths"], row["cells"]):
        cell, padding = plan["cell"], row["padding"]
        available = row["height"] - 2 * padding - plan["height"]
        valign = cell.get("valign", "top")
        top = y + padding + (available / 2 if valign == "middle" else available if valign == "bottom" else 0)
        for line in plan["lines"]:
            align = cell.get("align", "left")
            free = squares * GRID - 2 * padding - (line["right"] - line["left"])
            origin = x + padding - min(0, line["left"])
            if align != "left": origin = x + padding - line["left"] + free * (.5 if align == "center" else 1)
            _place_glyph_sequence(line["items"], origin, top + line["baseline"], page,
                                  lib.get("placement_y_offsets", {}), letter_spacing, 0, 0, rng)
        x += squares * GRID


def draw_borders(table, top, boundaries, page, row_indexes):
    left = table["left"] * GRID
    right = left + sum(table["widths"]) * GRID
    bottom = boundaries[-1]
    page["strokes"].append(border_stroke([(left,top),(left,bottom),(right,bottom),(right,top),(left,top)], table, True))
    for y in boundaries[:-1]:
        page["strokes"].append(border_stroke([(left,y),(right,y)], table))
    x = left
    for w in table["widths"][:-1]:
        x += w * GRID
        page["strokes"].append(border_stroke([(x,top),(x,bottom)], table))
    page.setdefault("tables", []).append({"id": table["id"], "x": left, "y": top, "width": right-left,
                                         "height": bottom-top, "rows": row_indexes})
