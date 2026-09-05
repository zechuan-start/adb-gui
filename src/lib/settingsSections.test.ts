import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  logcatPreset,
  type SettingsPreferences,
} from "@/lib/settings";
import {
  defaultSettingsSnapshot,
  findSettingsRow,
  findSettingsSection,
  modifiedRowIds,
  searchSettingsRows,
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
    const capture = findSettingsSection("capture");
    expect(capture.id).toBe("capture");
    expect(capture.label).toBe("截图与录屏");
    expect(capture.groups.map((group) => group.title)).toEqual([
      "保存位置",
      "截图",
      "录屏",
    ]);
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

describe("settings rows", () => {
  const ROW_IDS = SETTINGS_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) => group.rows.map((row) => row.id)),
  );

  it("keeps every row id unique and resolvable", () => {
    expect(new Set(ROW_IDS).size).toBe(ROW_IDS.length);
    for (const id of ROW_IDS) expect(findSettingsRow(id).id).toBe(id);
    expect(() => findSettingsRow("nope")).toThrow("未知设置项");
  });

  it("matches labels, descriptions, keywords and group titles case-insensitively", () => {
    expect(searchSettingsRows("  ")).toEqual([]);
    expect(searchSettingsRows("没有这个设置")).toEqual([]);
    expect(searchSettingsRows("耗电").map(({ row }) => row.id)).toEqual([
      "background",
    ]);
    expect(searchSettingsRows("CODE128").map(({ row }) => row.id)).toEqual([
      "codeType",
    ]);
    expect(searchSettingsRows("录屏").map(({ row }) => row.id)).toContain(
      "recordingOpen",
    );
    const directories = searchSettingsRows("目录").map(({ row }) => row.id);
    expect(directories).toContain("captureDirectory");
    expect(directories).toContain("startDirectory");
    expect(searchSettingsRows("生码").map(({ section }) => section.id)).toEqual([
      "codegen",
      "codegen",
    ]);
  });

  it("marks only the rows whose stored value left its default", () => {
    const base = defaultSettingsSnapshot();
    expect(modifiedRowIds(base).size).toBe(0);

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
