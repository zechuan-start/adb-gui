import { describe, expect, it } from "vitest";
import { isNetworkDevice, isSelectableDevice } from "@/lib/device";
import type { DeviceInfo } from "@/lib/tauri";

function device(serial: string, overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial,
    state: "device",
    model: serial,
    transport: "usb",
    is_network: false,
    alias_identity: null,
    ...overrides,
  };
}

describe("device metadata", () => {
  it("uses the backend network flag instead of reparsing the serial", () => {
    const networkSerial = "phone._adb-tls-connect._tcp:5555";

    expect(isNetworkDevice(device(networkSerial))).toBe(false);
    expect(isNetworkDevice(device("opaque", { is_network: true }))).toBe(true);
  });

  it("does not make an offline mDNS bare service selectable", () => {
    const identity = "legacy-phone._adb._tcp";
    const offlineBare = device(identity, {
      state: "offline",
      is_network: true,
      alias_identity: identity,
    });

    expect(isSelectableDevice(offlineBare)).toBe(false);
  });
});
