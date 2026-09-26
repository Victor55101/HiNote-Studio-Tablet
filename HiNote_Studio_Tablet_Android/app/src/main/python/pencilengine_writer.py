from __future__ import annotations

import argparse
import json
import struct
import tempfile
import uuid
import zipfile
from pathlib import Path

from pencilengine_color import patch_metadata

from pencilengine_reader import (
    MAGIC,
    GLOBAL_HEADER_SIZE,
    STROKE_HEADER_SIZE,
    STROKE_METADATA_SIZE,
    POINT_BLOCK_HEADER_SIZE,
    POINT_SIZE,
    FOOTER_SIZE,
    read_pencilengine,
    validate_pencilengine,
)


def _extract_bin_from_template(path: str | Path) -> bytes:
    path = Path(path)
    data = path.read_bytes()
    if data.startswith(MAGIC):
        return data
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path, "r") as zf:
            bins = [n for n in zf.namelist() if n.lower().endswith(".bin")]
            if not bins:
                raise ValueError("El .hinote plantilla no contiene archivos .bin")
            if len(bins) > 1:
                print(f"⚠️  La plantilla contiene {len(bins)} .bin; usaré {bins[0]}")
            return zf.read(bins[0])
    raise ValueError("La plantilla debe ser un .bin PENCILENGINE o un .hinote")


def _build_stroke(stroke: dict) -> bytes:
    points = stroke.get("points", [])
    if not points:
        raise ValueError("No se pueden escribir strokes vacíos")

    try:
        header = bytearray.fromhex(stroke["header_hex"])
        metadata = bytearray.fromhex(stroke["metadata_hex"])
        point_header = bytearray.fromhex(stroke["point_header_hex"])
    except Exception as e:
        raise ValueError(
            "El stroke no contiene las plantillas binarias header_hex/metadata_hex/point_header_hex. "
            "Regenera glyphs.json con calibration_extractor.py v3."
        ) from e

    if len(header) != STROKE_HEADER_SIZE:
        raise ValueError(f"header de stroke mide {len(header)}, esperado {STROKE_HEADER_SIZE}")
    if len(metadata) != STROKE_METADATA_SIZE:
        raise ValueError(f"metadata mide {len(metadata)}, esperado {STROKE_METADATA_SIZE}")
    if len(point_header) != POINT_BLOCK_HEADER_SIZE:
        raise ValueError(f"point header mide {len(point_header)}, esperado {POINT_BLOCK_HEADER_SIZE}")

    n = len(points)
    point_block_size = POINT_BLOCK_HEADER_SIZE + n * POINT_SIZE
    payload_size = STROKE_METADATA_SIZE + point_block_size

    # Cabecera de stroke. Conservamos todos los campos desconocidos del stroke
    # original y actualizamos únicamente los campos estructurales confirmados.
    struct.pack_into(">I", header, 0, STROKE_HEADER_SIZE)
    struct.pack_into(">I", header, 12, payload_size)
    header[16:32] = uuid.uuid4().bytes
    struct.pack_into(">I", header, 32, 68)
    struct.pack_into(">I", header, 36, STROKE_HEADER_SIZE)
    struct.pack_into(">I", header, 40, STROKE_METADATA_SIZE)
    struct.pack_into(">I", header, 44, point_block_size)

    # Huawei usa los campos metadata+8/+12 junto con el índice local del
    # bloque de puntos. Las notas de calibración pueden contener fragmentos de
    # un stroke mayor (por ejemplo index 15..39). En una nota generada cada
    # record es autónomo, así que normalizamos a 0..n-1 para evitar que Notes
    # interprete letras finas como continuaciones incompletas.
    struct.pack_into(">f", metadata, 8, 0.0)
    struct.pack_into(">f", metadata, 12, float(max(0, n - 1)))

    # Color y opacidad por stroke. Estos campos se obtuvieron comparando
    # la calibración de colores exportada directamente por Huawei Notes.
    patch_metadata(metadata, stroke.get("color", "#000000"), float(stroke.get("opacity", 100.0)))

    # El primer u32 del point header identifica el tipo de puntos/herramienta.
    # Lo conservamos del stroke manuscrito original. Actualizamos count/size.
    struct.pack_into(">I", point_header, 4, n)
    struct.pack_into(">I", point_header, 8, POINT_SIZE)

    point_bytes = bytearray()
    for i, p in enumerate(points):
        # Defensive canonicalization. compose_document() already emits these
        # values, but doing it again here also protects callers that feed an
        # older .strokes.json directly to the writer.
        if n == 1:
            state = 4
        elif i == 0:
            state = 4
        elif i == n - 1:
            state = 5
        else:
            state = 6
        point_bytes += struct.pack(
            ">ffiffffif",
            float(p["x"]),
            float(p["y"]),
            int(p.get("t", p.get("dt", 0))),
            float(p["pressure"]),
            float(p["extra1"]),
            float(p["extra2"]),
            float(p["extra3"]),
            state,
            float(i),
        )

    return bytes(header + metadata + point_header + point_bytes)


def write_pencilengine(composition: dict, template: str | Path, output: str | Path) -> Path:
    template_bin = _extract_bin_from_template(template)
    if len(template_bin) < GLOBAL_HEADER_SIZE + FOOTER_SIZE or not template_bin.startswith(MAGIC):
        raise ValueError("La plantilla no contiene un PENCILENGINE válido")

    global_header = bytearray(template_bin[:GLOBAL_HEADER_SIZE])
    footer = bytearray(template_bin[-FOOTER_SIZE:])

    output = Path(output)
    stroke_count = 0
    with output.open("wb") as stream:
        stream.write(global_header)
        for stroke in composition.get("strokes", []):
            stream.write(_build_stroke(stroke))
            stroke_count += 1
        footer[16:32] = uuid.uuid4().bytes
        stream.write(footer)
        total_len = stream.tell()

    # Campos globales confirmados comparando los templates de 1 y 2 strokes
    # y múltiples páginas reales de Huawei Notes.
    struct.pack_into(">I", global_header, 88, total_len - 124)
    global_header[92:108] = uuid.uuid4().bytes
    struct.pack_into(">I", global_header, 112, stroke_count)
    struct.pack_into(">I", global_header, 116, total_len - 164)

    with output.open("r+b") as stream:
        stream.write(global_header)

    # Auto-validación estructural inmediata.
    written_count, _ = validate_pencilengine(output)
    if written_count != stroke_count:
        raise RuntimeError("El archivo escrito no pasó la validación de stroke count")
    return output


def main():
    ap = argparse.ArgumentParser(description="Escribe un .bin PencilEngine desde composed_strokes.json")
    ap.add_argument("composition", help="JSON creado por render_text.py --export-strokes")
    ap.add_argument("template", help="template_1stroke.hinote/.bin (solo aporta header/footer global)")
    ap.add_argument("-o", "--output", default="generated.bin")
    args = ap.parse_args()

    composition = json.loads(Path(args.composition).read_text(encoding="utf-8"))
    out = write_pencilengine(composition, args.template, args.output)
    doc = read_pencilengine(out)
    print(f"✅ BIN generado: {out}")
    print(f"   strokes={len(doc.strokes)} | puntos={sum(len(s.points) for s in doc.strokes)} | bytes={out.stat().st_size}")


if __name__ == "__main__":
    main()
