import {
  COMPACT_COLUMNS,
  LOGCAT_COLUMNS,
  STANDARD_COLUMNS,
  type LogcatColumn,
} from "@/lib/logcatView";
import type { PaneId } from "@/lib/panes";
import {
  CODE_TYPE_OPTIONS,
  DEFAULT_GENERATOR_OPTIONS,
  SEPARATOR_OPTIONS,
  type GeneratorOptions,
} from "@/lib/codeGenerator";

export const SORT_DIRECTIONS = [
  { value: "asc", label: "升序" },
  { value: "desc", label: "降序" },
] as const;
export const FILE_SORT_OPTIONS = [
  { value: "name", label: "名称" },
  { value: "modifiedAt", label: "修改时间" },
  { value: "size", label: "大小" },
] as const;
export const APP_SORT_OPTIONS = [
  { value: "name", label: "应用名称" },
  { value: "packageName", label: "包名" },
  { value: "firstInstallTime", label: "安装时间" },
  { value: "lastUpdateTime", label: "更新时间" },
  { value: "apkSize", label: "APK 大小" },
] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number]["value"];
export interface FilePreferences {
  sortBy: (typeof FILE_SORT_OPTIONS)[number]["value"];
  sortDirection: SortDirection;
  directoriesFirst: boolean;
  showHidden: boolean;
  startDirectory: string | null;
}
export interface AppPreferences {
  sortBy: (typeof APP_SORT_OPTIONS)[number]["value"];
  sortDirection: SortDirection;
}

export const SETTINGS_STORAGE_KEY = "adb-gui-settings";
export const SETTINGS_VERSION = 1;
export const STARTUP_OPTIONS: ReadonlyArray<{
  value: "last" | PaneId;
  label: string;
}> = [
  { value: "last", label: "恢复上次页面" },
  { value: "tools", label: "工具" },
  { value: "apps", label: "应用" },
  { value: "files", label: "文件" },
  { value: "codegen", label: "生码" },
  { value: "decoder", label: "解码" },
  { value: "perf", label: "性能" },
];

export interface SaveBehavior {
  openAfterSave: boolean;
}

export interface ScreenshotBehavior extends SaveBehavior {
  revealAfterSave: boolean;
}

export interface SettingsPreferences {
  general: { startupPane: "last" | PaneId; checkUpdatesOnStartup: boolean };
  logcat: {
    columns: Record<LogcatColumn, boolean>;
    softWrap: boolean;
    autoFold: boolean;
    cozyRows: boolean;
  };
  performance: { backgroundEnabled: boolean };
  screenshot: ScreenshotBehavior;
  recording: SaveBehavior;
  capture: { directory: string | null };
  files: FilePreferences;
  apps: AppPreferences;
  codegen: GeneratorOptions;
}

export function defaultSettings(): SettingsPreferences {
  return {
    general: { startupPane: "last", checkUpdatesOnStartup: true },
    logcat: {
      columns: { ...STANDARD_COLUMNS },
      softWrap: false,
      autoFold: true,
      cozyRows: false,
    },
    performance: { backgroundEnabled: false },
    screenshot: { openAfterSave: true, revealAfterSave: true },
    recording: { openAfterSave: true },
    capture: { directory: null },
    files: {
      sortBy: "name",
      sortDirection: "asc",
      directoriesFirst: true,
      showHidden: true,
      startDirectory: null,
    },
    apps: { sortBy: "name", sortDirection: "asc" },
    codegen: { ...DEFAULT_GENERATOR_OPTIONS },
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("设置格式无效");
  }
  return value as Record<string, unknown>;
}

function group(value: unknown): Record<string, unknown> {
  return value === undefined ? {} : record(value);
}

function flag(
  source: Record<string, unknown>,
  key: string,
  initial: boolean,
): boolean {
  if (source[key] === undefined) return initial;
  if (typeof source[key] !== "boolean") throw new Error(`设置字段 ${key} 无效`);
  return source[key];
}

function choice<T extends string>(
  source: Record<string, unknown>,
  key: string,
  initial: T,
  options: readonly { value: T }[],
): T {
  if (source[key] === undefined) return initial;
  const option = options.find(({ value }) => value === source[key]);
  if (!option) throw new Error(`设置字段 ${key} 无效`);
  return option.value;
}

function text(
  source: Record<string, unknown>,
  key: string,
  initial: string,
): string {
  if (source[key] === undefined) return initial;
  if (typeof source[key] !== "string") throw new Error(`设置字段 ${key} 无效`);
  return source[key];
}

export function deviceStartDirectoryError(path: string): string | null {
  return !path.startsWith("/") || path.includes("\0")
    ? "请输入不含 NUL 的 Android 绝对路径"
    : null;
}

function startDirectory(source: Record<string, unknown>): string | null {
  const path = source.startDirectory;
  if (path === undefined || path === null) return null;
  if (typeof path !== "string" || deviceStartDirectoryError(path))
    throw new Error("文件起始目录设置无效");
  return path;
}

