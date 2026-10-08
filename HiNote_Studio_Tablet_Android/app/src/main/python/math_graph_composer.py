"""Structured mathematics and coordinate plots, exported as native editable ink.

No expression evaluation, network, fonts or rasterized formulas are involved.
Characters prefer the active calibration; geometric math signs are a documented
fallback. Layout works in Huawei's physical half-square grid, not font metrics.
"""
import copy
import math
import random
import re
import struct
import unicodedata

from table_composer import GRID, HALF, half, number, border_stroke
from pencilengine_width import native_width

SLOTS = {"fraction": ("num", "den"), "root": ("index", "body"),
         "scripts": ("base", "sup", "sub"), "group": ("body",),
         "operator": ("lower", "upper", "body")}


def color(value):
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Color de fórmula o gráfica inválido")
    return value


def validate_object(obj, kind=None):
    if not isinstance(obj, dict) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", str(obj.get("id", ""))):
        raise ValueError("Identificador de fórmula o gráfica inválido")
    kind = kind or obj.get("kind")
    if kind not in ("formula", "graph") or obj.get("kind") != kind:
        raise ValueError("Elemento matemático desconocido")
    obj["left"] = half(obj.get("left", 1), .5, 15)
    obj["width"] = half(obj.get("width", 15), 2, 15.5)
    if obj["left"] + obj["width"] > 16.00001:
        raise ValueError("El elemento sale del ancho de la hoja")
    obj["gap"] = half(obj.get("gap", 0), 0, 10)
    obj["height"] = half(obj.get("height", 2 if kind == "formula" else 8), .5, 24.5)
    obj["size"] = number(obj.get("size", 1 if kind == "formula" else .6), .4, 1.5)
    obj["thickness"] = int(number(obj.get("thickness", 2), 1, 10))
    obj["color"] = color(obj.get("color", "#000000"))
    if obj.get("align", "left") not in ("left", "center", "right"):
        raise ValueError("Alineación matemática inválida")
    if kind == "formula":
        count = [0, 0]
        def visit(node, depth=0):
            count[0] += 1
            if count[0] > 500 or depth > 12 or not isinstance(node, dict):
                raise ValueError("La fórmula admite hasta 500 elementos y 12 niveles")
            typ = node.get("type")
            if typ == "text":
                if not isinstance(node.get("text"), str) or len(node["text"]) > 2048 or "\n" in node["text"]:
                    raise ValueError("Campo de fórmula inválido")
                count[1] += len(node["text"])
                if "color" in node: color(node["color"])
            elif typ == "row":
                if not isinstance(node.get("items"), list) or len(node["items"]) > 500:
                    raise ValueError("Secuencia de fórmula inválida")
                for item in node["items"]: visit(item, depth + 1)
            elif typ == "matrix":
                cells = node.get("cells")
                if not isinstance(cells, list) or not 1 <= len(cells) <= 6 or not isinstance(cells[0], list) or not 1 <= len(cells[0]) <= 6:
                    raise ValueError("Las matrices admiten de 1 a 6 filas y columnas")
                for row in cells:
                    if not isinstance(row, list) or len(row) != len(cells[0]): raise ValueError("Matriz irregular")
                    for cell in row: visit(cell, depth + 1)
                if node.get("bracket", "[") not in ("[", "(", "|"): raise ValueError("Contorno de matriz inválido")
            elif typ in SLOTS:
                if typ == "operator" and node.get("symbol") not in ("Σ", "∫", "lim", "∏"):
                    raise ValueError("Operador matemático inválido")
                if typ == "group" and node.get("bracket", "(") not in ("(", "[", "|"):
                    raise ValueError("Agrupador inválido")
                for slot in SLOTS[typ]: visit(node.get(slot), depth + 1)
            else: raise ValueError("Molde de fórmula no reconocido")
        visit(obj.get("expression"))
        if count[1] > 8192: raise ValueError("La fórmula admite hasta 8192 caracteres")
    else:
        for axis in ("x", "y"):
            low = number(obj.get(axis + "min", 0), -1e9, 1e9)
            high = number(obj.get(axis + "max", 10), -1e9, 1e9)
            step = number(obj.get(axis + "step", 1), 1e-9, 1e9)
            if high <= low or (high - low) / step > 40:
                raise ValueError("Cada eje necesita mínimo < máximo y hasta 40 divisiones")
            obj[axis + "min"], obj[axis + "max"], obj[axis + "step"] = low, high, step
        for key in ("title", "xlabel", "ylabel"):
            if not isinstance(obj.get(key, ""), str) or len(obj.get(key, "")) > 60:
                raise ValueError("Etiqueta de gráfica demasiado larga")
        series = obj.get("series", [])
        if not isinstance(series, list) or len(series) > 8: raise ValueError("Cada gráfica admite hasta 8 trazos")
        for trace in series:
            if not isinstance(trace.get('label', ''), str) or len(trace.get('label', '')) > 60:
                raise ValueError('El nombre del trazo admite hasta 60 caracteres')
            if trace.get('labelPosition', 'auto') not in ('auto', 'middle', 'end'):
                raise ValueError('Posición del nombre del trazo inválida')
            color(trace.get("color", obj["color"]))
            for key in ("pointColor", "guideColor", "labelColor"):
                if key in trace: color(trace[key])
            for key, default, high in (("width", obj["thickness"], 10), ("guideWidth", 1, 4), ("pointSize", 2.5, 6)):
                if key in trace: trace[key] = number(trace[key], .5, high)
            if trace.get("type") not in ("points", "line", "curve"):
                raise ValueError("Tipo de trazo inválido")
            points = trace.get("points")
            if not isinstance(points, list) or len(points) > 100: raise ValueError("Cada trazo admite hasta 100 puntos")
            for p in points:
                if not isinstance(p, dict): raise ValueError("Punto de gráfica inválido")
                p["x"] = number(p.get("x"), obj["xmin"], obj["xmax"])
                p["y"] = number(p.get("y"), obj["ymin"], obj["ymax"])
                if not isinstance(p.get("label", ""), str) or len(p.get("label", "")) > 60:
                    raise ValueError("Etiqueta de punto inválida")
            if trace["type"] == "curve" and any(b["x"] <= a["x"] for a, b in zip(points, points[1:])):
                raise ValueError("Ordena los puntos de la curva por X, sin valores repetidos")
    return obj


