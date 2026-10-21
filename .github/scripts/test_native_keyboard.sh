#!/usr/bin/env bash
set -euo pipefail
mkdir -p keyboardHarness/build
adb root
adb wait-for-device
adb shell su 0 id
trap 'adb logcat -d > keyboardHarness/build/native-logcat.txt' EXIT
adb logcat -c
gradle --no-daemon :keyboardHarness:connectedDebugAndroidTest --stacktrace
