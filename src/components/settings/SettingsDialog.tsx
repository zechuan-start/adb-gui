import { useEffect, useRef, type ReactNode } from "react";
import { Monitor, Moon, RotateCcw, Sun, X } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { SortPreferences } from "@/components/settings/SortPreferences";
import { GeneratorPreferences } from "@/components/settings/GeneratorPreferences";
import { StartDirectoryPreference } from "@/components/settings/StartDirectoryPreference";
import { CaptureDirectoryPreference } from "@/components/settings/CaptureDirectoryPreference";
import {
  columnsMatch,
  COMPACT_COLUMNS,
  LOGCAT_COLUMNS,
  STANDARD_COLUMNS,
} from "@/lib/logcatView";
import {
  logcatPreset,
  STARTUP_OPTIONS,
  type SettingsSection,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useThemeStore } from "@/store/theme";
import { DEFAULT_LOG_OPEN_BY_PANE, useUiStore, type PaneId } from "@/store/ui";

const SECTIONS: ReadonlyArray<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "通用" },
  { id: "logcat", label: "日志" },
  { id: "performance", label: "性能" },
  { id: "capture", label: "截图与录屏" },
  { id: "files", label: "文件" },
  { id: "apps", label: "应用" },
  { id: "codegen", label: "生码" },
];

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-rule py-2.5 text-xs last:border-b-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-b border-rule py-2.5 text-xs last:border-b-0">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 shrink-0 accent-ink"
      />
    </label>
  );
}

