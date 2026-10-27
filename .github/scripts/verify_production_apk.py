"""Inspect the final production APK, not only Gradle or source manifests."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess
import zipfile

def string_pool(data, position):
    """Decode a ResStringPool shared by compiled XML and resources.arsc."""
    u16=lambda p:struct.unpack_from('<H',data,p)[0]
    u32=lambda p:struct.unpack_from('<I',data,p)[0]
    def length8(p):
        n=data[p];return (((n&127)<<8)|data[p+1],p+2) if n&128 else (n,p+1)
    def length16(p):
        n=u16(p);return (((n&32767)<<16)|u16(p+2),p+4) if n&32768 else (n,p+2)
    header=u16(position+2)
    count,_,flags,start,_=struct.unpack_from('<IIIII',data,position+8)
    strings=[]
    for i in range(count):
        p=position+start+u32(position+header+4*i)
        if flags&256:
            _,p=length8(p);length,p=length8(p);strings.append(data[p:p+length].decode('utf-8'))
        else:
            length,p=length16(p);strings.append(data[p:p+length*2].decode('utf-16le'))
    return strings

def binary_xml(data):
    strings=[];elements=[];position=8
    u32=lambda p:struct.unpack_from('<I',data,p)[0]
    while position<len(data):
        kind,header,size=struct.unpack_from('<HHI',data,position)
        if size<8 or position+size>len(data):raise ValueError('Invalid binary XML chunk')
        if kind==1:
            strings=string_pool(data,position)
        elif kind==0x102:
            tag=strings[u32(position+20)];start,stride,count=struct.unpack_from('<HHH',data,position+24);attrs={}
            for i in range(count):
                p=position+16+start+i*stride;_,name,raw=struct.unpack_from('<III',data,p)
                _,_,value_type,value=struct.unpack_from('<HBBI',data,p+12)
                attrs[strings[name]]=strings[raw] if raw!=0xffffffff else strings[value] if value_type==3 else value
            elements.append((tag,attrs))
        position+=size
    return elements

def resource_file_paths(data):
    """Resolve resource IDs to APK paths, including AAPT's shortened filenames."""
    strings=[];paths={}
    u16=lambda p:struct.unpack_from('<H',data,p)[0]
    u32=lambda p:struct.unpack_from('<I',data,p)[0]
    def chunks(start,end):
        while start<end:
            kind,header,size=struct.unpack_from('<HHI',data,start)
            if header<8 or size<header or start+size>end:
                raise ValueError('Invalid resource table chunk')
            yield start,kind,header,size
            start+=size
    for pos,kind,header,size in chunks(u16(2),len(data)):
        if kind==1:
            strings=string_pool(data,pos)
        elif kind==0x200:
            package_id=u32(pos+8)
            type_offset=u32(pos+284) if header>=288 else 0
            for at,child,child_header,child_size in chunks(pos+header,pos+size):
                if child!=0x201:continue
                type_id,flags=struct.unpack_from('<BB',data,at+8)
                count,entries_start=struct.unpack_from('<II',data,at+12)
                offsets=at+child_header
                for index in range(count):
                    if flags&1:  # Sparse: entry index and offset in four-byte units.
                        entry_index,offset=struct.unpack_from('<HH',data,offsets+index*4)
                        offset*=4
                    elif flags&2:  # Compact 16-bit offsets.
                        entry_index=index;offset=u16(offsets+index*2)
                        if offset==0xffff:continue
                        offset*=4
                    else:
                        entry_index=index;offset=u32(offsets+index*4)
                        if offset==0xffffffff:continue
                    entry=at+entries_start+offset
                    if entry+8>at+child_size:raise ValueError('Invalid resource entry')
                    entry_size,entry_flags=struct.unpack_from('<HH',data,entry)
                    if entry_flags&1:continue  # Complex/bag resources are not files.
                    value_at=entry+entry_size
                    if entry_size<8 or value_at+8>at+child_size:
                        raise ValueError('Invalid resource value')
                    _,_,value_type,value=struct.unpack_from('<HBBI',data,value_at)
                    if value_type==3:
                        resource_id=(package_id<<24)|((type_id+type_offset)<<16)|entry_index
                        paths.setdefault(resource_id,set()).add(strings[value])
    return paths

