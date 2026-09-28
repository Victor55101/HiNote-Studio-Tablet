"""Versioned, local handwriting profiles and bounded HiNote calibration import.

Guide labels are raster images, never input ink. The native reader decodes each
guide's checksummed visual label so a Huawei round trip need not preserve custom
JSON metadata. No OCR is used: an explicit template maps cells to characters.
"""
from __future__ import annotations
import gzip
import json
import math
import os
import re
import shutil
import struct
import unicodedata
import uuid
from functools import lru_cache
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from handwriting_composer import load_library
from mobile_hinote_writer import build_hinote_multi
from pencilengine_reader import read_pencilengine, validate_pencilengine
from validate_hinote import validate_hinote

BASE = "abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789áéíóúüÜÁÉÍÓÚ.;:,?¿()[]{}-_/\\”“'\"+=%#@•*><!¡&$°"
GROUPS = {
    "base": {"name": "Español y signos básicos", "chars": BASE},
    "math": {"name": "Matemáticas", "chars": "×÷±≤≥≠≈√∞∑∫∂∆πθαβγλμσΩ²³"},
    "code": {"name": "Programación y redes", "chars": "|^~`→←↑↓↔¬"},
    "type": {"name": "Monedas y tipografía", "chars": "€£¥¢ºª…–—·«»‘’©®™§"},
}
MAX_CHARS, MAX_PAGES, MAX_PROFILES = 256, 24, 20
MAX_ZIP, MAX_EXPANDED, MAX_BANK = 32 * 1024**2, 64 * 1024**2, 40 * 1024**2
MAX_POINTS = 180_000
ROWS, COLS = 12, 8
LEFT, TOP, CELL_W, CELL_H, BASELINE = 152.0, 120.0, 104.0, 108.0, 72.0
FORMAT = "hinote-profile-v1"
# Type 2 is used by Notes for native straight segments, including handwriting
# in the original bank and the user's completed ! / ¡ template. Keep it intact.
SUPPORTED_POINT_TYPES = (0, 2)
_ID = re.compile(r"[a-f0-9]{32}\Z")


def check(token):
    if token is not None and token.isCancelled():
        raise InterruptedError("Operación cancelada")


