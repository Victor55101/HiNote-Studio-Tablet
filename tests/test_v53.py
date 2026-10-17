"""Axis arrows follow the signed portions that actually exist in the plot."""
import unittest
from test_math_graphs import graph, ASSETS, Ink, load_library, _Warnings
from math_graph_composer import draw_graph, validate_object
from table_composer import GRID


class V53Tests(unittest.TestCase):
    def test_axis_arrows_point_outward_for_negative_positive_and_mixed_ranges(self):
        class RecordingInk(Ink):
            def __init__(self):
                super().__init__(load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None)
                self.paths=[]
            def path(self,box,coords,*args,**kwargs):
                self.paths.append(coords)
                return super().path(box,coords,*args,**kwargs)
        ranges=[(-6,0),(-6,-2),(0,6),(2,6),(-6,6)]
        for xmin,xmax in ranges:
            for ymin,ymax in ranges:
                for fit in (False,True):
                    with self.subTest(x=(xmin,xmax),y=(ymin,ymax),gridFit=fit):
                        painter=RecordingInk()
                        obj=validate_object(graph(width=12,height=8,xmin=xmin,xmax=xmax,ymin=ymin,ymax=ymax,xstep=2,ystep=2,gridFit=fit,series=[],ticks=False,xlabel='',ylabel='',title=''))
                        box=draw_graph(obj,painter)
                        heads=[p for p in painter.paths if len(p)==3]
                        directions=set()
                        for a,tip,b in heads:
                            if a[0]==b[0]:
                                directions.add('right' if tip[0]>a[0] else 'left')
                                self.assertAlmostEqual(tip[1],(a[1]+b[1])/2)
                            else:
                                directions.add('down' if tip[1]>a[1] else 'up')
                                self.assertAlmostEqual(tip[0],(a[0]+b[0])/2)
                        expected=set()
                        if xmin<0:expected.add('left')
                        if xmax>0:expected.add('right')
                        if ymin<0:expected.add('down')
                        if ymax>0:expected.add('up')
                        self.assertEqual(directions,expected);self.assertEqual(len(heads),len(expected))
                        for stroke in box.strokes:
                            for p in stroke['points']:
                                self.assertTrue(0<=p['x']<=box.width);self.assertTrue(0<=p['y']<=obj['height']*GRID)

    def test_disabling_arrows_keeps_only_the_axis_stems(self):
        class RecordingInk(Ink):
            def __init__(self):
                super().__init__(load_library(ASSETS/'glyphs_v24.json'),123,_Warnings(),lambda:None);self.paths=[]
            def path(self,box,coords,*args,**kwargs):
                self.paths.append(coords);return super().path(box,coords,*args,**kwargs)
        p=RecordingInk();draw_graph(validate_object(graph(xmin=-6,xmax=6,ymin=-6,ymax=6,series=[],ticks=False,arrows=False,xlabel='',ylabel='',title='')),p)
        self.assertEqual(len(p.paths),2);self.assertTrue(all(len(path)==2 for path in p.paths))

if __name__=='__main__':unittest.main()
