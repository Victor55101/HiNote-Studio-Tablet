"""Copy selected native pages into a new notebook, without altering sources.

Resource bytes, including PencilEngine ink, are copied unchanged. References,
identities, page order and both Huawei hash manifests are regenerated. Archives
are bounded and never extracted by path. Partial native exports (e.g. pages 8/9)
are supported, unlike the validator for newly generated sequential notebooks.
"""
import copy
import gzip
import hashlib
import json
import re
import time
import uuid
import zipfile
from contextlib import ExitStack
from pathlib import Path, PurePosixPath
from mobile_hinote_writer import _gzip_json
from pencilengine_reader import validate_pencilengine

MAX_BYTES = 512 * 1024 * 1024
MAX_PAGES = 500


def _check(token):
    if token is not None and token.isCancelled(): raise InterruptedError("Operación cancelada")


def _json(data):
    # Prevent a tiny gzip metadata file from expanding without bounds.
    if data[:2] == b"\x1f\x8b":
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream: data=stream.read(4_000_001)
    if len(data)>4_000_000: raise ValueError("Metadatos del cuaderno demasiado grandes")
    obj=json.loads(data.decode("utf-8"))
    if not isinstance(obj,dict):raise ValueError("Metadatos nativos inválidos")
    return obj


def _archive(path):
    if not zipfile.is_zipfile(path): raise ValueError("Elige un cuaderno .hinote exportado desde Huawei Notes")
    archive=zipfile.ZipFile(path)
    try:
        infos=archive.infolist();names=[i.filename for i in infos]
        if len(names)>10_000 or len(set(names))!=len(names):raise ValueError("Cuaderno con entradas repetidas o demasiados archivos")
        if sum(i.file_size for i in infos)>MAX_BYTES:raise ValueError("El cuaderno supera 512 MB descomprimido")
        for i in infos:
            name=i.filename;p=PurePosixPath(name)
            if name.endswith('.jhinote') and i.file_size>4_000_000:
                raise ValueError("Metadatos del cuaderno demasiado grandes")
            if name.startswith("/") or ".." in p.parts or "\\" in name or i.flag_bits&1:
                raise ValueError("Archivo nativo con rutas o cifrado no admitidos")
            if not i.is_dir() and (len(p.parts)>2 or (len(p.parts)==2 and p.parts[0] not in ("pages","files"))):
                raise ValueError("Estructura de cuaderno no reconocida")
        roots=[n for n in names if n.endswith(".jhinote") and "/" not in n and n!="custom_md.jhinote"]
        if len(roots)!=1:raise ValueError("El archivo debe contener exactamente un cuaderno")
        root=_json(archive.read(roots[0]));note=root.get("customNoteContent",{})
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}",str(note.get("id",""))):raise ValueError("Identificador de cuaderno inválido")
        pages=[];ids=set();numbers=set()
        for name in names:
            if not name.startswith("pages/") or not name.endswith(".jhinote"):continue
            obj=_json(archive.read(name));page=obj.get("customNotePageContent",{});pid=page.get("id","")
            if not isinstance(pid,str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}",pid) or pid in ids:raise ValueError("Identificadores de página repetidos o inválidos")
            number=page.get("pageNumber")
            if not isinstance(number,int) or number<1 or number in numbers:raise ValueError("Orden de páginas inválido")
            if page.get("notesId")!=note["id"]:raise ValueError("Página asociada a otro cuaderno")
            ids.add(pid);numbers.add(number);pages.append((name,obj))
        if not 1<=len(pages)<=MAX_PAGES:raise ValueError("El cuaderno admite de 1 a 500 páginas")
        pages.sort(key=lambda p:p[1]["customNotePageContent"]["pageNumber"])
        return archive,root,pages
    except BaseException:
        archive.close();raise


def _resources(archive,obj):
    listed={}
    for entry in obj.get("fileList",[]):
        name=entry.get("name","")
        if not isinstance(name,str) or not name or PurePosixPath(name).name!=name or name in listed:
            raise ValueError("Lista de recursos nativos inválida")
        if "files/"+name not in archive.namelist():raise ValueError("Falta un recurso del cuaderno: "+name)
        digest=entry.get("hash","")
        if not re.fullmatch(r"[a-fA-F0-9]{64}",digest):raise ValueError("Hash de recurso inválido")
        listed[name]=digest.lower()
    return listed


