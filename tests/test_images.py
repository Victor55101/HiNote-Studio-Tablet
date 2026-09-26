"""Native-image HiNote packing tests: Android bitmaps are tested separately."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP / 'python'))
from mobile_hinote_writer import build_hinote_multi, _gzip_json
from mobile_backend import compose, export_snapshot, _export_images
from handwriting_composer import document_from_plain_text
from validate_hinote import validate_hinote, loadj

class ImageExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / 'export-test'; self.work.mkdir()
        self.assets = APP / 'assets'
        self.jpeg = (ROOT / 'tests/thumbnail.jpg').read_bytes()
        self.source = self.work / 'image.jpg'; self.source.write_bytes(self.jpeg)

    def image(self, identity='one', page=0, **kw):
        return dict(id=identity, path=str(self.source), page=page, x=180, y=260, width=420, height=630, angle=320, **kw)

    def build(self, text='', count=3, images=None):
        snapshot = json.loads(compose(str(self.assets), str(self.root), json.dumps(document_from_plain_text(text)), '{}'))
        for i in range(count): (self.work / f'page-{i}-grid.jpg').write_bytes(self.jpeg)
        output = self.root / 'test.hinote'
        export_snapshot(str(self.assets), str(self.root), snapshot['snapshot'], 'Imágenes', True, str(output),
                        images_json=json.dumps(images or []), page_count=count, export_dir=str(self.work))
        return output, snapshot

    def test_image_only_pages_omit_binary_and_keep_native_geometry(self):
        output, _ = self.build(images=[self.image(), self.image('two',2)])
        self.assertTrue(validate_hinote(output, quiet=True))
        with zipfile.ZipFile(output) as z:
            self.assertFalse(any(n.endswith('.bin') for n in z.namelist()))
            pages = sorted((loadj(z.read(n)) for n in z.namelist() if n.startswith('pages/') and n.endswith('.jhinote')),key=lambda p:p['customNotePageContent']['pageNumber'])
            self.assertEqual(len(pages),3)
            im = pages[0]['customNotePageContent']['pageElement'][0]
            self.assertEqual((im['elementType'],im['angle'],im['scale']),(1,320,1))
            self.assertAlmostEqual(im['positionX'],.18);self.assertAlmostEqual(im['positionY'],.1625)
            self.assertAlmostEqual(im['width'],.42);self.assertAlmostEqual(im['height'],.39375)
            self.assertEqual(pages[1]['customNotePageContent']['pageElement'],[])
            self.assertEqual(pages[2]['customNotePageContent']['lastPageTag'],1)
            first=im['filePath'].split('/')[-1]
            self.assertEqual(first,pages[2]['customNotePageContent']['pageElement'][0]['filePath'].split('/')[-1])
            self.assertEqual(z.namelist().count('files/'+first),1)

    def test_images_and_writing_coexist_without_changing_strokes(self):
        output, snap = self.build('Hola _-Hola',images=[self.image('back'),self.image('front')])
        with zipfile.ZipFile(output) as z:
            pages = [loadj(z.read(n)) for n in z.namelist() if n.startswith('pages/') and n.endswith('.jhinote')]
            page = next(p for p in pages if p['customNotePageContent']['pageNumber']==1)
            binary = page['customNotePageContent']['attachment'][0]['filePath'].split('/')[-1]
            self.assertEqual(z.read('files/'+binary),(self.root/snap['snapshot']/'page-0.bin').read_bytes())
            self.assertEqual([i['positionZ'] for i in page['customNotePageContent']['pageElement']],[0,1])
            self.assertEqual(len([n for n in z.namelist() if n.endswith('.bin')]),1)

    def test_rejects_paths_nan_ids_and_invalid_pages(self):
        for key,value in [('path',str(ROOT/'tests/thumbnail.jpg')),('angle',float('nan')),('width',0),('page',500),('page',.5),('id','../escape')]:
            im=self.image();im[key]=value
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):
                _export_images(json.dumps([im]),3,self.work)
        with self.assertRaises(ValueError):_export_images(json.dumps([self.image(),self.image()]),3,self.work)
        with self.assertRaises(ValueError):_export_images(json.dumps([self.image(str(i)) for i in range(201)]),3,self.work)

    def test_validator_rejects_missing_image_reference(self):
        output, _ = self.build(images=[self.image()])
        broken=self.root/'broken.hinote'
        with zipfile.ZipFile(output) as source,zipfile.ZipFile(broken,'w') as dest:
            for name in source.namelist():
                data=source.read(name)
                if name.startswith('pages/') and name.endswith('.jhinote'):
                    meta=loadj(data)
                    for im in meta['customNotePageContent']['pageElement']:im['filePath']='/missing.png'
                    data=_gzip_json(meta)
                dest.writestr(name,data)
        self.assertFalse(validate_hinote(broken,quiet=True))

    def test_more_than_500_pages_is_rejected(self):
        with self.assertRaises(ValueError):self.build(count=501)

if __name__=='__main__':unittest.main()
