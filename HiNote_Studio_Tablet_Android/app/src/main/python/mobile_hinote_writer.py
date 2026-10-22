from __future__ import annotations

import copy
import gzip
import hashlib
import json
import time
import uuid
import zipfile
from pathlib import Path


def _gunzip_json(data: bytes):
    try:
        data = gzip.decompress(data)
    except OSError:
        pass
    return json.loads(data.decode("utf-8"))


def _gzip_json(obj) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return gzip.compress(raw, compresslevel=9, mtime=0)


def _sha(data):
    if isinstance(data, Path):
        digest = hashlib.sha256()
        with data.open("rb") as stream:
            for chunk in iter(lambda: stream.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()
    return hashlib.sha256(data).hexdigest()


def _write_entry(archive, name, data, check):
    if isinstance(data, Path):
        with data.open("rb") as source, archive.open(name, "w") as target:
            for chunk in iter(lambda: source.read(65536), b""):
                check()
                target.write(chunk)
    else:
        archive.writestr(name, data)


def _load_template(template_hinote: Path):
    with zipfile.ZipFile(template_hinote, "r") as zf:
        entries = {n: zf.read(n) for n in zf.namelist() if not n.endswith("/")}
    roots = [n for n in entries if n.endswith(".jhinote") and "/" not in n and n != "custom_md.jhinote"]
    pages = sorted(n for n in entries if n.startswith("pages/") and n.endswith(".jhinote"))
    if len(roots) != 1 or not pages:
        raise ValueError("Plantilla HiNote inválida")
    return entries, roots[0], _gunzip_json(entries[roots[0]]), pages[0], _gunzip_json(entries[pages[0]])


def build_hinote_multi(template_hinote, generated_bins, output_hinote, *, title="Nueva nota", thumbnails=None, images=None, pdf_pages=None, check_cancelled=None):
    check = check_cancelled or (lambda: None)
    template_hinote = Path(template_hinote)
    output_hinote = Path(output_hinote)
    generated_bins = [Path(p) if p is not None else None for p in generated_bins]
    thumbnails = [Path(p) for p in (thumbnails or [])]
    images = images or [[] for _ in generated_bins]
    if not generated_bins or len(generated_bins) != len(thumbnails):
        raise ValueError("Se requiere un thumbnail JPEG por página")
    if len(images) != len(generated_bins):
        raise ValueError("Las imágenes deben corresponder a las páginas")

    entries, _old_root, root_obj, _old_page, template_page_obj = _load_template(template_hinote)
    note = root_obj["customNoteContent"]
    template_page = template_page_obj["customNotePageContent"]

    old_page_files = set()
    for name, data in entries.items():
        if name.startswith("pages/") and name.endswith(".jhinote"):
            pobj = _gunzip_json(data)
            for item in pobj.get("fileList", []):
                if item.get("name"):
                    old_page_files.add("files/" + item["name"])

    note_id = uuid.uuid4().hex
    now_ms = int(time.time() * 1000)
    root_name = f"{note_id}.jhinote"
    note["id"] = note_id
    note["noteTitle"] = title or "Nueva nota"
    note["modifiedTime"] = now_ms
    for att in note.get("attachment", []):
        att["notesId"] = note_id
        att["id"] = uuid.uuid4().hex
        att["modifiedTime"] = now_ms

    files = {}
    for name, data in entries.items():
        if name.startswith("files/") and name not in old_page_files:
            files[name] = data

    pdf_pages=pdf_pages or [None]*len(generated_bins)
    if len(pdf_pages)!=len(generated_bins): raise ValueError("Las páginas de PDF deben corresponder a las páginas de la nota")
    pdf_attachments={};pdf_hashes={}
    for ref in pdf_pages:
        if not ref: continue
        check();source=Path(ref["path"])
        if source not in pdf_hashes: pdf_hashes[source]=_sha(source)
        digest=pdf_hashes[source]
        if digest not in pdf_attachments:
            name=digest+"_pdf.pdf";attachment_id=uuid.uuid4().hex
            files["files/"+name]=source;pdf_attachments[digest]=(attachment_id,name)
            note.setdefault("attachment",[]).append({"attachType":3,"cloudSyncState":1,"createTime":now_ms,"data1":'{"synDataTpye":"memonote"}',
                "filePath":"/data/data/com.huawei.hinote/files/importfiles/"+name,"id":attachment_id,"isDelete":0,"modifiedTime":now_ms,"notesId":note_id,"playbackProgress":0})
            root_obj.setdefault("fileList",[]).append({"hash":digest,"name":name})
    page_records = []
    for idx, (bin_path, thumb_path) in enumerate(zip(generated_bins, thumbnails), start=1):
        check()
        page_obj = copy.deepcopy(template_page_obj)
        page = page_obj["customNotePageContent"]
        page_id = uuid.uuid4().hex
        page_jh = f"pages/{page_id}.jhinote"
        bin_name = f"files/{page_id}.bin"
        thumb_name = f"files/{page_id}.jpg"
        if bin_path is not None:
            files[bin_name] = bin_path
        files[thumb_name] = thumb_path

        page["id"] = page_id
        page["notesId"] = note_id
        page["pageNumber"] = idx
        page["lastPageTag"] = 1 if idx == len(generated_bins) else 0
        page["createTime"] = now_ms + idx
        page["modifiedTime"] = now_ms + idx
        page.pop("guid", None)
        page.pop("unStructUuid", None)

        attachments = page.get("attachment", [])
        if not attachments:
            attachments.append({})
            page["attachment"] = attachments
        for att in attachments:
            att["attachType"] = 0
            att["notesId"] = note_id
            att["notePageId"] = page_id
            att["filePath"] = f"/data/data/com.huawei.hinote/files/hwFile/{page_id}.bin"
            att["data1"] = att.get("data1") or '{"synDataTpye":"memopage"}'
            att["isDelete"] = 0
            att["cloudSyncState"] = att.get("cloudSyncState", 0)
            att["createTime"] = now_ms + idx
            att["modifiedTime"] = now_ms + idx
            att["id"] = uuid.uuid4().hex
            att.setdefault("playbackProgress", 0)

        page["thumbnail"] = f"/data/data/com.huawei.hinote/files/thumbnail/{page_id}.jpg"
        page_obj["fileList"] = [{"hash": _sha(thumb_path), "name": Path(thumb_name).name}]
        if bin_path is None:
            page["attachment"] = []
        else:
            page_obj["fileList"].append({"hash": _sha(bin_path), "name": Path(bin_name).name})
        page.pop("bkgAttachmentId",None);page.pop("bkgAttachmentIndex",None)
        if pdf_pages[idx-1]:
            ref=pdf_pages[idx-1];attachment_id,_=pdf_attachments[pdf_hashes[Path(ref["path"])]]
            page["bkgAttachmentId"]=attachment_id;page["bkgAttachmentIndex"]=int(ref["index"])
        page["pageElement"] = []
        for layer, image in enumerate(images[idx - 1]):
            check()
            source = Path(image["path"])
            digest = _sha(source)
            image_name = digest + source.suffix.lower()
            files["files/" + image_name] = source
            if not any(item["name"] == image_name for item in page_obj["fileList"]):
                page_obj["fileList"].append({"hash": digest, "name": image_name})
            page["pageElement"].append({
                "id": str(uuid.uuid4()), "notePageId": page_id, "elementType": 1,
                "filePath": f"/data/data/com.huawei.hinote/files/image/{image_name}",
                "positionX": image["x"] / 1000.0, "positionY": image["y"] / 1600.0,
                "width": image["width"] / 1000.0, "height": image["height"] / 1600.0,
                "angle": image["angle"], "positionZ": layer, "scale": 1.0,
                "data1": '{"sourceDpi":"0","type":"0","stretchSplits":"null"}',
                "isDelete": 0, "cloudSyncState": 0, "playbackProgress": 0,
                "createTime": now_ms + idx, "modifiedTime": now_ms + idx,
            })
        page_records.append((page_jh, _gzip_json(page_obj), thumb_name, bin_name))

    root_obj["fileList"] = [
        {"hash": _sha(files[f"files/{item['name']}"]), "name": item["name"]}
        for item in root_obj.get("fileList", [])
        if f"files/{item.get('name', '')}" in files
    ]

    md = {"customMdContents": []}
    for name in sorted(files):
        basename = Path(name).name
        md["customMdContents"].append({
            "fileMdStr": _sha(files[name]),
            "fileNameMdStr": _sha(basename.encode("utf-8")),
        })

    with zipfile.ZipFile(output_hinote, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        out.writestr(root_name, _gzip_json(root_obj))
        out.writestr("pages/", b"")
        for page_jh, page_bytes, _, _ in page_records:
            out.writestr(page_jh, page_bytes)
        out.writestr("files/", b"")
        page_specific = {n for rec in page_records for n in rec[2:]}
        for name in sorted(files):
            if name not in page_specific:
                _write_entry(out, name, files[name], check)
        for _, _, thumb_name, bin_name in page_records:
            _write_entry(out, thumb_name, files[thumb_name], check)
            if bin_name in files:
                _write_entry(out, bin_name, files[bin_name], check)
        out.writestr("custom_md.jhinote", _gzip_json(md))
    return output_hinote
