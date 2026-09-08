import type { Messages } from "@/i18n/types";
import type { LocalePreference } from "@/i18n/locale";
import { LOGCAT_COLUMNS } from "@/lib/logcatView";
import { DEFAULT_LOG_OPEN_BY_PANE, type PaneId } from "@/lib/panes";
import { defaultSettings, type SettingsPreferences } from "@/lib/settings";
import type { Theme } from "@/store/theme";

export type SettingsSection =
  | "general"
  | "logcat"
  | "capture"
  | "files"
  | "apps"
  | "codegen";

// All preference owners participate in modified markers without sharing storage.
export interface SettingsSnapshot {
  preferences: SettingsPreferences;
  theme: Theme;
  localePreference: LocalePreference;
  logOpenByPane: Record<PaneId, boolean>;
}

export interface SettingsRowMeta {
  id: string;
  label: (messages: Messages) => string;
  description?: (messages: Messages) => string;
  // Absent when the row only presents a value another row owns.
  modified?: (state: SettingsSnapshot, defaults: SettingsSnapshot) => boolean;
}

export interface SettingsSectionMeta {
  id: SettingsSection;
  label: (messages: Messages) => string;
  rows: readonly SettingsRowMeta[];
}

// Navigation order. The performance switch lives in the general section, so
// `performance` stays a preference key without being a section of its own.
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSectionMeta> = [
  {
    id: "general",
    label: (m) => m.settings.sections.general,
    rows: [
      {
        id: "language",
        label: (m) => m.settings.general.language.label,
        description: (m) => m.settings.general.language.description,
        modified: (state, defaults) => state.localePreference !== defaults.localePreference,
      },
      {
        id: "theme",
        label: (m) => m.settings.rows.theme.label,
        description: (m) => m.settings.rows.theme.description,
        modified: (state, defaults) => state.theme !== defaults.theme,
      },
      {
        id: "startupPane",
        label: (m) => m.settings.rows.startupPane.label,
        description: (m) => m.settings.rows.startupPane.description,
        modified: (state, defaults) =>
          state.preferences.general.startupPane !==
          defaults.preferences.general.startupPane,
      },
      {
        id: "checkUpdates",
        label: (m) => m.settings.rows.checkUpdates.label,
        description: (m) => m.settings.rows.checkUpdates.description,
        modified: (state, defaults) =>
          state.preferences.general.checkUpdatesOnStartup !==
          defaults.preferences.general.checkUpdatesOnStartup,
      },
      {
        id: "background",
        label: (m) => m.settings.rows.background.label,
        description: (m) => m.settings.rows.background.description,
        modified: (state, defaults) =>
          state.preferences.performance.backgroundEnabled !==
          defaults.preferences.performance.backgroundEnabled,
      },
    ],
  },
  {
    id: "logcat",
    label: (m) => m.settings.sections.logcat,
    rows: [
      {
        id: "logcatFormat",
        label: (m) => m.settings.rows.logcatFormat.label,
        description: (m) => m.settings.rows.logcatFormat.description,
      },
      {
        id: "logcatColumns",
        label: (m) => m.settings.rows.logcatColumns.label,
        modified: (state, defaults) =>
          LOGCAT_COLUMNS.some(
            ({ column }) =>
              state.preferences.logcat.columns[column] !==
              defaults.preferences.logcat.columns[column],
          ),
      },
      {
        id: "softWrap",
        label: (m) => m.settings.rows.softWrap.label,
        description: (m) => m.settings.rows.softWrap.description,
        modified: (state, defaults) =>
          state.preferences.logcat.softWrap !==
          defaults.preferences.logcat.softWrap,
      },
      {
        id: "autoFold",
        label: (m) => m.settings.rows.autoFold.label,
        description: (m) => m.settings.rows.autoFold.description,
        modified: (state, defaults) =>
          state.preferences.logcat.autoFold !==
          defaults.preferences.logcat.autoFold,
      },
      {
        id: "cozyRows",
        label: (m) => m.settings.rows.cozyRows.label,
        description: (m) => m.settings.rows.cozyRows.description,
        modified: (state, defaults) =>
          state.preferences.logcat.cozyRows !==
          defaults.preferences.logcat.cozyRows,
      },
      {
        id: "logPanes",
        label: (m) => m.settings.rows.logPanes.label,
        modified: (state, defaults) =>
          Object.entries(defaults.logOpenByPane).some(
            ([pane, open]) => state.logOpenByPane[pane as PaneId] !== open,
          ),
      },
    ],
  },
  {
    id: "capture",
    label: (m) => m.settings.sections.capture,
    rows: [
      {
        id: "captureDirectory",
        label: (m) => m.settings.rows.captureDirectory.label,
        description: (m) => m.settings.rows.captureDirectory.description,
        modified: (state, defaults) =>
          state.preferences.capture.directory !==
          defaults.preferences.capture.directory,
      },
      {
        id: "screenshotOpen",
        label: (m) => m.settings.rows.screenshotOpen.label,
        modified: (state, defaults) =>
          state.preferences.screenshot.openAfterSave !==
          defaults.preferences.screenshot.openAfterSave,
      },
      {
        id: "screenshotReveal",
        label: (m) => m.settings.rows.screenshotReveal.label,
        modified: (state, defaults) =>
          state.preferences.screenshot.revealAfterSave !==
          defaults.preferences.screenshot.revealAfterSave,
      },
      {
        id: "recordingOpen",
        label: (m) => m.settings.rows.recordingOpen.label,
        description: (m) => m.settings.rows.recordingOpen.description,
        modified: (state, defaults) =>
          state.preferences.recording.openAfterSave !==
          defaults.preferences.recording.openAfterSave,
      },
    ],
  },
  {
    id: "files",
    label: (m) => m.settings.sections.files,
    rows: [
      {
        id: "fileSort",
        label: (m) => m.settings.rows.fileSort.label,
        modified: (state, defaults) =>
          state.preferences.files.sortBy !==
            defaults.preferences.files.sortBy ||
          state.preferences.files.sortDirection !==
            defaults.preferences.files.sortDirection,
      },
      {
        id: "directoriesFirst",
        label: (m) => m.settings.rows.directoriesFirst.label,
        modified: (state, defaults) =>
          state.preferences.files.directoriesFirst !==
          defaults.preferences.files.directoriesFirst,
      },
      {
        id: "showHidden",
        label: (m) => m.settings.rows.showHidden.label,
        description: (m) => m.settings.rows.showHidden.description,
        modified: (state, defaults) =>
          state.preferences.files.showHidden !==
          defaults.preferences.files.showHidden,
      },
      {
        id: "startDirectory",
        label: (m) => m.settings.rows.startDirectory.label,
        description: (m) => m.settings.rows.startDirectory.description,
        modified: (state, defaults) =>
          state.preferences.files.startDirectory !==
          defaults.preferences.files.startDirectory,
      },
    ],
  },
  {
    id: "apps",
    label: (m) => m.settings.sections.apps,
    rows: [
      {
        id: "appSort",
        label: (m) => m.settings.rows.appSort.label,
        modified: (state, defaults) =>
          state.preferences.apps.sortBy !== defaults.preferences.apps.sortBy ||
          state.preferences.apps.sortDirection !==
            defaults.preferences.apps.sortDirection,
      },
    ],
  },
  {
    id: "codegen",
    label: (m) => m.settings.sections.codegen,
    rows: [
      {
        id: "codeType",
        label: (m) => m.settings.rows.codeType.label,
        modified: (state, defaults) =>
          state.preferences.codegen.codeType !==
          defaults.preferences.codegen.codeType,
      },
      {
        id: "separator",
        label: (m) => m.settings.rows.separator.label,
        description: (m) => m.settings.rows.separator.description,
        modified: (state, defaults) =>
          state.preferences.codegen.separatorMode !==
            defaults.preferences.codegen.separatorMode ||
          state.preferences.codegen.customSeparator !==
            defaults.preferences.codegen.customSeparator,
      },
    ],
  },
];

