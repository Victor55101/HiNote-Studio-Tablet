"""Real glyphs, synthetic table content, native shape framing and bounded layout."""
import copy
import json
import random
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
ASSETS = APP / 'assets'
sys.path.insert(0, str(APP / 'python'))
import mobile_backend as backend
from handwriting_composer import compose_document, load_library, _Warnings
from table_composer import GRID, HALF, validate_table, plan_row
from pencilengine_reader import read_pencilengine, validate_pencilengine, validate_footer
from pencilengine_writer import write_pencilengine
from pencilengine_width import native_width
from validate_hinote import validate_hinote


def table(rows=5, text='Hola Ñandú _- 123.', widths=None):
    widths = widths or [4,5,6]
    return {'id':'test_table', 'widths':widths, 'left':1, 'mode':'standard', 'repeat_header':True,
            'rows':[{'height':1 if i==0 else 2,'cells':[{'segments':[{'text':text}], 'align':'center' if i==0 else 'left', 'valign':'middle'} for _ in widths]} for i in range(rows)]}


class TableTests(unittest.TestCase):
    def compose(self, t, before=None, after=None):
        paragraphs=(before or [])+[{'type':'table','table':t}]+(after or [])
        doc=backend._document(json.dumps({'paragraphs':paragraphs}))
        return compose_document(ASSETS/'glyphs_v24.json',doc)

    def test_native_grid_and_all_ink_stays_inside_table(self):
        t=table(6,'Hola Ñandú gyp ÁÉÍ _- 123. '*3)
        result=self.compose(t)
        for page in result['pages']:
            box=page['tables'][0]
            self.assertAlmostEqual(box['x']*.675,40)
            self.assertAlmostEqual(box['width']*.675,600)
            self.assertAlmostEqual(box['y']/HALF,round(box['y']/HALF))
            for s in page['strokes']:
                for p in s['points']:
                    self.assertGreaterEqual(p['x'],box['x']-.001)
                    self.assertLessEqual(p['x'],box['x']+box['width']+.001)
                    self.assertGreaterEqual(p['y'],box['y']-.001)
                    self.assertLessEqual(p['y'],box['y']+box['height']+.001)

    def test_compact_is_smaller_without_changing_variants_or_pressure(self):
        t=table(1,'abc gyp '*9);t['repeat_header']=False
        standard=self.compose(copy.deepcopy(t))
        t['mode']='compact';compact=self.compose(t)
        a=standard['pages'][0];b=compact['pages'][0]
        self.assertLessEqual(b['tables'][0]['height'],a['tables'][0]['height'])
        self.assertTrue(all(p['scale']==.60 for p in a['placements']))
        self.assertTrue(all(.5<=p['scale']<=.60 for p in b['placements']))
        sa=[s for s in a['strokes'] if not s.get('shape')];sb=[s for s in b['strokes'] if not s.get('shape')]
        self.assertEqual([s['variant'] for s in sa],[s['variant'] for s in sb])
        self.assertEqual([[p['pressure'] for p in s['points']] for s in sa],[[p['pressure'] for p in s['points']] for s in sb])
        self.assertLess(native_width(sb[0]),native_width(sa[0]))

    def test_explicit_cell_size_and_rich_colors(self):
        t=table(1);c=t['rows'][0]['cells'][0];c['size']=.55
        c['segments']=[{'text':'Rojo','color':'#FF0000','thickness':3},{'text':' Negro','color':'#000000'}]
        page=self.compose(t)['pages'][0]
        reds=[s for s in page['strokes'] if s.get('color')=='#FF0000']
        self.assertTrue(reds)
        self.assertAlmostEqual(native_width(reds[0]),.55)
        self.assertTrue(all(p['scale']==.55 for p in page['placements'][:4]))

    def test_standard_sixty_percent_and_fixed_sizes_override_both_modes(self):
        lib=load_library(ASSETS/'glyphs_v24.json')
        for mode in ('standard','compact'):
            for fixed in (0,.5,.6,.73):
                with self.subTest(mode=mode,fixed=fixed):
                    t=validate_table(table(1,'a\nb',widths=[5]));t['mode']=mode
                    t['rows'][0]['cells'][0]['size']=fixed
                    plan=plan_row(t,t['rows'][0],lib,0,123,15,0,_Warnings(),lambda:None)
                    self.assertEqual(plan['cells'][0]['size'],fixed or .6)
                    if fixed in (0,.5,.6):self.assertEqual(plan['height'],GRID)

    def test_whole_rows_move_and_header_repeats(self):
        t=table(9,'dato')
        for row in t['rows']:row['height']=5
        result=self.compose(t,before=[{'segments':[{'text':'Texto previo'}]}],after=[{'segments':[{'text':'Final'}]}])
        self.assertGreater(result['page_count'],1)
        indexes=[]
        for p in result['pages']:
            for box in p.get('tables',[]):
                self.assertEqual(box['rows'][0],0)
                self.assertGreater(len(box['rows']),1) # No orphaned header.
                indexes.extend(i for i in box['rows'] if i)
                self.assertLessEqual(box['y']+box['height'],1545.001)
        self.assertEqual(indexes,list(range(1,9)))
        all_chars=''.join(p['char'] for pg in result['pages'] for p in pg['placements'])
        self.assertTrue(all_chars.startswith('Textoprevio'))
        self.assertTrue(all_chars.endswith('Final'))

    def test_no_header_repetition_keeps_every_row_exactly_once(self):
        t=table(20,'abc');t['repeat_header']=False
        for r in t['rows']:r['height']=3
        result=self.compose(t)
        self.assertEqual([i for p in result['pages'] for box in p['tables'] for i in box['rows']],list(range(20)))
        self.assertEqual(len([p for pg in result['pages'] for p in pg['placements']]),20*3*3)

    def test_oversized_row_is_rejected_without_losing_text(self):
        t=table(1,'a\n'*100,widths=[15]);t['mode']='compact'
        with self.assertRaisesRegex(ValueError,'no caben|no cabe'):self.compose(t)

    def test_huge_cell_stops_planning_as_soon_as_it_exceeds_a_page(self):
        t=validate_table(table(1,'a\n'*50000,widths=[15]));t['mode']='compact'
        lib=load_library(ASSETS/'glyphs_v24.json')
        calls=[]
        plan=plan_row(t,t['rows'][0],lib,0,12345,26,0,_Warnings(),lambda:calls.append(1))
        self.assertGreater(plan['height'],25*GRID)
        self.assertEqual(plan['cells'][0]['lines'],[])
        self.assertLess(len(calls),1000)

    def test_half_square_heights_and_line_breaks(self):
        t=validate_table(table(1,'a\nb',widths=[3]));t['rows'][0]['height']=1.5
        lib=load_library(ASSETS/'glyphs_v24.json')
        plan=plan_row(t,t['rows'][0],lib,0,12345,26,0,_Warnings(),lambda:None)
        lines=plan['cells'][0]['lines']
        self.assertEqual(len(lines),2)
        self.assertAlmostEqual(lines[1]['baseline']-lines[0]['baseline'],HALF)
        self.assertAlmostEqual(plan['height']/HALF,round(plan['height']/HALF))

    def test_accents_and_descenders_do_not_skip_half_square_lines(self):
        lib=load_library(ASSETS/'glyphs_v24.json')
        for separator in (' ', '\n'):
            text=separator.join(('Hola mi Nombre es','Algo José Islas','Álvarez'))
            for mode in ('standard','compact'):
                t=validate_table(table(1,text,widths=[5]));t['mode']=mode
                with self.subTest(separator=separator,mode=mode):
                    plan=plan_row(t,t['rows'][0],lib,0,12345,26,0,_Warnings(),lambda:None)
                    lines=plan['cells'][0]['lines']
                    self.assertGreaterEqual(len(lines),2)
                    for a,b in zip(lines,lines[1:]):
                        self.assertAlmostEqual(b['baseline']-a['baseline'],HALF)

    def test_intentional_blank_cell_line_is_preserved(self):
        t=validate_table(table(1,'a\n\nb',widths=[5]))
        lib=load_library(ASSETS/'glyphs_v24.json')
        plan=plan_row(t,t['rows'][0],lib,0,12345,26,0,_Warnings(),lambda:None)
        lines=plan['cells'][0]['lines']
        self.assertEqual(len(lines),3)
        self.assertEqual(lines[1]['items'],[])
        self.assertAlmostEqual(lines[2]['baseline']-lines[0]['baseline'],GRID)

    def test_body_and_lists_resume_their_grid_after_fractional_tables(self):
        lib=load_library(ASSETS/'glyphs_v24.json')
        for height in (1,1.5,2,2.5):
            with self.subTest(height=height):
                t=table(1,'abc',widths=[5]);t['rows'][0]['height']=height
                before=[{'segments':[{'text':'Antes'}]}]
                after=[{'segments':[{'text':'Hola'}]}, {'segments':[{'text':'Otra línea'}], 'list':{'marker':'•'}}, {'segments':[{'text':'Final'}]}]
                result=self.compose(t,before=before,after=after)
                layout=result['layout'];pg=result['pages'][0]
                normal=[p for p in pg['placements'] if p['scale']==1]
                self.assertTrue(normal)
                for p in normal:
                    base=p['baseline_y']-lib.get('placement_y_offsets',{}).get(p['char'],0)
                    row=(base-layout['margin_top'])/layout['grid_step']
                    self.assertAlmostEqual(row,round(row))
                # The normal first line after the table occupies a whole square,
                # retaining the same lower-edge position as the text before it.
                bottom=pg['tables'][0]['y']+pg['tables'][0]['height']
                hello=normal[len('Antes')]
                self.assertGreaterEqual(hello['baseline_y']-bottom,HALF)
                self.assertLess(hello['baseline_y']-bottom,GRID*1.6)

    def test_body_after_table_page_break_restores_top_baseline(self):
        t=table(1,'abc',widths=[15]);t['rows'][0]['height']=24.5
        result=self.compose(t,after=[{'segments':[{'text':'Hola'}]}])
        self.assertEqual(result['page_count'],2)
        self.assertEqual(result['pages'][1]['placements'][0]['baseline_y'],result['layout']['margin_top'])

    def test_centering_uses_ink_bounds_and_padding(self):
        t=table(1,'a',widths=[4]);t['rows'][0]['cells'][0]['align']='center'
        p=self.compose(t)['pages'][0]
        xs=[pt['x'] for s in p['strokes'] if not s.get('shape') for pt in s['points']]
        self.assertAlmostEqual((min(xs)+max(xs))/2,3*GRID,places=3)

    def test_native_rectangle_footer_and_multiple_tables_round_trip(self):
        t=table(2,'a');second=copy.deepcopy(t);second['id']='second'
        d=backend._document(json.dumps({'paragraphs':[{'type':'table','table':t},{'type':'table','table':second}]}))
        p=compose_document(ASSETS/'glyphs_v24.json',d)['pages'][0]
        with tempfile.TemporaryDirectory() as path:
            binary=Path(path)/'page.bin';write_pencilengine(p,ASSETS/'template_1stroke.hinote',binary)
            out=read_pencilengine(binary);self.assertEqual(out.trailing_bytes,152)
            raw=binary.read_bytes()
            self.assertEqual(struct.unpack_from('>I',raw,88)[0],len(raw)-124)
            self.assertEqual(struct.unpack_from('>I',raw,116)[0],len(raw)-124-152)
            self.assertEqual(validate_pencilengine(binary)[0],len(p['strokes']))
            rectangles=[]
            for s in out.strokes:
                if s.point_type==2:
                    self.assertTrue(all(pt.state==4 for pt in s.points))
                    if len(s.points)==5:rectangles.append(s)
            self.assertEqual(len(rectangles),2)
            for s in rectangles:self.assertEqual((s.points[0].x,s.points[0].y),(s.points[-1].x,s.points[-1].y))
            bad=bytearray.fromhex(out.footer_hex);bad[-8]^=1
            with self.assertRaises(ValueError):validate_footer(bad,{bytes.fromhex(s.header_hex)[16:32] for s in out.strokes})

    def test_snapshot_export_keeps_shapes_and_existing_format(self):
        with tempfile.TemporaryDirectory() as path:
            cache=Path(path);doc={'paragraphs':[{'type':'table','table':table(12,'a')}]}
            m=json.loads(backend.compose(str(ASSETS),str(cache),json.dumps(doc),'{}'))
            self.assertTrue(m['table_pages'][0])
            work=cache/m['snapshot']
            for i in range(m['page_count']):(work/f'page-{i}-native.jpg').write_bytes((ROOT/'tests/thumbnail.jpg').read_bytes())
            out=cache/'table.hinote';backend.export_snapshot(str(ASSETS),str(cache),m['snapshot'],'Tabla',False,str(out))
            self.assertTrue(validate_hinote(out,quiet=True))
            with zipfile.ZipFile(out) as z:
                bins=[z.read(n) for n in z.namelist() if n.endswith('.bin')]
            self.assertEqual(len(bins),m['page_count'])

    def test_limits_and_invalid_geometry(self):
        for patch in ({'widths':[8,8,8]},{'left':float('nan')},{'mode':'bad'},{'widths':[4.25,5,6]}):
            t=table();t.update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValueError):self.compose(t)
        t=table();t['rows'][0]['cells'].pop()
        with self.assertRaises(ValueError):self.compose(t)

    def test_cancel_table_work_discards_incomplete_snapshot(self):
        with tempfile.TemporaryDirectory() as path:
            class Token:
                calls=0
                def isCancelled(self):self.calls+=1;return self.calls>40
                def onProgress(self,page):pass
            with self.assertRaises(InterruptedError):backend.compose(str(ASSETS),path,json.dumps({'paragraphs':[{'type':'table','table':table(200,'hola '*50)}]}),'{}',Token())
            self.assertEqual(list(Path(path).iterdir()),[])

if __name__=='__main__':unittest.main()
