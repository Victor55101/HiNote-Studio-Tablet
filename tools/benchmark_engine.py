"""Print reproducible engine-only Linux measurements; never retains generated notes."""
import argparse
import json
from pathlib import Path
import resource
import sys
import tempfile
import time
ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'HiNote_Studio_Tablet_Android/app/src/main'
sys.path.insert(0, str(APP / 'python'))
from handwriting_composer import document_from_plain_text
from mobile_backend import compose
parser = argparse.ArgumentParser()
parser.add_argument('--paragraphs', type=int, default=100)
parser.add_argument('--characters', type=int)
args = parser.parse_args()
phrase = 'Hola, esta es una prueba larga con mi letra. '
text = (phrase * 20 + '\n') * args.paragraphs
if args.characters: text = (phrase * (args.characters // len(phrase) + 1))[:args.characters]
with tempfile.TemporaryDirectory() as temp:
    start = time.perf_counter()
    raw = compose(str(APP / 'assets'), temp, json.dumps(document_from_plain_text(text)), '{}')
    result = json.loads(raw)
    print(json.dumps({'python':sys.version.split()[0], 'characters':len(text), 'pages':result['page_count'],
        'seconds':round(time.perf_counter()-start,2), 'peak_python_rss_mib':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1),
        'temporary_mib':round(sum(p.stat().st_size for p in Path(temp).rglob('*') if p.is_file())/1024**2,1),
        'summary_bytes':len(raw.encode())}, indent=2))
