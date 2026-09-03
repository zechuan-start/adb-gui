import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceDetail, DeviceInfo } from "@/lib/tauri";
import {
  getSelectableDevices,
  mergeDevicesByIdentity,
} from "@/lib/device";
import {
  createEmptyDeviceDetailState,
  useDeviceStore,
} from "@/store/device";

const { getDeviceInfoMock } = vi.hoisted(() => ({
  getDeviceInfoMock: vi.fn(),
}));

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    getDeviceInfo: getDeviceInfoMock,
  };
});

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

function detail(model: string): DeviceDetail {
  return {
    model,
    manufacturer: "Google",
    android_version: "16",
    sdk_level: "36",
    abi: "arm64-v8a",
    resolution: "1080x2400",
    density: "420",
    battery_level: "80",
    battery_status: "Charging",
  };
}

function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useDeviceStore", () => {
  beforeEach(() => {
    getDeviceInfoMock.mockReset();
    useDeviceStore.setState({
      adbInfo: null,
      devices: [],
      selectedDevice: null,
      deviceDetail: createEmptyDeviceDetailState(),
      currentActivity: "",
      currentPackage: "",
    });
  });

  it("keeps an explicitly selected USB device even when it is unavailable", () => {
    const online = device("online");
    const unauthorized = device("unauthorized", { state: "unauthorized" });
    const offline = device("offline", { state: "offline" });
    useDeviceStore.getState().setDevices([online, unauthorized, offline]);

    useDeviceStore.getState().setSelectedDevice(unauthorized.serial);
    expect(useDeviceStore.getState().selectedDevice).toBe(unauthorized.serial);

    useDeviceStore.getState().setSelectedDevice(offline.serial);
    expect(useDeviceStore.getState().selectedDevice).toBe(offline.serial);
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

  it("normalizes a WiFi selection to the merged USB primary after refresh", () => {
    const wifi = device("192.168.1.5:5555", {
      is_network: true,
      device_id: "physical-a",
    });
    const usb = device("physical-a", { device_id: "physical-a" });
    useDeviceStore.getState().setDevices([wifi]);

    useDeviceStore.getState().setDevices([wifi, usb]);

    const state = useDeviceStore.getState();
    const optionSerials = mergeDevicesByIdentity(getSelectableDevices(state.devices))
      .map((merged) => merged.serial);
    expect(state.selectedDevice).toBe(usb.serial);
    expect(optionSerials).toContain(state.selectedDevice);
  });

  it("normalizes an explicitly selected secondary transport to the group primary", () => {
    const wifi = device("192.168.1.5:5555", {
      is_network: true,
      device_id: "physical-a",
    });
    const usb = device("physical-a", { device_id: "physical-a" });
    useDeviceStore.getState().setDevices([wifi, usb]);

    useDeviceStore.getState().setSelectedDevice(wifi.serial);

    expect(useDeviceStore.getState().selectedDevice).toBe(usb.serial);
  });

  it("shares an in-flight detail request for the selected serial", async () => {
    const request = deferred<DeviceDetail>();
    getDeviceInfoMock.mockReturnValue(request.promise);
    useDeviceStore.getState().setDevices([device("device-a")]);

    const first = useDeviceStore.getState().refreshDeviceDetail();
    const second = useDeviceStore.getState().refreshDeviceDetail();

    expect(second).toBe(first);
    expect(useDeviceStore.getState().deviceDetail).toMatchObject({
      serial: "device-a",
      loading: true,
      detail: null,
      error: null,
    });

    request.resolve(detail("Pixel A"));
    await first;

    expect(getDeviceInfoMock).toHaveBeenCalledTimes(1);
    expect(getDeviceInfoMock).toHaveBeenCalledWith("device-a");
    expect(useDeviceStore.getState().deviceDetail).toMatchObject({
      serial: "device-a",
      loading: false,
      detail: detail("Pixel A"),
      error: null,
    });
  });

  it("rejects stale detail results across a fast A to B to A switch", async () => {
    const firstA = deferred<DeviceDetail>();
    const requestB = deferred<DeviceDetail>();
    const latestA = deferred<DeviceDetail>();
    getDeviceInfoMock
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockReturnValueOnce(latestA.promise);
    useDeviceStore.getState().setDevices([device("device-a"), device("device-b")]);

    const firstAPromise = useDeviceStore.getState().refreshDeviceDetail();
    useDeviceStore.getState().setSelectedDevice("device-b");
    expect(useDeviceStore.getState().deviceDetail).toEqual(createEmptyDeviceDetailState());
    const requestBPromise = useDeviceStore.getState().refreshDeviceDetail();
    useDeviceStore.getState().setSelectedDevice("device-a");
    expect(useDeviceStore.getState().deviceDetail).toEqual(createEmptyDeviceDetailState());
    const latestAPromise = useDeviceStore.getState().refreshDeviceDetail();

    firstA.resolve(detail("Stale Pixel A"));
    await firstAPromise;
    expect(useDeviceStore.getState().deviceDetail).toMatchObject({
      serial: "device-a",
      loading: true,
      detail: null,
    });

    requestB.resolve(detail("Stale Pixel B"));
    await requestBPromise;
    expect(useDeviceStore.getState().deviceDetail).toMatchObject({
      serial: "device-a",
      loading: true,
      detail: null,
    });

    latestA.resolve(detail("Latest Pixel A"));
    await latestAPromise;
    expect(useDeviceStore.getState().deviceDetail).toMatchObject({
      serial: "device-a",
      loading: false,
      detail: detail("Latest Pixel A"),
    });
  });

  it("clears a loaded detail when the selected device becomes unavailable", async () => {
    getDeviceInfoMock.mockResolvedValue(detail("Pixel A"));
    useDeviceStore.getState().setDevices([device("device-a")]);
    await useDeviceStore.getState().refreshDeviceDetail();

    useDeviceStore.getState().setDevices([
      device("device-a", { state: "offline" }),
    ]);

    expect(useDeviceStore.getState().selectedDevice).toBe("device-a");
    expect(useDeviceStore.getState().deviceDetail).toEqual(createEmptyDeviceDetailState());
  });
});
