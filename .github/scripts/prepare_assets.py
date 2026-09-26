"""Restore the original calibration resources without overwriting editable source."""
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'HiNote_Studio_Tablet_Android/app/src/main/assets/'
with ZipFile(ROOT / 'HiNote_Studio_Tablet_Android_Source.zip') as archive:
    for name in ('glyphs_v11.json', 'template_1stroke.hinote'):
        target = ROOT / PREFIX / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(PREFIX + name))
        print(f'Restored {name}')
