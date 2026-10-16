"""PDF insertion at physical page boundaries, independent of the editor caret."""
import copy
import json
import unittest
import test_v50 as v50
from test_v50 import ASSETS, backend, compose_document, document_from_plain_text
from test_tables import table


def pdf(after,index=0,name='A',pages=1):
    return {'type':'pdf','pdf':{'id':f'{name}-{index}','asset':'a'*64,'index':index,'pages':pages,'name':name+'.pdf','after_page':after}}


class V51Tests(unittest.TestCase):
    setUp=v50.V50Tests.setUp
    compose=v50.V50Tests.compose
    assert_same_pages=v50.V50Tests.assert_same_pages

    def test_inserts_inside_wrapped_list_item_without_reflow_or_duplicate_marker(self):
        doc=document_from_plain_text('1. '+('Texto de una lista larga con formato. '*130))
        original=compose_document(ASSETS/'glyphs_v24.json',doc)
        self.assertGreater(original['page_count'],3)
        doc['paragraphs'] += [pdf(0,0,pages=2),pdf(1,1,pages=2)]
        result=compose_document(ASSETS/'glyphs_v24.json',doc)
        self.assertEqual(result['page_count'],original['page_count']+2)
        self.assertEqual([i for i,p in enumerate(result['pages']) if p.get('pdf')],[1,2])
        # Every original glyph, marker, placement and table stays on its original
        # content page, merely moved after the inserted PDF pages.
        for a,b in zip(original['pages'],[p for p in result['pages'] if not p.get('pdf')]):
            for key in ('strokes','placements'):self.assertEqual(a[key],b[key])

    def test_table_can_continue_after_pdf_with_identical_rows_and_headers(self):
        t=table(20,'Datos')
        for row in t['rows']:row['height']=4
        doc={'paragraphs':[{'type':'table','table':t}]}
        original=compose_document(ASSETS/'glyphs_v24.json',backend._document(json.dumps(doc)))
        doc['paragraphs'].append(pdf(0))
        result=compose_document(ASSETS/'glyphs_v24.json',backend._document(json.dumps(doc)))
        self.assertGreater(original['page_count'],1);self.assertEqual(result['pages'][1]['pdf']['id'],'A-0')
        for a,b in zip(original['pages'],[p for p in result['pages'] if not p.get('pdf')]):
            self.assertEqual(a['tables'],b['tables'])
            # Native border UUIDs are fresh; compare all geometry/ink fields.
            self.assertEqual([{k:v for k,v in s.items() if k!='id'} for s in a['strokes']],
                             [{k:v for k,v in s.items() if k!='id'} for s in b['strokes']])

    def test_order_inserting_between_pdfs_and_target_beyond_text(self):
        doc={'paragraphs':[{'segments':[{'text':'Antes'}]},pdf(0,0,pages=2),pdf(2,1,pages=2),pdf(1,name='B'),pdf(7,name='C')]}
        result=self.compose(doc)
        self.assertEqual(result['page_count'],9)
        self.assertEqual([p and p['id'] for p in result['pdf_pages']],[None,'A-0','B-0','A-1',None,None,None,None,'C-0'])

    def test_insertions_invalidate_cache_and_later_text_edits_resume_correctly(self):
        doc=document_from_plain_text(('Texto de prueba. '*4+'\n')*40)
        initial=self.compose(doc)
        doc['paragraphs'].append(pdf(0))
        inserted=self.compose(doc,initial['snapshot']);self.assertEqual(inserted['reused_pages'],0)
        self.assert_same_pages(inserted,self.compose(doc,None))
        doc['paragraphs'][-3]['segments'][0]['text']='Cambio al final.'
        resumed=self.compose(doc,inserted['snapshot']);self.assertGreater(resumed['reused_pages'],2)
        self.assert_same_pages(resumed,self.compose(doc,None))
        doc['paragraphs'].pop()
        removed=self.compose(doc,resumed['snapshot']);self.assertEqual(removed['reused_pages'],0)
        self.assert_same_pages(removed,self.compose(doc,None))

    def test_invalid_positions_and_page_limits_are_rejected(self):
        for position in (-1,499,1.5,True):
            with self.assertRaises(ValueError):backend._document(json.dumps({'paragraphs':[pdf(position)]}))
        doc=document_from_plain_text('Texto '*100)
        doc['paragraphs'] += [pdf(0,0,pages=2),pdf(1,1,pages=2)]
        with self.assertRaises(ValueError):compose_document(ASSETS/'glyphs_v24.json',doc,max_pages=2)

if __name__=='__main__':unittest.main()
