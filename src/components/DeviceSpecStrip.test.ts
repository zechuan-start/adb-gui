import { describe, expect, it } from "vitest";
import {
  getDeviceSpecStripModel,
  type DeviceSpecStripModel,
} from "@/components/DeviceSpecStrip";
import type { DeviceDetail, DeviceInfo } from "@/lib/tauri";
import type { DeviceDetailState } from "@/store/device";

function device(state = "device"): DeviceInfo {
  return {
    serial: "emulator-5554",
    state,
    model: "Pixel 9",
    transport: "usb",
    is_network: false,
    alias_identity: null,
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
      model: "Pixel 9 Pro",
      serial: "emulator-5554",
      android: "16 / SDK 36",
      abi: "arm64-v8a",
      display: "1440x3120 / 560",
      battery: "82% / Charging",
    });
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
      state: "离线",
    });
  });

  it("does not render a strip when no device is selected", () => {
    expect(getDeviceSpecStripModel(null, detailState())).toBeNull();
  });
});
