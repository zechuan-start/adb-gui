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

Source: scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java
Refresh with: scripts/build-app-info-dex/build.sh (requires JDK + Android SDK)
