#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES="$ROOT/src-tauri/resources"
TMP="${TMPDIR:-/tmp}/adb-gui-platform-tools-$$"
mkdir -p "$TMP" "$RES/macos" "$RES/linux" "$RES/windows"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

fetch() {
  local platform="$1"
  local url="$2"
  local outdir="$3"
  local adb_name="$4"

  echo "Fetching platform-tools for $platform..."
  curl -fsSL "$url" -o "$TMP/$platform.zip"
  unzip -qo "$TMP/$platform.zip" -d "$TMP/$platform"

  cp "$TMP/$platform/platform-tools/$adb_name" "$RES/$outdir/$adb_name"
  if [[ "$platform" == "linux" ]]; then
    rm -rf "$RES/linux/lib64"
    cp -R "$TMP/$platform/platform-tools/lib64" "$RES/linux/"
  fi
  if [[ "$platform" == "windows" ]]; then
    cp "$TMP/$platform/platform-tools/AdbWinApi.dll" "$RES/windows/"
    cp "$TMP/$platform/platform-tools/AdbWinUsbApi.dll" "$RES/windows/"
  fi
}

fetch darwin "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip" macos adb
fetch linux "https://dl.google.com/android/repository/platform-tools-latest-linux.zip" linux adb
fetch windows "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" windows adb.exe

chmod +x "$RES/macos/adb" "$RES/linux/adb"
echo "Done. Bundled adb into $RES"
