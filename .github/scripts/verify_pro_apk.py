"""Fail closed on the separately installable, signed Pro development APK."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from zipfile import ZipFile
from verify_production_apk import binary_xml

CERTIFICATE = '544fb3ba1fc0b599dbe70c70db294621433559f4b4664585ead097a51ede0cfa'


def verify(apk, signer=None):
    with ZipFile(apk) as z:
        assert len(z.namelist()) == len(set(z.namelist()))
        manifest = binary_xml(z.read('AndroidManifest.xml'))
        package = next(a for t,a in manifest if t == 'manifest')
        app = next(a for t,a in manifest if t == 'application')
        assert package['package'] == 'com.hinote.studio.pro',package
        assert (package['versionName'],package['versionCode']) == ('0.1.0',1),package
        assert app['label'] == 'HiNote Studio Pro',app
        assert not app.get('debuggable',0) and not app.get('testOnly',0),app
        assert not app.get('allowBackup',1) and not app.get('usesCleartextTraffic',1)
        assert not [a for t,a in manifest if t.startswith('uses-permission') or t=='service']
        assert sorted({n.split('/')[1] for n in z.namelist() if n.startswith('lib/')}) == ['arm64-v8a']
        bank = json.loads(z.read('assets/glyphs_v24.json'))
        assert len(bank['glyphs']) == 110 and all(len(g)==8 for g in bank['glyphs'].values())
        assert bank['original_revision'] == 'v25'
        for name in ('pro_layout.js','pro_editor.js','pro_editor.css'):
            assert len(z.read('assets/'+name))>1000
        config = json.loads(z.read('assets/legal/notice.json'))
        assert config['policy_url'] == 'https://victor55101.github.io/HiNote-Studio-Tablet/'
        assert config['terms_url'] == 'https://victor55101.github.io/HiNote-Studio-Tablet/terms.html'
        assert 'chatgpt.site' not in z.read('assets/privacy.js').decode()
    result = {'package':package['package'],'version_name':package['versionName'],
        'version_code':package['versionCode'],'label':app['label'],
        'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'size_bytes':apk.stat().st_size,
        'original_characters':110,'original_variants_per_character':8,
        'release_type':'development_preview','store_submission':False}
    if signer:
        output = subprocess.check_output(['java','-jar',str(signer),'verify','--verbose','--print-certs',str(apk)],text=True)
        certs = set(re.findall(r'certificate SHA-256 digest: ([a-f0-9]{64})',output))
        assert certs == {CERTIFICATE},certs
        for scheme in ('v2','v3'):
            assert re.search(r'Verified using '+scheme+r' scheme .*: true',output)
        old = subprocess.check_output(['java','-jar',str(signer),'verify','--min-sdk-version','23','--max-sdk-version','23','--verbose',str(apk)],text=True)
        assert re.search(r'Verified using v1 scheme .*: true',old)
        result.update(certificate_sha256=CERTIFICATE,signatures=['v1','v2','v3'])
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk',type=Path)
    parser.add_argument('--apksigner',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    result = verify(args.apk,args.apksigner)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
