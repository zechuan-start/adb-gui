#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java"
OUT="$ROOT/scripts/build-app-info-dex/out"
CLASS_DIR="$OUT/classes"
DEX_DIR="$OUT/dex"
DESTINATION="$ROOT/src-tauri/resources/app-info.dex"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ -z "$SDK_ROOT" ]]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT must point to an Android SDK." >&2
  exit 1
fi

if ! command -v javac >/dev/null 2>&1; then
  echo "javac was not found. Install a JDK and add javac to PATH." >&2
  exit 1
fi

ANDROID_JAR=""
for candidate in "$SDK_ROOT"/platforms/android-*/android.jar; do
  [[ -f "$candidate" ]] || continue
  platform="$(basename "$(dirname "$candidate")")"
  api="${platform#android-}"
  if [[ "$api" =~ ^[0-9]+$ ]] && (( api >= 29 )) &&
    { [[ -z "$ANDROID_JAR" ]] || (( api > selected_api )); }; then
    ANDROID_JAR="$candidate"
    selected_api="$api"
  fi
done

if [[ -z "$ANDROID_JAR" ]]; then
  echo "No API 29+ android.jar found under $SDK_ROOT/platforms." >&2
  echo "Install an Android SDK Platform (API 29 or newer) with sdkmanager." >&2
  exit 1
fi

D8="$(command -v d8 || true)"
if [[ -z "$D8" ]]; then
  for candidate in "$SDK_ROOT"/build-tools/*/d8; do
    [[ -f "$candidate" ]] || continue
    D8="$candidate"
  done
fi
if [[ -z "$D8" ]]; then
  echo "d8 was not found in PATH or under $SDK_ROOT/build-tools." >&2
  echo "Install Android SDK Build-Tools with sdkmanager." >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$CLASS_DIR" "$DEX_DIR"

echo "Compiling app-info helper against $ANDROID_JAR"
javac \
  -source 8 \
  -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$ANDROID_JAR" \
  -d "$CLASS_DIR" \
  "$SOURCE"

MAIN_CLASS="$CLASS_DIR/com/adbgui/appinfo/Main.class"
if [[ ! -f "$MAIN_CLASS" ]]; then
  echo "javac produced no class files." >&2
  exit 1
fi

CLASS_FILES=()
while IFS= read -r -d '' class_file; do
  CLASS_FILES+=("$class_file")
done < <(find "$CLASS_DIR" -type f -name '*.class' -print0)

if [[ ${#CLASS_FILES[@]} -eq 0 ]]; then
  echo "javac produced no class files." >&2
  exit 1
fi

echo "Converting class files with $D8"
"$D8" --min-api 28 --lib "$ANDROID_JAR" --output "$DEX_DIR" "${CLASS_FILES[@]}"

if [[ ! -s "$DEX_DIR/classes.dex" ]]; then
  echo "d8 did not produce a non-empty classes.dex." >&2
  exit 1
fi

cp "$DEX_DIR/classes.dex" "$DESTINATION"
echo "Generated $DESTINATION"
