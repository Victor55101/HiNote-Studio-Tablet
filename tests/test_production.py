import gzip
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prepare_legal',ROOT/'.github/scripts/prepare_legal.py')
legal=importlib.util.module_from_spec(spec);spec.loader.exec_module(legal)
sys.path.insert(0,str(ROOT/'HiNote_Studio_Tablet_Android/app/src/main/python'))
from pencilengine_reader import validate_pencilengine
from validate_hinote import validate_hinote

class ProductionTests(unittest.TestCase):
    def test_publisher_identity_and_verified_channels_are_required_for_store(self):
        config={'publisher_name':'Persona de prueba','postal_address':'Domicilio de prueba',
            'privacy_email':'privacy@example.org','policy_url':'https://example.org/privacy',
            'email_verified':True,'policy_url_verified':True,'policy_version':'2026-10-24'}
        self.assertEqual(legal.pending_fields(config),[])
        for key in ('publisher_name','postal_address','privacy_email','policy_url','email_verified','policy_url_verified'):
            incomplete={**config,key:False if key.endswith('verified') else ''}
            self.assertIn(key,legal.pending_fields(incomplete))
        self.assertIn('https_policy_url',legal.pending_fields({**config,'policy_url':'http://example.org'}))

    def test_unconfirmed_email_is_not_a_live_contact_or_mail_link(self):
        config={'policy_version':'2026-10-24','proposed_privacy_email':'proposed@example.org'}
        policy=legal.privacy(config)
        self.assertIn('Aviso para revisión',policy)
        self.assertNotIn('proposed@example.org',policy)
        self.assertNotIn('href="mailto:',policy)

    def test_publisher_text_cannot_inject_html_into_offline_policy(self):
        policy=legal.privacy({'policy_version':'2026-10-24','publisher_name':'<script>alert(1)</script>'})
        self.assertNotIn('<script>',policy)
        self.assertIn('&lt;script&gt;',policy)

    def test_runtime_format_template_has_no_source_images_cover_or_writing(self):
        template=ROOT/'HiNote_Studio_Tablet_Android/app/src/main/assets/template_1stroke.hinote'
        self.assertTrue(validate_hinote(template,quiet=True))
        with zipfile.ZipFile(template) as note:
            names=note.namelist();self.assertFalse(any(n.lower().endswith(('.jpg','.jpeg')) for n in names))
            png=next(n for n in names if n.endswith('.png'));self.assertLess(len(note.read(png)),100)
            binary=note.read(next(n for n in names if n.endswith('.bin')))
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/'empty.bin';path.write_bytes(binary)
                self.assertEqual(validate_pencilengine(path),(0,0))
            root=json.loads(gzip.decompress(note.read(next(n for n in names if n.endswith('.jhinote') and '/' not in n and n!='custom_md.jhinote'))))['customNoteContent']
            self.assertEqual(root['attachment'],[]);self.assertEqual(root['hasCover'],0)
            self.assertEqual(root['noteTitle'],'Plantilla de formato HiNote Studio')
        self.assertFalse((template.parent/'paper_base3_source.jpg').exists())

    def test_backup_exclusions_cover_cloud_and_device_transfers(self):
        root=ROOT/'HiNote_Studio_Tablet_Android/app/src/main/res/xml'
        old=ET.parse(root/'backup_rules.xml').getroot()
        modern=ET.parse(root/'data_extraction_rules.xml').getroot()
        required={'root','file','database','sharedpref','external'}
        for parent in (old,modern.find('cloud-backup'),modern.find('device-transfer')):
            self.assertIsNotNone(parent)
            self.assertTrue(required.issubset({n.attrib['domain'] for n in parent.findall('exclude') if n.attrib.get('path')=='.'}))

    def test_policy_is_offline_and_discloses_actual_pdf_and_retention_behavior(self):
        policy=legal.privacy({'policy_version':'2026-10-24'})
        for text in ('PDF original completo','siete días','Borrar datos locales','proveedor','portapapeles'):
            self.assertIn(text,policy)
        self.assertNotIn('<script',policy);self.assertNotIn('<iframe',policy);self.assertNotIn('<form',policy)
        self.assertIn("default-src 'none'",policy)

if __name__=='__main__':unittest.main()