export function findSettingsSection(id: SettingsSection): SettingsSectionMeta {
  const section = SETTINGS_SECTIONS.find((item) => item.id === id);
  if (!section) {
    throw new Error(`Unknown settings section: ${id}`);
  }
  return section;
}

function everyRow(): SettingsRowMeta[] {
  return SETTINGS_SECTIONS.flatMap((section) => section.rows);
}

export function findSettingsRow(id: string): SettingsRowMeta {
  const found = everyRow().find((row) => row.id === id);
  if (!found) {
    throw new Error(`Unknown settings row: ${id}`);
  }
  return found;
}

export function sectionRowIds(section: SettingsSection): string[] {
  return findSettingsSection(section).rows.map((row) => row.id);
}

export function defaultSettingsSnapshot(): SettingsSnapshot {
  return {
    preferences: defaultSettings(),
    theme: "system",
    localePreference: "system",
    logOpenByPane: { ...DEFAULT_LOG_OPEN_BY_PANE },
  };
}

export function modifiedRowIds(state: SettingsSnapshot): ReadonlySet<string> {
  const defaults = defaultSettingsSnapshot();
  return new Set(
    everyRow()
      .filter((row) => row.modified?.(state, defaults))
      .map((row) => row.id),
  );
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

export function hasSectionResetChanges(section: SettingsSection, state: SettingsSnapshot): boolean {
  const plan = sectionResetPlan(section);
  const reset: SettingsSnapshot = {
    ...state,
    preferences: resetSettingsSection(state.preferences, section),
    theme: plan.resetTheme ? "system" : state.theme,
    logOpenByPane: plan.resetLogPanes ? DEFAULT_LOG_OPEN_BY_PANE : state.logOpenByPane,
  };
  return findSettingsSection(section).rows.some((row) => row.modified?.(state, reset));
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