def object_text(obj):
    if obj["kind"] == "graph":
        yield from (obj.get(key, "") for key in ("title", "xlabel", "ylabel"))
        for trace in obj.get("series", []):
            yield trace.get('label', '')
            for p in trace["points"]: yield p.get("label", "")
        return
    def visit(node):
        if node["type"] == "text": yield node["text"]
        elif node["type"] == "row":
            for item in node["items"]: yield from visit(item)
        elif node["type"] == "matrix":
            for row in node["cells"]:
                for item in row: yield from visit(item)
        else:
            for slot in SLOTS[node["type"]]: yield from visit(node[slot])
    yield from visit(obj["expression"])


class Box:
    def __init__(self, width=0, top=0, bottom=0):
        self.width, self.top, self.bottom = width, top, bottom
        self.strokes, self.placements = [], []

    def put(self, other, x=0, y=0):
        # Empty caret fields have no ink bounds; they must not move a baseline.
        if other.strokes:
            if not self.strokes and self.top == self.bottom == 0:
                self.top, self.bottom = y + other.top, y + other.bottom
            else:
                self.top, self.bottom = min(self.top, y + other.top), max(self.bottom, y + other.bottom)
        for source in other.strokes:
            s = {**source, "points": [{**p, "x": p["x"] + x, "y": p["y"] + y} for p in source["points"]]}
            self.strokes.append(s)
        self.placements.extend({**p, "x": p["x"] + x, "baseline_y": p["baseline_y"] + y} for p in other.placements)


