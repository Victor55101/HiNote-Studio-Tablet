import copy
import json
import math
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'HiNote_Studio_Tablet_Android/app/src/main'
ASSETS=APP/'assets'
sys.path.insert(0,str(APP/'python'))
import mobile_backend as backend
from handwriting_composer import compose_document,load_library,_Warnings
from math_graph_composer import validate_object,plan_object,smooth_points
from table_composer import GRID,HALF
from pencilengine_reader import validate_pencilengine,read_pencilengine
from pencilengine_writer import write_pencilengine
from validate_hinote import validate_hinote

def text(value):return {'type':'text','text':value}
def row(*items):return {'type':'row','items':[text(x) if isinstance(x,str) else x for x in items]}
def formula(expr=None,**options):
    return {'id':'formula_test','kind':'formula','left':1,'width':15,'height':2,'gap':0,'size':1,
            'color':'#000000','thickness':2,'fit':True,'expression':expr or row('a+b'),**options}
def graph(**options):
    return {'id':'graph_test','kind':'graph','left':1,'width':7,'height':8,'gap':0,'size':.6,'color':'#000000','thickness':2,
            'xmin':0,'xmax':10,'xstep':2,'ymin':0,'ymax':10,'ystep':2,'xlabel':'Q','ylabel':'P','title':'Demanda',
            'grid':False,'arrows':True,'ticks':True,'series':[{'type':'curve','color':'#245BCE','markers':True,'guides':True,
            'points':[{'x':1,'y':9,'label':'A'},{'x':4,'y':5,'label':'B'},{'x':9,'y':2,'label':'C'}]}],**options}

