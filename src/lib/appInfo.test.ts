import { describe, expect, it } from "vitest";
import { appDisplayName, fallbackAppInfo, filterAppInfo, sortAppInfo } from "@/lib/appInfo";
import type { AppInfo } from "@/lib/tauri";

function app(overrides: Partial<AppInfo>): AppInfo {
  return {
    packageName: "com.example.app",
    appName: "Example",
    versionName: "1.0",
    versionCode: 1,
    icon: "",
    firstInstallTime: 1,
    lastUpdateTime: 2,
    apkSize: 3,
    ...overrides,
  };
}

describe("appInfo", () => {
  it("creates a complete fallback contract from a package name", () => {
    expect(fallbackAppInfo("com.example.fallback")).toEqual({
      packageName: "com.example.fallback",
      appName: "com.example.fallback",
      versionName: "",
      versionCode: 0,
      icon: "",
      firstInstallTime: 0,
      lastUpdateTime: 0,
      apkSize: 0,
    });
  });

  it("sorts by display name and falls back to package name", () => {
    const apps = [
      app({ packageName: "com.example.z", appName: "Zulu" }),
      app({ packageName: "com.example.a", appName: "" }),
      app({ packageName: "com.example.b", appName: "Alpha" }),
    ];

    expect(sortAppInfo(apps).map((item) => appDisplayName(item))).toEqual([
      "Alpha",
      "com.example.a",
      "Zulu",
    ]);
    expect(apps[0].appName).toBe("Zulu");
  });

  it("filters by localized app name or package name", () => {
    const apps = [
      app({ packageName: "com.example.camera", appName: "相机" }),
      app({ packageName: "com.example.notes", appName: "Notes" }),
    ];

    expect(filterAppInfo(apps, "相机").map((item) => item.packageName)).toEqual([
      "com.example.camera",
    ]);
    expect(filterAppInfo(apps, "NOTES").map((item) => item.packageName)).toEqual([
      "com.example.notes",
    ]);
  });
});
