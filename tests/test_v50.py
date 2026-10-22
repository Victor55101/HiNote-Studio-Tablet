"""V50: native PDFs, deterministic incremental layout and independent text ink."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
ASSETS = APP / 'assets'
sys.path.insert(0, str(APP / 'python'))
import mobile_backend as backend
from handwriting_composer import compose_document, document_from_plain_text
from math_graph_composer import format_tick
from validate_hinote import loadj, validate_hinote
from pencilengine_reader import read_pencilengine


def sample_pdf(label):
    # Two valid vector pages, independent of optional PDF libraries in CI.
    stream = f'BT /F1 12 Tf 20 160 Td ({label}) Tj ET'.encode()
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data=b'%PDF-1.4\n'; offsets=[0]
    for i, obj in enumerate(objects,1):
        offsets.append(len(data)); data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 7\n0000000000 65535 f \n'
    for offset in offsets[1:]: data+=f'{offset:010d} 00000 n \n'.encode()
    return data+f'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


class V50Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.cache=Path(self.temp.name)/'cache';self.cache.mkdir()
    def compose(self, doc, previous='', settings=None, token=None, project=ASSETS):
        return json.loads(backend.compose(str(project),str(self.cache),json.dumps(doc),json.dumps(settings or {}),token,previous))
    def assert_same_pages(self,a,b):
        self.assertEqual(a['page_count'],b['page_count'])
        for key in ('warnings','stroke_counts','table_pages','object_pages','pdf_pages','layout'):
            self.assertEqual(a[key],b[key],key)
        for i in range(a['page_count']):
            self.assertEqual((self.cache/a['snapshot']/f'page-{i}.json').read_bytes(),
                             (self.cache/b['snapshot']/f'page-{i}.json').read_bytes(),f'page {i} preview')
            left=read_pencilengine(self.cache/a['snapshot']/f'page-{i}.bin')
            right=read_pencilengine(self.cache/b['snapshot']/f'page-{i}.bin')
            # Native records intentionally have fresh UUIDs; geometry, times,
            # pressure, ink metadata and point headers must be identical.
            self.assertEqual([(s.points,s.metadata_hex,s.point_header_hex) for s in left.strokes],
                             [(s.points,s.metadata_hex,s.point_header_hex) for s in right.strokes])
    def test_incremental_edit_and_deletion_match_fresh_bytes(self):
        doc=document_from_plain_text(('Texto de prueba con variantes. '*4+'\n')*45)
        original=self.compose(doc)
        doc['paragraphs'][-2]['segments'][0]['text']='Cambio final con letra diferente.'
        resumed=self.compose(doc,original['snapshot']);fresh=self.compose(doc,None)
        self.assertGreater(resumed['reused_pages'],2);self.assert_same_pages(resumed,fresh)
        doc['paragraphs']=doc['paragraphs'][:19]
        shorter=self.compose(doc,resumed['snapshot']);self.assert_same_pages(shorter,self.compose(doc,None))
    def test_settings_invalidate_prefix_and_cancel_keeps_previous(self):
        doc=document_from_plain_text(('Prueba de escritura. '*4+'\n')*25)
        original=self.compose(doc)
        changed=self.compose(doc,original['snapshot'],{'word_spacing':40})
        self.assertEqual(changed['reused_pages'],0)
        self.assert_same_pages(changed,self.compose(doc,None,{'word_spacing':40}))
        before=set(self.cache.iterdir())
        class Token:
            cancelled=False
            def isCancelled(self):return self.cancelled
            def onProgress(self,page):pass
            def onPageReady(self,snapshot,meta):self.cancelled=True
        doc['paragraphs'][-1]['segments'][0]['text']='Último cambio'
        with self.assertRaises(InterruptedError):self.compose(doc,original['snapshot'],token=Token())
        self.assertEqual(set(self.cache.iterdir()),before)
    def test_visible_page_available_before_manifest_and_later_pages(self):
        doc=document_from_plain_text(('Página de prueba. '*4+'\n')*22)
        events=[];cache=self.cache
        class Token:
            def isCancelled(self):return False
            def onProgress(self,page):pass
            def onPageReady(self,snapshot,meta):
                info=json.loads(meta);index=info['page_count']-1
                assert (cache/snapshot/f'page-{index}.json').is_file()
                assert not (cache/snapshot/'manifest.json').exists()
                events.append(info['page_count'])
        result=self.compose(doc,token=Token())
        self.assertGreater(len(events),1);self.assertEqual(events,list(range(1,result['page_count']+1)))
    def test_original_pdfs_are_embedded_once_with_native_page_references(self):
        project=Path(self.temp.name)/'project';project.mkdir()
        for name in ('glyphs_v24.json','template_1stroke.hinote'):
            shutil.copyfile(ASSETS/name,project/name)
        folder=project/'pdfs-v50';folder.mkdir();refs=[];originals={}
        for label in ('First PDF','Second PDF'):
            data=sample_pdf(label);asset=hashlib.sha256(data).hexdigest();originals[asset]=data
            (folder/(asset+'.pdf')).write_bytes(data)
            for i in range(2):refs.append({'id':f'{asset}-{i}','asset':asset,'index':i,'pages':2,'name':label+'.pdf'})
        doc={'paragraphs':[{'segments':[{'text':'Nota antes'}]}]+[{'type':'pdf','pdf':r} for r in refs]+[{'segments':[]}]}
        result=self.compose(doc,project=project);self.assertEqual(result['page_count'],5)
        self.assertEqual(result['pdf_pages'],[None]+refs)
        work=self.cache/result['snapshot']
        for i in range(5):shutil.copyfile(ROOT/'tests/thumbnail.jpg',work/f'page-{i}-native.jpg')
        output=self.cache/'pdfs.hinote'
        backend.export_snapshot(str(project),str(self.cache),result['snapshot'],'Dos PDF',True,str(output))
        self.assertTrue(validate_hinote(output,quiet=True))
        with zipfile.ZipFile(output) as z:
            pdf_names=[n for n in z.namelist() if n.endswith('.pdf')];self.assertEqual(len(pdf_names),2)
            for name in pdf_names:self.assertIn(z.read(name),originals.values())
            root=loadj(z.read(next(n for n in z.namelist() if n.endswith('.jhinote') and '/' not in n and n!='custom_md.jhinote')))
            attachments=[a for a in root['customNoteContent']['attachment'] if a['attachType']==3]
            self.assertEqual(len(attachments),2);ids={a['id'] for a in attachments}
            pages=sorted([loadj(z.read(n))['customNotePageContent'] for n in z.namelist() if n.startswith('pages/') and n.endswith('.jhinote')],key=lambda p:p['pageNumber'])
            self.assertNotIn('bkgAttachmentId',pages[0])
            self.assertEqual([p['bkgAttachmentIndex'] for p in pages[1:]],[0,1,0,1])
            self.assertTrue(all(p['bkgAttachmentId'] in ids for p in pages[1:]))
    def test_decimal_axis_labels_both_signs_and_small_steps(self):
        for value,expected in [(100000,'100000'),(120000,'120000'),(-120000,'-120000'),(.000001,'0.000001'),(-.000001,'-0.000001'),(.30000000000000004,'0.3'),(-0.0,'0')]:
            self.assertEqual(format_tick(value),expected)
    def test_independent_bold_italic_underline_survive_native_binary(self):
        plain={'paragraphs':[{'segments':[{'text':'Hola'}]}]}
        styled=copy.deepcopy(plain);styled['paragraphs'][0]['segments'][0].update(bold=True,italic=True,underline=True,color='#334455',opacity=45,thickness=2)
        a=compose_document(ASSETS/'glyphs_v24.json',plain);b=compose_document(ASSETS/'glyphs_v24.json',styled)
        self.assertGreater(len(b['strokes']),len(a['strokes']))
        self.assertEqual(b['strokes'][0]['width_scale'],1.5)
        self.assertEqual(b['strokes'][0]['opacity'],45)
        self.assertNotEqual(a['strokes'][0]['points'][0]['x'],b['strokes'][0]['points'][0]['x'])
        result=self.compose(styled);self.assertGreater(result['stroke_counts'][0],len(a['strokes']))

if __name__=='__main__':unittest.main()
