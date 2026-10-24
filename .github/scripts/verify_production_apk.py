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

def binary_xml(data):
    strings=[];elements=[];position=8
    u16=lambda p:struct.unpack_from('<H',data,p)[0]
    u32=lambda p:struct.unpack_from('<I',data,p)[0]
    def length8(p):
        n=data[p];return (((n&127)<<8)|data[p+1],p+2) if n&128 else (n,p+1)
    def length16(p):
        n=u16(p);return (((n&32767)<<16)|u16(p+2),p+4) if n&32768 else (n,p+2)
    while position<len(data):
        kind,header,size=struct.unpack_from('<HHI',data,position)
        if size<8 or position+size>len(data):raise ValueError('Invalid binary XML chunk')
        if kind==1:
            count,_,flags,start,_=struct.unpack_from('<IIIII',data,position+8)
            for i in range(count):
                p=position+start+u32(position+header+4*i)
                if flags&256:
                    _,p=length8(p);length,p=length8(p);strings.append(data[p:p+length].decode('utf-8'))
                else:
                    length,p=length16(p);strings.append(data[p:p+length*2].decode('utf-16le'))
        elif kind==0x102:
            tag=strings[u32(position+20)];start,stride,count=struct.unpack_from('<HHH',data,position+24);attrs={}
            for i in range(count):
                p=position+16+start+i*stride;_,name,raw=struct.unpack_from('<III',data,p)
                _,_,value_type,value=struct.unpack_from('<HBBI',data,p+12)
                attrs[strings[name]]=strings[raw] if raw!=0xffffffff else strings[value] if value_type==3 else value
            elements.append((tag,attrs))
        position+=size
    return elements

def verify(apk):
    with zipfile.ZipFile(apk) as archive:
        manifest=binary_xml(archive.read('AndroidManifest.xml'))
        package=next(a for t,a in manifest if t=='manifest');app=next(a for t,a in manifest if t=='application')
        assert package['package']=='com.hinote.studio.v54maintenance',package
        assert package['versionCode']==65 and package['versionName']=='5.4.5-production1',package
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
        for name in ('backup_rules','data_extraction_rules'):
            nodes=binary_xml(archive.read('res/xml/'+name+'.xml'))
            exclusions=[a for t,a in nodes if t=='exclude']
            for domain in ('root','file','database','sharedpref','external'):
                expected=2 if name=='data_extraction_rules' else 1
                assert sum(a.get('domain')==domain and a.get('path')=='.' for a in exclusions)==expected,(name,domain)
        assert 'assets/privacy.js' in archive.namelist()
        policy=archive.read('assets/legal/privacy.html').decode()
        assert 'Política de privacidad' in policy and "default-src 'none'" in policy
        assert '<script' not in policy and '<form' not in policy and '<iframe' not in policy
        assert 'CPython' in archive.read('assets/legal/licenses.html').decode()
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
    return {'package':package['package'],'version_code':package['versionCode'],
        'version_name':package['versionName'],'label':app['label'],'debuggable':False,
        'allow_backup':False,'permissions':permissions,'services':services,
        'abis':abis,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
        'policy_is_draft':'Aviso para revisión' in policy,'signature_verified':False}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('apk',type=Path)
    parser.add_argument('--output',type=Path);parser.add_argument('--apksigner',type=Path)
    parser.add_argument('--expected-certificate');args=parser.parse_args();result=verify(args.apk)
    if args.apksigner:
        signed=subprocess.check_output(['java','-jar',str(args.apksigner),'verify','--print-certs',str(args.apk)],text=True)
        certificates=set(re.findall(r'certificate SHA-256 digest: ([a-f0-9]{64})',signed))
        assert len(certificates)==1,certificates
        if args.expected_certificate:assert certificates=={args.expected_certificate},certificates
        result['certificate_sha256']=next(iter(certificates));result['signature_verified']=True
    print(json.dumps(result,indent=2))
    if args.output:args.output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