def js(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def chars(value, limit=MAX_CHARS):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Lista de caracteres inválida")
    result = []
    for ch in unicodedata.normalize("NFC", value):
        if ch.isspace():
            continue
        if unicodedata.category(ch)[0] not in "LNPS":
            raise ValueError("Escribe caracteres completos; no marcas combinantes, controles ni emoji compuestos")
        if ch not in result:
            result.append(ch)
    if len(result) > limit:
        raise ValueError("Cada perfil o plantilla admite hasta 256 caracteres")
    return result


def expected(options):
    selected = options.get("groups", ["base"])
    if not isinstance(selected, list) or any(g not in GROUPS for g in selected):
        raise ValueError("Grupo de caracteres inválido")
    return chars("".join(GROUPS[g]["chars"] for g in selected) + str(options.get("custom", "")))


def profile_dir(project):
    path = Path(project) / "profiles-v1"
    path.mkdir(parents=True, exist_ok=True)
    return path


def profile_path(project, identity):
    if not isinstance(identity, str) or not _ID.fullmatch(identity):
        raise ValueError("Perfil inválido")
    return profile_dir(project) / (identity + ".hnprofile")


def original(project):
    return load_library(Path(project) / "glyphs_v24.json")


def read_gzip(path, limit=MAX_BANK):
    with gzip.open(path, "rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("La calibración supera el tamaño permitido")
    return json.loads(raw)


@lru_cache(maxsize=1)
def _cached(path, mtime, size):
    return read_gzip(path)


def load_profile(project, identity):
    if identity == "original":
        bank = original(project)
        return {**bank, "format": FORMAT, "id": "original", "name": "Original", "revision": "v24",
                "expected": chars(BASE), "diagnostics": []}
    path = profile_path(project, identity)
    if not path.is_file():
        raise ValueError("La calibración elegida ya no está disponible. Selecciona Original.")
    stat = path.stat()
    return _cached(str(path), stat.st_mtime_ns, stat.st_size)


def atomic_gzip(path, value, token=None):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".part")
    try:
        with temporary.open("wb") as raw:
            with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as stream:
                chunks, length, total = [], 0, 0
                for piece in json.JSONEncoder(ensure_ascii=False, separators=(",", ":"), allow_nan=False).iterencode(value):
                    chunks.append(piece);length += len(piece)
                    if length >= 65536:
                        check(token)
                        payload = "".join(chunks).encode("utf-8");total += len(payload)
                        if total > MAX_BANK: raise ValueError("El perfil supera el tamaño máximo")
                        stream.write(payload);chunks=[];length=0
                payload = "".join(chunks).encode("utf-8")
                if total + len(payload) > MAX_BANK: raise ValueError("El perfil supera el tamaño máximo")
                check(token)
                stream.write(payload)
            raw.flush()
            os.fsync(raw.fileno())
        check(token)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def name(raw):
    result = str(raw or "Mi letra").strip()
    result = "".join(c for c in result if unicodedata.category(c)[0] != "C")[:60]
    return result or "Mi letra"


def summary(project, profile):
    own = profile["glyphs"]
    requested = chars("".join(profile.get("expected", [])) + "".join(own))
    # Basic coverage is always visible, even for supplementary or custom-only notes.
    scope = chars(BASE + "".join(requested), MAX_CHARS + len(BASE))
    missing = [c for c in scope if not own.get(c)]
    base = original(project)["glyphs"]
    fallback = [c for c in missing if base.get(c)] if profile["id"] != "original" else []
    return {"id": profile["id"], "name": profile["name"], "revision": profile["revision"],
            "protected": profile["id"] == "original", "found": list(own), "missing": missing,
            "fallback": fallback, "unavailable": [c for c in missing if c not in fallback],
            "variants": {c: len(v) for c, v in own.items()}, "expected": requested,
            "incomplete": [c for c, v in own.items() if len(v) < 8],
            "diagnostics": profile.get("diagnostics", [])[:80]}


def catalog(project):
    profiles = [summary(project, load_profile(project, "original"))]
    problems = []
    for path in sorted(profile_dir(project).glob("*.hnprofile"))[:MAX_PROFILES]:
        try:
            profiles.append(summary(project, load_profile(project, path.stem)))
        except Exception:
            problems.append("No se pudo leer un perfil guardado: " + path.stem)
    return {"profiles": profiles, "groups": GROUPS, "problems": problems}


def resolve(project, identity):
    profile = load_profile(project, identity)
    if identity == "original":
        return profile, set(), profile["revision"]
    base = original(project)
    own = profile["glyphs"]
    merged = {**base, "glyphs": {**base["glyphs"], **own},
              "placement_y_offsets": {**base.get("placement_y_offsets", {}), **profile.get("placement_y_offsets", {})}}
    return merged, set(base["glyphs"]) - set(own), profile["revision"]


def save_profile(project, profile, token=None):
    check(token)
    identity = profile["id"]
    path = profile_path(project, identity)
    if not path.exists() and len(list(profile_dir(project).glob("*.hnprofile"))) >= MAX_PROFILES:
        raise ValueError("Puedes guardar hasta 20 perfiles; respalda y elimina uno antes de añadir otro")
    if shutil.disk_usage(path.parent).free < 64 * 1024**2:
        raise ValueError("Necesitas al menos 64 MB libres para guardar la calibración")
    atomic_gzip(path, profile, token)
    _cached.cache_clear()


def new_profile(glyphs, required, title, offsets=None):
    return {"format": FORMAT, "id": uuid.uuid4().hex, "revision": uuid.uuid4().hex,
            "name": name(title), "expected": chars("".join(required)), "glyphs": glyphs,
            "coordinate_system": {"page_width": 1000., "page_height": 1600., "grid_dy": 117.6},
            "placement_y_offsets": offsets or {}, "diagnostics": []}


def template_plan(options):
    requested = expected(options)
    if not requested:
        raise ValueError("Selecciona un grupo o escribe los caracteres de la plantilla")
    identity = uuid.uuid4().hex
    count = math.ceil(len(requested) / ROWS)
    return [{"v": 1, "id": identity, "page": i, "pages": count, "chars": "".join(requested[i*ROWS:(i+1)*ROWS])}
            for i in range(count)]


def validate_guide(guide):
    if (not isinstance(guide, dict) or guide.get("v") != 1 or not _ID.fullmatch(str(guide.get("id", "")))
            or type(guide.get("pages")) is not int or not 1 <= guide["pages"] <= MAX_PAGES
            or type(guide.get("page")) is not int or not 0 <= guide["page"] < guide["pages"]):
        raise ValueError("Identificación de plantilla inválida")
    row_chars = chars(guide.get("chars", ""))
    if not 1 <= len(row_chars) <= ROWS or "".join(row_chars) != guide["chars"]:
        raise ValueError("Filas de plantilla inválidas")
    return row_chars


def build_template(project, work, plan_json, token=None):
    work = Path(work)
    plan = json.loads(plan_json)
    images = []
    for i, guide in enumerate(plan):
        check(token)
        validate_guide(guide)
        images.append([{"path": str(work / f"guide-{i}.png"), "x": 0, "y": 0,
                        "width": 1000, "height": 1600, "angle": 0}])
    target = work / "Plantilla-HiNote.hinote"
    build_hinote_multi(Path(project) / "template_1stroke.hinote", [None]*len(plan), target,
        title="Calibración HiNote · " + plan[0]["id"][:8], images=images,
        thumbnails=[work / f"thumb-{i}.jpg" for i in range(len(plan))], check_cancelled=lambda: check(token))
    if not validate_hinote(target, quiet=True, check_cancelled=lambda: check(token)):
        raise ValueError("No se pudo validar la plantilla")
    return str(target)


class SafeNote:
    def __init__(self, path):
        if Path(path).stat().st_size > MAX_ZIP:
            raise ValueError("La calibración admite archivos de hasta 32 MB")
        self.zip = ZipFile(path)
        try:
            entries = self.zip.infolist()
            names = [e.filename for e in entries]
            if len(entries) > 250 or len(names) != len(set(names)) or sum(e.file_size for e in entries) > MAX_EXPANDED:
                raise ValueError("El archivo contiene demasiados datos o entradas duplicadas")
            for e in entries:
                p = PurePosixPath(e.filename)
                if p.is_absolute() or ".." in p.parts or "\\" in e.filename or e.flag_bits & 1 or e.file_size > 16 * 1024**2:
                    raise ValueError("Estructura de calibración no admitida")
        except BaseException:
            self.zip.close()
            raise

    def close(self):
        self.zip.close()

    def read(self, entry, limit):
        if self.zip.getinfo(entry).file_size > limit:
            raise ValueError("Un elemento de la calibración es demasiado grande")
        with self.zip.open(entry) as stream:
            raw = stream.read(limit+1)
        if len(raw) > limit:
            raise ValueError("Elemento demasiado grande")
        return raw

    def page(self, entry):
        raw = self.read(entry, 256_000)
        if raw.startswith(b"\x1f\x8b"):
            from io import BytesIO
            with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
                raw = stream.read(256_001)
        if len(raw) > 256_000:
            raise ValueError("Metadatos demasiado grandes")
        return json.loads(raw)


def prepare_import(source, work, token=None):
    """Extract only the bounded guide images and ink named by active pages."""
    work = Path(work)
    note = SafeNote(source)
    try:
        entries = [n for n in note.zip.namelist() if n.startswith("pages/") and n.endswith(".jhinote")]
        if not 1 <= len(entries) <= MAX_PAGES:
            raise ValueError("La plantilla debe tener entre 1 y 24 páginas")
        pages = sorted((note.page(n)["customNotePageContent"] for n in entries), key=lambda p: p.get("pageNumber", 0))
        result = []
        for i, p in enumerate(pages):
            check(token)
            if p.get("pageNumber") != i+1 or p.get("isDelete", 0) or abs(float(p.get("pageRatio", 0))-.625) > .001 or p.get("pageOrientation", 0):
                raise ValueError("Cambió el orden, orientación o tamaño de las páginas")
            elements = [e for e in p.get("pageElement", []) if not e.get("isDelete", 0)]
            if len(elements) != 1 or elements[0].get("elementType") != 1:
                raise ValueError(f"Página {i+1}: falta la guía oficial o hay imágenes adicionales")
            im = elements[0]
            for key, target in (("positionX", 0), ("positionY", 0), ("width", 1), ("height", 1), ("angle", 0), ("scale", 1)):
                value = float(im.get(key, target))
                if not math.isfinite(value) or abs(value-target) > .001:
                    raise ValueError(f"Página {i+1}: la guía fue movida, girada o redimensionada")
            image_name = PurePosixPath(im.get("filePath", "")).name
            guide_path = work / f"input-guide-{i}.image"
            guide_path.write_bytes(note.read("files/"+image_name, 8*1024**2))
            attachments = [a for a in p.get("attachment", []) if not a.get("isDelete", 0)]
            if any(a.get("attachType") != 0 for a in attachments) or len(attachments) > 1:
                raise ValueError("La calibración contiene adjuntos no admitidos")
            binary = None
            if attachments:
                binary = work / f"input-{i}.bin"
                binary.write_bytes(note.read("files/"+PurePosixPath(attachments[0]["filePath"]).name, 12*1024**2))
                count, points = validate_pencilengine(binary, lambda: check(token))
                if count > 5000 or points > 40_000:
                    raise ValueError("Una página contiene demasiados trazos; elimina los garabatos y repite")
            result.append({"guide": str(guide_path), "binary": str(binary) if binary else None})
        (work / "prepared.json").write_text(js(result), encoding="utf-8")
        return js(result)
    finally:
        note.close()


def _finite(value, low, high):
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError("La calibración contiene datos de trazo fuera de rango")
    return value


def _validate_ink_format(metadata, point_type, context=""):
    tool = struct.unpack_from(">I", metadata, 68)[0]
    if tool != 12:
        raise ValueError(f"{context}herramienta no compatible (código {tool}). Usa Rotulador para esta muestra.")
    if point_type not in SUPPORTED_POINT_TYPES:
        raise ValueError(f"{context}formato de trazo todavía no compatible (tipo {point_type}). Conserva el .hinote para revisar esta muestra.")


def extract(project, work, guides_json, title, target="", token=None):
    work = Path(work)
    pages = json.loads((work / "prepared.json").read_text(encoding="utf-8"))
    guides = json.loads(guides_json)
    if not guides or len(guides) != len(pages):
        raise ValueError("Faltan guías de calibración")
    glyphs, required, diagnostics = {}, [], []
    total_points = 0
    for i, (page, guide) in enumerate(zip(pages, guides)):
        check(token)
        row_chars = validate_guide(guide)
        if guide["id"] != guides[0]["id"] or guide["page"] != i or guide["pages"] != len(pages):
            raise ValueError("Las páginas están incompletas, repetidas, desordenadas o pertenecen a otra plantilla")
        if set(required) & set(row_chars):
            raise ValueError("Un carácter aparece en varias filas")
        required.extend(row_chars)
        if len(required) > MAX_CHARS:
            raise ValueError("Demasiados caracteres")
        cells = {}
        document = read_pencilengine(page["binary"]) if page["binary"] else None
        for stroke in document.strokes if document else []:
            check(token)
            if not stroke.points:
                continue
            total_points += len(stroke.points)
            if total_points > MAX_POINTS:
                raise ValueError("Demasiados puntos de escritura en la calibración")
            metadata = bytes.fromhex(stroke.metadata_hex)
            _validate_ink_format(metadata, stroke.point_type, f"Página {i+1}, trazo {stroke.number+1}: ")
            _finite(struct.unpack_from(">f", metadata, 96)[0], .03, 10)
            if not any(p.state == 4 for p in stroke.points) and stroke.points[0].state != 6:
                raise ValueError("Trazo no reconocido")
            located = set()
            for p in stroke.points:
                _finite(p.x, 0, 1000); _finite(p.y, 0, 1600)
                _finite(p.pressure, 0, 1.1)
                for v in (p.extra1, p.extra2, p.extra3): _finite(v, -1e7, 1e7)
                col, row = int(math.floor((p.x-LEFT)/CELL_W)), int(math.floor((p.y-TOP)/CELL_H))
                if not 0 <= col < COLS or not 0 <= row < len(row_chars):
                    raise ValueError(f"Página {i+1}: hay trazos fuera de las celdas; elimínalos y vuelve a importar")
                located.add((row, col))
            if len(located) != 1:
                raise ValueError(f"Página {i+1}: un trazo cruza dos celdas")
            row, col = next(iter(located))
            cell = cells.setdefault((row, col), [])
            if len(cell) >= 64:
                raise ValueError("Hay demasiados trazos en una celda")
            x0 = LEFT+col*CELL_W+CELL_W/2
            y0 = TOP+row*CELL_H+BASELINE
            cell.append({"header_hex": stroke.header_hex, "metadata_hex": stroke.metadata_hex,
                         "point_header_hex": stroke.point_header_hex,
                         "points": [{"x": p.x-x0, "y": p.y-y0, "dt": 0, "pressure": p.pressure,
                                     "extra1": p.extra1, "extra2": p.extra2, "extra3": p.extra3,
                                     "state": p.state, "index": p.index} for p in stroke.points]})
        for row, ch in enumerate(row_chars):
            variants = []
            for col in range(COLS):
                strokes = cells.get((row, col))
                if not strokes: continue
                points = [p for s in strokes for p in s["points"]]
                xs, ys = [p["x"] for p in points], [p["y"] for p in points]
                # Cell position must not indent the glyph or move it outside the
                # page at large text sizes. Only y retains the guide baseline.
                left = min(xs)
                for point in points: point["x"] -= left
                bounds = [0., min(ys), max(xs)-left, max(ys)]
                variants.append({"source_page": i+1, "source_row": row, "source_col": col,
                                 "bbox": bounds, "advance": max(12., max(xs)-min(xs)+4.8),
                                 "baseline_method": "template-v1-baseline", "strokes": strokes})
            if variants: glyphs[ch] = variants
            if len(variants) < 8: diagnostics.append(f"{ch}: {len(variants)}/8 variantes")
        if token is not None: token.onProgress(i+1)
    if not glyphs:
        raise ValueError("La plantilla está vacía; escribe los caracteres en Huawei Notes antes de importarla")
    profile = new_profile(glyphs, required, title, {c: 0 for c in glyphs})
    profile["diagnostics"] = diagnostics
    return stage(project, work, profile, target, token)


def stage(project, work, profile, target, token=None):
    check(token)
    replace_count = 0
    target_revision = None
    if target:
        prior = load_profile(project, target)
        replace_count = len(set(prior["glyphs"]) & set(profile["glyphs"]))
        # Original can be extended only by making a separate, named copy.
        profile = {**profile, "id": prior["id"] if target != "original" else uuid.uuid4().hex,
                   "name": prior["name"] if target != "original" else "Original ampliada",
                   "expected": chars("".join(prior["expected"]) + "".join(profile["expected"])),
                   "glyphs": {**prior["glyphs"], **profile["glyphs"]},
                   "placement_y_offsets": {**prior.get("placement_y_offsets", {}), **profile.get("placement_y_offsets", {})}}
        target_revision = prior["revision"]
    atomic_gzip(Path(work)/"candidate.hnprofile", profile, token)
    (Path(work)/"commit.json").write_text(js({"target": target, "revision": target_revision}), encoding="utf-8")
    return js({"detail": summary(project, profile), "replaced": replace_count,
               "copiesOriginal": target == "original", "review": True})


def validate_profile(profile):
    """Reject untrusted backup data before it can reach the renderer or writer."""
    if not isinstance(profile, dict) or profile.get("format") != FORMAT:
        raise ValueError("Respaldo de calibración no reconocido")
    glyphs = profile.get("glyphs")
    if not isinstance(glyphs, dict) or not 1 <= len(glyphs) <= MAX_CHARS:
        raise ValueError("Cantidad de caracteres inválida")
    total = 0
    if len(chars("".join(glyphs))) != len(glyphs) or any(len(ch) != 1 for ch in glyphs):
        raise ValueError("Identificadores de caracteres inválidos")
    for variants in glyphs.values():
        if not isinstance(variants, list) or not 1 <= len(variants) <= 8:
            raise ValueError("Cada carácter admite de 1 a 8 variantes")
        for g in variants:
            if len(g.get("bbox", [])) != 4: raise ValueError("Límites de carácter inválidos")
            for v in g["bbox"]: _finite(v, -500, 500)
            if g["bbox"][0] > g["bbox"][2] or g["bbox"][1] > g["bbox"][3]: raise ValueError("Límites invertidos")
            _finite(g.get("advance"), 0, 600)
            strokes = g.get("strokes")
            if not isinstance(strokes, list) or not 1 <= len(strokes) <= 64: raise ValueError("Trazos inválidos")
            for s in strokes:
                for key, length in (("header_hex", 48), ("metadata_hex", 116), ("point_header_hex", 20)):
                    if len(bytes.fromhex(s.get(key, ""))) != length: raise ValueError("Metadatos de trazo inválidos")
                metadata = bytes.fromhex(s["metadata_hex"])
                point_type = struct.unpack_from(">I", bytes.fromhex(s["point_header_hex"]), 0)[0]
                _validate_ink_format(metadata, point_type, "Respaldo: ")
                _finite(struct.unpack_from(">f", metadata, 96)[0], .03, 10)
                pts = s.get("points")
                if not isinstance(pts, list) or not 1 <= len(pts) <= 5000: raise ValueError("Puntos inválidos")
                total += len(pts)
                if total > MAX_POINTS: raise ValueError("Demasiados puntos")
                for p in pts:
                    _finite(p.get("x"), -500, 500); _finite(p.get("y"), -500, 500)
                    _finite(p.get("pressure"), 0, 1.1)
                    for key in ("extra1", "extra2", "extra3"): _finite(p.get(key), -1e7, 1e7)
                    for key in ("state", "index"): _finite(p.get(key), 0, 1e7)
                    _finite(p.get("dt", p.get("t", 0)), -2**31, 2**31-1)
    offsets = profile.get("placement_y_offsets", {})
    if not isinstance(offsets, dict) or len(offsets) > MAX_CHARS: raise ValueError("Ajustes inválidos")
    for key, value in offsets.items():
        if key not in glyphs: raise ValueError("Ajuste sin carácter")
        _finite(value, -200, 200)
    result = new_profile(glyphs, chars("".join(profile.get("expected", []))), profile.get("name"), offsets)
    return result


def import_backup(project, source, work, token=None):
    check(token)
    if Path(source).stat().st_size > MAX_ZIP: raise ValueError("Respaldo demasiado grande")
    candidate = validate_profile(read_gzip(source))
    return stage(project, work, candidate, "", token)


def export_profile(project, identity, destination, token=None):
    check(token)
    profile = load_profile(project, identity)
    atomic_gzip(Path(destination), profile, token)
    check(token)
    return str(destination)


def commit(project, work, token=None):
    work = Path(work)
    info = json.loads((work/"commit.json").read_text(encoding="utf-8"))
    if info["target"] and load_profile(project, info["target"])["revision"] != info["revision"]:
        raise ValueError("El perfil cambió mientras se revisaba la importación; vuelve a importarlo")
    profile = read_gzip(work/"candidate.hnprofile")
    save_profile(project, profile, token)
    return js({"saved": profile["id"], "detail": summary(project, profile)})


def action(project, operation, args_json, token=None):
    args = json.loads(args_json or "{}")
    check(token)
    if operation == "catalog": return js(catalog(project))
    if operation == "restoreDeleted":
        stored = profile_dir(project)/"deleted-last.hnprofile.bak"
        if not stored.is_file(): raise ValueError("No hay una eliminación reciente para recuperar")
        profile = read_gzip(stored)
        save_profile(project, profile, token)
        stored.unlink()
        return js({"saved": profile["id"], "detail": summary(project, profile)})
    if operation == "templatePlan": return js(template_plan(args))
    identity = args.get("id", "original")
    profile = load_profile(project, identity)
    if operation == "detail": return js({"detail": summary(project, profile)})
    if operation == "rename":
        if identity == "original": raise ValueError("Original está protegida")
        profile = {**profile, "name": name(args.get("name")), "revision": uuid.uuid4().hex}
        save_profile(project, profile, token)
    elif operation == "duplicate":
        profile = {**profile, "id": uuid.uuid4().hex, "name": name(args.get("name") or profile["name"]+" (copia)"), "revision": uuid.uuid4().hex}
        save_profile(project, profile, token)
    elif operation == "delete":
        if identity == "original": raise ValueError("Original está protegida")
        path = profile_path(project, identity)
        # Recoverable last deletion. The original default can never be targeted.
        path.replace(profile_dir(project)/"deleted-last.hnprofile.bak")
        _cached.cache_clear()
        return js({"deleted": identity})
    else:
        raise ValueError("Operación de calibración no reconocida")
    return js({"saved": profile["id"], "detail": summary(project, profile)})
