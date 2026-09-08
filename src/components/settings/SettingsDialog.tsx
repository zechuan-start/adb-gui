import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AppWindow,
  Camera,
  Files,
  QrCode,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { SettingsView } from "@/components/settings/SettingRow";
import { SettingsSectionBlock } from "@/components/settings/SettingsSectionBlock";
import { AppsSection } from "@/components/settings/sections/AppsSection";
import { CaptureSection } from "@/components/settings/sections/CaptureSection";
import { CodegenSection } from "@/components/settings/sections/CodegenSection";
import { FilesSection } from "@/components/settings/sections/FilesSection";
import { GeneralSection } from "@/components/settings/sections/GeneralSection";
import { LogcatSection } from "@/components/settings/sections/LogcatSection";
import {
  modifiedRowIds,
  sectionResetPlan,
  sectionRowIds,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settingsSections";
import { confirmRestoreDefaults, isTauriRuntime, onOpenSettings } from "@/lib/tauri";
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

function resetPanes(): void {
  for (const [pane, open] of Object.entries(DEFAULT_LOG_OPEN_BY_PANE)) {
    useUiStore.getState().setLogOpen(pane as PaneId, open);
  }
}

function focusableControls(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]"),
  ).filter((element) =>
    element.tabIndex >= 0 &&
    !element.matches(":disabled") &&
    element.getClientRects().length > 0,
  );
}

