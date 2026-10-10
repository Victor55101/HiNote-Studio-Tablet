from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import struct
from typing import List

MAGIC = b"PENCILENGINE"
GLOBAL_HEADER_SIZE = 136
STROKE_HEADER_SIZE = 48
STROKE_METADATA_SIZE = 116
POINT_BLOCK_HEADER_SIZE = 20
POINT_SIZE = 36
FOOTER_SIZE = 40


@dataclass
class Point:
    x: float
    y: float
    t: int
    pressure: float
    extra1: float
    extra2: float
    extra3: float
    state: int
    index: float


@dataclass
class Stroke:
    number: int
    offset: int
    points: List[Point]
    header_hex: str
    metadata_hex: str
    point_header_hex: str

    @property
    def bbox(self):
        xs = [p.x for p in self.points]
        ys = [p.y for p in self.points]
        if not xs:
            return (0.0, 0.0, 0.0, 0.0)
        return (min(xs), min(ys), max(xs), max(ys))

    @property
    def centroid(self):
        if not self.points:
            return (0.0, 0.0)
        return (
            sum(p.x for p in self.points) / len(self.points),
            sum(p.y for p in self.points) / len(self.points),
        )

    @property
    def point_type(self) -> int:
        ph = bytes.fromhex(self.point_header_hex)
        return struct.unpack_from(">I", ph, 0)[0]


@dataclass
class PencilEngineDocument:
    path: str
    stroke_count_header: int
    strokes: List[Stroke]
    global_header_hex: str
    footer_hex: str
    trailing_bytes: int


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def validate_footer(footer, stroke_ids):
    """Known native rectangle extension; unknown footer kinds stay rejected."""
    footer = bytes(footer)
    if len(footer) < FOOTER_SIZE or _u32(footer, 0) != FOOTER_SIZE:
        raise ValueError("Footer PENCILENGINE inválido")
    extra, count = _u32(footer, 12), _u32(footer, 36)
    if len(footer) == FOOTER_SIZE and not extra and not count:
        return
    if extra != 56 * count or len(footer) != FOOTER_SIZE + extra or count > 2000:
        raise ValueError("Extensión de formas PENCILENGINE inválida")
    seen = set()
    for offset in range(FOOTER_SIZE, len(footer), 56):
        block = footer[offset:offset+56]
        identity = block[16:32]
        if (struct.unpack_from(">IIII", block) != (2,20,0,0) or _u32(block,32) != 1
                or _u32(block,52) != 0 or block[36:52] != identity
                or identity not in stroke_ids or identity in seen):
            raise ValueError("Referencia de rectángulo PENCILENGINE inválida")
        seen.add(identity)


def validate_pencilengine(path, check_cancelled=None):
    """Verify binary framing without allocating every point in the page."""
    check = check_cancelled or (lambda: None)
    size = Path(path).stat().st_size
    with Path(path).open("rb") as stream:
        header = stream.read(GLOBAL_HEADER_SIZE)
        if len(header) != GLOBAL_HEADER_SIZE or not header.startswith(MAGIC):
            raise ValueError("Cabecera PENCILENGINE inválida")
        if _u32(header, 88) != size - 124:
            raise ValueError("Tamaños globales PENCILENGINE inconsistentes")
        count, points = _u32(header, 112), 0
        stroke_ids = set()
        for _ in range(count):
            check()
            head = stream.read(STROKE_HEADER_SIZE)
            meta = stream.read(STROKE_METADATA_SIZE)
            block = stream.read(POINT_BLOCK_HEADER_SIZE)
            if len(head) != STROKE_HEADER_SIZE or len(meta) != STROKE_METADATA_SIZE or len(block) != POINT_BLOCK_HEADER_SIZE:
                raise ValueError("Stroke truncado")
            stroke_ids.add(head[16:32])
            n, point_size = _u32(block, 4), _u32(block, 8)
            block_size = POINT_BLOCK_HEADER_SIZE + n * POINT_SIZE
            if (_u32(head, 0) != STROKE_HEADER_SIZE or point_size != POINT_SIZE
                    or _u32(head, 12) != STROKE_METADATA_SIZE + block_size
                    or _u32(head, 44) != block_size):
                raise ValueError("Tamaños de stroke inconsistentes")
            if stream.tell() + n * POINT_SIZE > size - FOOTER_SIZE:
                raise ValueError("Puntos truncados")
            stream.seek(n * POINT_SIZE, 1)
            points += n
        if _u32(header, 116) != stream.tell() - 124:
            raise ValueError("Tamaño del bloque de trazos PENCILENGINE inconsistente")
        validate_footer(stream.read(FOOTER_SIZE + 56 * 2000 + 1), stroke_ids)
    return count, points


