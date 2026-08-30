import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceInfo } from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";

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

describe("useDeviceStore", () => {
  beforeEach(() => {
    useDeviceStore.setState({
      adbInfo: null,
      devices: [],
      selectedDevice: null,
      currentActivity: "",
      currentPackage: "",
    });
  });

  it("clears activity identity when the selected device changes", () => {
    useDeviceStore.getState().setDevices([device("device-a"), device("device-b")]);
    useDeviceStore.getState().setCurrentActivity("com.example.a/.MainActivity");

    useDeviceStore.getState().setSelectedDevice("device-b");

    const state = useDeviceStore.getState();
    expect(state.selectedDevice).toBe("device-b");
    expect(state.currentActivity).toBe("");
    expect(state.currentPackage).toBe("");
  });

  it("clears activity identity when a device refresh replaces the selection", () => {
    useDeviceStore.getState().setDevices([device("device-a"), device("device-b")]);
    useDeviceStore.getState().setCurrentActivity("com.example.a/.MainActivity");

    useDeviceStore.getState().setDevices([device("device-b")]);

    const state = useDeviceStore.getState();
    expect(state.selectedDevice).toBe("device-b");
    expect(state.currentActivity).toBe("");
    expect(state.currentPackage).toBe("");
  });

  it("keeps activity identity when a refresh retains the same selection", () => {
    useDeviceStore.getState().setDevices([device("device-a")]);
    useDeviceStore.getState().setCurrentActivity("com.example.a/.MainActivity");

    useDeviceStore.getState().setDevices([device("device-a"), device("device-b")]);

    const state = useDeviceStore.getState();
    expect(state.selectedDevice).toBe("device-a");
    expect(state.currentPackage).toBe("com.example.a");
  });

  it("migrates a selected TLS mDNS bare serial to its online alias", () => {
    const identity = "phone._adb-tls-connect._tcp";
    useDeviceStore.getState().setDevices([
      device(identity, { is_network: true, alias_identity: identity }),
    ]);
    useDeviceStore.getState().setCurrentActivity("com.example.a/.MainActivity");

    useDeviceStore.getState().setDevices([
      device("emulator-5554"),
      device(`${identity}:5555`, { is_network: true, alias_identity: identity }),
    ]);

    const state = useDeviceStore.getState();
    expect(state.selectedDevice).toBe(`${identity}:5555`);
    expect(state.currentActivity).toBe("");
    expect(state.currentPackage).toBe("");
  });

  it("migrates a selected legacy mDNS bare serial to its online alias", () => {
    const identity = "legacy-phone._adb._tcp";
    useDeviceStore.getState().setDevices([
      device(identity, { is_network: true, alias_identity: identity }),
    ]);

    useDeviceStore.getState().setDevices([
      device("emulator-5554"),
      device(`${identity}:6000`, { is_network: true, alias_identity: identity }),
    ]);

    expect(useDeviceStore.getState().selectedDevice).toBe(`${identity}:6000`);
  });

  it("does not select an isolated offline mDNS bare serial", () => {
    const identity = "offline-phone._adb._tcp";
    const offlineBare = device(identity, {
      state: "offline",
      is_network: true,
      alias_identity: identity,
    });

    useDeviceStore.getState().setDevices([offlineBare]);
    useDeviceStore.getState().setSelectedDevice(identity);

    expect(useDeviceStore.getState().selectedDevice).toBeNull();
  });

  it("does not prefer an unrelated network device when the selection disappears", () => {
    const identity = "phone-a._adb-tls-connect._tcp";
    useDeviceStore.getState().setDevices([
      device(identity, { is_network: true, alias_identity: identity }),
    ]);

    useDeviceStore.getState().setDevices([
      device("emulator-5554"),
      device("phone-b._adb-tls-connect._tcp:5555", {
        is_network: true,
        alias_identity: "phone-b._adb-tls-connect._tcp",
      }),
    ]);

    expect(useDeviceStore.getState().selectedDevice).toBe("emulator-5554");
  });
});
