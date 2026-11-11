import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MirrorTool } from "@/components/MirrorTool";
import { SettingsView } from "@/components/settings/SettingRow";
import { MirrorSection } from "@/components/settings/sections/MirrorSection";
import { en } from "@/i18n/messages/en";
import { zhCN } from "@/i18n/messages/zh-CN";
import type { MirrorDetection, MirrorLastExit, MirrorSession } from "@/lib/mirror";
import { defaultSettings } from "@/lib/settings";
import type { DeviceInfo } from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useLocaleStore } from "@/store/locale";
import { useMirrorStore } from "@/store/mirror";
import { useSettingsStore } from "@/store/settings";

// Server rendering reads Zustand's initial state, so feed it live snapshots
// while keeping the real actions.
vi.mock("@/i18n", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/i18n")>(),
  useT: () => useLocaleStore.getState().messages,
}));
vi.mock("@/lib/tauri", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tauri")>(),
  isTauriRuntime: () => true,
}));
vi.mock("@/store/device", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/device")>();
  const store = actual.useDeviceStore;
  return { ...actual, useDeviceStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});
vi.mock("@/store/mirror", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/mirror")>();
  const store = actual.useMirrorStore;
  return { ...actual, useMirrorStore: Object.assign(
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
vi.mock("@/store/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/ui")>();
  const store = actual.useUiStore;
  return { ...actual, useUiStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});

const DEVICE: DeviceInfo = {
  serial: "9A271FFAZ004TR",
  state: "device",
  model: "Pixel 7",
  transport: "usb",
  is_network: false,
  alias_identity: null,
  device_id: null,
};
const BUNDLED_PATH = "/Applications/ADB GUI.app/Contents/Resources/scrcpy/scrcpy";
const READY: MirrorDetection = {
  status: "ready",
  scrcpyPath: null,
  info: { path: BUNDLED_PATH, version: "5.0.1", source: "bundled" },
};
const NOT_FOUND = { status: "error", scrcpyPath: null, error: { code: "mirror.notFound" } } as const;
const TOO_OLD = {
  status: "error",
  scrcpyPath: null,
  error: { code: "mirror.tooOld", params: { version: "1.21", minimum: "2.0" } },
} as const;
const LONG_ERROR = "Could not open video stream: ".repeat(8).trim();

function render({
  detection = READY,
  session,
  lastExit,
  device = DEVICE,
}: {
  detection?: MirrorDetection;
  session?: MirrorSession;
  lastExit?: MirrorLastExit;
  device?: DeviceInfo | null;
} = {}): string {
  useDeviceStore.setState({ devices: device ? [device] : [], selectedDevice: device?.serial ?? null });
  useMirrorStore.setState({
    detection,
    sessions: session ? { [DEVICE.serial]: session } : {},
    lastExit: lastExit ? { [DEVICE.serial]: lastExit } : {},
  });
  return renderToStaticMarkup(<MirrorTool />);
}

function startButton(markup: string): string {
  return markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0] ?? "";
}

beforeEach(() => {
  useLocaleStore.getState().setPreference("zh-CN");
  useSettingsStore.setState({ preferences: defaultSettings(), available: true, error: null });
  useFeedbackStore.getState().clearToast();
});

afterEach(() => {
  useLocaleStore.getState().setPreference("zh-CN");
  vi.restoreAllMocks();
});

describe("mirror tool states", () => {
  it.each([
    ["no device", { device: null }, zhCN.tools.mirrorTool.noDevice, en.tools.mirrorTool.noDevice, false],
    ["detecting", { detection: { status: "detecting", scrcpyPath: null } as const }, zhCN.tools.mirrorTool.detecting, en.tools.mirrorTool.detecting, false],
    ["bundled scrcpy missing", { detection: NOT_FOUND }, zhCN.tools.mirrorTool.notFound, en.tools.mirrorTool.notFound, false],
    [
      "too old",
      { detection: TOO_OLD },
      zhCN.errors["mirror.tooOld"]({ version: "1.21", minimum: "2.0" }),
      en.errors["mirror.tooOld"]({ version: "1.21", minimum: "2.0" }),
      false,
    ],
    [
      "invalid custom path",
      { detection: { status: "error", scrcpyPath: null, error: { code: "mirror.customPathInvalid", params: { path: "/tmp/x" } } } as const },
      zhCN.tools.mirrorTool.openSettings,
      en.tools.mirrorTool.openSettings,
      false,
    ],
    ["ready", {}, zhCN.tools.mirrorTool.start, en.tools.mirrorTool.start, true],
    ["closed", { lastExit: { outcome: "closed", error: null, at: 1 } as const }, zhCN.tools.mirrorTool.closed, en.tools.mirrorTool.closed, true],
    [
      "disconnected",
      { lastExit: { outcome: "disconnected", error: { code: "mirror.disconnected" }, at: 1 } as const },
      zhCN.tools.mirrorTool.disconnected,
      en.tools.mirrorTool.disconnected,
      true,
    ],
    ["starting", { session: { phase: "starting" } as const }, zhCN.tools.mirrorTool.starting, en.tools.mirrorTool.starting, false],
    [
      "running",
      { session: { phase: "running", sessionId: 3, stopError: null } as const },
      zhCN.tools.mirrorTool.running({ device: "Pixel 7 - 9A271FFAZ004TR" }),
      en.tools.mirrorTool.running({ device: "Pixel 7 - 9A271FFAZ004TR" }),
      true,
    ],
  ])("renders %s in both languages", (_name, state, zh, english, enabled) => {
    const chinese = render(state);
    expect(chinese).toContain(zh);
    expect(startButton(chinese).includes('disabled=""')).toBe(!enabled);
    useLocaleStore.getState().setPreference("en");
    const markup = render(state);
    expect(markup).toContain(english);
    expect(markup).not.toMatch(/\p{Script=Han}/u);
  });

  it("offers only a new detection when the bundled scrcpy is missing", () => {
    const markup = render({ detection: NOT_FOUND });
    expect(markup).toContain(zhCN.tools.mirrorTool.redetect);
    expect(markup).not.toContain(zhCN.tools.mirrorTool.openSettings);
    expect(markup).not.toMatch(/brew|winget/i);
  });

  it("points a too-old custom scrcpy at settings and a new detection", () => {
    const markup = render({ detection: TOO_OLD });
    expect(markup).toContain(zhCN.tools.mirrorTool.redetect);
    expect(markup).toContain(zhCN.tools.mirrorTool.openSettings);
    expect(markup).not.toMatch(/brew|winget/i);
  });

  it("shows scrcpy's error beside the retry button and keeps the full text in the title", () => {
    const error = { code: "mirror.exitFailed", params: { code: 1 }, detail: LONG_ERROR };
    const markup = render({ lastExit: { outcome: "failed", error, at: 1 } });
    expect(markup).toContain(zhCN.tools.mirrorTool.failed({ detail: LONG_ERROR }));
    expect(markup).toContain(`title="${zhCN.errors["mirror.exitFailed"]({ code: 1 })}: ${LONG_ERROR}"`);
    expect(markup).toContain("line-clamp-3");
    expect(startButton(markup)).toContain(zhCN.tools.mirrorTool.start);
    expect(startButton(markup)).not.toContain('disabled=""');
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("says nothing after the app stopped the session itself", () => {
    const markup = render({ lastExit: { outcome: "stopped", error: null, at: 1 } });
    expect(markup).not.toContain(zhCN.tools.mirrorTool.closed);
    expect(markup).toMatch(/role="status"[^>]*><\/div>/);
  });
});

describe("mirror preset control", () => {
  it("is the one control the module and the settings row render", async () => {
    vi.resetModules();
    vi.doMock("@/components/settings/MirrorPreferences", async (importOriginal) => ({
      ...await importOriginal<typeof import("@/components/settings/MirrorPreferences")>(),
      MirrorPresetControl: () => <div data-testid="preset-control" />,
    }));
    const { MirrorTool: Tool } = await import("@/components/MirrorTool");
    const { MirrorSection: Section } = await import("@/components/settings/sections/MirrorSection");
    expect(renderToStaticMarkup(<Tool />)).toContain('data-testid="preset-control"');
    expect(renderToStaticMarkup(
      <SettingsView value={{ modified: () => false }}><Section /></SettingsView>,
    )).toContain('data-testid="preset-control"');
    vi.doUnmock("@/components/settings/MirrorPreferences");
  });

  it("writes the preset through the settings update action", async () => {
    const { MirrorPresetControl } = await vi.importActual<typeof import("@/components/settings/MirrorPreferences")>(
      "@/components/settings/MirrorPreferences",
    );
    const update = vi.fn();
    useSettingsStore.setState({ update });
    const element = MirrorPresetControl({});
    expect(isValidElement(element)).toBe(true);
    (element as ReactElement<{ onChange: (preset: string) => void }>).props.onChange("high");
    expect(update).toHaveBeenCalledWith("mirror", { ...defaultSettings().mirror, preset: "high" });
  });
});

describe("mirror settings section", () => {
  function section(): string {
    useMirrorStore.setState({ detection: READY });
    return renderToStaticMarkup(
      <SettingsView value={{ modified: () => false }}>
        <MirrorSection />
      </SettingsView>,
    );
  }

  it("renders the detected scrcpy and all four rows", () => {
    const markup = section();
    expect(markup).toContain(BUNDLED_PATH);
    expect(markup).toContain(zhCN.settings.mirror.version({ version: "5.0.1", source: zhCN.settings.mirror.sources.bundled }));
    for (const label of [
      zhCN.settings.rows.scrcpyPath.label,
      zhCN.settings.rows.mirrorPreset.label,
      zhCN.settings.rows.mirrorOptions.label,
      zhCN.settings.rows.mirrorExtraArgs.label,
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toMatch(/type="checkbo[x]"/);
  });

  it("disables the control-only options while view-only is on", () => {
    const options = { ...defaultSettings().mirror.options, viewOnly: true, stayAwake: true };
    useSettingsStore.setState({ preferences: { ...defaultSettings(), mirror: { ...defaultSettings().mirror, options } } });
    const markup = section();
    const chip = (label: string) =>
      markup.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
    for (const label of ["息屏投屏", "保持唤醒", "显示触摸"]) {
      expect(chip(label)).toContain('disabled=""');
    }
    // The stored value survives so switching view-only off restores it.
    expect(chip("保持唤醒")).toContain('aria-pressed="true"');
    for (const label of ["窗口置顶", "关闭音频", "仅查看"]) {
      expect(chip(label)).not.toContain('disabled=""');
    }
    expect(markup).toContain(zhCN.settings.mirror.viewOnlyNote);
  });
});
