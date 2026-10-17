"""Build the runtime calibration assets from the archived V11 source."""
import gzip
import json
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
    template = archive.read(PREFIX + 'template_1stroke.hinote')
    (assets / 'template_1stroke.hinote').write_bytes(template)
    # Exact Huawei base3 paper, including spacing and color. PageRenderer removes
    # the sole calibration dash in the known 40..88 x 56..72 pixel rectangle.
    with ZipFile(BytesIO(template)) as note:
        page = next(n for n in note.namelist() if n.startswith('pages/') and n.endswith('.jhinote'))
        data = json.loads(gzip.decompress(note.read(page)))['customNotePageContent']
        assert data['background'] == 'base3'
        (assets / 'paper_base3_source.jpg').write_bytes(note.read('files/' + Path(data['thumbnail']).name))
    print('Built glyphs_v24.json and native base3 paper source')
    print('Restored template_1stroke.hinote')
