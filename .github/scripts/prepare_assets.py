"""Build the runtime calibration assets from the archived V11 source."""
import gzip
import hashlib
import json
import struct
import sys
import tempfile
import zlib
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'HiNote_Studio_Tablet_Android/app/src/main/assets/'
CORRECTIONS = ROOT / '.github/assets/glyph_corrections_v22.json.gz'
with ZipFile(ROOT / 'HiNote_Studio_Tablet_Android_Source.zip') as archive:
    library = json.loads(archive.read(PREFIX + 'glyphs_v11.json'))
    with gzip.open(CORRECTIONS, 'rt', encoding='utf-8') as stream:
        corrections = json.load(stream)

    library['format'] = 'hinote-glyph-library-v4-corrected'
    library['glyphs'].update(corrections['glyphs'])
    library.setdefault('placement_y_offsets', {}).update(corrections['placement_y_offsets'])
    # V24: keep the calibrated underscore below the baseline of ordinary letters.
    library['placement_y_offsets']['_'] = 3.0
    library['corrections_applied'] = {
        'version': corrections['version'],
        'source_hinote': corrections['source_hinote'],
        'source_page': corrections['source_page'],
        'characters': list(corrections['glyphs']),
        'description': corrections['description'],
    }
    for diagnostic in library.get('diagnostics', []):
        if diagnostic.get('page') == corrections['source_page']:
            diagnostic['unassigned_strokes'] = []

    assets = ROOT / PREFIX
    assets.mkdir(parents=True, exist_ok=True)
    (assets / 'glyphs_v24.json').write_text(
        json.dumps(library, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    source_template = archive.read(PREFIX + 'template_1stroke.hinote')

# The runtime template contains newly authored metadata, an empty format record
# and our own one-pixel white PNG. No thumbnail, cover, drawing or device/note ID
# from the archived source note is distributed with the application.
sys.path.insert(0, str(ROOT / 'HiNote_Studio_Tablet_Android/app/src/main/python'))
from pencilengine_writer import write_pencilengine

with tempfile.TemporaryDirectory() as directory:
    source=Path(directory)/'format-source.hinote';source.write_bytes(source_template)
    target=Path(directory)/'empty.bin';write_pencilengine({'strokes':[]},source,target)
    binary=bytearray(target.read_bytes())
    binary[92:108]=bytes.fromhex('0'*31+'4')
    binary[-40+16:-40+32]=bytes.fromhex('0'*31+'5')
    binary=bytes(binary)

def png_chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
white_png=(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))
           +png_chunk(b'IDAT',zlib.compress(b'\0\xff\xff\xff'))+png_chunk(b'IEND',b''))
note_id='0'*31+'1';page_id='0'*31+'2';attachment_id='0'*31+'3'
prefix='/data/data/com.huawei.hinote/files/'
note={'outLineAttachment':[],'recordItemEntities':[],'attachment':[],
      'background':'base3','cloudSyncState':0,'createTime':0,'data1':'',
      'deleteTag':0,'deleteTime':0,'extendFields':'hinote_1.0.4','hasCover':0,
      'id':note_id,'isFavorite':0,'isTop':0,'modifiedTime':0,'noteIcon':'',
      'noteTitle':'Plantilla de formato HiNote Studio','noteType':100,'pageColor':-1,
      'pageOrientation':0,'pageRatio':0.625}
page={'pageBookMarks':[],'attachment':[{'attachType':0,'cloudSyncState':0,
      'createTime':0,'data1':'{"synDataTpye":"memopage"}',
      'filePath':prefix+'hwFile/'+page_id+'.bin','id':attachment_id,'isDelete':0,
      'modifiedTime':0,'notePageId':page_id,'notesId':note_id,'playbackProgress':0}],
      'background':'base3','cloudSyncState':0,'createTime':0,'id':page_id,
      'isDelete':0,'lastPageTag':1,'modifiedTime':0,'notesId':note_id,'pageColor':-1,
      'pageElement':[],'pageNumber':1,'pageOrientation':0,'pageRatio':0.625,
      'pageType':1,'thumbnail':prefix+'thumbnail/'+page_id+'.png'}
files={page_id+'.bin':binary,page_id+'.png':white_png}
sha=lambda data:hashlib.sha256(data).hexdigest()
gz=lambda obj:gzip.compress(json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode(),mtime=0)
with ZipFile(assets/'template_1stroke.hinote','w') as output:
    output.writestr(note_id+'.jhinote',gz({'customNoteContent':note,'fileList':[]}))
    output.writestr('pages/'+page_id+'.jhinote',gz({'customNotePageContent':page,
        'fileList':[{'hash':sha(data),'name':name} for name,data in files.items()]}))
    for name,data in files.items():output.writestr('files/'+name,data)
    output.writestr('custom_md.jhinote',gz({'customMdContents':[
        {'fileMdStr':sha(data),'fileNameMdStr':sha(name.encode())} for name,data in files.items()]}))
(assets/'paper_base3_source.jpg').unlink(missing_ok=True)
print('Built calibration and format-only template; no source paper or cover images')
