"""Round-trip profile extraction, original preservation, hostile input and ink widths."""
import copy
import gzip
import json
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP/'python'))
import calibration as cal
import mobile_backend as backend
from handwriting_composer import load_library, compose_document, document_from_plain_text
from pencilengine_reader import read_pencilengine
from pencilengine_writer import write_pencilengine
from mobile_hinote_writer import build_hinote_multi, _gzip_json, _gunzip_json
from pencilengine_width import native_width


class CalibrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name);self.project=self.root/'project';self.project.mkdir()
        self.work=self.root/'work';self.work.mkdir()
        self.assets=APP/'assets'
        for filename in ('glyphs_v24.json','template_1stroke.hinote'):
            shutil.copyfile(self.assets/filename,self.project/filename)
        self.original=cal.original(self.project)

    def template(self, text='a_', filled=None):
        guides=cal.template_plan({'groups':[],'custom':text})
        bins=[];thumbs=[];images=[]
        for i,guide in enumerate(guides):
            strokes=[]
            for row,ch in enumerate(guide['chars']):
                for col in range(8):
                    if filled is not None and (ch,col) not in filled:continue
                    glyph=self.original['glyphs']['_' if ch=='_' else 'a'][col]
                    for s in copy.deepcopy(glyph['strokes']):
                        for p in s['points']:
                            p['x']+=cal.LEFT+col*cal.CELL_W+20
                            p['y']+=cal.TOP+row*cal.CELL_H+cal.BASELINE+(4 if ch=='_' else 0)
                        strokes.append(s)
            binary=self.work/f'ink-{i}.bin'
            if strokes:write_pencilengine({'strokes':strokes},self.assets/'template_1stroke.hinote',binary)
            bins.append(binary if strokes else None)
            thumb=self.work/f'guide-{i}.jpg';shutil.copyfile(ROOT/'tests/thumbnail.jpg',thumb);thumbs.append(thumb)
            images.append([{'path':str(thumb),'x':0,'y':0,'width':1000,'height':1600,'angle':0}])
        note=self.work/'source.hinote'
        build_hinote_multi(self.assets/'template_1stroke.hinote',bins,note,thumbnails=thumbs,images=images)
        cal.prepare_import(note,self.work)
        return guides,note

    def import_profile(self, chars='a_', filled=None, target=''):
        guides,_=self.template(chars,filled)
        review=json.loads(cal.extract(self.project,self.work,json.dumps(guides),'Mi prueba',target))
        saved=json.loads(cal.commit(self.project,self.work))
        return saved['saved'],review

    def test_eight_variants_baseline_and_original_protection(self):
        before=(self.project/'glyphs_v24.json').read_bytes()
        identity,review=self.import_profile()
        profile=cal.load_profile(self.project,identity)
        self.assertEqual(profile['name'],'Mi prueba')
        self.assertEqual(len(profile['glyphs']['a']),8)
        self.assertGreater(min(p['y'] for s in profile['glyphs']['_'][0]['strokes'] for p in s['points']),2)
        self.assertEqual(profile['placement_y_offsets']['_'],0)
        for variants in profile['glyphs'].values():
            for g in variants:
                self.assertEqual(g['bbox'][0],0)
                self.assertEqual(min(p['x'] for s in g['strokes'] for p in s['points']),0)
        doc={'paragraphs':[{'segments':[{'text':'a_'*40,'scale':2}]}]}
        out=json.loads(backend.compose(str(self.project),str(self.root/'cache'),json.dumps(doc),json.dumps({'profile':identity})))
        ink=read_pencilengine(self.root/'cache'/out['snapshot']/'page-0.bin')
        self.assertGreater(min(p.x for s in ink.strokes for p in s.points),0)
        self.assertLess(max(p.x for s in ink.strokes for p in s.points),1000)
        self.assertEqual(before,(self.project/'glyphs_v24.json').read_bytes())
        for action in ('delete','rename'):
            with self.assertRaisesRegex(ValueError,'protegida'):cal.action(self.project,action,'{"id":"original"}')

    def test_coverage_partial_variants_and_fallback_are_distinct(self):
        identity,review=self.import_profile('a!_',filled={('a',i) for i in range(4)})
        detail=review['detail']
        self.assertEqual(detail['found'],['a']);self.assertIn('!',detail['missing'])
        self.assertIn('_',detail['fallback']);self.assertIn('!',detail['unavailable'])
        self.assertEqual(detail['incomplete'],['a']);self.assertEqual(detail['variants']['a'],4)
        out=json.loads(backend.compose(str(self.project),str(self.root/'cache'),json.dumps(document_from_plain_text('ab!')),json.dumps({'profile':identity})))
        self.assertIn('Original',out['warnings'][0]);self.assertIn('b',out['warnings'][0])
        self.assertTrue(any('!' in w and 'espacio' in w for w in out['warnings']))
        self.assertEqual(out['profile'],identity)
        accent=json.loads(backend.compose(str(self.project),str(self.root/'cache'),json.dumps(document_from_plain_text('a\u0301')),json.dumps({'profile':identity})))
        self.assertIn('Original',accent['warnings'][0]);self.assertIn('á',accent['warnings'][0])

    def test_supplement_extends_original_copy_and_preserves_blank_rows(self):
        identity,review=self.import_profile('a!',filled={('!',i) for i in range(8)},target='original')
        self.assertTrue(review['copiesOriginal']);self.assertNotEqual(identity,'original')
        profile=cal.load_profile(self.project,identity)
        self.assertIn('!',profile['glyphs']);self.assertEqual(profile['glyphs']['a'],self.original['glyphs']['a'])
        self.assertNotIn('!',cal.original(self.project)['glyphs'])
        old_a=profile['glyphs']['a']
        _,review2=self.import_profile('a!',filled={('!',0)},target=identity)
        self.assertEqual(review2['replaced'],1)
        self.assertEqual(cal.load_profile(self.project,identity)['glyphs']['a'],old_a)
        self.assertEqual(len(cal.load_profile(self.project,identity)['glyphs']['!']),1)

    def test_backup_duplicate_delete_restore_and_profile_switch(self):
        identity,_=self.import_profile()
        path=self.work/'backup.hnprofile';cal.export_profile(self.project,identity,path)
        cal.import_backup(self.project,path,self.work)
        second=json.loads(cal.commit(self.project,self.work))['saved']
        self.assertNotEqual(identity,second)
        renamed=json.loads(cal.action(self.project,'rename',json.dumps({'id':second,'name':'Otra letra'})))
        self.assertEqual(renamed['detail']['name'],'Otra letra')
        cal.action(self.project,'delete',json.dumps({'id':second}))
        with self.assertRaises(ValueError):cal.load_profile(self.project,second)
        cal.action(self.project,'restoreDeleted','{}')
        self.assertEqual(cal.load_profile(self.project,second)['name'],'Otra letra')
        dup=json.loads(cal.action(self.project,'duplicate',json.dumps({'id':identity})))['saved']
        self.assertNotIn(dup,(identity,second))

    def test_original_backup_preserves_all_glyphs_and_native_point_types(self):
        path=self.work/'original.hnprofile'
        cal.export_profile(self.project,'original',path)
        cal.import_backup(self.project,path,self.work)
        identity=json.loads(cal.commit(self.project,self.work))['saved']
        restored=cal.load_profile(self.project,identity)
        self.assertNotEqual(identity,'original')
        self.assertEqual(restored['glyphs'],self.original['glyphs'])
        self.assertEqual(restored['placement_y_offsets'],self.original['placement_y_offsets'])

    def test_full_custom_character_set_still_reports_missing_basic_characters(self):
        custom=''.join(chr(0x4e00+i) for i in range(256))
        plan=cal.template_plan({'groups':[],'custom':custom})
        self.assertEqual(len(plan),22)
        profile=cal.new_profile({c:[self.original['glyphs']['a'][0]] for c in custom},custom,'Personalizado')
        detail=cal.summary(self.project,profile)
        self.assertEqual(len(detail['found']),256)
        self.assertEqual(set(detail['missing']),set(cal.BASE))

    def test_blank_template_rejected_and_cancel_does_not_save(self):
        guides,_=self.template('a',filled=set())
        with self.assertRaisesRegex(ValueError,'vacía'):cal.extract(self.project,self.work,json.dumps(guides),'Vacía')
        class Cancel:
            def isCancelled(self):return True
        guides,_=self.template('a')
        with self.assertRaises(InterruptedError):cal.extract(self.project,self.work,json.dumps(guides),'Cancelada',token=Cancel())
        self.assertFalse(list(cal.profile_dir(self.project).glob('*.hnprofile')))

    def test_mixed_reordered_missing_pages_rejected(self):
        guides,_=self.template('abcdefghijklmn')
        for altered in ([guides[1],guides[0]],guides[:1],[guides[0],{**guides[1],'id':'f'*32}]):
            with self.assertRaises(ValueError):cal.extract(self.project,self.work,json.dumps(altered),'Inválida')

    def test_cross_cell_and_outside_ink_rejected(self):
        for delta in (-200,103):
            guides,_=self.template('a')
            binary=self.work/'input-0.bin';doc=read_pencilengine(binary)
            stroke=copy.deepcopy(self.original['glyphs']['a'][0]['strokes'][0])
            for i,p in enumerate(stroke['points']):
                p['x']+=cal.LEFT+cal.CELL_W/2+(delta if i else 0)
                p['y']+=cal.TOP+cal.BASELINE
            write_pencilengine({'strokes':[stroke]},self.assets/'template_1stroke.hinote',binary)
            with self.assertRaises(ValueError):cal.extract(self.project,self.work,json.dumps(guides),'Inválida')

    def test_corrupt_backup_and_untrusted_zip_rejected(self):
        profile=cal.new_profile({'a':copy.deepcopy(self.original['glyphs']['a'])},['a'],'Prueba')
        profile['glyphs']['a'][0]['strokes'][0]['points'][0]['x']=float('nan')
        with self.assertRaises(ValueError):cal.validate_profile(profile)
        bad=self.work/'bad.hinote'
        with ZipFile(bad,'w') as z:z.writestr('../outside','no')
        with self.assertRaises(ValueError):cal.prepare_import(bad,self.work)
        self.assertFalse((self.root/'outside').exists())
        with self.assertRaises(ValueError):cal.profile_path(self.project,'../original')

    def test_moved_guide_is_rejected_before_extracting(self):
        _,note=self.template('a')
        with ZipFile(note) as z:entries={n:z.read(n) for n in z.namelist()}
        page=next(n for n in entries if n.startswith('pages/') and n.endswith('.jhinote'))
        data=_gunzip_json(entries[page]);data['customNotePageContent']['pageElement'][0]['positionX']=.01
        entries[page]=_gzip_json(data)
        changed=self.work/'moved.hinote'
        with ZipFile(changed,'w') as z:
            for n,b in entries.items():z.writestr(n,b)
        with self.assertRaisesRegex(ValueError,'movida'):cal.prepare_import(changed,self.work)

    def test_template_character_validation_and_stale_review(self):
        guides=cal.template_plan({'groups':['base','math'],'custom':'a!€'})
        collected=''.join(g['chars'] for g in guides)
        self.assertEqual(len(collected),len(set(collected)));self.assertIn('!',collected)
        for custom in ('\u0301','\x00','a\u200db'):
            with self.assertRaises(ValueError):cal.template_plan({'groups':[],'custom':custom})
        identity,_=self.import_profile('a')
        gs,_=self.template('!');cal.extract(self.project,self.work,json.dumps(gs),'',identity)
        cal.action(self.project,'rename',json.dumps({'id':identity,'name':'Cambio'}))
        with self.assertRaisesRegex(ValueError,'cambió'):cal.commit(self.project,self.work)

    def test_width_levels_patch_native_field_without_changing_pressure_or_geometry(self):
        source_doc=document_from_plain_text('a')
        source=compose_document(self.project/'glyphs_v24.json',source_doc)['pages'][0]
        for level in range(1,11):
            source_doc['paragraphs'][0]['segments'][0]['thickness']=level
            page=compose_document(self.project/'glyphs_v24.json',source_doc)['pages'][0]
            self.assertEqual(page['strokes'][0]['points'],source['strokes'][0]['points'])
            binary=self.work/f'level-{level}.bin';write_pencilengine(page,self.assets/'template_1stroke.hinote',binary)
            stroke=read_pencilengine(binary).strokes[0]
            self.assertAlmostEqual(struct.unpack_from('>f',bytes.fromhex(stroke.metadata_hex),96)[0],level/3,places=6)
            self.assertAlmostEqual(stroke.points[0].pressure,source['strokes'][0]['points'][0]['pressure'],places=6)
        self.assertAlmostEqual(native_width(source['strokes'][0]),struct.unpack_from('>f',bytes.fromhex(source['strokes'][0]['metadata_hex']),96)[0])

    def test_list_width_and_snapshot_do_not_change_when_profile_changes(self):
        identity,_=self.import_profile('a')
        doc=document_from_plain_text('* a');doc['paragraphs'][0]['list']['marker_thickness']=3
        doc['paragraphs'][0]['segments'][0]['thickness']=1
        result=json.loads(backend.compose(str(self.project),str(self.root/'cache'),json.dumps(doc),json.dumps({'profile':identity})))
        path=self.root/'cache'/result['snapshot']/'page-0.bin';before=path.read_bytes()
        strokes=read_pencilengine(path).strokes
        widths=[struct.unpack_from('>f',bytes.fromhex(s.metadata_hex),96)[0] for s in strokes]
        self.assertIn(1.,widths);self.assertTrue(any(abs(w-1/3)<1e-6 for w in widths))
        cal.action(self.project,'rename',json.dumps({'id':identity,'name':'Cambio'}))
        self.assertEqual(path.read_bytes(),before)

if __name__=='__main__':unittest.main()
