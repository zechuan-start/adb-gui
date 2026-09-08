import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentAppActionsTool } from "@/components/ActivityMonitor";
import { ApkTool } from "@/components/AppManager";
import { BugReportTool } from "@/components/BugReportTool";
import { ClipboardTool } from "@/components/ClipboardTool";
import { CodeDecoderPage } from "@/components/CodeDecoderPage";
import { CodeGeneratorPage } from "@/components/CodeGeneratorPage";
import { DeepLinkTool } from "@/components/DeepLinkTool";
import { DeviceFileManager } from "@/components/DeviceFileManager";
import { PackageManagerPanel } from "@/components/PackageManager";
import { PortForwardTool } from "@/components/PortForwardTool";
import { QuickKeysTool } from "@/components/QuickKeys";
import { ScreenRecordTool } from "@/components/ScreenRecordTool";
import { ScreenshotTool } from "@/components/Screenshot";
import { en } from "@/i18n/messages/en";
import { zhCN } from "@/i18n/messages/zh-CN";
import { useCodeGeneratorStore } from "@/store/codeGenerator";
import { useLocaleStore } from "@/store/locale";
import { useSettingsStore } from "@/store/settings";
import { defaultSettings } from "@/lib/settings";

// Server rendering does not subscribe. Feed it current snapshots while keeping
// the real Zustand action implementations and retained state under test.
vi.mock("@/i18n", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/i18n")>(),
  useT: () => useLocaleStore.getState().messages,
  useLocale: () => useLocaleStore.getState().locale,
}));
vi.mock("@/store/codeGenerator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/codeGenerator")>();
  const store = actual.useCodeGeneratorStore;
  return { useCodeGeneratorStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});
vi.mock("@/store/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/settings")>();
  const store = actual.useSettingsStore;
  return { ...actual, useSettingsStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});

beforeEach(() => {
  useSettingsStore.setState({ preferences: defaultSettings(), available: true, error: null });
  useCodeGeneratorStore.getState().clear();
});

afterEach(() => {
  useLocaleStore.getState().setPreference("zh-CN");
  vi.restoreAllMocks();
});

describe("tool language presentation", () => {
  const tools: [string, ComponentType][] = [
    ["current app", CurrentAppActionsTool], ["install", ApkTool], ["bug report", BugReportTool],
    ["clipboard", ClipboardTool], ["decoder", CodeDecoderPage], ["generator", CodeGeneratorPage],
    ["deep link", DeepLinkTool], ["files", DeviceFileManager], ["apps", PackageManagerPanel],
    ["ports", PortForwardTool], ["keys", QuickKeysTool], ["recording", ScreenRecordTool],
    ["screenshot", ScreenshotTool],
  ];

  it.each(tools)("renders %s empty and unavailable states in English", (_name, Component) => {
    useLocaleStore.getState().setPreference("en");
    const html = renderToStaticMarkup(createElement(Component));
    expect(html).not.toMatch(/\p{Script=Han}/u);
    expect(html).toContain("<");
  });

  it("translates an existing generation error without rerunning the action", () => {
    useLocaleStore.getState().setPreference("zh-CN");
    expect(useCodeGeneratorStore.getState().generate()).toBe(false);
    const retainedError = useCodeGeneratorStore.getState().inputError;
    expect(renderToStaticMarkup(<CodeGeneratorPage />)).toContain(zhCN.errors.generator_empty_input());

    useLocaleStore.getState().setPreference("en");
    expect(renderToStaticMarkup(<CodeGeneratorPage />)).toContain(en.errors.generator_empty_input({}));
    expect(useCodeGeneratorStore.getState().inputError).toBe(retainedError);
  });

  it("formats a retained batch count in English without changing its data", () => {
    const input = Array.from({ length: 1234 }, (_, index) => `条目-${index}`).join("\n");
    useCodeGeneratorStore.getState().setInput(input);
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);
    const batch = useCodeGeneratorStore.getState().generatedBatch;
    useLocaleStore.getState().setPreference("en");
    expect(renderToStaticMarkup(<CodeGeneratorPage />)).toContain("1,234 items");
    expect(useCodeGeneratorStore.getState().generatedBatch).toBe(batch);
    expect(batch?.values[0]).toBe("条目-0");
  });
});
