"""Editable PDF flow and source boundaries shared by preview and text editor."""
import copy
import json
import unittest
import test_v50 as v50
from test_v50 import ASSETS, backend, compose_document, document_from_plain_text
from test_tables import table


def pdf(index=0):
    return {'type':'pdf','pdf':{'id':f'pdf-{index}','asset':'a'*64,'index':index,'pages':2,'name':'Prueba.pdf'}}


class V52Tests(unittest.TestCase):
    setUp=v50.V50Tests.setUp
    compose=v50.V50Tests.compose
    assert_same_pages=v50.V50Tests.assert_same_pages

    def test_pdf_slots_are_empty_until_typing_then_create_separate_content_pages(self):
        gap={'pdf_gap':True,'segments':[]}
        doc={'paragraphs':[{'segments':[{'text':'Antes'}]},gap,pdf(),gap,pdf(1),gap,{'segments':[{'text':'Después'}]}]}
        info=self.compose(doc)
        self.assertEqual(info['page_count'],4)
        self.assertEqual([bool(p) for p in info['pdf_pages']],[False,True,True,False])
        doc['paragraphs'][3]={'pdf_gap':True,'segments':[{'text':'Entre páginas del PDF'}]}
        doc['paragraphs'][5]={'pdf_gap':True,'segments':[{'text':'Después del PDF'}]}
        changed=self.compose(doc,info['snapshot'])
        self.assertEqual(changed['page_count'],5)
        self.assertEqual([bool(p) for p in changed['pdf_pages']],[False,True,False,True,False])
        for i,p in enumerate(changed['pdf_pages']):
            if p:self.assertEqual(changed['stroke_counts'][i],0,'typing must never cover the PDF')
        self.assert_same_pages(changed,self.compose(doc,None))

    def test_source_boundary_divides_long_paragraph_at_the_actual_page(self):
        text='Texto con tamaño y acentos. '*120
        original=document_from_plain_text('1. '+text)
        result=compose_document(ASSETS/'glyphs_v24.json',original)
        point=result['pages'][0]['source_end']
        self.assertEqual(point['line'],0);self.assertGreater(point['offset'],0);self.assertLess(point['offset'],len(text))
        start=copy.deepcopy(original['paragraphs'][0]);tail=copy.deepcopy(start)
        start['segments'][0]['text']=text[:point['offset']]
        tail['segments'][0]['text']=text[point['offset']:];tail['list']['hide_marker']=True
        split=compose_document(ASSETS/'glyphs_v24.json',{'paragraphs':[start,pdf(),tail]})
        self.assertTrue(split['pages'][1].get('pdf'))
        a=''.join(p['char'] for p in result['pages'][1]['placements'])
        b=''.join(p['char'] for p in split['pages'][2]['placements'])
        self.assertEqual(a,b,'suffix must begin on the page after the inserted PDF')

    def test_source_offsets_use_original_utf16_before_nfc_shaping(self):
        import handwriting_composer as composer
        raw='A😀e\u0301漢Z'
        self.assertEqual(list(composer._source_offsets([{'text':raw}])),[0,1,3,5,6])
        self.assertEqual(len(list(composer._source_offsets([{'text':'e\u0301 '*5000}]))),10000)

    def test_page_boundary_inside_empty_soft_lines_keeps_its_text_offset(self):
        text='Inicio\n'+'\n'*40+'Fin'
        result=compose_document(ASSETS/'glyphs_v24.json',{'paragraphs':[{'segments':[{'text':text}]}]})
        self.assertGreater(result['page_count'],1)
        point=result['pages'][0]['source_end'];self.assertEqual(point['line'],0);self.assertGreater(point['offset'],len('Inicio'))

    def test_table_boundary_reports_first_row_of_the_next_page(self):
        t=table(20,'Datos')
        for row in t['rows']:row['height']=4
        result=compose_document(ASSETS/'glyphs_v24.json',backend._document(json.dumps({'paragraphs':[{'type':'table','table':t}]})))
        self.assertGreater(result['page_count'],1)
        point=result['pages'][0]['source_end'];self.assertEqual(point['line'],0);self.assertGreater(point['row'],0)
        self.assertEqual(result['pages'][1]['tables'][0]['rows'][1],point['row'])

    def test_delete_everything_reduces_cached_document_to_one_page(self):
        doc=document_from_plain_text(('Contenido de prueba. '*4+'\n')*45)
        old=self.compose(doc);self.assertGreater(old['page_count'],2)
        empty=self.compose({'paragraphs':[{'segments':[]}]},old['snapshot'])
        self.assertEqual(empty['page_count'],1);self.assertEqual(empty['stroke_counts'],[0]);self.assertEqual(len(empty['page_ends']),1)
        self.assert_same_pages(empty,self.compose({'paragraphs':[{'segments':[]}]},None))

if __name__=='__main__':unittest.main()
