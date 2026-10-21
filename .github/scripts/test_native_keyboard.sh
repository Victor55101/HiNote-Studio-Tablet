#!/usr/bin/env bash
set -euo pipefail
mkdir -p keyboardHarness/build
trap 'adb logcat -d > keyboardHarness/build/native-logcat.txt' EXIT
adb logcat -c
gradle --no-daemon :keyboardHarness:connectedDebugAndroidTest --stacktrace
