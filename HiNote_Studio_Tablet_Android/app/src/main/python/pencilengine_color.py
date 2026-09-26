from __future__ import annotations

import struct

# Reverse-engineered from the user's Huawei Notes color calibration:
# metadata[76:88] = B, G, R as big-endian float32 values in [0,1].
# metadata[92:96] = opacity/alpha. Huawei's 25/50/75/100% settings were
# observed as the values below. metadata[88:92] is a second opacity-related
# parameter changed by the Huawei UI, so we interpolate it from the same
# calibration instead of inventing a constant.
_OPACITY_KNOTS = [
    (0.0,   0.0,                  0.0),
    (25.0,  0.2549019753932953,   0.36363473534584045),
    (50.0,  0.501960813999176,    0.46260401606559753),
    (75.0,  0.7450980544090271,   0.5554972887039185),
    (100.0, 1.0,                  1.0),
]


def normalize_hex(value: str | None) -> str:
    raw = str(value or "#000000").strip()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in raw):
        return "#000000"
    return "#" + raw.upper()


def hex_to_rgb01(value: str | None) -> tuple[float, float, float]:
    h = normalize_hex(value)[1:]
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _interp(opacity_percent: float, field_index: int) -> float:
    p = max(0.0, min(100.0, float(opacity_percent)))
    for i in range(1, len(_OPACITY_KNOTS)):
        p0, a0, f0 = _OPACITY_KNOTS[i - 1]
        p1, a1, f1 = _OPACITY_KNOTS[i]
        if p <= p1:
            t = 0.0 if p1 == p0 else (p - p0) / (p1 - p0)
            v0 = (a0, f0)[field_index]
            v1 = (a1, f1)[field_index]
            return v0 + (v1 - v0) * t
    return (_OPACITY_KNOTS[-1][1], _OPACITY_KNOTS[-1][2])[field_index]


def alpha_for_percent(opacity_percent: float) -> float:
    return _interp(opacity_percent, 0)


def secondary_opacity_for_percent(opacity_percent: float) -> float:
    return _interp(opacity_percent, 1)


def patch_metadata(metadata: bytearray, color: str | None, opacity_percent: float) -> None:
    """Patch Huawei PencilEngine stroke metadata with color/opacity.

    Confirmed offsets for the pen strokes in the supplied calibration file:
      +76 float32 = blue
      +80 float32 = green
      +84 float32 = red
      +88 float32 = secondary opacity parameter
      +92 float32 = alpha/opacity
    """
    r, g, b = hex_to_rgb01(color)
    struct.pack_into(">f", metadata, 76, b)
    struct.pack_into(">f", metadata, 80, g)
    struct.pack_into(">f", metadata, 84, r)
    struct.pack_into(">f", metadata, 88, secondary_opacity_for_percent(opacity_percent))
    struct.pack_into(">f", metadata, 92, alpha_for_percent(opacity_percent))
