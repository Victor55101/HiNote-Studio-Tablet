import gzip
import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];APP=ROOT/'HiNote_Studio_Tablet_Android/app/src/main'
ASSETS=APP/'assets';sys.path.insert(0,str(APP/'python'))
from mobile_hinote_writer import build_hinote_multi,_gzip_json,_gunzip_json
from notebook_merger import inspect_notebook,merge_notebooks,thumbnail
from validate_hinote import validate_hinote


class NotebookTests(unittest.TestCase):
    def fixture(self,directory,title='Origen',partial=False,with_image=False):
        path=directory/(title+'.hinote');thumb=ROOT/'tests/thumbnail.jpg'
        with zipfile.ZipFile(ASSETS/'template_1stroke.hinote') as z:
            binary=directory/'ink.bin';binary.write_bytes(z.read(next(n for n in z.namelist() if n.endswith('.bin'))))
        image=directory/'image.jpg';image.write_bytes(thumb.read_bytes())
        images=[[{'path':str(image),'x':80,'y':300,'width':200,'height':150,'angle':30}],[]] if with_image else None
        build_hinote_multi(ASSETS/'template_1stroke.hinote',[binary,binary],path,title=title,thumbnails=[thumb,thumb],images=images)
        if partial:
            with zipfile.ZipFile(path) as z:entries={n:z.read(n) for n in z.namelist()}
            for name in entries:
                if name.startswith('pages/') and name.endswith('.jhinote'):
                    obj=_gunzip_json(entries[name]);obj['customNotePageContent']['pageNumber']+=7;entries[name]=_gzip_json(obj)
            with zipfile.ZipFile(path,'w') as z:
                for name,data in entries.items():z.writestr(name,data)
        return path

    def test_partial_native_numbers_supported_and_selected_order_normalized(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d,'Semestre',partial=True);b=self.fixture(d,'Clase')
            ai=json.loads(inspect_notebook(a));bi=json.loads(inspect_notebook(b));self.assertEqual([p['number'] for p in ai['pages']],[8,9])
            plan={'title':'Materia','pages':[{'source':'a','page':ai['pages'][1]['id']},{'source':'b','page':bi['pages'][0]['id']},{'source':'a','page':ai['pages'][0]['id']}]}
            out=d/'combined.hinote';merge_notebooks(json.dumps({'a':str(a),'b':str(b)}),json.dumps(plan),out,d/'work')
            self.assertTrue(validate_hinote(out,quiet=True));info=json.loads(inspect_notebook(out));self.assertEqual(info['title'],'Materia');self.assertEqual([p['number'] for p in info['pages']],[1,2,3])

    def test_ink_and_images_bytes_unchanged_originals_unchanged_new_ids(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d,'Images',with_image=True);before=a.read_bytes();info=json.loads(inspect_notebook(a))
            out=d/'copy.hinote';plan={'pages':[{'source':'a','page':p['id']} for p in info['pages']]}
            merge_notebooks(json.dumps({'a':str(a)}),json.dumps(plan),out,d/'work')
            self.assertEqual(a.read_bytes(),before);self.assertTrue(validate_hinote(out,quiet=True))
            with zipfile.ZipFile(a) as z,zipfile.ZipFile(out) as target:
                native_bins=[z.read(n) for n in z.namelist() if n.endswith('.bin')]
                copied_bins=[target.read(n) for n in target.namelist() if n.endswith('.bin')]
                self.assertCountEqual(native_bins,copied_bins)
                pages=[_gunzip_json(target.read(n))['customNotePageContent'] for n in target.namelist() if n.startswith('pages/') and n.endswith('.jhinote')]
                ids={p['id'] for p in pages};self.assertFalse(ids&{p['id'] for p in info['pages']})
                images=[im for p in pages for im in p['pageElement']];self.assertEqual(len(images),1);im=images[0]
                self.assertIn(im['notePageId'],ids);self.assertEqual(im['angle'],30)
                self.assertEqual(target.read('files/'+Path(im['filePath']).name),(ROOT/'tests/thumbnail.jpg').read_bytes())

    def test_repeated_page_gets_independent_id_and_native_bin_reference(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d);p=json.loads(inspect_notebook(a))['pages'][0]['id'];out=d/'copy.hinote'
            merge_notebooks(json.dumps({'a':str(a)}),json.dumps({'pages':[{'source':'a','page':p}]*2}),out,d/'work')
            self.assertTrue(validate_hinote(out,quiet=True));info=json.loads(inspect_notebook(out));self.assertEqual(len({p['id'] for p in info['pages']}),2)

    def test_original_thumbnail_is_read_by_page_id(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d);pid=json.loads(inspect_notebook(a))['pages'][0]['id'];dest=d/'thumbnail.input'
            thumbnail(a,pid,dest);self.assertEqual(dest.read_bytes(),(ROOT/'tests/thumbnail.jpg').read_bytes())
            with self.assertRaisesRegex(ValueError,'disponible'):thumbnail(a,'bad',dest)

    def test_multiple_native_binary_resources_rejected_without_overwriting(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d)
            with zipfile.ZipFile(a) as z:entries={n:z.read(n) for n in z.namelist()}
            page_name=next(n for n in entries if n.startswith('pages/') and n.endswith('.jhinote'))
            obj=_gunzip_json(entries[page_name]);entry=next(f for f in obj['fileList'] if f['name'].endswith('.bin'))
            extra='auxiliary.bin';entries['files/'+extra]=entries['files/'+entry['name']]
            obj['fileList'].append({'name':extra,'hash':entry['hash']});entries[page_name]=_gzip_json(obj)
            with zipfile.ZipFile(a,'w') as z:
                for n,b in entries.items():z.writestr(n,b)
            pid=obj['customNotePageContent']['id'];out=d/'copy.hinote'
            before=a.read_bytes()
            with self.assertRaisesRegex(ValueError,'binarios'):
                merge_notebooks(json.dumps({'a':str(a)}),json.dumps({'pages':[{'source':'a','page':pid}]}),out,d/'work')
            self.assertFalse(out.exists());self.assertEqual(a.read_bytes(),before)

    def test_corrupt_hash_cannot_be_saved_and_partial_output_removed(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d)
            with zipfile.ZipFile(a) as z:entries={n:z.read(n) for n in z.namelist()}
            name=next(n for n in entries if n.endswith('.bin'));entries[name]=entries[name]+b'corrupt'
            with zipfile.ZipFile(a,'w') as z:
                for n,b in entries.items():z.writestr(n,b)
            pid=json.loads(inspect_notebook(a))['pages'][0]['id'];out=d/'copy.hinote'
            with self.assertRaisesRegex(ValueError,'hash'):merge_notebooks(json.dumps({'a':str(a)}),json.dumps({'pages':[{'source':'a','page':pid}]}),out,d/'work')
            self.assertFalse(out.exists())

    def test_unsafe_zip_empty_selection_and_unknown_source_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);bad=d/'bad.hinote'
            with zipfile.ZipFile(bad,'w') as z:z.writestr('../outside',b'x')
            with self.assertRaisesRegex(ValueError,'rutas'):inspect_notebook(bad)
            a=self.fixture(d);out=d/'copy.hinote'
            for pages in ([],[{'source':'missing','page':'bad'}]):
                with self.subTest(pages=pages),self.assertRaises(ValueError):merge_notebooks(json.dumps({'a':str(a)}),json.dumps({'pages':pages}),out,d/'work')
                self.assertFalse(out.exists())

    def test_cancel_streaming_copy_never_touches_source(self):
        class Token:
            calls=0
            def isCancelled(self):self.calls+=1;return self.calls>5
            def onProgress(self,page):pass
        with tempfile.TemporaryDirectory() as td:
            d=Path(td);a=self.fixture(d);before=a.read_bytes();pid=json.loads(inspect_notebook(a))['pages'][0]['id'];out=d/'copy.hinote'
            with self.assertRaises(InterruptedError):merge_notebooks(json.dumps({'a':str(a)}),json.dumps({'pages':[{'source':'a','page':pid}]}),out,d/'work',Token())
            self.assertEqual(a.read_bytes(),before);self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
