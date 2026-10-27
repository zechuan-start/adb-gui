#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/adb-gui-dex-tests.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

javac -d "$OUT" \
  "$ROOT/scripts/build-app-info-dex/src/com/adbgui/clipboard/DeviceLockState.java" \
  "$ROOT/scripts/build-app-info-dex/tests/com/adbgui/clipboard/DeviceLockStateTest.java"
java -cp "$OUT" com.adbgui.clipboard.DeviceLockStateTest