class Ink:
    def __init__(self, lib, seed, warnings, check, scale_text_width=False):
        self.lib, self.rng, self.warnings, self.check = lib, random.Random(seed), warnings, check
        self.scale_text_width = scale_text_width
    def path(self, box, coords, color="#000000", thickness=2, straight=False):
        """Geometry uses fresh native line records with a constant pen width.

        A copied handwriting record contains gesture timestamps, tilt and tool
        state tied to its original samples. Replacing only its coordinates makes
        Huawei's renderer taper long synthetic paths despite a uniform preview.
        Each pair here is a native two-point line, the same format as table rules.
        Round caps meet at the shared vertex; curved paths remain editable ink.
        """
        for a,b in zip(coords, coords[1:]):
            self.check()
            if a == b: continue
            stroke=border_stroke([a,b], {"color":color,"border":thickness})
            # Match the existing synthetic-ink preview pressure without inheriting
            # any calibration gesture metadata, point headers or end state.
            for p in stroke['points']:p['pressure']=.88
            top,bottom=min(a[1],b[1]),max(a[1],b[1])
            if not box.strokes and box.top == box.bottom == 0:
                box.top,box.bottom=top,bottom
            else:
                box.top,box.bottom=min(box.top,top),max(box.bottom,bottom)
            box.strokes.append(stroke)

    def sign(self, ch, size, ink, thickness):
        # Normalized paths are a fallback only; calibrated mathematical signs win.
        circle = lambda cx, cy, rx, ry: [(cx + rx * math.cos(i * math.pi / 12), cy + ry * math.sin(i * math.pi / 12)) for i in range(25)]
        paths = {
            "×": [[(0,-.7),(.65,-.1)],[(0,-.1),(.65,-.7)]],
            "÷": [[(0,-.4),(.7,-.4)],[(.34,-.76),(.36,-.76)],[(.34,-.04),(.36,-.04)]],
            "−": [[(0,-.4),(.7,-.4)]], "·": [[(.2,-.4),(.22,-.4)]],
            "±": [[(0,-.4),(.7,-.4)],[(.35,-.7),(.35,-.1)],[(0,.05),(.7,.05)]],
            "≠": [[(0,-.55),(.7,-.55)],[(0,-.25),(.7,-.25)],[(.12,0),(.58,-.8)]],
            "≤": [[(.7,-.8),(0,-.45),(.7,-.1)],[(0,.08),(.7,.08)]],
            "≥": [[(0,-.8),(.7,-.45),(0,-.1)],[(0,.08),(.7,.08)]],
            "≈": [[(i/20*.7,-.55+math.sin(i/20*2*math.pi)*.08) for i in range(21)],[(i/20*.7,-.25+math.sin(i/20*2*math.pi)*.08) for i in range(21)]],
            "→": [[(0,-.4),(.9,-.4)],[(.65,-.65),(.9,-.4),(.65,-.15)]],
            "∞": [[(.45+.45*math.cos(i*math.pi/24),-.4+.22*math.sin(i*math.pi/12)) for i in range(49)]],
            "π": [[(0,-.7),(.8,-.7)],[(.2,-.7),(.15,0)],[(.6,-.7),(.6,-.1),(.72,0),(.8,-.05)]],
            "Δ": [[(0,0),(.4,-.85),(.8,0),(0,0)]],
            "Σ": [[(.8,-.85),(0,-.85),(.45,-.42),(0,0),(.8,0)]],
            "∏": [[(0,0),(0,-1),(.8,-1),(.8,0)]],
            "∫": [[(.6,-1),(.4,-1.08),(.25,-.98),(.2,-.7),(.2,.1),(.15,.3),(0,.35),(-.12,.28)]],
            "∂": [circle(.3,-.3,.28,.3),[(.02,-.82),(.24,-.95),(.52,-.8),(.58,-.58),(.52,-.22)]],
            "α": [circle(.3,-.32,.28,.32),[(.57,-.65),(.53,-.2),(.6,0),(.75,-.08)]],
            "β": [[(0,.3),(0,-.8),(.2,-1),(.5,-.92),(.52,-.65),(.16,-.45),(.54,-.4),(.6,-.15),(.42,0),(0,0)]],
            "γ": [[(0,-.65),(.15,-.65),(.32,-.2),(.4,.3),(.26,.2),(.32,-.1),(.64,-.65)]],
            "η": [[(0,-.65),(.1,-.5),(.1,0),(.1,-.45),(.3,-.65),(.5,-.55),(.5,.28)]],
            "θ": [circle(.3,-.45,.27,.45),[(.05,-.45),(.55,-.45)]],
            "λ": [[(0,-.9),(.18,-.88),(.35,-.5),(.65,0)],[(.35,-.5),(0,0)]],
            "μ": [[(0,-.65),(0,.3)],[(0,-.1),(.18,0),(.38,-.12),(.42,-.65),(.42,-.1),(.58,0),(.7,-.1)]],
            "ρ": [circle(.3,-.32,.3,.32),[(0,-.32),(0,.3)]],
            "σ": [circle(.3,-.3,.3,.3),[(.3,-.6),(.75,-.6)]],
            "ω": [[(0,-.65),(-.02,-.2),(.1,0),(.27,-.08),(.35,-.4),(.37,-.1),(.55,0),(.7,-.18),(.7,-.65)]],
            "φ": [circle(.35,-.38,.34,.3),[(.35,-.95),(.35,.3)]],
            "Ω": [[(0,0),(.23,0),(.08,-.35),(.08,-.7),(.23,-.9),(.5,-.9),(.7,-.7),(.7,-.35),(.55,0),(.8,0)]],
            "|": [[(.1,-.9),(.1,.15)]], "[": [[(.25,-.9),(0,-.9),(0,.1),(.25,.1)]],
            "]": [[(0,-.9),(.25,-.9),(.25,.1),(0,.1)]],
            "(": [[(.25,-.9),(.06,-.65),(0,-.4),(.06,-.15),(.25,.1)]],
            ")": [[(0,-.9),(.19,-.65),(.25,-.4),(.19,-.15),(0,.1)]]}
        if ch not in paths: raise ValueError(f"Agrega el carácter «{ch}» a tu calibración para escribir esta fórmula o etiqueta")
        self.warnings.append("Signos matemáticos geométricos (sin muestra calibrada): " + ch)
        em = 38 * size
        left=min(x for path in paths[ch] for x,_ in path)
        b = Box((max(x for path in paths[ch] for x, _ in path)-left) * em + 2 * size)
        for path in paths[ch]: self.path(b, [((x-left)*em, y*em) for x, y in path], ink, thickness)
        return b

    def text(self, text, size, ink="#000000", thickness=2):
        from handwriting_composer import _choose_char_items, _place_glyph_sequence
        out = Box()
        width_scale = size if self.scale_text_width else 1
        for ch in unicodedata.normalize("NFC", text):
            self.check()
            if ch.isspace(): out.width += 14 * size; continue
            if ch not in self.lib["glyphs"]:
                b = self.sign(ch, size, ink, thickness * width_scale)
            else:
                items = list(_choose_char_items([{"ch": ch, "scale": size, "color": ink, "opacity": 100,
                                                  "thickness": thickness}], self.lib["glyphs"], self.rng, 14, self.warnings))
                p = {"strokes": [], "placements": []}
                _place_glyph_sequence(items, 0, 0, p, self.lib.get("placement_y_offsets", {}), 0, 0, 0, self.rng)
                # Formula scripts keep the body's pen width (V34). Graph labels
                # retain V33's proportional width, including smaller tick numbers.
                for stroke in p['strokes']:
                    metadata=bytearray.fromhex(stroke['metadata_hex'])
                    struct.pack_into('>f',metadata,96,native_width(stroke)*width_scale)
                    stroke.update(metadata_hex=metadata.hex(),thickness=0,width_scale=1)
                pts = [pt for s in p["strokes"] for pt in s["points"]]
                left, right = min(pt["x"] for pt in pts), max(pt["x"] for pt in pts)
                b = Box(right-left, min(pt["y"] for pt in pts), max(pt["y"] for pt in pts))
                b.strokes, b.placements = p["strokes"], p["placements"]
                normalized = Box(b.width); normalized.put(b, -left); b = normalized
            out.put(b, out.width); out.width += b.width + 4.8 * size
        if text and not text[-1].isspace(): out.width = max(0, out.width - 4.8 * size)
        return out

    def bracket(self, top, bottom, opening, bracket, ink, thickness, size):
        ch = bracket if opening or bracket == "|" else {"(": ")", "[": "]"}[bracket]
        if ch == "|" and ch not in self.lib["glyphs"]:
            box = Box()
            self.warnings.append("Signos matemáticos geométricos (sin muestra calibrada): |")
            self.path(box, [(0, top), (0, bottom)], ink, thickness*size, straight=True)
            return box
        # Use the user's delimiter and stretch only its height to enclose the body.
        box = self.text(ch, size, ink, thickness)
        old_top, height = box.top, max(.001, box.bottom-box.top)
        sy = (bottom-top)/height
        for stroke in box.strokes:
            for point in stroke["points"]:
                point["y"] = top+(point["y"]-old_top)*sy
        for p in box.placements:
            p["baseline_y"] = top+(p["baseline_y"]-old_top)*sy
        box.top, box.bottom = top, bottom
        if ch in self.lib["glyphs"]:
            # A stretched delimiter is geometry too: preserve the user's outline,
            # but do not ask Huawei to replay the original gesture at a new height.
            stable=Box(box.width,top,bottom)
            for stroke in box.strokes:
                start=len(stable.strokes)
                self.path(stable,[(p['x'],p['y']) for p in stroke['points']],ink,thickness*size)
                # Retain semantic attribution for diagnostics and composition.
                for segment in stable.strokes[start:]:
                    if 'char' in stroke:segment['char']=stroke['char']
            stable.placements=box.placements
            box=stable
        return box

    def expression(self, node, size, ink, thickness):
        self.check(); typ = node["type"]; em = 38 * size; gap = 6 * size
        if typ == "text": return self.text(node["text"], size, node.get("color", ink), thickness)
        if typ == "row":
            out = Box()
            for child in node["items"]:
                b = self.expression(child, size, ink, thickness)
                if not b.width: continue
                if out.width: out.width += 3 * size
                out.put(b, out.width); out.width += b.width
                if hasattr(b, 'grid_anchor') and not hasattr(out, 'grid_anchor'): out.grid_anchor=b.grid_anchor
            return out
        if typ == "fraction":
            a = self.expression(node["num"], size*.9, ink, thickness); b = self.expression(node["den"], size*.9, ink, thickness)
            if not a.strokes and not b.strokes: return Box()
            out = Box(max(a.width,b.width)+2*gap)
            y = -em*.35
            out.put(a,(out.width-a.width)/2,y-gap-a.bottom)
            out.put(b,(out.width-b.width)/2,y+gap-b.top)
            self.path(out,[(0,y),(out.width,y)],ink,thickness*size,straight=True);out.grid_anchor=y;return out
        if typ == "scripts":
            base = self.expression(node["base"], size, ink, thickness)
            sup = self.expression(node["sup"], size*.48, ink, thickness); sub = self.expression(node["sub"], size*.48, ink, thickness)
            side_gap = 2.5 * size
            out = Box(base.width+max(sup.width,sub.width)+(side_gap if sup.width or sub.width else 0)); out.put(base)
            height = max(base.bottom-base.top, em*.6)
            if sup.width: out.put(sup,base.width+side_gap,base.top+height*.2-sup.bottom)
            if sub.width: out.put(sub,base.width+side_gap,max(base.top+height*.7,base.bottom-em*.25)-sub.top)
            return out
        if typ == "root":
            body = self.expression(node["body"],size,ink,thickness); idx=self.expression(node["index"],size*.5,ink,thickness)
            if not body.strokes and not idx.strokes: return Box()
            offset=max(18*size,idx.width+9*size); out=Box(offset+body.width+gap)
            out.put(body,offset); top=min(body.top,-em*.65)-gap; bottom=max(body.bottom,0)
            self.path(out,[(offset-18*size,-em*.25),(offset-13*size,-em*.35),(offset-8*size,bottom),
                           (offset-2*size,top),(out.width,top)],ink,thickness*size)
            if idx.width: out.put(idx,0,top+em*.2-idx.bottom)
            return out
        if typ == "group":
            body=self.expression(node["body"],size,ink,thickness)
            if not body.strokes: return Box()
            bracket=node.get("bracket","(");pad=8*size if bracket=="|" else 4*size
            top=min(body.top,-em*.7)-3*size;bottom=max(body.bottom,0)+3*size
            left=self.bracket(top,bottom,True,bracket,ink,thickness,size)
            right=self.bracket(top,bottom,False,bracket,ink,thickness,size)
            out=Box(body.width+left.width+right.width+2*pad)
            out.put(left);out.put(body,left.width+pad);out.put(right,out.width-right.width)
            if hasattr(body,'grid_anchor'):out.grid_anchor=body.grid_anchor
            return out
        if typ == "matrix":
            cells=[[self.expression(c,size*.85,ink,thickness) for c in row] for row in node["cells"]]
            widths=[max(row[c].width for row in cells) for c in range(len(cells[0]))]
            tops=[min(b.top for b in row) for row in cells];bottoms=[max(b.bottom for b in row) for row in cells]
            baselines=[0]
            for i in range(1,len(cells)):baselines.append(baselines[-1]+math.ceil((bottoms[i-1]-tops[i]+gap)/HALF)*HALF)
            heights=[bottom-top for top,bottom in zip(tops,bottoms)]
            bracket=node.get("bracket","[");pad=8*size if bracket=="|" else 4*size
            h=baselines[-1]+bottoms[-1]-tops[0]
            top=-h/2-em*.3;shift=top-tops[0]
            left=self.bracket(top-gap/2,top+h+gap/2,True,bracket,ink,thickness,size)
            right=self.bracket(top-gap/2,top+h+gap/2,False,bracket,ink,thickness,size)
            out=Box(sum(widths)+18*size*(len(widths)-1)+left.width+right.width+2*pad);out.grid_anchor=shift
            out.put(left);out.put(right,out.width-right.width)
            for row,baseline in zip(cells,baselines):
                baseline+=shift;x=left.width+pad
                for b,w in zip(row,widths):out.put(b,x+(w-b.width)/2,baseline);x+=w+18*size
            return out
        if typ == "operator":
            symbol=node["symbol"]
            sign=self.text(symbol,size*(1.3 if symbol in "Σ∫" else 1 if symbol=='∏' else .8),ink,thickness)
            lo=self.expression(node["lower"],size*.55,ink,thickness);hi=self.expression(node["upper"],size*.55,ink,thickness)
            body=self.expression(node["body"],size,ink,thickness);w=max(sign.width,lo.width,hi.width)
            out=Box(w+gap+body.width);out.put(sign,(w-sign.width)/2)
            if hi.width:out.put(hi,(w-hi.width)/2,sign.top-gap-hi.bottom)
            if lo.width:out.put(lo,(w-lo.width)/2,sign.bottom+gap-lo.top)
            out.put(body,w+gap);return out
        raise ValueError("Molde desconocido")


