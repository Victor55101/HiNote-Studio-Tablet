import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT/'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP/'python'))
from pro_editor import live_library, compose_live
from mobile_backend import compose, export_snapshot, _settings
from validate_hinote import validate_hinote


class LiveEditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank = live_library(APP/'assets')
        cls.library = json.loads((APP/'assets/glyphs_v24.json').read_text())

    def document(self, text='Hola ñandu\n', extra=None):
        doc = {'paragraphs': [{'segments': [{'text': text, 'scale': 1, **(extra or {})}]}]}
        script = "const fs=require('fs'),L=require('./HiNote_Studio_Tablet_Android/app/src/main/assets/pro_layout.js'),x=JSON.parse(fs.readFileSync(0,'utf8'));const p=L.create(x.bank).layout(x.doc,x.settings);process.stdout.write(JSON.stringify(p.pages.map(p=>p.items.map(c=>[c.line,c.offset,c.v,c.x,c.y]))));"
        data = {'bank': self.bank, 'doc': doc, 'settings': _settings('{}')}
        pages = json.loads(subprocess.check_output(['node','-e',script],input=json.dumps(data).encode(),cwd=ROOT))
        doc['pro_layout'] = {'format': 'hinote-live-v1', 'pages': pages}
        return doc

    def test_live_geometry_and_original_pressure_are_exported_without_relayout(self):
        doc = self.document('áñ Hola', {'scale':1.5, 'italic':True, 'color':'#334455','thickness':2})
        pages = []
        result = compose_live(doc,self.library,_settings('{}'),pages.append,lambda:None)
        self.assertEqual(result['page_count'],1)
        for entry,placement in zip(doc['pro_layout']['pages'][0],pages[0]['placements']):
            self.assertAlmostEqual(entry[3],placement['x'])
            self.assertAlmostEqual(entry[4],placement['baseline_y'])
        entry = doc['pro_layout']['pages'][0][0]
        source = self.library['glyphs']['á'][entry[2]]['strokes'][0]['points'][0]
        target = pages[0]['strokes'][0]['points'][0]
        self.assertAlmostEqual(target['x'],entry[3]+(source['x']-.2*source['y'])*1.5)
        self.assertAlmostEqual(target['y'],entry[4]+source['y']*1.5)
        self.assertEqual(target['pressure'],source['pressure'])

    def test_live_snapshot_round_trip_is_a_valid_hinote(self):
        doc = self.document(('Prueba Pro 123.\n'*45))
        with tempfile.TemporaryDirectory() as tmp:
            info = json.loads(compose(str(APP/'assets'),tmp,json.dumps(doc),'{}'))
            self.assertGreater(info['page_count'],1)
            for i in range(info['page_count']):
                (Path(tmp)/info['snapshot']/f'page-{i}-native.jpg').write_bytes((ROOT/'tests/thumbnail.jpg').read_bytes())
            output = Path(tmp)/'Pro.hinote'
            export_snapshot(str(APP/'assets'),tmp,info['snapshot'],'Pro',True,str(output))
            self.assertTrue(validate_hinote(output))

    def test_incomplete_duplicate_nonfinite_and_invalid_variant_plans_fail(self):
        doc = self.document('Hola')
        variants = []
        bad = copy.deepcopy(doc);bad['pro_layout']['pages'][0].pop();variants.append(bad)
        bad = copy.deepcopy(doc);bad['pro_layout']['pages'][0].append(bad['pro_layout']['pages'][0][0]);variants.append(bad)
        for at,value in [(2,999),(3,float('nan')),(4,10000)]:
            bad = copy.deepcopy(doc);bad['pro_layout']['pages'][0][0][at]=value;variants.append(bad)
        for bad in variants:
            with self.subTest(plan=bad),self.assertRaises(ValueError):
                compose_live(bad,self.library,_settings('{}'),lambda p:None,lambda:None)

    def test_decomposed_accents_and_supplementary_characters_keep_utf16_offsets(self):
        doc = self.document('n\u0303😀A')
        entries = doc['pro_layout']['pages'][0]
        self.assertEqual([e[1] for e in entries],[0,4])
        compose_live(doc,self.library,_settings('{}'),lambda p:None,lambda:None)

    def test_lists_and_blank_paragraphs_are_valid(self):
        doc = self.document('')
        self.assertEqual(doc['pro_layout']['pages'],[[]])
        compose_live(doc,self.library,_settings('{}'),lambda p:None,lambda:None)


if __name__=='__main__': unittest.main()
