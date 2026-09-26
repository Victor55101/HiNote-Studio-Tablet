"""Disk-backed, cancellable mobile pipeline; WebView never receives full geometry."""
from __future__ import annotations
import json
import math
import re
import shutil
import uuid
from pathlib import Path
from handwriting_composer import compose_document
from mobile_hinote_writer import build_hinote_multi
from pencilengine_writer import write_pencilengine
from validate_hinote import validate_hinote
MAX_CHARACTERS = 200_000
MAX_PAGES = 500
MAX_CACHE_BYTES = 512 * 1024 * 1024

def _number(value, low, high):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Los ajustes deben contener números finitos.")
    return max(low, min(high, number))

def _settings(raw):
    s = json.loads(raw or "{}")
    return {"seed": int(_number(s.get("seed", 12345), 0, 2**31-1)),
        "letter_spacing": _number(s.get("letter_spacing", 0), -8, 8),
        "word_spacing": _number(s.get("word_spacing", 26), 12, 60),
        "line_grid_rows": int(_number(s.get("line_grid_rows", 1), 1, 4)),
        "list_indent_squares": int(_number(s.get("list_indent_squares", 1), 0, 6)),
        "wrap_tolerance": 5.0, "margin_bottom": 55.0,
        "auto_line_spacing": bool(s.get("auto_line_spacing", True))}

def _document(raw):
    if len(raw) > 4_000_000:
        raise ValueError("El documento tiene demasiado formato; divídelo en varias notas.")
    doc = json.loads(raw)
    paragraphs = doc.get("paragraphs", [])
    if not isinstance(paragraphs, list) or len(paragraphs) > 10_000:
        raise ValueError("El documento supera 10 000 párrafos.")
    chars = segments = 0
    for para in paragraphs:
        for seg in para.get("segments", []):
            if not isinstance(seg.get("text", ""), str):
                raise ValueError("El texto de un segmento no es válido.")
            chars += len(seg.get("text", "")); segments += 1
            seg["scale"] = _number(seg.get("scale", 1), .35, 2)
            seg["opacity"] = _number(seg.get("opacity", 100), 1, 100)
        info = para.get("list")
        if info:
            info["level"] = int(_number(info.get("level", 0), 0, 6))
            info["base_indent_squares"] = int(_number(info.get("base_indent_squares", 1), 0, 6))
            info["marker_scale"] = _number(info.get("marker_scale", 1), .35, 2)
            info["marker_opacity"] = _number(info.get("marker_opacity", 100), 1, 100)
            if len(str(info.get("marker", ""))) > 16:
                raise ValueError("Marcador de lista demasiado largo.")
    if chars + max(0,len(paragraphs)-1) > MAX_CHARACTERS or segments > 20_000:
        raise ValueError("La nota supera 200 000 caracteres o 20 000 segmentos; divídela en varias notas.")
    return doc

def _check(token):
    if token is not None and token.isCancelled():
        raise InterruptedError("Operación cancelada")

def _json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

def _snapshot(cache_dir, snapshot_id):
    if not re.fullmatch(r"[0-9a-f]{32}", snapshot_id):
        raise ValueError("Vista previa no válida. Actualiza la vista.")
    path = Path(cache_dir) / snapshot_id
    if not (path / "manifest.json").is_file():
        raise ValueError("La vista previa ya no está disponible. Actualízala.")
    return path

def compose(project_dir, cache_dir, document_json, settings_json, token=None):
    _check(token)
    doc, settings = _document(document_json), _settings(settings_json)
    project, cache = Path(project_dir), Path(cache_dir)
    snapshot_id = uuid.uuid4().hex
    work = cache / snapshot_id
    work.mkdir(parents=True)
    cache_bytes = 0
    stroke_counts = []
    try:
        def sink(page):
            nonlocal cache_bytes
            _check(token)
            index = page["page_number"] - 1
            stroke_counts.append(len(page["strokes"]))
            if shutil.disk_usage(cache).free < 20 * 1024 * 1024:
                raise ValueError("No queda suficiente espacio para generar la nota.")
            binary = work / f"page-{index}.bin"
            write_pencilengine(page, project / "template_1stroke.hinote", binary)
            # Only the preview is rounded; the BIN keeps all original points.
            preview = {"strokes": [[s.get("color", "#000000"), s.get("opacity", 100),
                [[round(p["x"],3),round(p["y"],3),round(p["pressure"],4)] for p in s["points"]]]
                for s in page["strokes"]]}
            preview_path = work / f"page-{index}.json"
            preview_path.write_text(_json(preview), encoding="utf-8")
            cache_bytes += binary.stat().st_size + preview_path.stat().st_size
            if cache_bytes > MAX_CACHE_BYTES:
                raise ValueError("La nota supera el espacio de trabajo de 512 MB; divídela en varias notas.")
            if token is not None: token.onProgress(index + 1)
        result = compose_document(project / "glyphs_v23.json", doc, **settings,
            page_sink=sink, check_cancelled=lambda: _check(token), max_pages=MAX_PAGES)
        _check(token)
        manifest = {"snapshot": snapshot_id, "page_count": result["page_count"],
                    "layout": result["layout"], "warnings": result["warnings"],
                    "stroke_counts": stroke_counts}
        (work / "manifest.json").write_text(_json(manifest), encoding="utf-8")
        return _json(manifest)
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise

