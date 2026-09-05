import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceMetricsFrame } from "@/lib/tauri";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";

function frame(serial: string, sessionId: number, atMs: number): DeviceMetricsFrame {
  return {
    serial,
    session_id: sessionId,
    at_ms: atMs,
    cpu: { total_percent: 12.5, core_count: 8 },
    memory: { total_kb: 1000, available_kb: 400, used_kb: 600 },
    battery: null,
    processes: null,
  };
}

describe("useDeviceMetricsStore", () => {
  beforeEach(() => {
    useDeviceMetricsStore.getState().bindDevice(null, null);
    useDeviceMetricsStore.setState({
      paused: false,
      restartNonce: 0,
    });
  });

  it("drops late frames from an old session", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("device-a", "usb-a");
    store.beginSession("device-a", "usb-a", 2);
    store.acceptFrame(frame("usb-a", 1, 1000));
    store.acceptFrame(frame("usb-a", 2, 2000));

    expect(useDeviceMetricsStore.getState().history.toArray()).toHaveLength(1);
    expect(useDeviceMetricsStore.getState().latestFrame?.at_ms).toBe(2000);
  });

  it("preserves history across transport migration for the same device", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("physical-a", "192.168.0.2:5555");
    store.beginSession("physical-a", "192.168.0.2:5555", 1);
    store.acceptFrame(frame("192.168.0.2:5555", 1, 1000));

    store.bindDevice("physical-a", "usb-a");

    const migrated = useDeviceMetricsStore.getState();
    expect(migrated.serial).toBe("usb-a");
    expect(migrated.sessionId).toBeNull();
    expect(migrated.history.toArray()).toHaveLength(1);
  });

  it("clears history when the physical device changes", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("physical-a", "usb-a");
    store.beginSession("physical-a", "usb-a", 1);
    store.acceptFrame(frame("usb-a", 1, 1000));

    store.bindDevice("physical-b", "usb-b");

    const changed = useDeviceMetricsStore.getState();
    expect(changed.history.count).toBe(0);
    expect(changed.latestFrame).toBeNull();
    expect(changed.processes).toBeNull();
  });

  it("never grows history beyond the fixed capacity", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("physical-a", "usb-a");
    store.beginSession("physical-a", "usb-a", 1);
    const capacity = useDeviceMetricsStore.getState().history.capacity;
    for (let index = 0; index < capacity + 20; index += 1) {
      useDeviceMetricsStore.getState().acceptFrame(frame("usb-a", 1, index));
    }

    const history = useDeviceMetricsStore.getState().history;
    expect(history.count).toBe(capacity);
    expect(history.at(0)?.atMs).toBe(20);
  });

  it("keeps the pause preference and collected history across device switches", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("physical-a", "usb-a");
    store.setPaused(true);

    store.bindDevice("physical-b", "usb-b");

    expect(useDeviceMetricsStore.getState().paused).toBe(true);
  });

  it("resumes collection when an interrupted session is restarted", () => {
    const store = useDeviceMetricsStore.getState();
    store.bindDevice("physical-a", "usb-a");
    store.setPaused(true);

    useDeviceMetricsStore.getState().restart();

    const restarted = useDeviceMetricsStore.getState();
    expect(restarted.paused).toBe(false);
    expect(restarted.restartNonce).toBe(1);
    expect(restarted.error).toBe("");
  });
});
