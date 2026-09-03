import { describe, expect, it } from "vitest";
import {
  activeTransports,
  deviceCacheKey,
  getPreferredSelectedDeviceSerial,
  isNetworkDevice,
  isSelectableDevice,
  mergeDevicesByIdentity,
  transportKind,
  transportSummary,
} from "@/lib/device";
import type { DeviceInfo } from "@/lib/tauri";

function device(serial: string, overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial,
    state: "device",
    model: serial,
    transport: "usb",
    is_network: false,
    alias_identity: null,
    device_id: serial,
    ...overrides,
  };
}

describe("device metadata", () => {
  it("derives a stable cache key through the documented fallback chain", () => {
    expect(deviceCacheKey(device("usb-a", { device_id: "physical-a" }))).toBe(
      "physical-a",
    );
    expect(
      deviceCacheKey(
        device("192.168.1.5:5555", {
          device_id: null,
          alias_identity: "phone._adb-tls-connect._tcp",
        }),
      ),
    ).toBe("phone._adb-tls-connect._tcp");
    expect(
      deviceCacheKey(
        device("192.168.1.5:5555", { device_id: null, alias_identity: null }),
      ),
    ).toBe("192.168.1.5:5555");
  });

  it("shares one cache key across USB and WiFi transports for one device", () => {
    const usb = device("usb-a", { device_id: "physical-a" });
    const wifi = device("192.168.1.5:5555", {
      device_id: "physical-a",
      is_network: true,
    });

    expect(deviceCacheKey(usb)).toBe(deviceCacheKey(wifi));
  });

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

describe("device transport merging", () => {
  it("keeps a single USB transport as one group", () => {
    const usb = device("usb-a");

    expect(mergeDevicesByIdentity([usb])).toEqual([
      { serial: usb.serial, primary: usb, transports: [usb] },
    ]);
    expect(transportKind(usb)).toBe("usb");
    expect(transportSummary(mergeDevicesByIdentity([usb])[0])).toBe("USB 连接");
  });

  it("merges online USB and WiFi transports with USB as primary", () => {
    const wifi = device("192.168.1.5:5555", {
      transport: "tcpip",
      is_network: true,
      device_id: "physical-a",
    });
    const usb = device("physical-a", { device_id: "physical-a" });

    const [merged] = mergeDevicesByIdentity([wifi, usb]);

    expect(merged.serial).toBe(usb.serial);
    expect(merged.primary).toBe(usb);
    expect(merged.transports).toEqual([usb, wifi]);
    expect(activeTransports(merged)).toEqual([usb, wifi]);
    expect(transportSummary(merged)).toBe("USB 和 WiFi 连接, 当前使用 USB");
  });

  it("keeps a WiFi-only device as its primary transport", () => {
    const wifi = device("192.168.1.5:5555", {
      transport: "tcpip",
      is_network: true,
      device_id: "physical-a",
    });

    const [merged] = mergeDevicesByIdentity([wifi]);

    expect(merged.primary).toBe(wifi);
    expect(transportSummary(merged)).toBe("WiFi 连接");
  });

  it("does not merge distinct physical devices", () => {
    const devices = [
      device("usb-a", { device_id: "physical-a" }),
      device("wifi-a", { is_network: true, device_id: "physical-a" }),
      device("usb-b", { device_id: "physical-b" }),
      device("wifi-b", { is_network: true, device_id: "physical-b" }),
    ];

    const merged = mergeDevicesByIdentity(devices);

    expect(merged.map((item) => item.serial)).toEqual(["usb-a", "usb-b"]);
    expect(merged.map((item) => item.transports.map((transport) => transport.serial))).toEqual([
      ["usb-a", "wifi-a"],
      ["usb-b", "wifi-b"],
    ]);
  });

  it("keeps every device without an identity in a separate group", () => {
    const first = device("unknown-a", { device_id: null });
    const second = device("unknown-b", { device_id: null });

    expect(mergeDevicesByIdentity([first, second]).map((item) => item.serial)).toEqual([
      first.serial,
      second.serial,
    ]);
  });

  it("prefers an online WiFi transport over an offline USB transport", () => {
    const usb = device("physical-a", { state: "offline", device_id: "physical-a" });
    const wifi = device("wifi-a", { is_network: true, device_id: "physical-a" });

    const [merged] = mergeDevicesByIdentity([usb, wifi]);

    expect(merged.primary).toBe(wifi);
    expect(activeTransports(merged)).toEqual([wifi]);
    expect(transportSummary(merged)).toBe("WiFi 连接");
  });

  it("falls back to the primary transport when a whole group is offline", () => {
    const usb = device("offline-usb", { state: "offline" });
    const [merged] = mergeDevicesByIdentity([usb]);

    expect(merged.primary).toBe(usb);
    expect(activeTransports(merged)).toEqual([usb]);
  });

  it("preserves the first appearance order of each identity group", () => {
    const wifiA = device("wifi-a", { is_network: true, device_id: "physical-a" });
    const usbB = device("usb-b", { device_id: "physical-b" });
    const usbA = device("usb-a", { device_id: "physical-a" });
    const wifiB = device("wifi-b", { is_network: true, device_id: "physical-b" });

    expect(mergeDevicesByIdentity([wifiA, usbB, usbA, wifiB]).map((item) => item.serial)).toEqual([
      usbA.serial,
      usbB.serial,
    ]);
  });

  it("deduplicates multiple online network transports in badges and text", () => {
    const first = device("wifi-a", { is_network: true, device_id: "physical-a" });
    const second = device("wifi-b", { is_network: true, device_id: "physical-a" });
    const [merged] = mergeDevicesByIdentity([first, second]);

    expect(activeTransports(merged)).toEqual([first]);
    expect(transportSummary(merged)).toBe("WiFi 连接");
  });
});

describe("preferred selected transport", () => {
  it("moves from a removed USB serial to online WiFi with the same device identity", () => {
    const previousUsb = device("physical-a", { device_id: "physical-a" });
    const wifi = device("wifi-a", { is_network: true, device_id: "physical-a" });

    expect(getPreferredSelectedDeviceSerial([wifi], previousUsb.serial, [previousUsb])).toBe(
      wifi.serial,
    );
  });

  it("moves from an offline USB serial to online WiFi in the same current group", () => {
    const offlineUsb = device("physical-a", {
      state: "offline",
      device_id: "physical-a",
    });
    const wifi = device("wifi-a", { is_network: true, device_id: "physical-a" });

    expect(
      getPreferredSelectedDeviceSerial(
        [offlineUsb, wifi],
        offlineUsb.serial,
      ),
    ).toBe(wifi.serial);
  });

  it("normalizes a still-online WiFi selection to USB when USB appears", () => {
    const wifi = device("wifi-a", { is_network: true, device_id: "physical-a" });
    const usb = device("physical-a", { device_id: "physical-a" });

    expect(getPreferredSelectedDeviceSerial([wifi, usb], wifi.serial, [wifi])).toBe(usb.serial);
  });

  it("maps an mDNS alias fallback to the merged group's primary serial", () => {
    const alias = "phone._adb-tls-connect._tcp";
    const previous = device(alias, {
      is_network: true,
      alias_identity: alias,
      device_id: null,
    });
    const wifi = device(`${alias}:5555`, {
      is_network: true,
      alias_identity: alias,
      device_id: "physical-a",
    });
    const usb = device("physical-a", { device_id: "physical-a" });

    expect(getPreferredSelectedDeviceSerial([wifi, usb], previous.serial, [previous])).toBe(
      usb.serial,
    );
  });

  it("returns the first online merged primary when the old device is gone", () => {
    const wifi = device("wifi-a", { is_network: true, device_id: "physical-a" });
    const usb = device("physical-a", { device_id: "physical-a" });

    expect(getPreferredSelectedDeviceSerial([wifi, usb], "missing", [])).toBe(usb.serial);
  });

  it("normalizes an explicitly retained offline secondary to its group primary", () => {
    const offlineUsb = device("usb-a", { state: "offline", device_id: "physical-a" });
    const offlineUsbTwo = device("usb-b", { state: "offline", device_id: "physical-a" });

    expect(
      getPreferredSelectedDeviceSerial(
        [offlineUsb, offlineUsbTwo],
        offlineUsbTwo.serial,
      ),
    ).toBe(offlineUsb.serial);
  });
});
