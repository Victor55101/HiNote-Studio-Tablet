from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

from pencilengine_reader import validate_pencilengine


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def loadj(data: bytes):
    try:
        data = gzip.decompress(data)
    except OSError:
        pass
    return json.loads(data.decode("utf-8"))


def validate_hinote(path: str | Path, *, check_cancelled=None, quiet=False) -> bool:
    check = check_cancelled or (lambda: None)
    path = Path(path)
    errors = []
    if not zipfile.is_zipfile(path):
        print("❌ No es un ZIP/HiNote válido")
        return False

    with zipfile.ZipFile(path, "r") as zf:
        names = zf.namelist()
        root = [n for n in names if n.endswith('.jhinote') and '/' not in n and n != 'custom_md.jhinote']
        pages = [n for n in names if n.startswith('pages/') and n.endswith('.jhinote')]
        bins = [n for n in names if n.startswith('files/') and n.endswith('.bin')]
        if len(root) != 1:
            errors.append(f"root .jhinote: {len(root)}")
        if not pages:
            errors.append("no hay páginas .jhinote")
        if len(bins) != len(pages):
            errors.append(f"páginas={len(pages)} pero bins={len(bins)}")

        files = {}
        for name in names:
            if not name.startswith('files/') or name.endswith('/'):
                continue
            check()
            digest = hashlib.sha256()
            with zf.open(name) as source:
                for chunk in iter(lambda: source.read(65536), b""):
                    check()
                    digest.update(chunk)
            files[Path(name).name] = digest.hexdigest()
        filename_hashes = {sha(name.encode('utf-8')): name for name in files}
        if 'custom_md.jhinote' not in names:
            errors.append("falta custom_md.jhinote")
        else:
            md = loadj(zf.read('custom_md.jhinote'))
            for e in md.get('customMdContents', []):
                name = filename_hashes.get(e.get('fileNameMdStr'))
                if name is None:
                    errors.append("custom_md contiene filename hash sin archivo único")
                    continue
                if files[name] != e.get('fileMdStr'):
                    errors.append(f"hash de contenido incorrecto: {name}")

        root_obj = loadj(zf.read(root[0])) if len(root) == 1 else None
        note_id = root_obj.get("customNoteContent", {}).get("id") if root_obj else None

        page_meta = []
        referenced_bins = []
        for jh in root + pages:
            obj = loadj(zf.read(jh))
            for item in obj.get('fileList', []):
                nm = item.get('name')
                if nm not in files:
                    errors.append(f"{jh}: fileList referencia archivo ausente {nm}")
                elif files[nm] != item.get('hash'):
                    errors.append(f"{jh}: hash incorrecto para {nm}")

            if jh in pages:
                page = obj.get("customNotePageContent", {})
                page_meta.append((int(page.get("pageNumber", -1)), int(page.get("lastPageTag", 0)), jh, page))
                if note_id and page.get("notesId") != note_id:
                    errors.append(f"{jh}: notesId no coincide con root")
                for item in obj.get("fileList", []):
                    nm = item.get("name", "")
                    if nm.endswith(".bin"):
                        referenced_bins.append(nm)

        if page_meta:
            numbers = sorted(x[0] for x in page_meta)
            expected = list(range(1, len(page_meta) + 1))
            if numbers != expected:
                errors.append(f"pageNumber no contiguos: {numbers}")
            last_tags = [x for x in page_meta if x[1] == 1]
            if len(last_tags) != 1 or last_tags[0][0] != len(page_meta):
                errors.append("lastPageTag inválido: debe existir solo en la última página")
            if len(set(referenced_bins)) != len(page_meta):
                errors.append("las páginas no referencian un .bin único cada una")

        # Valida todos los .bin y muestra resumen por pageNumber cuando es posible.
        bin_to_page = {}
        for num, _, _, page in page_meta:
            for att in page.get("attachment", []):
                fp = att.get("filePath", "")
                if fp.lower().endswith(".bin"):
                    bin_to_page[Path(fp).name] = num

        with tempfile.TemporaryDirectory(prefix='validate_hinote_') as td:
            for bname in bins:
                check()
                bp = Path(td) / Path(bname).name
                with zf.open(bname) as source, bp.open("wb") as target:
                    shutil.copyfileobj(source, target, 65536)
                try:
                    strokes, points = validate_pencilengine(bp, check_cancelled=check)
                    n = bin_to_page.get(Path(bname).name, "?")
                    if not quiet:
                        print(f"Página {n}: {strokes} strokes, {points} puntos")
                except InterruptedError:
                    raise
                except Exception as e:
                    errors.append(f"PencilEngine inválido {bname}: {e}")
                finally:
                    bp.unlink(missing_ok=True)

    if errors:
        print("❌ HiNote con problemas:")
        for e in errors:
            print("  -", e)
        return False
    if not quiet:
        print(f"✅ HiNote consistente: {len(pages)} página(s), hashes, referencias y .bin pasan validación local.")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hinote')
    args = ap.parse_args()
    raise SystemExit(0 if validate_hinote(args.hinote) else 1)


if __name__ == '__main__':
    main()
