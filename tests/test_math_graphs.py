import copy
import json
import math
import sys
import struct
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
from math_graph_composer import validate_object,plan_object,smooth_points,Ink,graph_geometry
from pencilengine_width import native_width
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

    def painter(self):
        return Ink(load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None)

    def test_caret_fields_have_no_spacing_and_absolute_value_is_centered(self):
        plain=self.painter().expression(row('12'),1,'#000000',2)
        with_carets=self.painter().expression(row('','12','',''),1,'#000000',2)
        self.assertAlmostEqual(plain.width,with_carets.width)
        self.assertEqual([(p['x'],p['baseline_y']) for p in plain.placements],
                         [(p['x'],p['baseline_y']) for p in with_carets.placements])
        group=self.painter().expression({'type':'group','bracket':'|','body':row('','12','')},1,'#000000',2)
        glyphs=[p for s in group.strokes if s.get('char') for p in s['points']]
        bars=[s for s in group.strokes if s.get('native_segment')]
        self.assertEqual(len(bars),2)
        left,right=(s['points'][0]['x'] for s in bars)
        self.assertAlmostEqual(min(p['x'] for p in glyphs)-left,right-max(p['x'] for p in glyphs))
        self.assertFalse(self.painter().expression({'type':'fraction','num':row(),'den':row()},1,'#000000',2).strokes)

    def test_indices_are_small_and_close_to_the_base(self):
        expr={'type':'scripts','base':row('Q'),'sup':row('2'),'sub':row('1')}
        box=self.painter().expression(expr,1,'#000000',2)
        self.assertEqual([p['scale'] for p in box.placements],[1,.48,.48])
        def bounds(char):
            ys=[p['y'] for s in box.strokes if s.get('char')==char for p in s['points']]
            return min(ys),max(ys)
        top,bottom=bounds('Q');height=bottom-top
        sup_top,sup_bottom=bounds('2');sub_top,sub_bottom=bounds('1')
        self.assertLess(sup_bottom-sup_top,height*.65)
        self.assertGreaterEqual(sup_bottom,top+height*.3)
        self.assertLessEqual(sup_bottom,top+height*.5)
        self.assertLessEqual(sub_top,bottom)
        self.assertGreaterEqual(sub_top,top+height*.65)

    def test_axes_ticks_and_primary_fraction_bar_follow_the_sheet_grid(self):
        for options in ({},{'xmin':-5,'xmax':5,'ymin':-5,'ymax':5}):
            g=graph(**options);geo=graph_geometry(g)
            for value in (geo['ax'],geo['ay']):
                self.assertAlmostEqual(value/HALF,round(value/HALF))
            for v in (0,2,4):
                x,y=geo['xy'](v,v)
                self.assertAlmostEqual(x/HALF,round(x/HALF))
                self.assertAlmostEqual(y/HALF,round(y/HALF))
        f={'type':'fraction','num':row('Q2−Q1'),'den':row('2')}
        page=self.compose([formula(row('x=',f))])['pages'][0]
        bar=max((s for s in page['strokes'] if s.get('native_segment') and s['points'][0]['y']==s['points'][-1]['y']),key=lambda s:abs(s['points'][-1]['x']-s['points'][0]['x']))
        self.assertAlmostEqual(bar['points'][0]['y']/HALF,round(bar['points'][0]['y']/HALF))

    def test_graph_styles_export_and_shared_guides_are_not_overdrawn(self):
        trace={'type':'line','color':'#245BCE','pointColor':'#E53935','guideColor':'#11977B','labelColor':'#8B36AD',
               'width':3,'guideWidth':1.5,'pointSize':3,'markers':True,'guides':True,
               'points':[{'x':2,'y':8,'label':'A'},{'x':5,'y':8,'label':'B'},{'x':7,'y':2,'label':'C'}]}
        box=plan_object(graph(series=[trace]),load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None)
        for ink in ('#245BCE','#E53935','#11977B','#8B36AD'):
            self.assertTrue(any(s['color']==ink for s in box.strokes))
        paths=[s for s in box.strokes if s['color']=='#245BCE']
        geo=graph_geometry(graph(series=[trace]))
        expected=[geo['xy'](p['x'],p['y']) for p in trace['points']]
        self.assertEqual([(s['points'][0]['x'],s['points'][0]['y']) for s in paths]+[(paths[-1]['points'][-1]['x'],paths[-1]['points'][-1]['y'])],expected)
        self.assertTrue(all(abs(native_width(s)-1)<1e-7 for s in paths))
        guides=[s for s in box.strokes if s['color']=='#11977B']
        coords=[tuple((round(p['x'],7),round(p['y'],7)) for p in s['points']) for s in guides]
        self.assertEqual(len(coords),len(set(coords)))
        self.assertTrue(all(abs(native_width(s)-.5)<1e-7 for s in guides))
        axes=[s for s in box.strokes if s['color']=='#000000' and not s.get('char')]
        self.assertGreaterEqual(len(axes),6)
        self.assertTrue(all(abs(native_width(s)-2/3)<1e-6 for s in axes))

    def test_invalid_graph_style_is_rejected(self):
        for patch in ({'pointColor':'red'},{'guideWidth':0},{'pointSize':20},{'width':float('nan')}):
            g=graph();g['series'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValueError):validate_object(g)

    def test_matrix_row_baselines_are_separated_by_half_squares(self):
        matrix={'type':'matrix','bracket':'[','cells':[[row('1'),row('2')],[row('1'),row('4')],[row('1'),row('6')]]}
        box=plan_object(formula(row('A=',matrix)),load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None)
        ys=[p['baseline_y'] for p in box.placements if p['char']=='1']
        self.assertEqual(len(ys),3)
        for a,b in zip(ys,ys[1:]):self.assertAlmostEqual((b-a)/HALF,round((b-a)/HALF))

    def test_dashed_curves_keep_gaps_across_short_interpolation_segments(self):
        g=graph();g['series'][0].update(dashed=True,guides=False,markers=False)
        box=plan_object(g,load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None)
        paths=[s for s in box.strokes if s['color']=='#245BCE' and not s.get('char')]
        self.assertGreater(len(paths),5)
        lengths=[sum(math.dist((a['x'],a['y']),(b['x'],b['y'])) for a,b in zip(s['points'],s['points'][1:])) for s in paths]
        self.assertTrue(all(length<=5.000001 for length in lengths))
        dash_lengths=[lengths[0]]
        for i,(a,b) in enumerate(zip(paths,paths[1:])):
            end,start=a['points'][-1],b['points'][0]
            gap=math.dist((end['x'],end['y']),(start['x'],start['y']))
            if gap<1e-7:dash_lengths[-1]+=lengths[i+1]
            else:
                self.assertGreater(gap,4.8);dash_lengths.append(lengths[i+1])
        self.assertGreater(len(dash_lengths),5)
        for length in dash_lengths[:-1]:self.assertAlmostEqual(length,5,places=6)

    def test_synthetic_curve_and_math_ink_has_fresh_constant_width_native_records(self):
        from math_graph_composer import Box
        painter=self.painter();box=Box()
        coords=smooth_points([(0,0),(40,35),(65,8),(100,55)])
        painter.path(box,coords,'#245BCE',3)
        # The rendered curve still visits every interpolation sample continuously.
        self.assertEqual([(s['points'][0]['x'],s['points'][0]['y']) for s in box.strokes]+[tuple(box.strokes[-1]['points'][-1][k] for k in ('x','y'))],coords)
        with tempfile.TemporaryDirectory() as td:
            # Use the same file-global header as the real composition/export path.
            manifest=json.loads(backend.compose(str(ASSETS),td,json.dumps({'paragraphs':[{'type':'graph','object':graph(series=[{'type':'curve','color':'#245BCE','markers':False,'points':[{'x':0,'y':0},{'x':4,'y':7},{'x':10,'y':2}]}])}]}),'{}'))
            source=Path(td)/manifest['snapshot']/'page-0.bin'
            strokes=read_pencilengine(source).strokes
            synthetic=[s for s in strokes if s.point_type==2]
            self.assertGreater(len(synthetic),40)
            for stroke in synthetic:
                self.assertEqual(len(stroke.points),2)
                self.assertEqual([p.state for p in stroke.points],[4,4])
                self.assertAlmostEqual(stroke.points[0].pressure,stroke.points[1].pressure)
                self.assertEqual(bytes.fromhex(stroke.metadata_hex)[:8],bytes(8))
                self.assertEqual(bytes.fromhex(stroke.metadata_hex)[24:68],bytes(44))
            self.assertEqual(len({s.header_hex[32:64] for s in synthetic}),len(synthetic))

    def test_stretched_calibrated_delimiters_keep_outline_and_constant_width(self):
        for bracket in ('(', '[', '|'):
            painter=self.painter();original=self.painter().text(bracket,.7,'#000000',2)
            top,bottom=-100,60
            stretched=painter.bracket(top,bottom,True,bracket,'#000000',2,.7)
            if bracket!='|':self.assertAlmostEqual(stretched.width,original.width)
            pts=[p for s in stretched.strokes for p in s['points']]
            self.assertAlmostEqual(min(p['y'] for p in pts),top)
            self.assertAlmostEqual(max(p['y'] for p in pts),bottom)
            self.assertTrue(all(s.get('native_segment') for s in stretched.strokes))
            self.assertTrue(all(abs(native_width(s)-1.4/3)<1e-6 for s in stretched.strokes))
            if bracket!='|':self.assertIn(bracket,[p['char'] for p in stretched.placements])

    def test_graph_plot_reserves_one_square_left_and_below(self):
        for options in ({},{'width':7.5,'height':7.5,'xmax':100,'ymax':100,'xstep':20,'ystep':20}):
            g=graph(**options);geo=graph_geometry(g)
            self.assertAlmostEqual(geo['left'],GRID)
            self.assertAlmostEqual(g['height']*GRID-geo['bottom'],GRID)

    def test_mixed_formula_and_graph_rows_share_origin_and_paginate_together(self):
        for reverse in (False,True):
            objects=[formula(row('x=2'),width=7,height=2),graph(left=8.5,height=9,beside=True)]
            if reverse:
                objects.reverse();objects[0].update(left=1,beside=False);objects[1].update(left=8.5,beside=True)
            result=self.compose(objects,before=[{'segments':[{'text':'Antes'}]}]*20)
            pair=result['pages'][-1]['objects']
            self.assertEqual(len(pair),2);self.assertEqual(pair[0]['y'],pair[1]['y'])
            self.assertEqual({p['kind'] for p in pair},{'formula','graph'})

if __name__=='__main__':unittest.main()
