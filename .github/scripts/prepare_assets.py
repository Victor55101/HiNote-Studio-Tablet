"""Build the runtime calibration assets from the archived V11 source."""
import gzip
import json
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
    (assets / 'glyphs_v22.json').write_text(
        json.dumps(library, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    (assets / 'template_1stroke.hinote').write_bytes(
        archive.read(PREFIX + 'template_1stroke.hinote')
    )
    print('Built glyphs_v22.json with corrected calibration mappings')
    print('Restored template_1stroke.hinote')
