"""Export geometry for structured paragraphs and character scripts."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP / 'python'))
from handwriting_composer import compose_document
from mobile_backend import _document
from pencilengine_writer import write_pencilengine
from pencilengine_reader import read_pencilengine
from pencilengine_width import native_width


class TextEditingTests(unittest.TestCase):
    def compose(self, paragraphs):
        return compose_document(APP / 'assets/glyphs_v24.json', {'paragraphs': paragraphs},
                                jitter_x=0, jitter_y=0, seed=42)

    def test_scripts_shrink_coordinates_keep_pen_width_and_shift_baselines(self):
        for thickness in (0, 2, 7):
            with self.subTest(thickness=thickness):
                segments=[{'text':'a','scale':1.4,'thickness':thickness},
                          {'text':'a','scale':1.4,'thickness':thickness,'script':'sup'},
                          {'text':'a','scale':1.4,'thickness':thickness,'script':'sub'}]
                page=self.compose([{'segments':segments}])['pages'][0]
                normal,sup,sub=page['placements']
                self.assertAlmostEqual(sup['scale'], normal['scale']*.65)
                self.assertAlmostEqual(sub['scale'], normal['scale']*.65)
                self.assertLess(sup['baseline_y'],normal['baseline_y'])
                self.assertGreater(sub['baseline_y'],normal['baseline_y'])
                for stroke in page['strokes']:
                    self.assertEqual(stroke['width_scale'],1)
                    self.assertEqual(stroke['thickness'],thickness)
                # Equal explicit widths are retained in the actual native file.
                if thickness:
                    with tempfile.TemporaryDirectory() as folder:
                        path=Path(folder)/'text.bin'
                        write_pencilengine({'strokes':page['strokes']},APP/'assets/template_1stroke.hinote',path)
                        parsed=read_pencilengine(path)
                        widths=[round(native_width(vars(s)),6) for s in parsed.strokes]
                        self.assertEqual(len(set(widths)),1)

    def test_soft_break_keeps_one_marker_and_hanging_text_alignment(self):
        page=self.compose([{'segments':[{'text':'A\nB\n\nC'}],
                            'list':{'marker':'1.','level':0,'indent_squares':0}}])['pages'][0]
        placements=page['placements']
        self.assertEqual(''.join(p['char'] for p in placements),'1.ABC')
        a,b,c=[p for p in placements if p['char'] in 'ABC']
        self.assertEqual(a['x'],b['x']);self.assertEqual(b['x'],c['x'])
        self.assertGreater(b['baseline_y'],a['baseline_y'])
        self.assertAlmostEqual(c['baseline_y']-b['baseline_y'],2*(b['baseline_y']-a['baseline_y']))

    def test_multilevel_marker_width_does_not_overlap_the_body(self):
        page=self.compose([{'segments':[{'text':'Texto'}],
                            'list':{'marker':'12.34.56.','level':2,'indent_squares':2}}])['pages'][0]
        marker=[s for s in page['strokes'] if s['char'] in '123456.']
        body=[s for s in page['strokes'] if s['char'] in 'Texto']
        self.assertLess(max(p['x'] for s in marker for p in s['points']),min(p['x'] for s in body for p in s['points']))

    def test_independent_marker_size_reaches_native_ink_and_keeps_text_clear(self):
        for marker in ('1.', 'a)', 'III.', '12.34.', '•', '*', '-'):
            for marker_scale, text_scale in ((.6, .6), (2, .6), (.6, 1.5)):
                with self.subTest(marker=marker, marker_scale=marker_scale, text_scale=text_scale):
                    checked=_document(json.dumps({'paragraphs':[{
                        'segments':[{'text':'Texto', 'scale':text_scale, 'thickness':2}],
                        'list':{'marker':marker, 'marker_scale':marker_scale, 'marker_thickness':2}
                    }]}))
                    page=self.compose(checked['paragraphs'])['pages'][0]
                    marker_placements=page['placements'][:len(marker)]
                    self.assertTrue(all(p['scale']==marker_scale for p in marker_placements))
                    self.assertTrue(all(p['scale']==text_scale for p in page['placements'][len(marker):]))
                    marker_strokes=[s for s in page['strokes'] if s['char'] in marker]
                    text_strokes=[s for s in page['strokes'] if s['char'] in 'Texto']
                    self.assertLess(max(p['x'] for s in marker_strokes for p in s['points']), min(p['x'] for s in text_strokes for p in s['points']))
                    with tempfile.TemporaryDirectory() as folder:
                        path=Path(folder)/'text.bin'
                        write_pencilengine({'strokes':page['strokes']},APP/'assets/template_1stroke.hinote',path)
                        parsed=read_pencilengine(path)
                        self.assertEqual(len(parsed.strokes),len(page['strokes']))
                        self.assertEqual(len({round(native_width(vars(s)),6) for s in parsed.strokes}),1)

    def test_manual_indentation_does_not_change_hierarchy_and_scripts_are_validated(self):
        doc={'paragraphs':[{'segments':[{'text':'a','scale':.6,'script':'sub'}],
                            'list':{'marker':'2.1.','level':1,'indent_squares':4}}]}
        checked=_document(json.dumps(doc))
        self.assertEqual(checked['paragraphs'][0]['list']['level'],1)
        self.assertEqual(checked['paragraphs'][0]['list']['indent_squares'],4)
        self.assertEqual(checked['paragraphs'][0]['segments'][0]['script'],'sub')
        doc['paragraphs'][0]['segments'][0]['script']='bad'
        with self.assertRaises(ValueError):_document(json.dumps(doc))

    def test_soft_break_can_end_a_paragraph_without_losing_a_blank_line(self):
        placements=self.compose([{'segments':[{'text':'A\n'}]}, {'segments':[{'text':'B'}]}])['pages'][0]['placements']
        ordinary=self.compose([{'segments':[{'text':'A'}]}, {'segments':[{'text':'B'}]}])['pages'][0]['placements']
        self.assertAlmostEqual(placements[1]['baseline_y']-placements[0]['baseline_y'],2*(ordinary[1]['baseline_y']-ordinary[0]['baseline_y']))


if __name__=='__main__':unittest.main()
