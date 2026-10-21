#!/usr/bin/env bash
set -euo pipefail
mkdir -p keyboardHarness/build
adb root
adb wait-for-device
adb shell su 0 id
trap 'adb logcat -d > keyboardHarness/build/native-logcat.txt' EXIT
adb logcat -c
# Resolve and compile before device tests; retry only transient Maven throttling,
# never a compilation error or a failing keyboard assertion.
for attempt in 1 2 3; do
  if gradle --no-daemon :keyboardHarness:assembleDebug :keyboardHarness:assembleDebugAndroidTest --stacktrace > keyboardHarness/build/native-build.txt 2>&1; then
    cat keyboardHarness/build/native-build.txt
    break
  else
    result=$?
    cat keyboardHarness/build/native-build.txt
    if [ "$attempt" -eq 3 ] || ! grep -Eq 'status code 429|Too Many Requests' keyboardHarness/build/native-build.txt; then
      exit "$result"
    fi
    sleep "$((attempt * 10))"
  fi
done
gradle --no-daemon :keyboardHarness:connectedDebugAndroidTest --stacktrace
