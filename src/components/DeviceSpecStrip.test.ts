import { describe, expect, it } from "vitest";
import {
  getDeviceSpecStripModel,
  getForegroundActivityLabel,
  type DeviceSpecStripModel,
} from "@/components/DeviceSpecStrip";
import type { DeviceDetail, DeviceInfo } from "@/lib/tauri";
import type { DeviceDetailState } from "@/store/device";

function device(state = "device", overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "emulator-5554",
    state,
    model: "Pixel 9",
    transport: "usb",
    is_network: false,
    alias_identity: null,
    device_id: "emulator-5554",
    ...overrides,
  };
}

function detail(): DeviceDetail {
  return {
    model: "Pixel 9 Pro",
    manufacturer: "Google",
    android_version: "16",
    sdk_level: "36",
    abi: "arm64-v8a",
    resolution: "1440x3120",
    density: "560",
    battery_level: "82",
    battery_status: "Charging",
  };
}

function detailState(overrides: Partial<DeviceDetailState> = {}): DeviceDetailState {
  return {
    serial: null,
    detail: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

function itemValues(model: DeviceSpecStripModel | null): Record<string, string> {
  return Object.fromEntries(model?.items.map((item) => [item.key, item.value]) ?? []);
}

describe("getDeviceSpecStripModel", () => {
  it("maps online detail into the complete specification strip", () => {
    const model = getDeviceSpecStripModel(
      device(),
      detailState({ serial: "emulator-5554", detail: detail() }),
    );

    expect(model?.loading).toBe(false);
    expect(itemValues(model)).toEqual({
      model: "Google / Pixel 9 Pro",
      serial: "emulator-5554",
      transport: "USB",
      android: "16 / SDK 36",
      abi: "arm64-v8a",
      display: "1440x3120 / 560",
      battery: "82% / Charging",
    });
  });

  it("keeps the model readable when the manufacturer is unknown", () => {
    const model = getDeviceSpecStripModel(
      device(),
      detailState({
        serial: "emulator-5554",
        detail: { ...detail(), manufacturer: "" },
      }),
    );

    expect(itemValues(model).model).toBe("Pixel 9 Pro");
  });

  it("uses a fixed loading status before online detail arrives", () => {
    const model = getDeviceSpecStripModel(
      device(),
      detailState({ serial: "emulator-5554", loading: true }),
    );

    expect(model?.loading).toBe(true);
    expect(itemValues(model)).toEqual({
      model: "Pixel 9",
      serial: "emulator-5554",
      transport: "USB",
      "detail-status": "读取中...",
    });
  });

  it("shows only list metadata for an unauthorized device", () => {
    const model = getDeviceSpecStripModel(
      device("unauthorized"),
      detailState({ serial: "emulator-5554", detail: detail() }),
    );

    expect(itemValues(model)).toEqual({
      model: "Pixel 9",
      serial: "emulator-5554",
      transport: "USB",
      state: "未授权",
    });
  });

  it("shows only list metadata for an offline device", () => {
    const model = getDeviceSpecStripModel(
      device("offline"),
      detailState({ serial: "emulator-5554", detail: detail() }),
    );

    expect(itemValues(model)).toEqual({
      model: "Pixel 9",
      serial: "emulator-5554",
      transport: "USB",
      state: "离线",
    });
  });

  it("does not render a strip when no device is selected", () => {
    expect(getDeviceSpecStripModel(null, detailState())).toBeNull();
  });

  it("shows all merged transports and marks the current USB transport", () => {
    const usb = device();
    const wifi = device("device", {
      serial: "192.168.1.5:5555",
      transport: "tcpip",
      is_network: true,
    });

    const model = getDeviceSpecStripModel(
      usb,
      detailState({ serial: usb.serial, detail: detail() }),
      [usb, wifi],
    );

    expect(itemValues(model).transport).toBe("USB 和 WiFi (当前 USB)");
  });

  it("marks WiFi when it is the active transport of a merged device", () => {
    const wifi = device("device", {
      serial: "192.168.1.5:5555",
      transport: "tcpip",
      is_network: true,
    });
    const offlineUsb = device("offline");

    const model = getDeviceSpecStripModel(
      wifi,
      detailState({ serial: wifi.serial, detail: detail() }),
      [wifi, offlineUsb],
    );

    expect(itemValues(model).transport).toBe("USB 和 WiFi (当前 WiFi)");
  });
});

describe("getForegroundActivityLabel", () => {
  it("shows the polled activity for an online device", () => {
    expect(
      getForegroundActivityLabel(device(), "cn.example.app/.main.MainActivity"),
    ).toBe("cn.example.app/.main.MainActivity");
  });

  it("falls back to an empty-foreground hint for an online device", () => {
    expect(getForegroundActivityLabel(device(), "")).toBe("暂无前台 Activity");
  });

  it("reports an unusable device instead of a stale activity", () => {
    expect(
      getForegroundActivityLabel(device("unauthorized"), "cn.example.app/.Main"),
    ).toBe("设备不可用");
    expect(getForegroundActivityLabel(null, "")).toBe("设备不可用");
  });
});
