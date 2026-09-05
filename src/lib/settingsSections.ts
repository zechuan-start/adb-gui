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

// The three stores a settings row can read, so one marker covers all of them.
export interface SettingsSnapshot {
  preferences: SettingsPreferences;
  theme: Theme;
  logOpenByPane: Record<PaneId, boolean>;
}

export interface SettingsRowMeta {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  // Absent when the row only presents a value another row owns.
  modified?: (state: SettingsSnapshot, defaults: SettingsSnapshot) => boolean;
}

export interface SettingsGroupMeta {
  title?: string;
  rows: readonly SettingsRowMeta[];
}

export interface SettingsSectionMeta {
  id: SettingsSection;
  label: string;
  groups: readonly SettingsGroupMeta[];
}

// Navigation order. The performance switch lives in the general section, so
// `performance` stays a preference key without being a section of its own.
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSectionMeta> = [
  {
    id: "general",
    label: "通用",
    groups: [
      {
        rows: [
          {
            id: "theme",
            label: "主题",
            description: "跟随系统时随桌面外观自动切换",
            keywords: ["theme", "外观", "深色", "暗色", "夜间"],
            modified: (state, defaults) => state.theme !== defaults.theme,
          },
          {
            id: "startupPane",
            label: "启动页面",
            description: "下次启动应用时生效",
            keywords: ["startup", "首页", "默认页面"],
            modified: (state, defaults) =>
              state.preferences.general.startupPane !==
              defaults.preferences.general.startupPane,
          },
          {
            id: "checkUpdates",
            label: "启动时检查更新",
            description: "只在启动时检查一次; 运行中打开不会立刻发起检查",
            keywords: ["update", "升级", "版本"],
            modified: (state, defaults) =>
              state.preferences.general.checkUpdatesOnStartup !==
              defaults.preferences.general.checkUpdatesOnStartup,
          },
          {
            id: "background",
            label: "离开性能页后继续采集",
            description: "离开性能页后仍按秒采样, 会持续占用 adb 并增加设备耗电",
            keywords: ["性能", "后台", "采样", "耗电"],
            modified: (state, defaults) =>
              state.preferences.performance.backgroundEnabled !==
              defaults.preferences.performance.backgroundEnabled,
          },
        ],
      },
    ],
  },
  {
    id: "logcat",
    label: "日志",
    groups: [
      {
        title: "显示",
        rows: [
          {
            id: "logcatFormat",
            label: "显示格式",
            description: "紧凑只保留时间与等级两列",
            keywords: ["标准", "紧凑", "columns"],
          },
          {
            id: "logcatColumns",
            label: "显示列",
            keywords: ["日期", "时间", "pid", "tid", "包名", "tag", "等级"],
            modified: (state, defaults) =>
              LOGCAT_COLUMNS.some(
                ({ column }) =>
                  state.preferences.logcat.columns[column] !==
                  defaults.preferences.logcat.columns[column],
              ),
          },
          {
            id: "softWrap",
            label: "自动换行",
            description: "长行折行显示, 不再横向滚动",
            keywords: ["wrap", "折行"],
            modified: (state, defaults) =>
              state.preferences.logcat.softWrap !==
              defaults.preferences.logcat.softWrap,
          },
          {
            id: "autoFold",
            label: "自动折叠崩溃堆栈",
            description: "一次崩溃先收成一行, 展开后仍是完整堆栈",
            keywords: ["crash", "崩溃", "堆栈", "折叠"],
            modified: (state, defaults) =>
              state.preferences.logcat.autoFold !==
              defaults.preferences.logcat.autoFold,
          },
          {
            id: "cozyRows",
            label: "宽行距",
            description: "每行留更多纵向空隙, 长时间读日志更省眼",
            keywords: ["行距", "密度"],
            modified: (state, defaults) =>
              state.preferences.logcat.cozyRows !==
              defaults.preferences.logcat.cozyRows,
          },
        ],
      },
      {
        title: "显示日志的工作区",
        rows: [
          {
            id: "logPanes",
            label: "显示日志的工作区",
            keywords: ["面板", "工作区", "工具", "应用", "文件"],
            modified: (state, defaults) =>
              Object.entries(defaults.logOpenByPane).some(
                ([pane, open]) => state.logOpenByPane[pane as PaneId] !== open,
              ),
          },
        ],
      },
    ],
  },
  {
    id: "capture",
    label: "截图与录屏",
    groups: [
      {
        title: "保存位置",
        rows: [
          {
            id: "captureDirectory",
            label: "本机保存目录",
            description: "截图与录屏共用. 恢复默认后回到系统图片目录下的 ADB GUI",
            keywords: ["目录", "路径", "directory"],
            modified: (state, defaults) =>
              state.preferences.capture.directory !==
              defaults.preferences.capture.directory,
          },
        ],
      },
      {
        title: "截图",
        rows: [
          {
            id: "screenshotOpen",
            label: "保存截图后打开图片",
            keywords: ["打开", "预览"],
            modified: (state, defaults) =>
              state.preferences.screenshot.openAfterSave !==
              defaults.preferences.screenshot.openAfterSave,
          },
          {
            id: "screenshotReveal",
            label: "保存截图后定位所在目录",
            keywords: ["定位", "文件管理器"],
            modified: (state, defaults) =>
              state.preferences.screenshot.revealAfterSave !==
              defaults.preferences.screenshot.revealAfterSave,
          },
        ],
      },
      {
        title: "录屏",
        rows: [
          {
            id: "recordingOpen",
            label: "保存录屏后打开视频",
            description: "保存失败时手机上的源文件会保留, 可重试保存或另存为",
            keywords: ["视频", "录制"],
            modified: (state, defaults) =>
              state.preferences.recording.openAfterSave !==
              defaults.preferences.recording.openAfterSave,
          },
        ],
      },
    ],
  },
  {
    id: "files",
    label: "文件",
    groups: [
      {
        title: "排序与显示",
        rows: [
          {
            id: "fileSort",
            label: "排序",
            keywords: ["名称", "修改时间", "大小", "升序", "降序"],
            modified: (state, defaults) =>
              state.preferences.files.sortBy !==
                defaults.preferences.files.sortBy ||
              state.preferences.files.sortDirection !==
                defaults.preferences.files.sortDirection,
          },
          {
            id: "directoriesFirst",
            label: "文件夹优先",
            keywords: ["目录"],
            modified: (state, defaults) =>
              state.preferences.files.directoriesFirst !==
              defaults.preferences.files.directoriesFirst,
          },
          {
            id: "showHidden",
            label: "显示隐藏文件",
            description: "以点开头的条目; 隐藏后会同时清空对它的选择",
            keywords: ["隐藏", "点文件"],
            modified: (state, defaults) =>
              state.preferences.files.showHidden !==
              defaults.preferences.files.showHidden,
          },
        ],
      },
      {
        title: "起始目录",
        rows: [
          {
            id: "startDirectory",
            label: "设备起始目录",
            description: "下次进入文件页或点主页时生效, 不打断当前浏览",
            keywords: ["下载", "sdcard", "相机", "内部存储"],
            modified: (state, defaults) =>
              state.preferences.files.startDirectory !==
              defaults.preferences.files.startDirectory,
          },
        ],
      },
    ],
  },
  {
    id: "apps",
    label: "应用",
    groups: [
      {
        rows: [
          {
            id: "appSort",
            label: "排序",
            description: "改变排序不会重新读取应用信息",
            keywords: ["包名", "安装时间", "更新时间", "apk", "大小"],
            modified: (state, defaults) =>
              state.preferences.apps.sortBy !==
                defaults.preferences.apps.sortBy ||
              state.preferences.apps.sortDirection !==
                defaults.preferences.apps.sortDirection,
          },
        ],
      },
    ],
  },
  {
    id: "codegen",
    label: "生码",
    groups: [
      {
        rows: [
          {
            id: "codeType",
            label: "码类型",
            keywords: ["二维码", "code128", "条码", "qr"],
            modified: (state, defaults) =>
              state.preferences.codegen.codeType !==
              defaults.preferences.codegen.codeType,
          },
          {
            id: "separator",
            label: "分隔符",
            description: "批量生成时用它切分输入; 清空结果不会重置这里",
            keywords: ["换行", "逗号", "分号", "制表符", "自定义"],
            modified: (state, defaults) =>
              state.preferences.codegen.separatorMode !==
                defaults.preferences.codegen.separatorMode ||
              state.preferences.codegen.customSeparator !==
                defaults.preferences.codegen.customSeparator,
          },
        ],
      },
    ],
  },
];