function SettingsContent({ section }: { section: SettingsSection }) {
  const preferences = useSettingsStore((s) => s.preferences);
  const update = useSettingsStore((s) => s.update);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const logOpen = useUiStore((s) => s.logOpenByPane);
  const setLogOpen = useUiStore((s) => s.setLogOpen);

  if (section === "general")
    return (
      <>
        <SettingRow label="主题">
          <div
            className="flex border border-rule"
            role="group"
            aria-label="主题"
          >
            {[
              { id: "system" as const, label: "跟随系统", icon: Monitor },
              { id: "light" as const, label: "亮色", icon: Sun },
              { id: "dark" as const, label: "暗色", icon: Moon },
            ].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                aria-label={label}
                title={label}
                aria-pressed={theme === id}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex h-8 w-10 items-center justify-center border-r border-rule last:border-r-0 hover:bg-hover",
                  theme === id && "bg-ink text-onink hover:bg-ink",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="启动页面">
          <BlueprintSelect
            value={preferences.general.startupPane}
            options={STARTUP_OPTIONS}
            ariaLabel="启动页面"
            containerClassName="w-44 shrink-0"
            onValueChange={(value) => {
              const option = STARTUP_OPTIONS.find(
                (item) => item.value === value,
              );
              if (option)
                update("general", {
                  ...preferences.general,
                  startupPane: option.value,
                });
            }}
          />
        </SettingRow>
        <Toggle
          label="启动时检查更新"
          checked={preferences.general.checkUpdatesOnStartup}
          onChange={(checkUpdatesOnStartup) =>
            update("general", { ...preferences.general, checkUpdatesOnStartup })
          }
        />
      </>
    );

  if (section === "logcat")
    return (
      <>
        <SettingRow label="显示格式">
          <div
            className="flex border border-rule"
            role="group"
            aria-label="显示格式"
          >
            {(["standard", "compact"] as const).map((format) => (
              <button
                type="button"
                key={format}
                aria-pressed={columnsMatch(
                  preferences.logcat.columns,
                  format === "standard" ? STANDARD_COLUMNS : COMPACT_COLUMNS,
                )}
                onClick={() =>
                  update("logcat", {
                    ...preferences.logcat,
                    columns: logcatPreset(format),
                  })
                }
                className={cn(
                  "h-8 border-r border-rule px-4 text-xs last:border-r-0 hover:bg-hover",
                  columnsMatch(
                    preferences.logcat.columns,
                    logcatPreset(format),
                  ) && "bg-ink text-onink hover:bg-ink",
                )}
              >
                {format === "standard" ? "标准" : "紧凑"}
              </button>
            ))}
          </div>
        </SettingRow>
        <div
          className="grid grid-cols-2 gap-x-6 border-b border-rule py-2"
          role="group"
          aria-label="显示列"
        >
          {LOGCAT_COLUMNS.map(({ column, label }) => (
            <label
              key={column}
              className="flex min-h-9 items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={preferences.logcat.columns[column]}
                onChange={(event) =>
                  update("logcat", {
                    ...preferences.logcat,
                    columns: {
                      ...preferences.logcat.columns,
                      [column]: event.currentTarget.checked,
                    },
                  })
                }
                className="h-3.5 w-3.5 accent-ink"
              />
              {label}
            </label>
          ))}
        </div>
        <Toggle
          label="自动换行"
          checked={preferences.logcat.softWrap}
          onChange={(softWrap) =>
            update("logcat", { ...preferences.logcat, softWrap })
          }
        />
        <Toggle
          label="自动折叠崩溃堆栈"
          checked={preferences.logcat.autoFold}
          onChange={(autoFold) =>
            update("logcat", { ...preferences.logcat, autoFold })
          }
        />
        <Toggle
          label="宽行距"
          checked={preferences.logcat.cozyRows}
          onChange={(cozyRows) =>
            update("logcat", { ...preferences.logcat, cozyRows })
          }
        />
        <div className="mt-5 text-xs font-semibold">显示日志的工作区</div>
        <div className="grid grid-cols-2 gap-x-6 pt-2">
          {STARTUP_OPTIONS.filter(
            (item): item is { value: PaneId; label: string } =>
              item.value !== "last",
          ).map(({ value, label }) => (
            <label
              key={value}
              className="flex min-h-9 items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={logOpen[value]}
                onChange={(event) =>
                  setLogOpen(value, event.currentTarget.checked)
                }
                className="h-3.5 w-3.5 accent-ink"
              />
              {label}
            </label>
          ))}
        </div>
      </>
    );

  if (section === "performance")
    return (
      <Toggle
        label="切换页面时继续采集"
        checked={preferences.performance.backgroundEnabled}
        onChange={(backgroundEnabled) =>
          update("performance", { backgroundEnabled })
        }
      />
    );

  if (section === "files") return <>
    <SettingRow label="排序"><SortPreferences section="files" /></SettingRow>
    <Toggle label="文件夹优先" checked={preferences.files.directoriesFirst} onChange={(directoriesFirst) => update("files", { ...preferences.files, directoriesFirst })} />
    <Toggle label="显示隐藏文件" checked={preferences.files.showHidden} onChange={(showHidden) => update("files", { ...preferences.files, showHidden })} />
    <StartDirectoryPreference />
  </>;
  if (section === "apps") return <SettingRow label="排序"><SortPreferences section="apps" /></SettingRow>;
  if (section === "codegen") return <GeneratorPreferences id="settings-code-separator" />;

  return (
    <>
      <CaptureDirectoryPreference />
      <Toggle
        label="保存截图后打开图片"
        checked={preferences.screenshot.openAfterSave}
        onChange={(openAfterSave) =>
          update("screenshot", { ...preferences.screenshot, openAfterSave })
        }
      />
      <Toggle
        label="保存截图后定位所在目录"
        checked={preferences.screenshot.revealAfterSave}
        onChange={(revealAfterSave) =>
          update("screenshot", { ...preferences.screenshot, revealAfterSave })
        }
      />
      <Toggle
        label="保存录屏后打开视频"
        checked={preferences.recording.openAfterSave}
        onChange={(openAfterSave) => update("recording", { openAfterSave })}
      />
    </>
  );
}

export function SettingsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const section = useUiStore((s) => s.settingsSection);
  const openSettings = useUiStore((s) => s.openSettings);
  const closeSettings = useUiStore((s) => s.closeSettings);
  const error = useSettingsStore((s) => s.error);
  const available = useSettingsStore((s) => s.available);
  const resetSection = useSettingsStore((s) => s.resetSection);
  const restoreDefaults = useSettingsStore((s) => s.restoreDefaults);
  const reload = useSettingsStore((s) => s.reload);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (section && !dialog.open) dialog.showModal();
    if (!section && dialog.open) dialog.close();
  }, [section]);

  function resetCurrent() {
    if (!section) return;
    resetSection(section);
    if (useSettingsStore.getState().error) return;
    if (section === "general") useThemeStore.getState().setTheme("system");
    if (section === "logcat")
      for (const [pane, open] of Object.entries(DEFAULT_LOG_OPEN_BY_PANE))
        useUiStore.getState().setLogOpen(pane as PaneId, open);
  }

  return (
    <dialog
      ref={dialogRef}
      id="settings-dialog"
      aria-labelledby="settings-title"
      onClose={closeSettings}
      onCancel={closeSettings}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.defaultPrevented) return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        const boundary = event.shiftKey ? first : last;
        if (document.activeElement !== boundary) return;
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }}
      className="m-auto w-[min(720px,calc(100vw-32px))] max-w-none overflow-visible border border-rule bg-paper p-0 text-ink shadow-[3px_3px_0_var(--color-hard-shadow)] backdrop:bg-black/35"
    >
      <div className="flex h-[min(620px,calc(100dvh-32px))] min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-rule px-5">
          <h2 id="settings-title" className="text-sm font-semibold">
            设置
          </h2>
          <button
            type="button"
            onClick={closeSettings}
            title="关闭设置"
            aria-label="关闭设置"
            className="flex h-8 w-8 items-center justify-center hover:bg-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div
          className="flex shrink-0 flex-wrap gap-1 border-b border-rule px-4 pt-2"
          role="tablist"
          aria-label="设置分组"
          onKeyDown={(event) => {
            const index = SECTIONS.findIndex((item) => item.id === section);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % SECTIONS.length
                : event.key === "ArrowLeft"
                  ? (index + SECTIONS.length - 1) % SECTIONS.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? SECTIONS.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            openSettings(SECTIONS[next].id);
            document
              .getElementById(`settings-tab-${SECTIONS[next].id}`)
              ?.focus();
          }}
        >
          {SECTIONS.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              id={`settings-tab-${id}`}
              role="tab"
              tabIndex={section === id ? 0 : -1}
              aria-selected={section === id}
              aria-controls="settings-content"
              onClick={() => openSettings(id)}
              className={cn(
                "min-h-9 border-b-2 border-transparent px-3 text-xs text-ink2 hover:text-ink",
                section === id && "border-ink font-semibold text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
          id="settings-content"
          role="tabpanel"
          aria-labelledby={`settings-tab-${section ?? "general"}`}
        >
          {error && (
            <div
              role="alert"
              className="mb-3 border border-err bg-err-band p-3 text-xs"
            >
              <p className="break-words">{error}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reload}
                  className="border border-rule px-2 py-1"
                >
                  重新读取
                </button>
                {!available && (
                  <button
                    type="button"
                    onClick={restoreDefaults}
                    className="border border-rule px-2 py-1"
                  >
                    恢复新设置默认值
                  </button>
                )}
              </div>
            </div>
          )}
          <fieldset
            disabled={!available}
            className="min-w-0 disabled:opacity-50"
          >
            {section && <SettingsContent section={section} />}
          </fieldset>
        </div>
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-rule px-5">
          <button
            type="button"
            disabled={!available}
            onClick={resetCurrent}
            className="inline-flex h-8 items-center gap-2 border border-rule px-3 text-xs hover:bg-hover disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复本组默认
          </button>
          <button
            type="button"
            onClick={closeSettings}
            className="h-8 border border-ink bg-ink px-5 text-xs text-onink"
          >
            关闭
          </button>
        </footer>
      </div>
    </dialog>
  );
}