def snapshot_info(cache_dir, snapshot_id):
    return (_snapshot(cache_dir, snapshot_id)/"manifest.json").read_text(encoding="utf-8")

def page_preview(cache_dir, snapshot_id, index):
    work = _snapshot(cache_dir, snapshot_id)
    info = json.loads((work/"manifest.json").read_text(encoding="utf-8"))
    if not 0 <= index < info["page_count"]: raise ValueError("Página fuera de rango")
    return (work/f"page-{index}.json").read_text(encoding="utf-8")

def export_snapshot(project_dir, cache_dir, snapshot_id, title, grid, output_path, token=None,
                    images_json="[]", page_count=0, export_dir=None):
    work = _snapshot(cache_dir, snapshot_id)
    info = json.loads((work/"manifest.json").read_text(encoding="utf-8"))
    count = max(info["page_count"], int(page_count))
    if not 1 <= count <= MAX_PAGES:
        raise ValueError("El documento supera 500 páginas")
    rendered = Path(export_dir) if export_dir else work
    if export_dir and rendered.resolve().parent != Path(cache_dir).resolve():
        raise ValueError("Directorio de exportación inválido")
    images = _export_images(images_json, count, rendered)
    stroke_counts = info.get("stroke_counts", [1] * info["page_count"])
    bins = [work/f"page-{i}.bin" if i < info["page_count"] and stroke_counts[i] else None for i in range(count)]
    thumbs = [rendered/f"page-{i}-{'grid' if grid else 'plain'}.jpg" for i in range(count)]
    output = Path(output_path)
    try:
        _check(token)
        build_hinote_multi(Path(project_dir)/"template_1stroke.hinote", bins, output,
            title=title or "Nueva nota", thumbnails=thumbs, images=images, check_cancelled=lambda: _check(token))
        if not validate_hinote(output, check_cancelled=lambda: _check(token), quiet=True):
            raise RuntimeError("La nota generada no pasó la validación local")
        _check(token)
        return str(output)
    except BaseException:
        output.unlink(missing_ok=True)
        raise

def _export_images(raw, count, directory):
    """Only native-prepared image files inside this isolated export are trusted."""
    records = json.loads(raw)
    if not isinstance(records, list) or len(records) > 200:
        raise ValueError("La nota admite hasta 200 imágenes")
    pages = [[] for _ in range(count)]
    ids = set()
    for item in records:
        page = item.get("page")
        if not isinstance(page, int) or not 0 <= page < count:
            raise ValueError("Página de imagen inválida")
        identity = item.get("id", "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", identity) or identity in ids:
            raise ValueError("Identificador de imagen inválido o repetido")
        ids.add(identity)
        source = Path(item["path"]).resolve()
        if not source.is_relative_to(directory.resolve()) or not source.is_file() or source.suffix not in (".jpg", ".png"):
            raise ValueError("Archivo de imagen inválido")
        clean = {"path": str(source)}
        for key, low, high in (("x",-3200,3200),("y",-3200,3200),("width",1,3200),("height",1,3200),("angle",-360,360)):
            value = float(item[key])
            if not math.isfinite(value) or not low <= value <= high:
                raise ValueError("Transformación de imagen inválida")
            clean[key] = value
        pages[page].append(clean)
        if len(pages[page]) > 20:
            raise ValueError("Cada página admite hasta 20 imágenes")
    return pages

def remove_snapshot(cache_dir, snapshot_id):
    if re.fullmatch(r"[0-9a-f]{32}", snapshot_id):
        shutil.rmtree(Path(cache_dir)/snapshot_id, ignore_errors=True)
