import { describe, expect, it } from "vitest";
import { getDevicePickerOptions } from "@/components/layout/DevicePicker";
import type { DeviceInfo } from "@/lib/tauri";

function device(overrides: Partial<DeviceInfo>): DeviceInfo {
  return {
    serial: "R5CT30ZXJKQ",
    state: "device",
    model: "Pixel 8 Pro",
    transport: "usb",
    is_network: false,
    alias_identity: null,
    ...overrides,
  };
}

describe("getDevicePickerOptions", () => {
  it("keeps each selectable device's model, serial, and state in its accessible label", () => {
    const options = getDevicePickerOptions([
      device({}),
      device({ serial: "8A17X0YMK", model: "Redmi K70", state: "unauthorized" }),
      device({ serial: "emulator-5554", model: "sdk_gphone64_x86_64", state: "offline" }),
    ]);

    expect(options).toEqual([
      {
        value: "R5CT30ZXJKQ",
        label: "Pixel 8 Pro, R5CT30ZXJKQ, 在线",
      },
      {
        value: "8A17X0YMK",
        label: "Redmi K70, 8A17X0YMK, 未授权",
      },
      {
        value: "emulator-5554",
        label: "sdk_gphone64_x86_64, emulator-5554, 离线",
      },
    ]);
  });

  it("keeps the existing selectable-device rule for disconnected network aliases", () => {
    const options = getDevicePickerOptions([
      device({
        serial: "192.168.1.23:5555",
        model: "Galaxy S24 Ultra",
        state: "offline",
        transport: "tcpip",
        is_network: true,
      }),
    ]);

    expect(options).toEqual([]);
  });
});