def _validate_refs(obj,listed):
    page=obj.get("customNotePageContent") or obj.get("customNoteContent",{})
    if 'customNotePageContent' in obj and sum(name.lower().endswith('.bin') for name in listed)>1:
        raise ValueError("La página incluye varios binarios nativos no admitidos; vuelve a exportar el cuaderno completo")
    for item in page.get("attachment",[])+page.get("pageElement",[]):
        path=item.get("filePath","")
        if path and PurePosixPath(path).name not in listed:raise ValueError("El cuaderno tiene adjuntos sin sus archivos; vuelve a exportarlo completo")
    thumbnail=page.get("thumbnail","")
    if thumbnail and PurePosixPath(thumbnail).name not in listed:raise ValueError("Falta la miniatura de una página")


def inspect_notebook(path,token=None):
    _check(token);archive,root,pages=_archive(path)
    try:
        for obj in [root]+[p[1] for p in pages]:_check(token);_validate_refs(obj,_resources(archive,obj))
        response={"title":str(root["customNoteContent"].get("noteTitle","Cuaderno"))[:128],"pages":[]}
        for _,obj in pages:
            p=obj["customNotePageContent"]
            response["pages"].append({"id":p["id"],"number":p["pageNumber"],"ratio":p.get("pageRatio",.625),
                                     "hasInk":any(n.endswith(".bin") for n in _resources(archive,obj)),
                                     "images":len(p.get("pageElement",[]))})
        return json.dumps(response,ensure_ascii=False,separators=(",",":"))
    finally:archive.close()


def thumbnail(path,page_id,destination,token=None):
    _check(token);archive,_,pages=_archive(path)
    try:
        page=next((obj for _,obj in pages if obj["customNotePageContent"]["id"]==page_id),None)
        if page is None:raise ValueError("Página no disponible")
        name=PurePosixPath(page["customNotePageContent"].get("thumbnail","")).name
        if name not in _resources(archive,page):raise ValueError("La página no incluye miniatura")
        if archive.getinfo("files/"+name).file_size>16*1024*1024:raise ValueError("Miniatura demasiado grande")
        with archive.open("files/"+name) as src,Path(destination).open("wb") as dst:
            for chunk in iter(lambda:src.read(65536),b""):_check(token);dst.write(chunk)
        return str(destination)
    finally:archive.close()