export function findSettingsSection(id: SettingsSection): SettingsSectionMeta {
  const section = SETTINGS_SECTIONS.find((item) => item.id === id);
  if (!section) {
    throw new Error(`未知设置分组: ${id}`);
  }
  return section;
}

export interface SettingsRowLocation {
  section: SettingsSectionMeta;
  group: SettingsGroupMeta;
  row: SettingsRowMeta;
}

function everyRow(): SettingsRowLocation[] {
  return SETTINGS_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.rows.map((row) => ({ section, group, row })),
    ),
  );
}

// The panel renders rows from this metadata, so a search hit always names a row
// the section can actually show.
export function findSettingsRow(id: string): SettingsRowMeta {
  const found = everyRow().find(({ row }) => row.id === id);
  if (!found) {
    throw new Error(`未知设置项: ${id}`);
  }
  return found.row;
}

export function searchSettingsRows(query: string): SettingsRowLocation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return everyRow().filter(({ section, group, row }) =>
    [
      row.label,
      row.description ?? "",
      section.label,
      group.title ?? "",
      ...(row.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function defaultSettingsSnapshot(): SettingsSnapshot {
  return {
    preferences: defaultSettings(),
    theme: "system",
    logOpenByPane: { ...DEFAULT_LOG_OPEN_BY_PANE },
  };
}

export function modifiedRowIds(state: SettingsSnapshot): ReadonlySet<string> {
  const defaults = defaultSettingsSnapshot();
  return new Set(
    everyRow()
      .filter(({ row }) => row.modified?.(state, defaults))
      .map(({ row }) => row.id),
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
