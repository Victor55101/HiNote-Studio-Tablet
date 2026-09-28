"""Rotulador width: metadata +96 is level/3 in the supplied 1..10 sample.

Zero means keep the source stroke's calibrated width. Pressure is never edited.
Other pen families have not been calibrated by the supplied sample.
"""
import math
import struct


def width_level(value):
    value = float(value or 0)
    if not math.isfinite(value) or value != int(value) or not 0 <= value <= 10:
        raise ValueError("El grosor debe ser Calibrado o un entero de 1 a 10")
    return int(value)


def native_width(stroke):
    level = width_level(stroke.get("thickness", 0))
    metadata = bytes.fromhex(stroke["metadata_hex"])
    if level:
        if struct.unpack_from(">I", metadata, 68)[0] != 12:
            raise ValueError("El ajuste de grosor admite el rotulador de la calibración")
        return level / 3.0
    return struct.unpack_from(">f", metadata, 96)[0]


def patch_width(metadata, stroke):
    if width_level(stroke.get("thickness", 0)):
        struct.pack_into(">f", metadata, 96, native_width(stroke))