def read_pencilengine(path: str | Path, strict: bool = True) -> PencilEngineDocument:
    """Lee el layout PencilEngine observado en Huawei Notes/HiNote.

    Estructura confirmada en las notas de calibración y en los templates de
    1 y 2 strokes suministrados para este proyecto:
      global header:       136 bytes
      per-stroke header:    48 bytes
      stroke metadata:     116 bytes
      point block header:   20 bytes
      each point:           36 bytes, >ffiffffif
      footer:               40 bytes

    NOTA: esto es ingeniería inversa, no una especificación oficial de Huawei.
    """
    path = Path(path)
    data = path.read_bytes()

    if len(data) < GLOBAL_HEADER_SIZE + FOOTER_SIZE or not data.startswith(MAGIC):
        raise ValueError(f"{path} no parece un archivo PENCILENGINE válido")

    stroke_count = _u32(data, 112)
    offset = GLOBAL_HEADER_SIZE
    strokes: List[Stroke] = []

    for n in range(stroke_count):
        minimum = STROKE_HEADER_SIZE + STROKE_METADATA_SIZE + POINT_BLOCK_HEADER_SIZE
        if offset + minimum > len(data):
            raise ValueError(
                f"Stroke {n}: el archivo termina antes del encabezado completo (offset {offset})."
            )

        stroke_start = offset
        header = data[offset: offset + STROKE_HEADER_SIZE]
        header_size = _u32(header, 0)
        payload_size = _u32(header, 12)
        if strict and header_size != STROKE_HEADER_SIZE:
            raise ValueError(
                f"Stroke {n}: tamaño de header inesperado {header_size}, esperado {STROKE_HEADER_SIZE}."
            )
        offset += STROKE_HEADER_SIZE

        metadata = data[offset: offset + STROKE_METADATA_SIZE]
        offset += STROKE_METADATA_SIZE

        point_header = data[offset: offset + POINT_BLOCK_HEADER_SIZE]
        point_count = _u32(point_header, 4)
        point_size = _u32(point_header, 8)
        if strict and point_size != POINT_SIZE:
            raise ValueError(
                f"Stroke {n}: tamaño de punto inesperado {point_size}, esperado {POINT_SIZE}."
            )
        offset += POINT_BLOCK_HEADER_SIZE

        bytes_needed = point_count * point_size
        if offset + bytes_needed > len(data):
            raise ValueError(
                f"Stroke {n}: faltan bytes para {point_count} puntos desde offset {offset}."
            )

        points: List[Point] = []
        for _ in range(point_count):
            x, y, t, pressure, e1, e2, e3, state, index = struct.unpack_from(
                ">ffiffffif", data, offset
            )
            points.append(Point(x, y, t, pressure, e1, e2, e3, state, index))
            offset += point_size

        if strict:
            expected_payload = STROKE_METADATA_SIZE + POINT_BLOCK_HEADER_SIZE + point_count * point_size
            if payload_size != expected_payload:
                raise ValueError(
                    f"Stroke {n}: payload={payload_size}, esperado={expected_payload}."
                )
            expected_point_block = POINT_BLOCK_HEADER_SIZE + point_count * point_size
            if _u32(header, 44) != expected_point_block:
                raise ValueError(
                    f"Stroke {n}: tamaño de point block inconsistente."
                )

        strokes.append(
            Stroke(
                number=n,
                offset=stroke_start,
                points=points,
                header_hex=header.hex(),
                metadata_hex=metadata.hex(),
                point_header_hex=point_header.hex(),
            )
        )

    footer = data[offset:]
    if strict:
        validate_footer(footer, {bytes.fromhex(s.header_hex)[16:32] for s in strokes})

    return PencilEngineDocument(
        path=str(path),
        stroke_count_header=stroke_count,
        strokes=strokes,
        global_header_hex=data[:GLOBAL_HEADER_SIZE].hex(),
        footer_hex=footer.hex(),
        trailing_bytes=len(footer),
    )


def document_summary(doc: PencilEngineDocument) -> str:
    point_count = sum(len(s.points) for s in doc.strokes)
    return (
        f"{Path(doc.path).name}: {len(doc.strokes)} strokes, "
        f"{point_count} puntos, footer={doc.trailing_bytes} bytes"
    )


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Inspecciona un .bin PENCILENGINE")
    ap.add_argument("bin_file")
    ap.add_argument("--no-strict", action="store_true")
    args = ap.parse_args()

    doc = read_pencilengine(args.bin_file, strict=not args.no_strict)
    print(document_summary(doc))
