import { useEffect, useRef } from "react";
import { RotateCcw, X } from "lucide-react";
import { AppsSection } from "@/components/settings/sections/AppsSection";
import { CaptureSection } from "@/components/settings/sections/CaptureSection";
import { CodegenSection } from "@/components/settings/sections/CodegenSection";
import { FilesSection } from "@/components/settings/sections/FilesSection";
import { GeneralSection } from "@/components/settings/sections/GeneralSection";
import { LogcatSection } from "@/components/settings/sections/LogcatSection";
import {
  sectionResetPlan,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settingsSections";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useThemeStore } from "@/store/theme";
import { DEFAULT_LOG_OPEN_BY_PANE, useUiStore, type PaneId } from "@/store/ui";

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
  const plan = sectionResetPlan(section ?? "general");
  const resettable = available || plan.resetTheme || plan.resetLogPanes;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (section && !dialog.open) dialog.showModal();
    if (!section && dialog.open) dialog.close();
  }, [section]);

  // Each store is reset on its own: a failed settings write no longer swallows
  // the theme or pane reset that belongs to a different store.
  function resetCurrent() {
    if (!section) return;
    if (useSettingsStore.getState().available) resetSection(section);
    if (plan.resetTheme) useThemeStore.getState().setTheme("system");
    if (plan.resetLogPanes)
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
            const index = SETTINGS_SECTIONS.findIndex(
              (item) => item.id === section,
            );
            const count = SETTINGS_SECTIONS.length;
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % count
                : event.key === "ArrowLeft"
                  ? (index + count - 1) % count
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? count - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            openSettings(SETTINGS_SECTIONS[next].id);
            document
              .getElementById(`settings-tab-${SETTINGS_SECTIONS[next].id}`)
              ?.focus();
          }}
        >
          {SETTINGS_SECTIONS.map(({ id, label }) => (
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
          {section && <SectionContent section={section} />}
        </div>
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-rule px-5">
          <button
            type="button"
            disabled={!resettable}
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
