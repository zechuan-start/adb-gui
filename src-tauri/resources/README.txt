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
