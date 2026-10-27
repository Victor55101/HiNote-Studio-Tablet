"""Insert the private expanded Original into the unsigned CI APK, then align it.

Only the protected bundled glyph bank changes. Private calibration ink never
needs to be uploaded to the public source repository or its CI service.
"""
import argparse
import copy
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile

parser=argparse.ArgumentParser()
parser.add_argument('candidate',type=Path)
parser.add_argument('--profile',type=Path,required=True)
parser.add_argument('--zipalign',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
asset='assets/glyphs_v24.json'
with tempfile.TemporaryDirectory(prefix='hinote-private-original-') as temporary:
    work=Path(temporary)
    subprocess.run([sys.executable,str(root/'.github/scripts/prepare_assets.py'),
        '--original-profile',str(args.profile.resolve()),'--output-directory',str(work/'assets')],check=True)
    bank=(work/'assets/glyphs_v24.json').read_bytes()
    with ZipFile(args.candidate) as source,ZipFile(work/'un-aligned.apk','w') as target:
        names=source.namelist()
        assert len(names)==len(set(names)) and asset in names,'Invalid APK entries'
        assert not any(n.startswith('META-INF/') and n.endswith(('.SF','.RSA','.DSA','.EC')) for n in names),'Use an unsigned candidate'
        for entry in source.infolist():
            info=copy.copy(entry);info.extra=b''
            target.writestr(info,bank if entry.filename==asset else source.read(entry))
    subprocess.run([str(args.zipalign.resolve()),'-P','16','-f','4',str(work/'un-aligned.apk'),str(args.output.resolve())],check=True)
    subprocess.run([str(args.zipalign.resolve()),'-c','-P','16','4',str(args.output.resolve())],check=True)
    with ZipFile(args.candidate) as before,ZipFile(args.output) as after:
        assert before.namelist()==after.namelist()
        changed=[n for n in before.namelist() if before.read(n)!=after.read(n)]
        assert changed==[asset],changed
print('Expanded Original packaged privately; other APK contents unchanged')