def verify(apk, legacy_1_0_0=False):
    # The previous signed download remains available, but cannot be mistaken
    # for a newly built release or bypass the current legal-document checks.
    if legacy_1_0_0:
        assert hashlib.sha256(apk.read_bytes()).hexdigest()=='3513daa267dc5bbefa0036b81ea48307c73489cdeb22001ccd9ff7a0d47e88a0', 'Legacy download differs from the published 1.0.0 APK'
    with zipfile.ZipFile(apk) as archive:
        manifest=binary_xml(archive.read('AndroidManifest.xml'))
        package=next(a for t,a in manifest if t=='manifest');app=next(a for t,a in manifest if t=='application')
        assert package['package']=='com.hinote.studio.v54maintenance',package
        assert (package['versionCode'],package['versionName'])==((67,'1.0.0') if legacy_1_0_0 else (68,'1.0.1')),package
        assert app['label']=='HiNote Studio',app
        assert not app.get('debuggable',0) and not app.get('testOnly',0),app
        assert not app.get('allowBackup',1) and not app.get('usesCleartextTraffic',1),app
        assert app.get('fullBackupContent') and app.get('dataExtractionRules'),app
        permissions=[a['name'] for t,a in manifest if t.startswith('uses-permission')]
        services=[a['name'] for t,a in manifest if t=='service']
        assert not permissions and not services,(permissions,services)
        legal=next(a for t,a in manifest if t=='activity' and a['name']=='com.hinote.studio.LegalActivity')
        assert not legal.get('exported',0),legal
        providers=[a for t,a in manifest if t=='provider']
        assert len(providers)==1 and not providers[0].get('exported',0),providers
        resource_paths=resource_file_paths(archive.read('resources.arsc'))
        backup_resources={}
        for attribute in ('fullBackupContent','dataExtractionRules'):
            paths=resource_paths.get(app[attribute],set())
            assert paths,(attribute,app[attribute])
            backup_resources[attribute]=sorted(paths)
            for path in paths:
                nodes=binary_xml(archive.read(path))
                expected_root='data-extraction-rules' if attribute=='dataExtractionRules' else 'full-backup-content'
                assert nodes[0][0]==expected_root,(attribute,path,nodes)
                exclusions=[a for t,a in nodes if t=='exclude']
                domains=['root','file','database','sharedpref','external']
                domains+=['device_root','device_file','device_database','device_sharedpref']
                for domain in domains:
                    expected=2 if attribute=='dataExtractionRules' else 1
                    assert sum(a.get('domain')==domain and a.get('path')=='.' for a in exclusions)==expected,(attribute,path,domain)
        assert 'assets/privacy.js' in archive.namelist()
        editor_html=archive.read('assets/index.html').decode()
        assert 'id="aboutBtn"' in editor_html and 'id="privacyBtn"' not in editor_html
        policy=archive.read('assets/legal/privacy.html').decode()
        assert 'Política de privacidad' in policy and "default-src 'none'" in policy
        assert '<script' not in policy and '<form' not in policy and '<iframe' not in policy
        assert 'CPython' in archive.read('assets/legal/licenses.html').decode()
        notice=json.loads(archive.read('assets/legal/notice.json'))
        components=json.loads(archive.read('assets/legal/licenses.json'))['components']
        assert notice['contact_email']=='soporte.hinotestudio@gmail.com',notice['contact_email']
        publisher=json.loads((Path(__file__).resolve().parents[2]/'distribution/publisher.json').read_text())
        assert notice['policy_url_verified']
        if not legacy_1_0_0:
            assert notice['policy_url']==publisher['policy_url']=='https://victor55101.github.io/HiNote-Studio-Tablet/'
            assert notice['terms_url']==publisher['terms_url']=='https://victor55101.github.io/HiNote-Studio-Tablet/terms.html'
            assert notice['terms_url_verified']
            terms=archive.read('assets/legal/terms.html').decode()
            assert "default-src 'none'" in terms and '<script' not in terms and '<iframe' not in terms
            assert 'Condiciones de uso' in terms and 'Las funciones ofrecidas gratuitamente se mantienen gratuitas' in terms
            assert terms.split('<body>',1)[1].rsplit('</body>',1)[0]==notice['terms_html']
            assert 'chatgpt.site' not in json.dumps(notice)
        assert notice['policy_url'].startswith('https://') and 'github.com/' not in notice['policy_url']
        assert 'Esta versión' not in notice['welcome_summary'] and 'Esta versión' not in policy
        assert '10. Responsable y contacto' in policy and '8. Soporte y derechos sobre tus datos' in policy
        bank=json.loads(archive.read('assets/glyphs_v24.json'))
        original_complete=bank.get('original_revision')=='v25' and len(bank['glyphs'])==110
        assert original_complete or (bank.get('original_revision')=='v24' and len(bank['glyphs'])==105)
        if original_complete:assert all(len(bank['glyphs'][ch])==8 for ch in '!¡&$°')
        for value in ('Hugo Zoé Islas Vázquez','Cda. de Totli 3','soporte.hinotestudio@gmail.com'):
            assert value in policy and value in notice['privacy_html'],value
        assert len(components)>=13 and all(len(c['text'])>100 for c in components)
        assert 'Aviso para revisión' not in policy and 'Pendiente de completar' not in policy
        assert 'assets/paper_base3_source.jpg' not in archive.namelist()
        with zipfile.ZipFile(io.BytesIO(archive.read('assets/template_1stroke.hinote'))) as template:
            assert not any(n.lower().endswith(('.jpg','.jpeg')) for n in template.namelist())
            data=template.read(next(n for n in template.namelist() if n.endswith('.bin')))
            assert struct.unpack_from('>I',data,112)[0]==0
            for name in template.namelist():
                if name.endswith('.jhinote') and name!='custom_md.jhinote':
                    obj=json.loads(gzip.decompress(template.read(name)))
                    assert not any(k in obj for k in ('userId','deviceId','accountId'))
        abis=sorted({n.split('/')[1] for n in archive.namelist() if n.startswith('lib/')})
        assert abis==['arm64-v8a'],abis
        runtime=archive.read('lib/arm64-v8a/libpython3.11.so')
        crypto=archive.read('lib/arm64-v8a/libcrypto_python.so')
        assert re.search(rb'3\.11\.17(?:\x00|\s)',runtime),'Unexpected Python runtime version'
        assert b'OpenSSL 3.5.9 ' in crypto,'Unexpected OpenSSL runtime version'
    return {'package':package['package'],'version_code':package['versionCode'],
        'version_name':package['versionName'],'label':app['label'],'debuggable':False,
        'allow_backup':False,'permissions':permissions,'services':services,
        'abis':abis,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
        'python_version':'3.11.17','openssl_version':'3.5.9',
        'backup_resources':backup_resources,
        'legal_viewer':'native','support_email':notice['contact_email'],'policy_url':notice['policy_url'],
        'terms_url':notice.get('terms_url'),'terms_included':bool(notice.get('terms_html')),
        'original_characters':len(bank['glyphs']),'original_complete':original_complete,
        'policy_is_draft':'Aviso para revisión' in policy,'signature_verified':False}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('apk',type=Path)
    parser.add_argument('--output',type=Path);parser.add_argument('--apksigner',type=Path)
    parser.add_argument('--expected-certificate')
    parser.add_argument('--legacy-1-0-0',action='store_true',help='Verify only the byte-identical, previously published 1.0.0 download')
    args=parser.parse_args();result=verify(args.apk,args.legacy_1_0_0)
    if args.apksigner:
        assert result['original_complete'], 'Private expanded Original must be packaged locally before final signing'
        signed=subprocess.check_output(['java','-jar',str(args.apksigner),'verify','--verbose','--print-certs',str(args.apk)],text=True)
        certificates=set(re.findall(r'certificate SHA-256 digest: ([a-f0-9]{64})',signed))
        assert len(certificates)==1,certificates
        if args.expected_certificate:assert certificates=={args.expected_certificate},certificates
        for scheme in ('v2','v3'):
            assert re.search(r'Verified using '+scheme+r' scheme .*: true',signed),scheme+' signature missing'
        # minSdk 24 verification legitimately skips JAR signing when v2/v3
        # succeeds. Force an older verifier to validate the compatibility
        # signature too; this does not change the APK's supported SDK range.
        legacy=subprocess.check_output(['java','-jar',str(args.apksigner),'verify','--verbose','--print-certs',
            '--min-sdk-version','23','--max-sdk-version','23',str(args.apk)],text=True,stderr=subprocess.STDOUT)
        assert re.search(r'Verified using v1 scheme .*: true',legacy),'v1 compatibility signature missing'
        legacy_certificates=set(re.findall(r'certificate SHA-256 digest: ([a-f0-9]{64})',legacy))
        assert legacy_certificates==certificates,'Signature schemes use different certificates'
        result['signature_schemes']={'v1':True,'v2':True,'v3':True}
        result['certificate_sha256']=next(iter(certificates));result['signature_verified']=True
    print(json.dumps(result,indent=2))
    if args.output:args.output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
