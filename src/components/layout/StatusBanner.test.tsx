import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBanner } from "@/components/layout/StatusBanner";
import type { DeviceInfo } from "@/lib/tauri";

const deviceState = vi.hoisted(() => ({
  devices: [] as DeviceInfo[],
  selectedDevice: null as string | null,
}));

vi.mock("@/store/device", () => ({
  useDeviceStore: (
    selector: (state: typeof deviceState) => unknown,
  ) => selector(deviceState),
}));

function device(state: DeviceInfo["state"]): DeviceInfo {
  return {
    serial: "R5CT30ZXJKQ",
    state,
    model: "Pixel 8 Pro",
    transport: "usb",
    is_network: false,
    alias_identity: null,
  };
}

function renderStatus(devices: DeviceInfo[], selectedDevice: string | null): string {
  deviceState.devices = devices;
  deviceState.selectedDevice = selectedDevice;
  return renderToStaticMarkup(<StatusBanner />);
}

describe("StatusBanner", () => {
  beforeEach(() => {
    deviceState.devices = [];
    deviceState.selectedDevice = null;
  });

  it("stays hidden for an online device", () => {
    const online = device("device");

    expect(renderStatus([online], online.serial)).toBe("");
  });

  it("explains how to authorize a selected USB device", () => {
    const unauthorized = device("unauthorized");
    const html = renderStatus([unauthorized], unauthorized.serial);

    expect(html).toContain("设备未授权");
    expect(html).toContain("请在设备上确认 USB 调试授权");
    expect(html).toContain("生码和解码等本地工具仍可使用");
  });

  it("explains how to recover a selected offline device", () => {
    const offline = device("offline");
    const html = renderStatus([offline], offline.serial);

    expect(html).toContain("设备离线");
    expect(html).toContain("请重新连接设备或刷新设备列表");
    expect(html).toContain("生码和解码等本地工具仍可使用");
  });

  it("keeps local tools available when no device exists", () => {
    const html = renderStatus([], null);

    expect(html).toContain("没有检测到设备");
    expect(html).toContain("连接 Android 设备后可使用 ADB 功能");
    expect(html).toContain("生码和解码等本地工具仍可使用");
  });
});
