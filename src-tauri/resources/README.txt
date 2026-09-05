# Bundled Android platform-tools (adb only)

Platform-specific adb binaries are shipped with the app as a fallback when
system adb / ANDROID_HOME / ANDROID_SDK_ROOT are unavailable.

Layout:
  macos/adb
  linux/adb
  windows/adb.exe
  windows/AdbWinApi.dll
  windows/AdbWinUsbApi.dll

Source: https://developer.android.com/tools/releases/platform-tools
Refresh with: scripts/fetch-platform-tools.sh

App information helper

app-info.dex is loaded on an Android device with app_process to collect
third-party application names, versions, icons, install times, and base APK
sizes in one JSON response. It is built from the checked-in Java source and is
independent of the desktop platform and Android device CPU architecture.
The dex and Rust bridge share the `--ADBGUI-APPINFO-V1--` sentinel, the
`--no-icons` / `--icons-only` mode arguments, and optional package filters
after `--icons-only`; update both sides and rebuild the dex when changing this
contract.

Source: scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java
Refresh with: scripts/build-app-info-dex/build.sh (requires JDK + Android SDK)

Manual clipboard helper

The same app-info.dex also contains com.adbgui.clipboard.Main. It uses shell
UID/package attribution and ClipboardManager for primary-user plain text.
Keep the original app-info entry and protocol compatible when rebuilding.
Compile against API 31+; D8 min-api remains 28. Intermediate files are temporary.

Requests are version-1 JSON over stdin, with operation get or set (plus text).
Responses use the complete line --ADBGUI-CLIPBOARD-V1-- followed by one JSON
envelope. Results are text, no_text or written; written requires readback.
Use adb shell -T -e none, an 8-second device timeout and a 10-second host timeout.
Text is limited to 256 KiB UTF-8. Never pass text in shell arguments or log it.
Lockscreen, non-primary users and permission failures are explicit errors.

Source: scripts/build-app-info-dex/src/com/adbgui/clipboard/
Shared host deployment: src-tauri/src/device_helper.rs