type SettingsMigration = (
  settings: Record<string, unknown>,
) => Record<string, unknown>;

// Keyed by the version a step migrates away from. Add an entry in the same
// change that raises SETTINGS_VERSION, so stored settings keep being readable.
const MIGRATIONS: Readonly<Record<number, SettingsMigration>> = {};

export function migrateSettings(
  version: unknown,
  settings: unknown,
): Record<string, unknown> {
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > SETTINGS_VERSION
  ) {
    throw new Error("不支持此设置版本");
  }
  let migrated = record(settings);
  for (let from = version; from < SETTINGS_VERSION; from += 1) {
    const migrate = MIGRATIONS[from];
    if (!migrate) throw new Error("不支持此设置版本");
    migrated = record(migrate(migrated));
  }
  return migrated;
}

export function decodeSettings(raw: string | null): SettingsPreferences {
  const defaults = defaultSettings();
  if (raw === null) return defaults;
  const envelope = record(JSON.parse(raw));
  // Migration only shapes the value in memory; it is persisted by the next write.
  const source = migrateSettings(envelope.version, envelope.settings);
  const general = group(source.general);
  const logcat = group(source.logcat);
  const columns = group(logcat.columns);
  const performance = group(source.performance);
  const screenshot = group(source.screenshot);
  const recording = group(source.recording);
  const capture = group(source.capture);
  const captureDirectory = capture.directory;
  if (
    captureDirectory !== undefined &&
    captureDirectory !== null &&
    (typeof captureDirectory !== "string" ||
      captureDirectory.length === 0 ||
      captureDirectory.includes("\0"))
  ) {
    throw new Error("截图录屏保存目录设置无效");
  }
  const files = group(source.files);
  const apps = group(source.apps);
  const codegen = group(source.codegen);
  const startupPane =
    general.startupPane === undefined
      ? defaults.general.startupPane
      : general.startupPane;
  const startup = STARTUP_OPTIONS.find(
    (option) => option.value === startupPane,
  );
  if (!startup) throw new Error("启动页面设置无效");
  return {
    capture: {
      directory: captureDirectory === undefined ? null : captureDirectory,
    },
    files: {
      sortBy: choice(files, "sortBy", defaults.files.sortBy, FILE_SORT_OPTIONS),
      sortDirection: choice(
        files,
        "sortDirection",
        defaults.files.sortDirection,
        SORT_DIRECTIONS,
      ),
      directoriesFirst: flag(
        files,
        "directoriesFirst",
        defaults.files.directoriesFirst,
      ),
      showHidden: flag(files, "showHidden", defaults.files.showHidden),
      startDirectory: startDirectory(files),
    },
    apps: {
      sortBy: choice(apps, "sortBy", defaults.apps.sortBy, APP_SORT_OPTIONS),
      sortDirection: choice(
        apps,
        "sortDirection",
        defaults.apps.sortDirection,
        SORT_DIRECTIONS,
      ),
    },
    codegen: {
      codeType: choice(
        codegen,
        "codeType",
        defaults.codegen.codeType,
        CODE_TYPE_OPTIONS,
      ),
      separatorMode: choice(
        codegen,
        "separatorMode",
        defaults.codegen.separatorMode,
        SEPARATOR_OPTIONS,
      ),
      customSeparator: text(
        codegen,
        "customSeparator",
        defaults.codegen.customSeparator,
      ),
    },
    general: {
      startupPane: startup.value,
      checkUpdatesOnStartup: flag(
        general,
        "checkUpdatesOnStartup",
        defaults.general.checkUpdatesOnStartup,
      ),
    },
    logcat: {
      columns: Object.fromEntries(
        LOGCAT_COLUMNS.map(({ column }) => [
          column,
          flag(columns, column, defaults.logcat.columns[column]),
        ]),
      ) as Record<LogcatColumn, boolean>,
      softWrap: flag(logcat, "softWrap", defaults.logcat.softWrap),
      autoFold: flag(logcat, "autoFold", defaults.logcat.autoFold),
      cozyRows: flag(logcat, "cozyRows", defaults.logcat.cozyRows),
    },
    performance: {
      backgroundEnabled: flag(
        performance,
        "backgroundEnabled",
        defaults.performance.backgroundEnabled,
      ),
    },
    screenshot: {
      openAfterSave: flag(
        screenshot,
        "openAfterSave",
        defaults.screenshot.openAfterSave,
      ),
      revealAfterSave: flag(
        screenshot,
        "revealAfterSave",
        defaults.screenshot.revealAfterSave,
      ),
    },
    recording: {
      openAfterSave: flag(
        recording,
        "openAfterSave",
        defaults.recording.openAfterSave,
      ),
    },
  };
}

export function logcatPreset(
  format: "standard" | "compact",
): Record<LogcatColumn, boolean> {
  return { ...(format === "standard" ? STANDARD_COLUMNS : COMPACT_COLUMNS) };
}