def merge_notebooks(sources_json,plan_json,output_path,work_dir,token=None):
    sources=json.loads(sources_json);plan=json.loads(plan_json);records=plan.get("pages",[])
    if not isinstance(sources,dict) or not 1<=len(sources)<=8:raise ValueError("Elige de 1 a 8 archivos .hinote")
    if not isinstance(records,list) or not 1<=len(records)<=MAX_PAGES:raise ValueError("Selecciona de 1 a 500 páginas para el cuaderno nuevo")
    title=str(plan.get("title","Cuaderno combinado")).strip()[:128] or "Cuaderno combinado"
    work=Path(work_dir);work.mkdir(parents=True,exist_ok=True);output=Path(output_path)
    written=False
    try:
        with ExitStack() as stack:
            opened={}
            for key in {r.get("source") for r in records}:
                if key not in sources:raise ValueError("Cuaderno de origen no disponible; vuelve a seleccionarlo")
                z,root,pages=_archive(sources[key]);stack.enter_context(z)
                opened[key]=(z,root,{p[1]["customNotePageContent"]["id"]:p[1] for p in pages})
            note_id=uuid.uuid4().hex;now=int(time.time()*1000)
            first=opened[records[0]["source"]];root=copy.deepcopy(first[1])
            note=root["customNoteContent"];old_note=note["id"];note["id"]=note_id;note["noteTitle"]=title;note["modifiedTime"]=now
            root_map={old_note:note_id};files={};digest_files={};page_records=[];total=0
            def copy_resource(z,name,expected,preferred=None):
                nonlocal total
                _check(token);size=z.getinfo("files/"+name).file_size;total+=size
                if total>MAX_BYTES:raise ValueError("El cuaderno combinado supera 512 MB")
                suffix=PurePosixPath(name).suffix
                if len(suffix)>12 or not re.fullmatch(r"\.[a-zA-Z0-9]+",suffix):suffix=".dat"
                new_name=preferred or expected+suffix.lower()
                # Content-addressed non-ink resources are deduplicated, even across notebooks.
                key=(expected,suffix.lower())
                if preferred is None and key in digest_files:return digest_files[key]
                local=work/new_name;digest=hashlib.sha256()
                with z.open("files/"+name) as src,local.open("wb") as dst:
                    for chunk in iter(lambda:src.read(65536),b""):_check(token);digest.update(chunk);dst.write(chunk)
                if digest.hexdigest()!=expected:raise ValueError("El archivo está dañado: hash incorrecto de "+name)
                if suffix.lower()==".bin":validate_pencilengine(local,check_cancelled=lambda:_check(token))
                files[new_name]=(local,expected)
                if preferred is None:digest_files[key]=new_name
                return new_name
            def remap(value,mapping):
                if isinstance(value,dict):return {k:remap(v,mapping) for k,v in value.items()}
                if isinstance(value,list):return [remap(v,mapping) for v in value]
                if isinstance(value,str):
                    pattern=re.compile("|".join(re.escape(k) for k in sorted(mapping,key=len,reverse=True))) if mapping else None
                    return pattern.sub(lambda m:mapping[m.group()],value) if pattern else value
                return value
            root_resources=_resources(first[0],root);_validate_refs(root,root_resources)
            for name,digest in root_resources.items():root_map[name]=copy_resource(first[0],name,digest)
            for att in note.get("attachment",[]):
                if att.get("id"):root_map[att["id"]]=uuid.uuid4().hex
            root=remap(root,root_map);root["fileList"]=[{"name":root_map[n],"hash":d} for n,d in root_resources.items()]
            for index,record in enumerate(records,1):
                _check(token);z,source_root,source_pages=opened[record["source"]]
                source=source_pages.get(record.get("page"))
                if source is None:raise ValueError("Una página seleccionada ya no está disponible")
                obj=copy.deepcopy(source);page=obj["customNotePageContent"];pid=uuid.uuid4().hex
                mapping={source_root["customNoteContent"]["id"]:note_id,page["id"]:pid};resources=_resources(z,obj);_validate_refs(obj,resources)
                for name,digest in resources.items():
                    # One independent ink resource per copy, preserving PencilEngine bytes exactly.
                    preferred=pid+".bin" if name.lower().endswith(".bin") else None
                    mapping[name]=copy_resource(z,name,digest,preferred)
                for item in page.get("attachment",[])+page.get("pageElement",[]):
                    if item.get("id"):mapping[item["id"]]=str(uuid.uuid4()) if "-" in str(item["id"]) else uuid.uuid4().hex
                for key in ("guid","unStructUuid"):
                    if page.get(key):mapping[str(page[key])]=uuid.uuid4().hex
                obj=remap(obj,mapping);page=obj["customNotePageContent"]
                page.update(id=pid,notesId=note_id,pageNumber=index,lastPageTag=1 if index==len(records) else 0,modifiedTime=now+index)
                obj["fileList"]=[{"name":mapping[n],"hash":d} for n,d in resources.items()]
                page_records.append((f"pages/{pid}.jhinote",_gzip_json(obj)))
                if token is not None:token.onProgress(index)
            md={"customMdContents":[{"fileMdStr":digest,"fileNameMdStr":hashlib.sha256(name.encode()).hexdigest()} for name,(_,digest) in sorted(files.items())]}
            _check(token)
            with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as out:
                out.writestr(note_id+".jhinote",_gzip_json(root));out.writestr("pages/",b"")
                for name,data in page_records:_check(token);out.writestr(name,data)
                out.writestr("files/",b"")
                for name,(local,_) in sorted(files.items()):
                    _check(token)
                    with local.open("rb") as src,out.open("files/"+name,"w") as dst:
                        for chunk in iter(lambda:src.read(65536),b""):_check(token);dst.write(chunk)
                out.writestr("custom_md.jhinote",_gzip_json(md))
            _check(token);written=True
            return json.dumps({"pages":len(records),"title":title,"output":str(output)},ensure_ascii=False)
    finally:
        if not written:output.unlink(missing_ok=True)
