"""Real calibration fixture, kept out of generated public source files."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'HiNote_Studio_Tablet_Android/app/src/main/python'))
from pro_editor import live_library
print(json.dumps(live_library(ROOT/'HiNote_Studio_Tablet_Android/app/src/main/assets'), separators=(',', ':')))
