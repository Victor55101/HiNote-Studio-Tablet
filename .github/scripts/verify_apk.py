"""Verify the built, versioned APK before exposing the Actions artifact."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "HiNote_Studio_Tablet_Android/app/src/main/assets"
APK = ROOT / "HiNote_Studio_Tablet_Android/app/build/outputs/apk/stable/debug/app-stable-debug.apk"
DESTINATION = ROOT / "dist"
DESTINATION.mkdir(exist_ok=True)
with ZipFile(APK) as archive:
    assert archive.testzip() is None, "Corrupt APK"
    abis = sorted({name.split("/")[1] for name in archive.namelist() if name.startswith("lib/")})
    assert abis == ["arm64-v8a"], abis
    checked = sorted(path for path in SOURCE.iterdir() if path.suffix in (".js", ".css", ".html", ".svg"))
    for path in checked:
        assert archive.read("assets/" + path.name) == path.read_bytes(), path.name
sdk = Path(os.environ["ANDROID_HOME"]) / "build-tools"
version = lambda path: tuple(int(n) for n in re.findall(r"\d+", path.parent.name))
aapt = max(sdk.glob("*/aapt"), key=version)
badging = subprocess.run([str(aapt), "dump", "badging", str(APK)], check=True, text=True, capture_output=True).stdout
package = next(line for line in badging.splitlines() if line.startswith("package:"))
assert "name='com.hinote.studio'" in package, package
assert "versionCode='56'" in package and "versionName='5.6-tablet'" in package, package
signer = max(sdk.glob("*/lib/apksigner.jar"), key=lambda path: tuple(int(n) for n in re.findall(r"\d+", path.parent.parent.name)))
signature = subprocess.run(["java", "-jar", str(signer), "verify", "--verbose", "--print-certs", str(APK)], check=True, text=True, capture_output=True).stdout
(DESTINATION / "apk-signature.txt").write_text(signature)
certificate = re.search(r"certificate SHA-256 digest: ([a-f0-9]+)", signature).group(1)
tests = []
for report in sorted((ROOT / "HiNote_Studio_Tablet_Android/app/build/reports/tests").glob("*/index.html")):
    html = report.read_text()
    counts = {key: int(re.search(r'id="' + key + r'"[^>]*>.*?<div class="counter">(\d+)</div>', html, re.S).group(1)) for key in ("tests", "failures", "ignored")}
    assert counts["failures"] == 0, report
    tests.append({"suite": report.parent.name, **counts})
assert {entry["suite"] for entry in tests} == {"testStableDebugUnitTest", "testProbeDebugUnitTest"}, tests
target = DESTINATION / "HiNote-Studio-Tablet-V56.apk"
shutil.copy2(APK, target)
result = {"file": target.name, "version": "5.6-tablet", "version_code": 56, "bytes": target.stat().st_size,
          "sha256": sha256(target.read_bytes()).hexdigest(), "certificate_sha256": certificate,
          "abis": abis, "editor_assets_matched": len(checked), "android_unit_tests": tests}
(DESTINATION / "apk-verification.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
