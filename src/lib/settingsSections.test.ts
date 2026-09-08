import { describe, expect, it } from "vitest";
import { zhCN } from "@/i18n/messages/zh-CN";
import {
  defaultSettings,
  logcatPreset,
  type SettingsPreferences,
} from "@/lib/settings";
import {
  defaultSettingsSnapshot,
  findSettingsRow,
  findSettingsSection,
  hasSectionResetChanges,
  modifiedRowIds,
  resetSettingsSection,
  sectionRowIds,
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
  it("does not offer a no-op section reset for an explicit language alone", () => {
    const state = { ...defaultSettingsSnapshot(), localePreference: "en" as const };
    expect(modifiedRowIds(state).has("language")).toBe(true);
    expect(hasSectionResetChanges("general", state)).toBe(false);
    expect(hasSectionResetChanges("general", { ...state, theme: "dark" })).toBe(true);
  });
  it("lists six sections in navigation order without a performance group", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "general",
      "logcat",
      "capture",
      "files",
      "apps",
      "codegen",
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.label(zhCN))).toEqual([
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
    const capture = findSettingsSection("capture");
    expect(capture.id).toBe("capture");
    expect(capture.label(zhCN)).toBe(zhCN.settings.sections.capture);
    expect(capture.rows.map((row) => row.id)).toEqual([
      "captureDirectory",
      "screenshotOpen",
      "screenshotReveal",
      "recordingOpen",
    ]);
    expect(() =>
      findSettingsSection("performance" as SettingsSection),
    ).toThrow("Unknown settings section");
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

describe("settings rows", () => {
  const ROW_IDS = SETTINGS_SECTIONS.flatMap((section) =>
    section.rows.map((row) => row.id),
  );

  it("keeps every row id unique, resolvable and owned by one section", () => {
    expect(new Set(ROW_IDS).size).toBe(ROW_IDS.length);
    expect(SETTINGS_SECTIONS.flatMap(({ id }) => sectionRowIds(id))).toEqual(
      ROW_IDS,
    );
    for (const { id, rows } of SETTINGS_SECTIONS) {
      expect(sectionRowIds(id)).toEqual(rows.map((row) => row.id));
    }
    for (const id of ROW_IDS) {
      expect(findSettingsRow(id).id).toBe(id);
    }
    expect(() => findSettingsRow("nope")).toThrow("Unknown settings row");
  });

  it("marks only the rows whose stored value left its default", () => {
    const base = defaultSettingsSnapshot();
    expect(modifiedRowIds(base).size).toBe(0);

    expect(sectionRowIds("general")[0]).toBe("language");
    expect(modifiedRowIds({ ...base, localePreference: "en" })).toEqual(new Set(["language"]));

    expect(modifiedRowIds({ ...base, theme: "dark" })).toEqual(
      new Set(["theme"]),
    );
    expect(
      modifiedRowIds({
        ...base,
        logOpenByPane: { ...base.logOpenByPane, codegen: true },
      }),
    ).toEqual(new Set(["logPanes"]));
    expect(
      modifiedRowIds({
        ...base,
        preferences: { ...base.preferences, logcat: logcatCompact(base) },
      }),
    ).toEqual(new Set(["logcatColumns"]));
    expect(
      modifiedRowIds({
        ...base,
        preferences: {
          ...base.preferences,
          capture: { directory: "/tmp/shots" },
          apps: { ...base.preferences.apps, sortDirection: "desc" },
        },
      }),
    ).toEqual(new Set(["captureDirectory", "appSort"]));
  });

  it("leaves the format row unmarked because the columns row owns that value", () => {
    const base = defaultSettingsSnapshot();
    const marks = modifiedRowIds({
      ...base,
      preferences: { ...base.preferences, logcat: logcatCompact(base) },
    });
    expect(marks.has("logcatFormat")).toBe(false);
  });
});

function logcatCompact(base: ReturnType<typeof defaultSettingsSnapshot>) {
  return { ...base.preferences.logcat, columns: logcatPreset("compact") };
}
