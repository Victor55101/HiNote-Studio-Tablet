"""Regression tests with the repository's real calibration, no Android required."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP / 'python'))
import mobile_backend as backend
from handwriting_composer import compose_document, document_from_plain_text
from pencilengine_reader import read_pencilengine, validate_pencilengine
from validate_hinote import validate_hinote, loadj

ASSETS = APP / 'assets'
GLYPHS = ASSETS / 'glyphs_v24.json'

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name)

    def compose(self, text, token=None, settings=None):
        return json.loads(backend.compose(str(ASSETS), str(self.cache), json.dumps(document_from_plain_text(text)), json.dumps(settings or {}), token))

    def test_disk_snapshot_has_small_manifest_and_lazy_preview(self):
        result = self.compose(('Una nota con mi letra. ' * 10 + '\n') * 12)
        self.assertGreater(result['page_count'], 1)
        self.assertNotIn('pages', result)
        self.assertLess(len(json.dumps(result)), 2000)
        for i in range(result['page_count']):
            binary = self.cache / result['snapshot'] / f'page-{i}.bin'
            strokes, points = validate_pencilengine(binary)
            self.assertGreater(strokes, 0); self.assertGreater(points, strokes)
        page = json.loads(backend.page_preview(str(self.cache), result['snapshot'], 0))
        self.assertEqual(len(page['strokes'][0]), 4)
        self.assertEqual(len(page['strokes'][0][2][0]), 3)
        with self.assertRaises(ValueError): backend.page_preview(str(self.cache), result['snapshot'], result['page_count'])

    def test_streaming_matches_full_composition(self):
        doc = document_from_plain_text(('1. Una nota de prueba.\n    a) Mi letra personal.\n') * 12)
        full = compose_document(GLYPHS, doc)
        pages = []
        streamed = compose_document(GLYPHS, doc, page_sink=lambda p: pages.append(copy.deepcopy(p)))
        self.assertEqual(pages, full['pages'])
        self.assertEqual(streamed['page_count'], full['page_count'])
        self.assertEqual(streamed['pages'], [])

    def test_cancellation_removes_partial_snapshot_only(self):
        previous = self.compose('Una nota anterior.')
        class Token:
            page = 0
            def isCancelled(self): return self.page >= 2
            def onProgress(self, page): self.page = page
        with self.assertRaises(InterruptedError): self.compose(('Prueba larga. ' * 40 + '\n') * 50, Token())
        self.assertEqual([p.name for p in self.cache.iterdir()], [previous['snapshot']])
        backend.snapshot_info(str(self.cache), previous['snapshot'])

    def test_export_preserves_snapshot_binary_and_hashes(self):
        result = self.compose(('Hola mi nota. ' * 30 + '\n') * 8)
        work = self.cache / result['snapshot']
        # Valid image fixture; the native renderer is covered by device checks.
        jpeg = (ROOT / 'tests/thumbnail.jpg').read_bytes()
        for i in range(result['page_count']): (work / f'page-{i}-native.jpg').write_bytes(jpeg)
        output = self.cache / 'result.hinote'
        backend.export_snapshot(str(ASSETS), str(self.cache), result['snapshot'], 'Mi nota ñ', True, str(output))
        self.assertTrue(validate_hinote(output, quiet=True))
        with zipfile.ZipFile(output) as archive:
            pages = [n for n in archive.namelist() if n.startswith('pages/') and n.endswith('.jhinote')]
            self.assertEqual(len(pages), result['page_count'])
            for name in pages:
                meta = loadj(archive.read(name)); number = meta['customNotePageContent']['pageNumber']
                binary = next(f['name'] for f in meta['fileList'] if f['name'].endswith('.bin'))
                self.assertEqual(archive.read('files/' + binary), (work / f'page-{number-1}.bin').read_bytes())

    def test_failed_export_removes_partial_output(self):
        result = self.compose('Hola')
        output = self.cache / 'failed.hinote'
        with self.assertRaises(FileNotFoundError): backend.export_snapshot(str(ASSETS), str(self.cache), result['snapshot'], 'test', True, str(output))
        self.assertFalse(output.exists())

    def test_probe_exports_only_selected_page_and_preserves_its_binary(self):
        result = self.compose(('Hola mi nota. ' * 30 + '\n') * 8)
        self.assertGreater(result['page_count'], 1)
        rendered = self.cache / 'export-probe'; rendered.mkdir()
        (rendered / 'page-0-native.jpg').write_bytes((ROOT / 'tests/thumbnail.jpg').read_bytes())
        output = self.cache / 'probe.hinote'
        backend.export_probe_page(str(ASSETS), str(self.cache), result['snapshot'], 1, 'Solo página 2', str(output), export_dir=str(rendered))
        self.assertTrue(validate_hinote(output, quiet=True))
        with zipfile.ZipFile(output) as archive:
            pages = [n for n in archive.namelist() if n.startswith('pages/') and n.endswith('.jhinote')]
            self.assertEqual(len(pages), 1)
            meta = loadj(archive.read(pages[0]))
            self.assertEqual(meta['customNotePageContent']['pageNumber'], 1)
            binary = next(f['name'] for f in meta['fileList'] if f['name'].endswith('.bin'))
            self.assertEqual(archive.read('files/' + binary), (self.cache / result['snapshot'] / 'page-1.bin').read_bytes())
        for index in (-1, result['page_count'], 1.5):
            with self.assertRaises(ValueError):
                backend.export_probe_page(str(ASSETS), str(self.cache), result['snapshot'], index, 'Fuera', str(self.cache / 'invalid.hinote'), export_dir=str(rendered))

    def test_probe_image_only_page_keeps_native_images_without_unrelated_writing(self):
        result = self.compose('Texto de la primera página')
        rendered = self.cache / 'export-probe'; rendered.mkdir()
        jpeg = (ROOT / 'tests/thumbnail.jpg').read_bytes()
        (rendered / 'page-0-native.jpg').write_bytes(jpeg)
        image = rendered / 'image.jpg'; image.write_bytes(jpeg)
        output = self.cache / 'probe-images.hinote'
        record = dict(id='selected', path=str(image), page=0, x=20, y=30, width=200, height=300, angle=0)
        backend.export_probe_page(str(ASSETS), str(self.cache), result['snapshot'], 2, 'Solo imagen', str(output),
            images_json=json.dumps([record]), page_count=3, export_dir=str(rendered))
        self.assertTrue(validate_hinote(output, quiet=True))
        with zipfile.ZipFile(output) as archive:
            self.assertFalse(any(n.endswith('.bin') for n in archive.namelist()))
            page = loadj(archive.read(next(n for n in archive.namelist() if n.startswith('pages/') and n.endswith('.jhinote'))))
            self.assertEqual(len(page['customNotePageContent']['pageElement']), 1)

    def test_transfer_sample_contains_three_native_colored_strokes_not_an_image(self):
        # Read the same fixture supplied by the app, then inspect the generated BIN.
        import re
        source = (APP / 'java/com/hinote/studio/TransferInk.java').read_text()
        preview = json.loads('"' + re.search(r'static final String SAMPLE="(.*)";', source)[1] + '"')
        rendered = self.cache / 'export-sample'; rendered.mkdir()
        (rendered / 'page-0-native.jpg').write_bytes((ROOT / 'tests/thumbnail.jpg').read_bytes())
        output = self.cache / 'sample.hinote'
        backend.export_transfer_sample(str(ASSETS), str(self.cache), preview, str(output), str(rendered))
        self.assertTrue(validate_hinote(output, quiet=True))
        self.assertEqual(validate_pencilengine(rendered / 'sample.bin'), (3, 6))
        records = read_pencilengine(rendered / 'sample.bin')
        import struct
        for stroke, source in zip(records.strokes, json.loads(preview)['strokes']):
            self.assertEqual([(p.x, p.y) for p in stroke.points], [(p[0], p[1]) for p in source[2]])
            rgb = tuple(int(source[0][i:i+2], 16) / 255 for i in (1,3,5))
            bgr = struct.unpack_from('>fff', bytes.fromhex(stroke.metadata_hex), 76)
            for actual, expected in zip(bgr, reversed(rgb)): self.assertAlmostEqual(actual, expected, places=6)
        with zipfile.ZipFile(output) as archive:
            native = [name for name in archive.namelist() if name.endswith('.bin')]
            self.assertEqual(len(native), 1)
            self.assertEqual(archive.read(native[0]), (rendered / 'sample.bin').read_bytes())
            page = loadj(archive.read(next(n for n in archive.namelist() if n.startswith('pages/') and n.endswith('.jhinote'))))
            elements = page['customNotePageContent']['pageElement']
            self.assertEqual(elements, [])

    def test_transfer_sample_cancellation_does_not_leave_a_notebook(self):
        rendered = self.cache / 'export-sample'; rendered.mkdir()
        output = self.cache / 'sample.hinote'
        preview = json.dumps({'strokes': [['#000000', 100, [[10,10,1],[20,20,1]],2]] * 3})
        class Token:
            def isCancelled(self): return True
        with self.assertRaises(InterruptedError):
            backend.export_transfer_sample(str(ASSETS), str(self.cache), preview, str(output), str(rendered), Token())
        self.assertFalse(output.exists())

    def test_oversize_word_wraps_within_page(self):
        doc = document_from_plain_text('W' * 1800, scale=2)
        composed = compose_document(GLYPHS, doc)
        self.assertGreater(composed['page_count'], 1)
        self.assertEqual(sum(len(p['placements']) for p in composed['pages']), 1800)
        for page in composed['pages']:
            for stroke in page['strokes']:
                for point in stroke['points']:
                    self.assertLessEqual(point['x'], 925.01)
                    self.assertLessEqual(point['y'], 1545.01)

    def test_unicode_and_stroke_states(self):
        result = self.compose('lY a\u0301 ñ')
        self.assertEqual(result['warnings'], [])
        doc = read_pencilengine(self.cache / result['snapshot'] / 'page-0.bin')
        self.assertGreater(len(doc.strokes), 0)
        for stroke in doc.strokes:
            self.assertEqual(stroke.points[0].state, 4)
            if len(stroke.points) > 1: self.assertEqual(stroke.points[-1].state, 5)
            self.assertEqual([p.index for p in stroke.points], list(range(len(stroke.points))))

    def test_missing_glyph_warnings_are_deduplicated(self):
        result = self.compose('🙂' * 1000)
        self.assertEqual(len(result['warnings']), 1)

    def test_leading_spaces_tabs_and_manual_lines_keep_their_position(self):
        for prefix, width in [(' '*9,234), ('\t\t',208), ('\u00a0'*3,78)]:
            with self.subTest(prefix=repr(prefix)):
                plain=compose_document(GLYPHS,document_from_plain_text('O --- O\nI\nO'),jitter_x=0,jitter_y=0)
                indented=compose_document(GLYPHS,document_from_plain_text(prefix+'O --- O\n'+prefix+'I\n'+prefix+'O'),jitter_x=0,jitter_y=0)
                before=plain['pages'][0]['placements'];after=indented['pages'][0]['placements']
                self.assertEqual([p['char'] for p in before],[p['char'] for p in after])
                for a,b in zip(before,after):
                    self.assertAlmostEqual(b['x']-a['x'],width)
                    self.assertAlmostEqual(b['baseline_y'],a['baseline_y'])

    def test_leading_spaces_respect_style_and_soft_wrapping_does_not_repeat_indent(self):
        doc={'paragraphs':[{'segments':[{'text':'  ','scale':2},{'text':'  '+'Hola '*60,'scale':1}],'list':None}]}
        composed=compose_document(GLYPHS,doc,jitter_x=0,jitter_y=0)
        placements=composed['pages'][0]['placements']
        self.assertAlmostEqual(placements[0]['x'],composed['layout']['margin_left']+156)
        next_line=next(p for p in placements if p['baseline_y']!=placements[0]['baseline_y'])
        self.assertAlmostEqual(next_line['x'],composed['layout']['margin_left'])

    def test_excessive_indent_and_long_words_wrap_without_losing_ink(self):
        composed=compose_document(GLYPHS,document_from_plain_text(' '*200+'W'*180),jitter_x=0,jitter_y=0)
        self.assertEqual(sum(len(p['placements']) for p in composed['pages']),180)
        for page in composed['pages']:
            for stroke in page['strokes']:
                for point in stroke['points']:self.assertLessEqual(point['x'],925.01)

    def test_export_thumbnail_does_not_depend_on_preview_grid_toggle(self):
        result=self.compose('Hola');work=self.cache/result['snapshot'];jpeg=(ROOT/'tests/thumbnail.jpg').read_bytes()
        (work/'page-0-native.jpg').write_bytes(jpeg)
        for grid in (False,True):
            output=self.cache/f'grid-{grid}.hinote'
            backend.export_snapshot(str(ASSETS),str(self.cache),result['snapshot'],'Papel nativo',grid,str(output))
            with zipfile.ZipFile(output) as z:
                name=next(n for n in z.namelist() if n.startswith('pages/') and n.endswith('.jhinote'))
                page=loadj(z.read(name))['customNotePageContent']
                self.assertEqual(page['background'],'base3')
                self.assertEqual(z.read('files/'+Path(page['thumbnail']).name),jpeg)

    def test_corrected_symbols_lists_and_underscore_height(self):
        library = json.loads(GLYPHS.read_text(encoding='utf-8'))
        expected_rows = {'+': 5, '=': 6, '%': 7, '#': 8, '@': 9, '•': 10, '*': 11, '<': 12}
        for char, row in expected_rows.items():
            variants = library['glyphs'][char]
            self.assertEqual(len(variants), 8)
            self.assertEqual([variant['source_col'] for variant in variants], list(range(8)))
            self.assertTrue(all(variant['source_page'] == 8 and variant['source_row'] == row for variant in variants))

        self.assertEqual(
            [[stroke['source_stroke'] for stroke in variant['strokes']] for variant in library['glyphs']['•']],
            [[169 + column] for column in range(8)],
        )
        self.assertEqual(
            [[stroke['source_stroke'] for stroke in variant['strokes']] for variant in library['glyphs']['*']],
            [[177 + column, 185 + column, 193 + 2 * column, 194 + 2 * column] for column in range(8)],
        )
        self.assertEqual(library['placement_y_offsets']['-'], -16.0)
        self.assertEqual(library['placement_y_offsets']['_'], 3.0)
        self.assertTrue(all(variant['source_row'] == 10 for variant in library['glyphs']['-']))
        self.assertTrue(all(variant['source_row'] == 11 for variant in library['glyphs']['_']))

        plain = compose_document(GLYPHS, document_from_plain_text('_-Hola'), jitter_x=0)
        underscore, dash = plain['pages'][0]['placements'][:2]
        self.assertEqual((underscore['char'], dash['char']), ('_', '-'))
        self.assertAlmostEqual(underscore['baseline_y'] - dash['baseline_y'], 19.0)
        self.assertTrue(all(point['y'] > plain['pages'][0]['placements'][2]['baseline_y']
                            for stroke in plain['pages'][0]['strokes'] if stroke['char']=='_'
                            for point in stroke['points']))

        listed = compose_document(GLYPHS, document_from_plain_text('• Viñeta\n* Asterisco'), jitter_x=0)
        page = listed['pages'][0]
        self.assertEqual([p['char'] for p in page['placements'] if p['char'] in {'•', '*'}], ['•', '*'])
        bullet_sources = [s['source_stroke'] for s in page['strokes'] if s['char'] == '•']
        star_sources = [s['source_stroke'] for s in page['strokes'] if s['char'] == '*']
        self.assertEqual(len(bullet_sources), 1)
        self.assertIn(bullet_sources[0], range(169, 177))
        self.assertEqual(len(star_sources), 4)
        self.assertTrue(set(star_sources).issubset(set(range(177, 209))))

    def test_limits_invalid_settings_and_snapshot_paths(self):
        with self.assertRaises(ValueError): compose_document(GLYPHS, document_from_plain_text('a\n' * 60), max_pages=1)
        with self.assertRaises(ValueError): self.compose('Hola', settings={'word_spacing': float('inf')})
        with self.assertRaises(ValueError): backend.snapshot_info(str(self.cache), '../escape')
        with self.assertRaises(ValueError): self.compose('a' * 200001)
        self.assertEqual(list(self.cache.iterdir()), [])

    def test_streaming_validator_detects_corruption(self):
        result = self.compose('Hola')
        binary = self.cache / result['snapshot'] / 'page-0.bin'
        data = bytearray(binary.read_bytes()); data[115] ^= 1; binary.write_bytes(data)
        with self.assertRaises(ValueError): validate_pencilengine(binary)

if __name__ == '__main__': unittest.main()
