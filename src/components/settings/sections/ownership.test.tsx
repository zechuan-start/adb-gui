import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "@/components/settings/SettingRow";
import { AppsSection } from "@/components/settings/sections/AppsSection";
import { CaptureSection } from "@/components/settings/sections/CaptureSection";
import { CodegenSection } from "@/components/settings/sections/CodegenSection";
import { FilesSection } from "@/components/settings/sections/FilesSection";
import { GeneralSection } from "@/components/settings/sections/GeneralSection";
import { LogcatSection } from "@/components/settings/sections/LogcatSection";
import { defaultSettings, type SettingsPreferences } from "@/lib/settings";

const settingsState = vi.hoisted(() => ({
  preferences: {} as SettingsPreferences,
  available: true,
  update: () => {},
}));

const themeState = vi.hoisted(() => ({
  theme: "system" as const,
  setTheme: () => {},
}));

const uiState = vi.hoisted(() => ({
  logOpenByPane: {
    tools: true,
    apps: true,
    files: true,
    codegen: false,
    decoder: false,
    perf: false,
  },
  setLogOpen: () => {},
}));

vi.mock("@/store/settings", () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));
vi.mock("@/store/theme", () => ({
  useThemeStore: (selector: (state: typeof themeState) => unknown) =>
    selector(themeState),
}));
vi.mock("@/store/ui", () => ({
  useUiStore: (selector: (state: typeof uiState) => unknown) =>
    selector(uiState),
}));

function render(section: "general" | "logcat", available: boolean): string {
  settingsState.preferences = defaultSettings();
  settingsState.available = available;
  return renderToStaticMarkup(
    section === "general" ? <GeneralSection /> : <LogcatSection />,
  );
}

// The section owns the fieldset, so anything stored outside adb-gui-settings has
// to render before it opens (general) or after it closes (logcat).
function fieldsetRange(markup: string): { start: number; end: number } {
  const start = markup.indexOf("<fieldset");
  const end = markup.indexOf("</fieldset>");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return { start, end };
}

describe("settings section ownership", () => {
  beforeEach(() => {
    settingsState.available = true;
  });

  it("disables only the settings-owned controls of the general section", () => {
    const markup = render("general", false);
    const { start } = fieldsetRange(markup);
    expect(markup).toContain('<fieldset disabled=""');
    expect(markup.indexOf('aria-label="主题"')).toBeLessThan(start);
    expect(markup.indexOf("启动页面")).toBeGreaterThan(start);
    expect(markup.indexOf("启动时检查更新")).toBeGreaterThan(start);
    expect(markup.indexOf("离开性能页后继续采集")).toBeGreaterThan(start);
  });

  it("keeps the log pane checkboxes outside the logcat fieldset", () => {
    const markup = render("logcat", false);
    const { start, end } = fieldsetRange(markup);
    expect(markup.indexOf('aria-label="显示格式"')).toBeGreaterThan(start);
    expect(markup.indexOf('aria-label="显示列"')).toBeGreaterThan(start);
    expect(markup.indexOf("自动折叠崩溃堆栈")).toBeGreaterThan(start);
    expect(markup.indexOf("显示日志的工作区")).toBeGreaterThan(end);
  });

  it("leaves every control enabled while the settings file is readable", () => {
    for (const section of ["general", "logcat"] as const) {
      const markup = render(section, true);
      expect(markup).toContain('<fieldset class="min-w-0 disabled:opacity-50">');
      expect(markup).not.toContain("disabled=\"\"");
    }
  });
});

describe("settings section rendering", () => {
  it("renders every section from row metadata", () => {
    settingsState.preferences = defaultSettings();
    settingsState.available = true;
    for (const [Section, sample] of [
      [GeneralSection, "启动页面"],
      [LogcatSection, "自动换行"],
      [CaptureSection, "保存截图后打开图片"],
      [FilesSection, "文件夹优先"],
      [AppsSection, "排序"],
      [CodegenSection, "分隔符"],
    ] as const) {
      const markup = renderToStaticMarkup(
        <SettingsView value={{ visible: () => true, modified: () => false }}>
          <Section />
        </SettingsView>,
      );
      expect(markup).toContain(sample);
    }
  });

  it("keeps only the searched rows and drops their empty groups", () => {
    settingsState.preferences = defaultSettings();
    settingsState.available = true;
    const markup = renderToStaticMarkup(
      <SettingsView
        value={{ visible: (id) => id === "showHidden", modified: () => false }}
      >
        <FilesSection />
      </SettingsView>,
    );
    expect(markup).toContain("显示隐藏文件");
    expect(markup).toContain("排序与显示");
    expect(markup).not.toContain("文件夹优先");
    expect(markup).not.toContain("起始目录");
  });

  it("marks a row whose value left its default", () => {
    settingsState.preferences = defaultSettings();
    settingsState.available = true;
    const markup = renderToStaticMarkup(
      <SettingsView
        value={{ visible: () => true, modified: (id) => id === "cozyRows" }}
      >
        <LogcatSection />
      </SettingsView>,
    );
    expect(markup.match(/title="已改动"/g)).toHaveLength(1);
  });
});