export function SettingsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionElements = useRef(new Map<SettingsSection, HTMLElement>());
  const navigationButtons = useRef(new Map<SettingsSection, HTMLButtonElement>());
  const scrollFrame = useRef<number | null>(null);
  const programmaticSection = useRef<SettingsSection | null>(null);
  const programmaticClearFrame = useRef<number | null>(null);
  const requestedSection = useUiStore((state) => state.settingsSection);
  const openSettings = useUiStore((state) => state.openSettings);
  const closeSettings = useUiStore((state) => state.closeSettings);
  const logOpenByPane = useUiStore((state) => state.logOpenByPane);
  const theme = useThemeStore((state) => state.theme);
  const preferences = useSettingsStore((state) => state.preferences);
  const error = useSettingsStore((state) => state.error);
  const available = useSettingsStore((state) => state.available);
  const resetPreferenceSection = useSettingsStore((state) => state.resetSection);
  const restoreDefaults = useSettingsStore((state) => state.restoreDefaults);
  const reload = useSettingsStore((state) => state.reload);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");

  const modified = useMemo(
    () => modifiedRowIds({ preferences, theme, logOpenByPane }),
    [preferences, theme, logOpenByPane],
  );
  const view = useMemo(
    () => ({ modified: (rowId: string) => modified.has(rowId) }),
    [modified],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onOpenSettings(() => {
      if (!disposed) {
        openSettings(useUiStore.getState().settingsSection ?? "general");
      }
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((failure) => {
        if (!disposed) showToast("error", `监听设置菜单失败: ${String(failure)}`);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openSettings, showToast]);

  const scrollToSection = useCallback((section: SettingsSection): void => {
    const content = contentRef.current;
    const element = sectionElements.current.get(section);
    if (!content || !element) return;
    // The explicit anchor wins over the scroll event it causes. Later user
    // scrolling resumes the normal scrollspy calculation.
    programmaticSection.current = section;
    if (scrollFrame.current !== null) {
      window.cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    }
    if (programmaticClearFrame.current !== null) {
      window.cancelAnimationFrame(programmaticClearFrame.current);
    }
    content.scrollTo({ top: element.offsetTop, behavior: "auto" });
    programmaticClearFrame.current = window.requestAnimationFrame(() => {
      programmaticClearFrame.current = null;
      if (programmaticSection.current === section) {
        programmaticSection.current = null;
      }
    });
  }, []);

  const updateActiveSection = useCallback((): void => {
    const content = contentRef.current;
    if (!content) return;
    const atBottom =
      content.scrollTop + content.clientHeight >= content.scrollHeight - 1;
    if (atBottom) {
      setActiveSection(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id);
      return;
    }
    let next = SETTINGS_SECTIONS[0].id;
    for (const { id } of SETTINGS_SECTIONS) {
      const element = sectionElements.current.get(id);
      if (element && element.offsetTop <= content.scrollTop + 24) next = id;
    }
    setActiveSection(next);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!requestedSection) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
      titleRef.current?.focus({ preventScroll: true });
    }
    setActiveSection(requestedSection);
    const frame = window.requestAnimationFrame(() => {
      scrollToSection(requestedSection);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedSection, scrollToSection]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current);
      }
      if (programmaticClearFrame.current !== null) {
        window.cancelAnimationFrame(programmaticClearFrame.current);
      }
    },
    [],
  );

  function handleContentScroll(): void {
    if (programmaticSection.current !== null) {
      setActiveSection(programmaticSection.current);
      programmaticSection.current = null;
      return;
    }
    if (scrollFrame.current !== null) return;
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null;
      updateActiveSection();
    });
  }

  function navigateToSection(section: SettingsSection, focus = false): void {
    openSettings(section);
    setActiveSection(section);
    if (requestedSection === section) scrollToSection(section);
    if (focus) navigationButtons.current.get(section)?.focus();
  }

  function handleNavigationKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    section: SettingsSection,
  ): void {
    if (event.key === "Tab" && !event.shiftKey) {
      const element = sectionElements.current.get(section);
      if (!element) return;
      event.preventDefault();
      (focusableControls(element)[0] ?? element).focus({ preventScroll: true });
      scrollToSection(section);
      return;
    }
    const index = SETTINGS_SECTIONS.findIndex(
      ({ id }) => id === section,
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
    navigateToSection(SETTINGS_SECTIONS[next].id, true);
  }

  function resetSection(section: SettingsSection): void {
    const plan = sectionResetPlan(section);
    if (useSettingsStore.getState().available) {
      resetPreferenceSection(section);
    }
    if (plan.resetTheme) useThemeStore.getState().setTheme("system");
    if (plan.resetLogPanes) resetPanes();
  }

  async function restoreEverything(): Promise<void> {
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
        const controls = focusableControls(event.currentTarget);
        const first = controls[0];
        const last = controls[controls.length - 1];
        const boundary = event.shiftKey ? first : last;
        if (document.activeElement !== titleRef.current && document.activeElement !== boundary) return;
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }}
      className="m-auto w-[min(800px,calc(100vw-32px))] max-w-none overflow-hidden border border-rule bg-paper p-0 text-ink shadow-[3px_3px_0_var(--color-hard-shadow)] backdrop:bg-black/35"
    >
      <div className="flex h-[min(600px,calc(100dvh-32px))] min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-rule px-5">
          <h2
            ref={titleRef}
            id="settings-title"
            tabIndex={-1}
            className="text-sm font-semibold outline-none"
          >
            设置
          </h2>
          <button
            type="button"
            onClick={closeSettings}
            title="关闭设置"
            aria-label="关闭设置"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center hover:bg-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {error && (
          <div role="alert" className="mx-5 my-3 shrink-0 border border-err bg-err-band p-3 text-xs">
            <p className="break-words">{error}</p>
            {!available && (
              <p className="mt-1 break-words text-ink2">主题与日志面板可见性仍可修改.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={reload} className="border border-rule px-2 py-1">
                重新读取
              </button>
              {!available && (
                <button type="button" onClick={restoreDefaults} className="border border-rule px-2 py-1">
                  恢复新设置默认值
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="设置分组"
            className="flex w-[140px] shrink-0 flex-col border-r border-rule bg-surface2 pt-1.5"
          >
            {SETTINGS_SECTIONS.map(({ id, label }) => {
              const Icon = SECTION_ICONS[id];
              const active = activeSection === id;
              return (
                <button
                  ref={(element) => {
                    if (element) navigationButtons.current.set(id, element);
                    else navigationButtons.current.delete(id);
                  }}
                  type="button"
                  key={id}
                  id={`settings-nav-${id}`}
                  tabIndex={active ? 0 : -1}
                  aria-current={active ? "true" : undefined}
                  onClick={() => navigateToSection(id)}
                  onKeyDown={(event) => handleNavigationKeyDown(event, id)}
                  className={cn(
                    "relative flex min-h-9 items-center gap-2.5 px-3 text-left text-xs text-ink2 hover:bg-hover hover:text-ink",
                    active &&
                      "bg-hover font-semibold text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-ink",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{label}</span>
                </button>
              );
            })}
          </nav>
          <div
            ref={contentRef}
            id="settings-content"
            onScroll={handleContentScroll}
            className="blueprint-grid settings-grid min-h-0 flex-1 overflow-y-auto px-5 py-3"
          >
            <div className="relative mx-auto max-w-[600px]">
              <SettingsView value={view}>
                {SETTINGS_SECTIONS.map((meta, index) => (
                  <SettingsSectionBlock
                    key={meta.id}
                    meta={meta}
                    index={index}
                    dirty={sectionRowIds(meta.id).some((id) => modified.has(id))}
                    onReset={() => resetSection(meta.id)}
                    sectionRef={(element) => {
                      if (element) sectionElements.current.set(meta.id, element);
                      else sectionElements.current.delete(meta.id);
                    }}
                  >
                    <SectionContent section={meta.id} />
                  </SettingsSectionBlock>
                ))}
                <div className="pb-5 pt-1">
                  <button
                    type="button"
                    onClick={() => void restoreEverything()}
                    className="inline-flex h-8 items-center gap-1.5 px-1.5 text-xs text-ink2 hover:bg-hover hover:text-ink"
                  >
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    全部恢复默认
                  </button>
                </div>
              </SettingsView>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