def smooth_points(points):
    """Monotone cubic Hermite interpolation: passes through data, no overshoot."""
    if len(points) < 3: return points
    slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(points,points[1:])]
    tangents=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]):tangents.append(0 if a*b<=0 else 2*a*b/(a+b))
    tangents.append(slopes[-1]);out=[]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        dx=b[0]-a[0]
        for j in range(24):
            t=j/24;t2=t*t;t3=t2*t
            y=(2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*dx*tangents[i]+(-2*t3+3*t2)*b[1]+(t3-t2)*dx*tangents[i+1]
            out.append((a[0]+t*dx,y))
    return out+[points[-1]]


def graph_geometry(obj, unit=GRID):
    """Tick anchors and the editor share the sheet's half-square lattice.

    Coordinate values are never changed. Dense scales which cannot fit a half
    square per tick use continuous spacing instead of dropping data or labels.
    """
    w, h = obj['width'], obj['height']
    def axis(low, high, step, start, end):
        tick = math.floor(low/step+1e-9)
        span = high/step-tick
        scale = math.floor((end-start)/span*2+1e-9)/2
        fitted = obj.get('gridFit', True) and scale >= .5
        if not fitted: scale = (end-start)/span
        return {'tick': tick, 'scale': scale, 'start': start, 'fitted': fitted}
    x = axis(obj['xmin'], obj['xmax'], obj['xstep'], 1, w-.5)
    y = axis(obj['ymin'], obj['ymax'], obj['ystep'], 1.5 if obj.get('title') else 1, h-1)
    def xy(px, py):
        return ((x['start']+(px/obj['xstep']-x['tick'])*x['scale'])*unit,
                (h-1-(py/obj['ystep']-y['tick'])*y['scale'])*unit)
    left, bottom = xy(obj['xmin'], obj['ymin'])
    right, top = xy(obj['xmax'], obj['ymax'])
    ax, ay = xy(max(obj['xmin'], min(obj['xmax'], 0)), max(obj['ymin'], min(obj['ymax'], 0)))
    return {'xy': xy, 'left': left, 'right': right, 'top': top, 'bottom': bottom,
            'ax': ax, 'ay': ay, 'x': x, 'y': y}


class LabelSpace:
    """Bounded local queries for short labels near dense plots."""
    def __init__(self, width, height, unit=GRID):
        self.width, self.height, self.unit = width, height, unit
        self.cells, self.segments, self.boxes = {}, [], []

    def keys(self, rect):
        x,y,w,h=rect
        for i in range(math.floor(x/self.unit),math.floor((x+w)/self.unit)+1):
            for j in range(math.floor(y/self.unit),math.floor((y+h)/self.unit)+1):
                yield i,j

    def path(self, points, pad=1):
        for a,b in zip(points,points[1:]):
            index=len(self.segments);self.segments.append((a,b,pad))
            rect=(min(a[0],b[0])-pad,min(a[1],b[1])-pad,abs(a[0]-b[0])+2*pad,abs(a[1]-b[1])+2*pad)
            for key in self.keys(rect):self.cells.setdefault(key,[]).append(index)

    @staticmethod
    def crosses(a, b, rect, pad=0):
        x,y,w,h=rect;x-=pad;y-=pad;w+=2*pad;h+=2*pad
        dx,dy=b[0]-a[0],b[1]-a[1];lo,hi=0,1
        for p,q in ((-dx,a[0]-x),(dx,x+w-a[0]),(-dy,a[1]-y),(dy,y+h-a[1])):
            if abs(p)<1e-12:
                if q<0:return False
            elif p<0:lo=max(lo,q/p)
            else:hi=min(hi,q/p)
            if lo>hi:return False
        return True

    def place(self, x, y, width, height, radius=3):
        margin=radius+self.unit*.12;best=None
        for gap in (margin,margin+self.unit*.3):
            for ox,oy in ((gap,-height-gap),(gap,gap),(-width-gap,-height-gap),(-width-gap,gap),
                          (-width/2,-height-gap),(-width/2,gap),(gap,-height/2),(-width-gap,-height/2)):
                xx=max(3,min(self.width-width-3,x+ox));yy=max(3,min(self.height-height-3,y+oy))
                rect=(xx,yy,width,height)
                indices={i for key in self.keys(rect) for i in self.cells.get(key,[])}
                collisions=sum(self.crosses(a,b,rect,pad+self.unit*.025) for a,b,pad in (self.segments[i] for i in indices))
                overlaps=sum(max(0,min(xx+width,bx+bw)-max(xx,bx))*max(0,min(yy+height,by+bh)-max(yy,by)) for bx,by,bw,bh in self.boxes)
                score=collisions*1000+overlaps*100+math.hypot(xx+width/2-x,yy+height/2-y)
                if best is None or score<best[0]:best=(score,rect)
        self.boxes.append(best[1]);return best[1]


def trace_label_pose(points, width, height, position, has_point_labels, space):
    """Place a readable, straight handwritten name along the local tangent."""
    segments = [(a, b, math.dist(a, b)) for a, b in zip(points, points[1:]) if math.dist(a, b) > 1e-8]
    total = sum(length for _, _, length in segments)
    if not total:
        return None
    at_end = position == 'end' or (position == 'auto' and has_point_labels)
    fractions = (.85, .72, .95) if at_end else (.5, .35, .65, .2, .8)
    best = None
    for fraction in fractions:
        remaining = total * fraction
        for a, b, length in segments:
            if remaining <= length:
                break
            remaining -= length
        t = max(0, min(1, remaining / length))
        px, py = a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t
        angle = math.atan2(b[1]-a[1], b[0]-a[0])
        if angle > math.pi/2: angle -= math.pi
        if angle < -math.pi/2: angle += math.pi
        c, sn = math.cos(angle), math.sin(angle)
        bw, bh = abs(c)*width+abs(sn)*height, abs(sn)*width+abs(c)*height
        if bw > space.width-6 or bh > space.height-6:
            continue
        for gap in (.14, .35, .6):
            cx, cy = px+sn*(height/2+space.unit*gap), py-c*(height/2+space.unit*gap)
            ox, oy = cx, cy
            cx = max(bw/2+3, min(space.width-bw/2-3, cx))
            cy = max(bh/2+3, min(space.height-bh/2-3, cy))
            rect = (cx-bw/2, cy-bh/2, bw, bh)
            indices = {i for key in space.keys(rect) for i in space.cells.get(key, [])}
            hits = sum(space.crosses(a,b,rect,pad+space.unit*.025) for a,b,pad in (space.segments[i] for i in indices))
            x,y,w,h = rect
            overlap = sum(max(0,min(x+w,bx+bw)-max(x,bx))*max(0,min(y+h,by+bh)-max(y,by)) for bx,by,bw,bh in space.boxes)
            score = hits*1000+overlap*100+math.hypot(cx-ox,cy-oy)*30+abs(fraction-fractions[0])*space.unit+gap*space.unit
            candidate = {'score':score, 'cx':cx, 'cy':cy, 'angle':angle, 'rect':rect, 'fraction':fraction}
            if best is None or score < best['score']:
                best = candidate
    if best:
        space.boxes.append(best['rect'])
    return best


def rotated_label(box, pose):
    x,y,w,h = pose['rect']
    out = Box(w, 0, h)
    c,sn = math.cos(pose['angle']), math.sin(pose['angle'])
    center_y = (box.top+box.bottom)/2
    def point(px, py):
        px,py = px-box.width/2, py-center_y
        return pose['cx']+c*px-sn*py-x, pose['cy']+sn*px+c*py-y
    for source in box.strokes:
        stroke = copy.deepcopy(source)
        for p in stroke['points']:
            p['x'],p['y'] = point(p['x'],p['y'])
        stroke['trace_label'] = True
        out.strokes.append(stroke)
    for source in box.placements:
        p = copy.deepcopy(source)
        p['x'],p['baseline_y'] = point(p['x'],p['baseline_y'])
        p['rotation_degrees'] = math.degrees(pose['angle'])
        p['trace_label'] = True
        out.placements.append(p)
    return out


def draw_graph(obj, painter):
    w,h=obj["width"]*GRID,obj["height"]*GRID
    if w < 4*GRID or h < 4*GRID:raise ValueError("Una gráfica necesita al menos 4 × 4 cuadros para sus ejes y etiquetas")
    out=Box(w,0,h);size=obj["size"];ink=obj["color"];thickness=obj["thickness"]
    # Labels occupy reserved margins; plot area is independent of handwriting size.
    geometry=graph_geometry(obj);xy=geometry['xy']
    left,right,top,bottom,ax,ay=(geometry[k] for k in ('left','right','top','bottom','ax','ay'))
    arrow_right=right+HALF if obj.get('arrows',True) and right+HALF<=w-3 else right
    arrow_top=top-HALF if obj.get('arrows',True) and top-HALF>=3 else top
    labels=[];trace_labels=[]
    xzero=max(obj["xmin"],min(obj["xmax"],0));yzero=max(obj["ymin"],min(obj["ymax"],0))
    def line(coords,c=ink,width=thickness,dashed=False):
        if not dashed:return painter.path(out,coords,c,width,straight=len(coords)==2)
        drawing=True;remaining=5;pending=[]
        for a,b in zip(coords,coords[1:]):
            length=math.dist(a,b)
            if not length:continue
            start=0
            while start<length-1e-8:
                end=min(start+remaining,length)
                p=lambda d:(a[0]+(b[0]-a[0])*d/length,a[1]+(b[1]-a[1])*d/length)
                if drawing:
                    if not pending:pending.append(p(start))
                    pending.append(p(end))
                elif pending:
                    painter.path(out,pending,c,width);pending=[]
                remaining-=end-start;start=end
                if remaining<1e-7:
                    if pending:painter.path(out,pending,c,width);pending=[]
                    drawing=not drawing;remaining=5
        if pending:painter.path(out,pending,c,width)
    def label(text,x,y,c=ink,s=size,align="left",vertical="baseline"):
        b=painter.text(text,s,c,thickness)
        if b.width>w-GRID*.2:raise ValueError("La etiqueta de gráfica no cabe: acórtala o reduce su tamaño")
        if vertical=='top':y-=b.top
        x-=b.width*(.5 if align=="center" else 1 if align=="right" else 0)
        x=max(3,min(w-b.width-3,x));y=max(3-b.top,min(h-3-b.bottom,y));out.put(b,x,y)
    def ticks(axis):
        low,high,step=(obj[axis+k] for k in ("min","max","step"));start=math.ceil(low/step-1e-9)*step
        return [start+i*step for i in range(int((high-start)/step+1e-8)+1)]
    guides={}
    for trace in obj['series']:
        if not trace.get('guides'): continue
        c=trace.get('guideColor',trace.get('color',ink));width=trace.get('guideWidth',1)
        for point in trace['points']:
            x,y=xy(point['x'],point['y'])
            for key,a,b in ((('v',round(x,8),c,width),y,ay),(('h',round(y,8),c,width),x,ax)):
                guides.setdefault(key,[]).append((min(a,b),max(a,b)))
    for (axis,position,c,width),intervals in guides.items():
        merged=[]
        for a,b in sorted(intervals):
            if merged and a<=merged[-1][1]+1e-7: merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
            else: merged.append((a,b))
        for a,b in merged:
            line([(position,a),(position,b)] if axis=='v' else [(a,position),(b,position)],c,width,True)
    for axis in ("x","y"):
        for value in ticks(axis):
            x,y=xy(value,yzero) if axis=="x" else xy(xzero,value)
            if obj.get("grid",False):line([(x,top),(x,bottom)] if axis=="x" else [(left,y),(right,y)],"#C4CCD5",1)
            if obj.get("ticks",True):
                if not obj.get('arrows',True) or (arrow_right-x if axis=='x' else y-arrow_top)>12:
                    line([(x,ay-3),(x,ay+3)] if axis=="x" else [(ax-3,y),(ax+3,y)])
                if abs(value)>1e-9:
                    text=f"{value:.5g}".replace("e+","e")
                    label(text,x,ay+22, s=size*.72,align="center") if axis=="x" else label(text,ax-9,y+6,s=size*.72,align="right")
    # Keep stems and arrow wings in one ink tool with matching width/caps.
    painter.path(out,[(left,ay),(arrow_right,ay)],ink,thickness)
    painter.path(out,[(ax,bottom),(ax,arrow_top)],ink,thickness)
    if obj.get("arrows",True):
        painter.path(out,[(arrow_right-8,ay-5),(arrow_right,ay),(arrow_right-8,ay+5)],ink,thickness)
        painter.path(out,[(ax-5,arrow_top+8),(ax,arrow_top),(ax+5,arrow_top+8)],ink,thickness)
    label(obj.get("xlabel","x"),right,ay+(30 if obj.get('ticks',True) else 8),align="right",vertical='top');label(obj.get("ylabel","y"),ax+12,top-10)
    if obj.get("title"):label(obj["title"],w/2,max(GRID*.5,top-GRID*.7),align="center")
    for trace in obj["series"]:
        painter.check();c=trace.get("color",ink);width=trace.get('width',thickness)
        coords=[xy(p["x"],p["y"]) for p in trace["points"]]
        rendered=[xy(x,y) for x,y in smooth_points([(p['x'],p['y']) for p in trace['points']])] if trace['type']=='curve' else coords
        if trace["type"]!="points" and len(coords)>1:
            if trace.get('dashed'): line(rendered,c,width,True)
            else: painter.path(out,rendered,c,width)
        if trace.get('label') and len(rendered)>1:
            b=painter.text(trace['label'],size,trace.get('labelColor',c),thickness)
            trace_labels.append((b,rendered,trace.get('labelPosition','auto'),any(p.get('label') for p in trace['points'])))
        for p,(x,y) in zip(trace["points"],coords):
            if trace.get("markers",True) or trace["type"]=="points":
                radius=trace.get('pointSize',2.5)
                painter.path(out,[(x-.01,y),(x+.01,y)],trace.get('pointColor',c),2*radius/.928)
            if p.get("label"):
                b=painter.text(p["label"],size,trace.get('labelColor',trace.get('pointColor',c)),thickness)
                if b.width>w-GRID*.2:raise ValueError("La etiqueta de gráfica no cabe: acórtala o reduce su tamaño")
                labels.append((b,x,y,trace.get('pointSize',2.5)))
    space=LabelSpace(w,h)
    for stroke in out.strokes:
        space.path([(p['x'],p['y']) for p in stroke['points']],native_width(stroke)*1.4)
    for b,x,y,radius in labels:
        xx,yy,_,_=space.place(x,y,b.width,b.bottom-b.top,radius)
        out.put(b,xx,yy-b.top)
    for b,points,position,has_point_labels in trace_labels:
        pose=trace_label_pose(points,b.width,b.bottom-b.top,position,has_point_labels,space)
        if not pose:
            raise ValueError('El nombre del trazo no cabe: acórtalo o reduce el tamaño de letra')
        out.put(rotated_label(b,pose),pose['rect'][0],pose['rect'][1])
    return out


def plan_object(obj, lib, seed, warnings, check):
    obj=validate_object(obj);painter=Ink(lib,seed,warnings,check,scale_text_width=obj['kind']=='graph')
    if obj["kind"]=="graph":return draw_graph(obj,painter)
    # Fit retries reuse the same variants. Never stretch individual glyphs.
    size=obj["size"];width=(16-obj['left'] if obj.get('autoWidth') is True else obj['width'])*GRID;pad=GRID*.1
    while True:
        painter=Ink(lib,seed,warnings,check)
        b=painter.expression(obj["expression"],size,obj["color"],obj["thickness"])
        if b.width<=width-2*pad:break
        if not obj.get("fit",True) or size<=.4+.00001:raise ValueError("La fórmula no cabe: amplía su ancho, reduce el tamaño o divídela en fórmulas")
        size=max(.4,min(size-.05,size*(width-2*pad)/max(b.width,1)))
    # Baselines (or the main fraction bar) land on a half-square, rather than
    # floating a fixed padding distance below the block's upper edge.
    if obj.get('autoWidth') is True:
        width=max(2*GRID,min(width,math.ceil((b.width+2*pad)/HALF-1e-9)*HALF))
        obj['width']=width/GRID
    anchor=getattr(b,'grid_anchor',0)
    shift=math.ceil((pad-b.top+anchor)/HALF-1e-9)*HALF-anchor
    out=Box(width,0,max(obj["height"]*GRID,math.ceil((shift+b.bottom+pad)/HALF)*HALF))
    free=width-b.width;align=obj.get("align","left")
    x=math.floor((free/2 if align=="center" else free if align=="right" else 0)/HALF)*HALF
    out.put(b,x,shift)
    if size<obj["size"]-.001:warnings.append(f"Fórmula ajustada al ancho: {round(size*100)} %")
    return out


def draw_object(obj, box, y, page):
    placed=Box();placed.put(box,obj["left"]*GRID,y)
    page["strokes"].extend(placed.strokes);page["placements"].extend(placed.placements)
    page.setdefault("objects",[]).append({"id":obj["id"],"kind":obj["kind"],"x":obj["left"]*GRID,
                                          "y":y,"width":box.width,"height":box.bottom})
