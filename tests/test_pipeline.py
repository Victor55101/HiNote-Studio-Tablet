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
        self.assertEqual(len(page['strokes'][0]), 3)
        self.assertEqual(len(page['strokes'][0][2][0]), 3)
        with self.assertRaises(ValueError): backend.page_preview(str(self.cache), result['snapshot'], result['page_count'])

    def test_streaming_matches_full_composition(self):
        doc = document_from_plain_text(('1. Una nota de prueba.\n    a) Mi letra personal.\n') * 12)
        full = compose_document(ASSETS / 'glyphs_v11.json', doc)
        pages = []
        streamed = compose_document(ASSETS / 'glyphs_v11.json', doc, page_sink=lambda p: pages.append(copy.deepcopy(p)))
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
        for i in range(result['page_count']): (work / f'page-{i}-grid.jpg').write_bytes(jpeg)
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

    def test_oversize_word_wraps_within_page(self):
        doc = document_from_plain_text('W' * 1800, scale=2)
        composed = compose_document(ASSETS / 'glyphs_v11.json', doc)
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

    def test_limits_invalid_settings_and_snapshot_paths(self):
        with self.assertRaises(ValueError): compose_document(ASSETS / 'glyphs_v11.json', document_from_plain_text('a\n' * 60), max_pages=1)
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
