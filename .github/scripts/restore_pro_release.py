"""Restore an already signed Pro APK; the private signing key stays offline."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import bsdiff4

ROOT=Path(__file__).resolve().parents[2]
digest=lambda data:hashlib.sha256(data).hexdigest()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('base_apk',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    release=json.loads((ROOT/'distribution/releases/pro-0.1.0.json').read_text())
    base=args.base_apk.read_bytes()
    patch=(ROOT/'distribution/releases/pro-0.1.0.bsdiff').read_bytes()
    assert digest(base)==release['base_sha256']
    assert digest(patch)==release['patch_sha256']
    source=release['source_commit'];assert re.fullmatch('[a-f0-9]{40}',source)
    subprocess.run(['git','fetch','--depth','1','origin',source],cwd=ROOT,check=True)
    subprocess.run(['git','diff','--exit-code',source,'HEAD','--',
        'HiNote_Studio_Tablet_Android','.github/assets',
        '.github/scripts/prepare_assets.py','.github/scripts/prepare_legal.py',
        'distribution/publisher.json','distribution/third_party'],cwd=ROOT,check=True)
    apk=bsdiff4.patch(base,patch)
    assert digest(apk)==release['sha256']
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(apk)
    (args.output.parent/'SHA256SUMS.txt').write_text(release['sha256']+'  '+args.output.name+'\n')
    print('Signed Pro APK restored byte-for-byte without exposing the signing key')
