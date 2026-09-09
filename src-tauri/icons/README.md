# App icons

- `Icon.icon/` is the macOS 26+ Icon Composer document. Light, dark, and tinted appearances use the two source illustrations.
- `Assets.car` is the compiled catalog Tauri copies into the app bundle. Compile it from `Icon.icon` instead of letting `tauri build` run `actool` (that path races with `ibtoold`).
- `icon.icns`, `icon.ico`, and the PNG sizes are generated from the dark illustration and remain the fallback for Windows, Linux, and older macOS.

Regenerate the raster set from the dark master:

```bash
pnpm tauri icon src-tauri/icons/Icon.icon/Assets/icon-dark.png -o /tmp/tauri-icons-out
```

Copy only the desktop files back into this directory. Do not overwrite `Icon.icon/`.

Recompile `Assets.car`:

```bash
killall ibtoold 2>/dev/null || true
TMP=$(mktemp -d)
ditto src-tauri/icons/Icon.icon "$TMP/Icon.icon"
mkdir -p "$TMP/out"
actool "$TMP/Icon.icon" --compile "$TMP/out" \
  --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$TMP/out/assetcatalog_generated_info.plist" \
  --app-icon Icon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx
cp "$TMP/out/Assets.car" src-tauri/icons/Assets.car
```
