import { describe, expect, it } from "vitest";
import { defaultSettings, type SettingsPreferences } from "@/lib/settings";
import {
  findSettingsSection,
  resetSettingsSection,
  sectionResetPlan,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settingsSections";

function customized(): SettingsPreferences {
  const defaults = defaultSettings();
  return {
    general: { startupPane: "files", checkUpdatesOnStartup: false },
    logcat: { ...defaults.logcat, softWrap: true, cozyRows: true },
    performance: { backgroundEnabled: true },
    screenshot: { openAfterSave: false, revealAfterSave: false },
    recording: { openAfterSave: false },
    capture: { directory: "/Volumes/中文 空格" },
    files: { ...defaults.files, sortBy: "size", startDirectory: "/sdcard/DCIM" },
    apps: { sortBy: "apkSize", sortDirection: "desc" },
    codegen: { codeType: "code128", separatorMode: "comma", customSeparator: "" },
  };
}

describe("settings sections", () => {
  it("lists six sections in navigation order without a performance group", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "general",
      "logcat",
      "capture",
      "files",
      "apps",
      "codegen",
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual([
      "通用",
      "日志",
      "截图与录屏",
      "文件",
      "应用",
      "生码",
    ]);
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.id)).size).toBe(
      SETTINGS_SECTIONS.length,
    );
  });

  it("resolves a known section and rejects an unknown one", () => {
    expect(findSettingsSection("capture")).toEqual({
      id: "capture",
      label: "截图与录屏",
    });
    expect(() =>
      findSettingsSection("performance" as SettingsSection),
    ).toThrow("未知设置分组");
  });

  it("names every store a section reset touches", () => {
    expect(sectionResetPlan("general")).toEqual({
      settingsKeys: ["general", "performance"],
      resetTheme: true,
      resetLogPanes: false,
    });
    expect(sectionResetPlan("logcat")).toEqual({
      settingsKeys: ["logcat"],
      resetTheme: false,
      resetLogPanes: true,
    });
    expect(sectionResetPlan("capture").settingsKeys).toEqual([
      "capture",
      "screenshot",
      "recording",
    ]);
    for (const section of ["files", "apps", "codegen"] as const) {
      expect(sectionResetPlan(section)).toEqual({
        settingsKeys: [section],
        resetTheme: false,
        resetLogPanes: false,
      });
    }
  });

  it("resets only the preference keys its plan names", () => {
    const defaults = defaultSettings();
    const source = customized();
    for (const { id } of SETTINGS_SECTIONS) {
      const reset = resetSettingsSection(source, id);
      const planned = new Set<string>(sectionResetPlan(id).settingsKeys);
      for (const key of Object.keys(defaults) as (keyof SettingsPreferences)[]) {
        expect({ key, value: reset[key] }).toEqual({
          key,
          value: planned.has(key) ? defaults[key] : source[key],
        });
      }
    }
    expect(source).toEqual(customized());
  });

  it("resets the performance switch together with the general group", () => {
    const reset = resetSettingsSection(customized(), "general");
    expect(reset.performance).toEqual(defaultSettings().performance);
    expect(reset.general).toEqual(defaultSettings().general);
    expect(reset.logcat.softWrap).toBe(true);
  });
});
