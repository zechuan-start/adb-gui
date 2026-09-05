import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  Camera,
  Files,
  QrCode,
  RotateCcw,
  ScrollText,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { SettingsView } from "@/components/settings/SettingRow";
import { AppsSection } from "@/components/settings/sections/AppsSection";
import { CaptureSection } from "@/components/settings/sections/CaptureSection";
import { CodegenSection } from "@/components/settings/sections/CodegenSection";
import { FilesSection } from "@/components/settings/sections/FilesSection";
import { GeneralSection } from "@/components/settings/sections/GeneralSection";
import { LogcatSection } from "@/components/settings/sections/LogcatSection";
import {
  modifiedRowIds,
  searchSettingsRows,
  sectionResetPlan,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settingsSections";
import { confirmRestoreDefaults } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/store/feedback";
import { useSettingsStore } from "@/store/settings";
import { useThemeStore } from "@/store/theme";
import { DEFAULT_LOG_OPEN_BY_PANE, useUiStore, type PaneId } from "@/store/ui";

const SECTION_ICONS: Record<SettingsSection, typeof SlidersHorizontal> = {
  general: SlidersHorizontal,
  logcat: ScrollText,
  capture: Camera,
  files: Files,
  apps: AppWindow,
  codegen: QrCode,
};

// An exhaustive switch turns a forgotten section into a compile error instead of
// silently falling through to whichever section happens to be last.
function SectionContent({ section }: { section: SettingsSection }) {
  switch (section) {
    case "general":
      return <GeneralSection />;
    case "logcat":
      return <LogcatSection />;
    case "capture":
      return <CaptureSection />;
    case "files":
      return <FilesSection />;
    case "apps":
      return <AppsSection />;
    case "codegen":
      return <CodegenSection />;
    default:
      return assertNeverSection(section);
  }
}

function assertNeverSection(section: never): never {
  throw new Error(`未知设置分组: ${String(section)}`);
}

function resetPanes() {
  for (const [pane, open] of Object.entries(DEFAULT_LOG_OPEN_BY_PANE))
    useUiStore.getState().setLogOpen(pane as PaneId, open);
}

export function SettingsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const section = useUiStore((s) => s.settingsSection);
  const openSettings = useUiStore((s) => s.openSettings);
  const closeSettings = useUiStore((s) => s.closeSettings);
  const logOpenByPane = useUiStore((s) => s.logOpenByPane);
  const theme = useThemeStore((s) => s.theme);
  const preferences = useSettingsStore((s) => s.preferences);
  const error = useSettingsStore((s) => s.error);
  const available = useSettingsStore((s) => s.available);
  const resetSection = useSettingsStore((s) => s.resetSection);
  const restoreDefaults = useSettingsStore((s) => s.restoreDefaults);
  const reload = useSettingsStore((s) => s.reload);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [query, setQuery] = useState("");
  const plan = sectionResetPlan(section ?? "general");
  const resettable = available || plan.resetTheme || plan.resetLogPanes;

  const modified = useMemo(
    () => modifiedRowIds({ preferences, theme, logOpenByPane }),
    [preferences, theme, logOpenByPane],
  );
  const hits = useMemo(() => searchSettingsRows(query), [query]);
  const searching = query.trim().length > 0;
  const visibleRows = useMemo(
    () => new Set(hits.map(({ row }) => row.id)),
    [hits],
  );
  const hitSections = SETTINGS_SECTIONS.filter((item) =>
    hits.some(({ section: owner }) => owner.id === item.id),
  );
  const view = useMemo(
    () => ({
      visible: (rowId: string) => !searching || visibleRows.has(rowId),
      modified: (rowId: string) => modified.has(rowId),
    }),
    [searching, visibleRows, modified],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (section && !dialog.open) dialog.showModal();
    if (!section && dialog.open) dialog.close();
    if (!section) setQuery("");
  }, [section]);

  // Each store is reset on its own: a failed settings write no longer swallows
  // the theme or pane reset that belongs to a different store.
  function resetCurrent() {
    if (!section) return;
    if (useSettingsStore.getState().available) resetSection(section);
    if (plan.resetTheme) useThemeStore.getState().setTheme("system");
    if (plan.resetLogPanes) resetPanes();
  }

  async function restoreEverything() {
    try {
      if (!(await confirmRestoreDefaults())) return;
    } catch (failure) {
      showToast("error", `无法确认恢复默认: ${String(failure)}`);
      return;
    }
    restoreDefaults();
    useThemeStore.getState().setTheme("system");
    resetPanes();
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
      className="m-auto w-[min(860px,calc(100vw-32px))] max-w-none overflow-visible border border-rule bg-paper p-0 text-ink shadow-[3px_3px_0_var(--color-hard-shadow)] backdrop:bg-black/35"
    >
      <div className="flex h-[min(640px,calc(100dvh-32px))] min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rule px-5">
          <h2 id="settings-title" className="text-sm font-semibold">
            设置
          </h2>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink3" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索设置项"
              aria-label="搜索设置项"
              className="h-8 w-52 border border-rule bg-paper pr-2 pl-7 text-xs outline-none placeholder:text-ink3"
            />
          </div>
          <button
            type="button"
            onClick={closeSettings}
            title="关闭设置"
            aria-label="关闭设置"
            className="flex h-8 w-8 shrink-0 items-center justify-center hover:bg-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <div
            className="flex w-[152px] shrink-0 flex-col border-r border-rule bg-surface2 pt-1.5"
            role="tablist"
            aria-orientation="vertical"
            aria-label="设置分组"
            onKeyDown={(event) => {
              const index = SETTINGS_SECTIONS.findIndex(
                (item) => item.id === section,
              );
              const count = SETTINGS_SECTIONS.length;
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % count
                  : event.key === "ArrowUp"
                    ? (index + count - 1) % count
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? count - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setQuery("");
              openSettings(SETTINGS_SECTIONS[next].id);
              document
                .getElementById(`settings-tab-${SETTINGS_SECTIONS[next].id}`)
                ?.focus();
            }}
          >
            {SETTINGS_SECTIONS.map(({ id, label, groups }) => {
              const Icon = SECTION_ICONS[id];
              const dirty = groups.some((group) =>
                group.rows.some((row) => modified.has(row.id)),
              );
              const active = section === id && !searching;
              return (
                <button
                  type="button"
                  key={id}
                  id={`settings-tab-${id}`}
                  role="tab"
                  tabIndex={section === id ? 0 : -1}
                  aria-selected={active}
                  aria-controls="settings-content"
                  onClick={() => {
                    setQuery("");
                    openSettings(id);
                  }}
                  className={cn(
                    "relative flex min-h-9 items-center gap-2.5 px-3 text-left text-xs text-ink2 hover:bg-hover hover:text-ink",
                    active &&
                      "bg-hover font-semibold text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-ink",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{label}</span>
                  {dirty && (
                    <span
                      aria-hidden="true"
                      className="ml-auto h-1.5 w-1.5 shrink-0 bg-note"
                    />
                  )}
                </button>
              );
            })}
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
                {!available && (
                  <p className="mt-1 break-words text-ink2">
                    主题与日志面板可见性来自其他存储, 不受影响.
                  </p>
                )}
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
            <SettingsView value={view}>
              {searching ? (
                hitSections.length === 0 ? (
                  <p className="py-6 text-xs text-ink3">
                    没有匹配 "{query.trim()}" 的设置项.
                  </p>
                ) : (
                  hitSections.map(({ id, label }) => (
                    <section key={id} className="mb-4 last:mb-0">
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          openSettings(id);
                        }}
                        className="mb-1 font-data text-[10px] tracking-[0.12em] text-ink3 uppercase hover:text-ink"
                      >
                        {label}
                      </button>
                      <SectionContent section={id} />
                    </section>
                  ))
                )
              ) : (
                section && <SectionContent section={section} />
              )}
            </SettingsView>
          </div>
        </div>
        <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-rule px-5">
          <button
            type="button"
            disabled={!resettable || searching}
            onClick={resetCurrent}
            className="inline-flex h-8 items-center gap-2 border border-rule px-3 text-xs hover:bg-hover disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复本组默认
          </button>
          <button
            type="button"
            disabled={!available}
            onClick={() => void restoreEverything()}
            className="inline-flex h-8 items-center border border-rule px-3 text-xs hover:bg-hover disabled:opacity-40"
          >
            全部恢复默认
          </button>
          <button
            type="button"
            onClick={closeSettings}
            className="ml-auto h-8 border border-ink bg-ink px-5 text-xs text-onink"
          >
            关闭
          </button>
        </footer>
      </div>
    </dialog>
  );
}
