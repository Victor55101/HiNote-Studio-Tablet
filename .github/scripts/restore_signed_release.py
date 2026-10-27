"""Restore the verified signed release without giving CI the private signing key."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import bsdiff4

ROOT=Path(__file__).resolve().parents[2]


def digest(data):return hashlib.sha256(data).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('base_apk',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--check-source',action='store_true')
    args=parser.parse_args()
    release=json.loads((ROOT/'distribution/releases/1.0.1.json').read_text())
    base=args.base_apk.read_bytes()
    assert digest(base)==release['base_sha256'],'Base APK differs from the verified 1.0.0 download'
    patch=(ROOT/'distribution/releases/1.0.1.bsdiff').read_bytes()
    assert digest(patch)==release['patch_sha256'],'Release delta checksum mismatch'
    if args.check_source:
        source=release['source_commit']
        assert re.fullmatch('[a-f0-9]{40}',source),'Invalid source commit'
        subprocess.run(['git','fetch','--depth','1','origin',source],cwd=ROOT,check=True)
        subprocess.run(['git','diff','--exit-code',source,'HEAD','--',
            'HiNote_Studio_Tablet_Android','.github/assets',
            '.github/scripts/prepare_assets.py','.github/scripts/prepare_legal.py',
            'distribution/publisher.json','distribution/third_party'],cwd=ROOT,check=True)
    apk=bsdiff4.patch(base,patch)
    assert digest(apk)==release['sha256'],'Restored APK differs from the locally signed and verified release'
    args.output.write_bytes(apk)
    (args.output.parent/'SHA256SUMS.txt').write_text(release['sha256']+'  '+args.output.name+'\n')
    print('Signed release restored byte-for-byte; no signing key is held by CI')


if __name__=='__main__':main()
