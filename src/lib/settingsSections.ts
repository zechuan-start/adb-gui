import { defaultSettings, type SettingsPreferences } from "@/lib/settings";

export type SettingsSection =
  | "general"
  | "logcat"
  | "capture"
  | "files"
  | "apps"
  | "codegen";

export interface SettingsSectionMeta {
  id: SettingsSection;
  label: string;
}

// Navigation order. The performance switch lives in the general section, so
// `performance` stays a preference key without being a section of its own.
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSectionMeta> = [
  { id: "general", label: "通用" },
  { id: "logcat", label: "日志" },
  { id: "capture", label: "截图与录屏" },
  { id: "files", label: "文件" },
  { id: "apps", label: "应用" },
  { id: "codegen", label: "生码" },
];

export function findSettingsSection(id: SettingsSection): SettingsSectionMeta {
  const section = SETTINGS_SECTIONS.find((item) => item.id === id);
  if (!section) {
    throw new Error(`未知设置分组: ${id}`);
  }
  return section;
}

// A section can own preferences from stores other than the settings file, so a
// reset names every store it touches instead of hiding the exceptions in the UI.
export interface SectionResetPlan {
  settingsKeys: ReadonlyArray<keyof SettingsPreferences>;
  resetTheme: boolean;
  resetLogPanes: boolean;
}

const RESET_PLANS: Readonly<Record<SettingsSection, SectionResetPlan>> = {
  general: {
    settingsKeys: ["general", "performance"],
    resetTheme: true,
    resetLogPanes: false,
  },
  logcat: {
    settingsKeys: ["logcat"],
    resetTheme: false,
    resetLogPanes: true,
  },
  capture: {
    settingsKeys: ["capture", "screenshot", "recording"],
    resetTheme: false,
    resetLogPanes: false,
  },
  files: { settingsKeys: ["files"], resetTheme: false, resetLogPanes: false },
  apps: { settingsKeys: ["apps"], resetTheme: false, resetLogPanes: false },
  codegen: {
    settingsKeys: ["codegen"],
    resetTheme: false,
    resetLogPanes: false,
  },
};

export function sectionResetPlan(section: SettingsSection): SectionResetPlan {
  return RESET_PLANS[section];
}

export function resetSettingsSection(
  settings: SettingsPreferences,
  section: SettingsSection,
): SettingsPreferences {
  const defaults = defaultSettings();
  const reset = { ...settings };
  for (const key of sectionResetPlan(section).settingsKeys) {
    Object.assign(reset, { [key]: defaults[key] });
  }
  return reset;
}