class MathGraphTests(unittest.TestCase):
    def compose(self,objects,before=None,after=None):
        doc=backend._document(json.dumps({'paragraphs':(before or [])+[{'type':o['kind'],'object':o} for o in objects]+(after or [])}))
        return compose_document(ASSETS/'glyphs_v24.json',doc)

    def test_nested_fraction_root_and_indices_keep_all_ink_in_block(self):
        expression=row('x=',{'type':'fraction','num':row('−b±',{'type':'root','index':row(),
            'body':row({'type':'scripts','base':row('b'),'sup':row('2'),'sub':row()},'−4ac')}),'den':row('2a')})
        result=self.compose([formula(expression)])
        page=result['pages'][0];box=page['objects'][0]
        self.assertTrue(any(s.get('native_segment') for s in page['strokes']))
        self.assertIn('b',''.join(p['char'] for p in page['placements']))
        for s in page['strokes']:
            for p in s['points']:
                self.assertTrue(box['x']-.01<=p['x']<=box['x']+box['width']+.01)
                self.assertTrue(box['y']-.01<=p['y']<=box['y']+box['height']+.01)
        self.assertAlmostEqual(box['height']/HALF,round(box['height']/HALF))

    def test_calibrated_math_sign_has_priority_over_geometric_fallback(self):
        lib=copy.deepcopy(load_library(ASSETS/'glyphs_v24.json'))
        lib['glyphs']['π']=copy.deepcopy(lib['glyphs']['a'])
        lib['glyphs']['∏']=copy.deepcopy(lib['glyphs']['a'])
        operator={'type':'operator','symbol':'∏','lower':row(),'upper':row(),'body':row()}
        page=compose_document(ASSETS/'glyphs_v24.json',{'paragraphs':[{'type':'formula','object':formula(row('π',operator))}]},library_data=lib)['pages'][0]
        self.assertEqual([p['char'] for p in page['placements']],['π','∏'])
        self.assertTrue(all(s['char'] in ('π','∏') for s in page['strokes']))

    def test_structural_symbols_export_without_math_calibration_but_unknown_is_explicit(self):
        result=self.compose([formula(row('π×α÷∞'))])
        self.assertTrue(result['pages'][0]['strokes']);self.assertTrue(any('geométricos' in w for w in result['warnings']))
        with self.assertRaisesRegex(ValueError,'calibración'):self.compose([formula(row('漢'))])

    def test_matrix_and_operators_preserve_nested_fields_and_colors(self):
        matrix={'type':'matrix','bracket':'|','cells':[[row('1'),row({'type':'text','text':'2','color':'#E53935'})],[row('3'),row('4')]]}
        operator={'type':'operator','symbol':'∫','lower':row('0'),'upper':row('1'),'body':row('x dx')}
        result=self.compose([formula(row(matrix,'=',operator))]);page=result['pages'][0]
        self.assertEqual(''.join(p['char'] for p in page['placements'] if p['color']=='#E53935'),'2')
        self.assertTrue(all(math.isfinite(p['x']) and math.isfinite(p['y']) for s in page['strokes'] for p in s['points']))

    def test_fit_reuses_variants_and_never_stretches_letters(self):
        obj=formula(row('Hola '*6),width=4);lib=load_library(ASSETS/'glyphs_v24.json')
        box=plan_object(obj,lib,123,_Warnings(),lambda:None)
        self.assertTrue(all(.4<=p['scale']<=1 for p in box.placements))
        self.assertTrue(all(s.get('width_scale',1)<=1 for s in box.strokes))
        obj['fit']=False
        with self.assertRaisesRegex(ValueError,'no cabe'):plan_object(obj,lib,123,_Warnings(),lambda:None)

    def test_graphs_can_share_a_row_and_group_moves_whole_to_next_page(self):
        a=graph(height=10);b=graph(id='other',left=8.5,width=7,beside=True,height=9)
        result=self.compose([a,b],before=[{'segments':[{'text':'Antes'}]}]*20,after=[{'segments':[{'text':'Hola'}]}])
        self.assertEqual(result['page_count'],2)
        page=result['pages'][1];self.assertEqual(len(page['objects']),2)
        self.assertEqual(page['objects'][0]['y'],page['objects'][1]['y'])
        lib=load_library(ASSETS/'glyphs_v24.json')
        body=[p for p in page['placements'] if p['scale']==1]
        for p in body:
            baseline=p['baseline_y']-lib.get('placement_y_offsets',{}).get(p['char'],0)
            lattice=(baseline-result['layout']['margin_top'])/result['layout']['grid_step']
            self.assertAlmostEqual(lattice,round(lattice))
        b['left']=7
        with self.assertRaisesRegex(ValueError,'superponen'):self.compose([a,b])

    def test_graph_axes_guides_and_labels_stay_inside_allocated_area(self):
        for ranges in ({},{'xmin':-5,'xmax':5,'ymin':-5,'ymax':5,'series':[]}):
            with self.subTest(ranges=ranges):
                page=self.compose([graph(**ranges)])['pages'][0];b=page['objects'][0]
                for s in page['strokes']:
                    for p in s['points']:
                        self.assertGreaterEqual(p['x'],b['x']-.01);self.assertLessEqual(p['x'],b['x']+b['width']+.01)
                        self.assertGreaterEqual(p['y'],b['y']-.01);self.assertLessEqual(p['y'],b['y']+b['height']+.01)
                self.assertTrue(any(s.get('native_segment') for s in page['strokes']))

    def test_curve_interpolation_goes_through_samples_without_overshoot(self):
        points=[(0,10),(1,9),(3,3),(4,2),(5,5)]
        out=smooth_points(points)
        for i,(a,b) in enumerate(zip(points,points[1:])):
            segment=out[i*24:(i+1)*24]
            self.assertEqual(segment[0],a)
            self.assertTrue(all(min(a[1],b[1])-1e-7<=y<=max(a[1],b[1])+1e-7 for _,y in segment))
        self.assertEqual(out[-1],points[-1])

    def test_native_binary_and_snapshot_export_round_trip(self):
        with tempfile.TemporaryDirectory() as td:
            nested={'type':'fraction','num':row({'type':'root','index':row('3'),'body':row({'type':'scripts','base':row('x'),'sup':row('2'),'sub':row('n')},'±π')}),'den':row('2')}
            matrix={'type':'matrix','bracket':'[','cells':[[row('1'),row('2')],[row('3'),row('4')]]}
            product={'type':'operator','symbol':'∏','lower':row('i=1'),'upper':row('n'),'body':row('x')}
            doc={'paragraphs':[{'type':'formula','object':formula(row(nested),size=.6)},
                               {'type':'formula','object':formula(row(matrix,product),id='small_matrix',size=.4)},
                               {'type':'graph','object':graph()}]}
            manifest=json.loads(backend.compose(str(ASSETS),td,json.dumps(doc),'{}'));self.assertTrue(manifest['object_pages'][0])
            work=Path(td)/manifest['snapshot']
            for i in range(manifest['page_count']):
                count,_=validate_pencilengine(work/f'page-{i}.bin');self.assertEqual(count,manifest['stroke_counts'][i])
                (work/f'page-{i}-native.jpg').write_bytes((ROOT/'tests/thumbnail.jpg').read_bytes())
            out=Path(td)/'math.hinote';backend.export_snapshot(str(ASSETS),td,manifest['snapshot'],'Matemáticas',False,str(out))
            self.assertTrue(validate_hinote(out,quiet=True))

    def test_invalid_sizes_depth_ranges_points_and_duplicate_ids_rejected(self):
        bad=[]
        for patch in ({'left':float('nan')},{'width':15.5,'left':1},{'size':.1},{'height':2.25}):bad.append(formula(**patch))
        for patch in ({'xmax':0},{'xstep':.01},{'series':[{'type':'line','points':[{'x':11,'y':2}]}]}, {'series':[{'type':'curve','points':[{'x':3,'y':2},{'x':2,'y':4}]}]}):bad.append(graph(**patch))
        for obj in bad:
            with self.subTest(obj=obj),self.assertRaises(ValueError):validate_object(obj)
        with self.assertRaisesRegex(ValueError,'duplicado'):self.compose([formula(),formula()])

    def test_cancellation_discards_math_snapshot(self):
        class Token:
            count=0
            def isCancelled(self):self.count+=1;return self.count>18
            def onProgress(self,page):pass
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(InterruptedError):backend.compose(str(ASSETS),td,json.dumps({'paragraphs':[{'type':'graph','object':graph()}]}),'{}',Token())
            self.assertFalse(list(Path(td).iterdir()))

if __name__=='__main__':unittest.main()
