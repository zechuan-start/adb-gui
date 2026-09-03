import { describe, expect, it } from "vitest";
import { getDevicePickerOptions } from "@/components/layout/DevicePicker";
import type { DeviceInfo } from "@/lib/tauri";

function device(overrides: Partial<DeviceInfo>): DeviceInfo {
  const serial = overrides.serial ?? "R5CT30ZXJKQ";
  return {
    serial,
    state: "device",
    model: "Pixel 8 Pro",
    transport: "usb",
    is_network: false,
    alias_identity: null,
    device_id: serial,
    ...overrides,
  };
}

describe("getDevicePickerOptions", () => {
  it("keeps model, serial, state, and transport in each accessible label", () => {
    const options = getDevicePickerOptions([
      device({}),
      device({ serial: "8A17X0YMK", model: "Redmi K70", state: "unauthorized" }),
      device({ serial: "emulator-5554", model: "sdk_gphone64_x86_64", state: "offline" }),
    ]);

    expect(options).toEqual([
      {
        value: "R5CT30ZXJKQ",
        label: "Pixel 8 Pro, R5CT30ZXJKQ, 在线, USB 连接",
      },
      {
        value: "8A17X0YMK",
        label: "Redmi K70, 8A17X0YMK, 未授权, USB 连接",
      },
      {
        value: "emulator-5554",
        label: "sdk_gphone64_x86_64, emulator-5554, 离线, USB 连接",
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

  it("merges matching USB and WiFi transports into one accessible option", () => {
    const options = getDevicePickerOptions([
      device({ device_id: "physical-a" }),
      device({
        serial: "192.168.1.5:5555",
        transport: "tcpip",
        is_network: true,
        device_id: "physical-a",
      }),
    ]);

    expect(options).toEqual([
      {
        value: "R5CT30ZXJKQ",
        label: "Pixel 8 Pro, R5CT30ZXJKQ, 在线, USB 和 WiFi 连接, 当前使用 USB",
      },
    ]);
  });

  it("does not merge devices whose physical identity is unavailable", () => {
    const options = getDevicePickerOptions([
      device({ serial: "unknown-a", device_id: null }),
      device({ serial: "unknown-b", device_id: null }),
    ]);

    expect(options.map((option) => option.value)).toEqual(["unknown-a", "unknown-b"]);
  });
});
