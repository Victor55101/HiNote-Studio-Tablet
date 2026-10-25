#!/usr/bin/env bash
set -euo pipefail

export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export ANDROID_SERIAL=emulator-5554
# Keep avdmanager and the emulator on the same explicit AVD directory.
# Hosted runners may have SDK preference paths configured by separate tools.
export ANDROID_USER_HOME="${RUNNER_TEMP:-/tmp}/hinote-legal-android"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"
sdkmanager 'system-images;android-35;google_apis;x86_64' 'emulator' 'platform-tools'
avdmanager create avd --force --name hinote-legal --path "$ANDROID_AVD_HOME/hinote-legal.avd" --package 'system-images;android-35;google_apis;x86_64' --device pixel_c <<< 'no'
test -s "$ANDROID_AVD_HOME/hinote-legal.ini"
emulator -list-avds
mkdir -p test-results/legal-device
emulator -avd hinote-legal -port 5554 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 2048 -cores 2 > test-results/legal-device/emulator.log 2>&1 &
hinote_emulator_pid=$!
finish_legal_test() {
    timeout 10 adb pull /sdcard/Android/data/com.hinote.studio/files/legal-test-screens test-results/legal-device/screens || true
    timeout 10 adb logcat -d > test-results/legal-device/logcat.log 2>&1 || true
    kill "$hinote_emulator_pid" 2>/dev/null || true
}
trap finish_legal_test EXIT
if ! timeout 90 adb wait-for-device; then
    cat test-results/legal-device/emulator.log
    exit 1
fi
timeout 180 bash -c 'until [[ "$(adb shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; do sleep 2; done'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell wm size 1600x1000
adb shell wm density 160
adb shell input keyevent 82
gradle --no-daemon -p HiNote_Studio_Tablet_Android connectedStableDebugAndroidTest -PhinoteTestAbi=x86_64 -Pandroid.testInstrumentationRunnerArguments.class=com.hinote.studio.LegalActivityDeviceTest
