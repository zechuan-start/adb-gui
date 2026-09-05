import { describe, expect, it, vi } from "vitest";
import {
  createClipboardTransfer,
  MAX_CLIPBOARD_TEXT_BYTES,
} from "@/lib/clipboardTransfer";
import type { DeviceClipboard, DeviceInfo } from "@/lib/tauri";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const device = (serial: string, state = "device"): DeviceInfo => ({
  serial,
  state,
  model: serial,
  transport: "usb",
  is_network: false,
  alias_identity: null,
  device_id: serial,
});
function setup() {
  const deps = {
    readHost: vi.fn(async () => "host"),
    writeHost: vi.fn(async (_text: string) => {}),
    getDevice: vi.fn(async (_serial: string): Promise<DeviceClipboard> => ({
      kind: "text",
      text: "device",
    })),
    setDevice: vi.fn(async (_serial: string, _text: string) => {}),
    onBusy: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };
  const transfer = createClipboardTransfer(deps);
  transfer.bind(device("a"));
  return { deps, transfer };
}

describe("manual clipboard transfers", () => {
  it("reads only on click and preserves literal text in both directions", async () => {
    const { deps, transfer } = setup();
    expect(deps.readHost).not.toHaveBeenCalled();
    expect(deps.getDevice).not.toHaveBeenCalled();
    const text = " \r\n中文 😀 ' \" ` $(echo test) --ADBGUI-CLIPBOARD-V1--\n ";
    deps.readHost.mockResolvedValue(text);
    await transfer.transfer("to-device");
    expect(deps.setDevice).toHaveBeenCalledExactlyOnceWith("a", text);
    await transfer.transfer("to-host");
    expect(deps.writeHost).toHaveBeenCalledExactlyOnceWith("device");
    expect(deps.onSuccess).toHaveBeenCalledTimes(2);
  });

  it("does not write after A -> B -> A or loss of device authorization", async () => {
    for (const direction of ["to-device", "to-host"] as const) {
      for (const next of [device("b"), device("a", "unauthorized"), null]) {
        const { deps, transfer } = setup();
        const host = deferred<string>();
        const phone = deferred<DeviceClipboard>();
        deps.readHost.mockReturnValue(host.promise);
        deps.getDevice.mockReturnValue(phone.promise);
        const operation = transfer.transfer(direction);
        transfer.bind(next);
        transfer.bind(device("a"));
        host.resolve("old");
        phone.resolve({ kind: "text", text: "old" });
        await operation;
        expect(deps.setDevice).not.toHaveBeenCalled();
        expect(deps.writeHost).not.toHaveBeenCalled();
        expect(deps.onSuccess).not.toHaveBeenCalled();
      }
    }
  });

  it("invalidates transport replacement but preserves normal polling updates", async () => {
    const { deps, transfer } = setup();
    const pending = deferred<DeviceClipboard>();
    deps.getDevice.mockReturnValue(pending.promise);
    const first = transfer.transfer("to-host");
    transfer.bind({ ...device("a"), transport: "network", is_network: true });
    pending.resolve({ kind: "text", text: "old" });
    await first;
    expect(deps.writeHost).not.toHaveBeenCalled();
    const second = transfer.transfer("to-host");
    transfer.bind({
      ...device("a"),
      transport: "network",
      is_network: true,
      model: "updated label",
    });
    await second;
    expect(deps.writeHost).toHaveBeenCalledOnce();
  });

  it("does not let stale completion clear a newer operation or publish its error", async () => {
    const { deps, transfer } = setup();
    const old = deferred<string>();
    const fresh = deferred<string>();
    deps.readHost
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = transfer.transfer("to-device");
    await transfer.transfer("to-device");
    expect(deps.readHost).toHaveBeenCalledTimes(1);
    transfer.bind(device("b"));
    const second = transfer.transfer("to-device");
    old.reject(new Error("old device"));
    await first;
    expect(deps.onBusy).toHaveBeenLastCalledWith("to-device");
    expect(deps.onError).not.toHaveBeenCalled();
    fresh.resolve("new");
    await second;
    expect(deps.setDevice).toHaveBeenCalledExactlyOnceWith("b", "new");
    expect(deps.onBusy).toHaveBeenLastCalledWith(null);
  });

  it("retains the destination on empty, non-text, oversized and failed reads", async () => {
    const { deps, transfer } = setup();
    deps.readHost
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("中".repeat(MAX_CLIPBOARD_TEXT_BYTES / 3 + 1))
      .mockRejectedValueOnce(new Error("read failed"));
    await transfer.transfer("to-device");
    await transfer.transfer("to-device");
    await transfer.transfer("to-device");
    deps.getDevice
      .mockResolvedValueOnce({ kind: "no_text" })
      .mockResolvedValueOnce({ kind: "text", text: "" });
    await transfer.transfer("to-host");
    await transfer.transfer("to-host");
    expect(deps.setDevice).not.toHaveBeenCalled();
    expect(deps.writeHost).not.toHaveBeenCalled();
    expect(deps.onError).toHaveBeenCalledTimes(5);
  });

  it("never retries a submitted write and disposes pending reads", async () => {
    const { deps, transfer } = setup();
    deps.setDevice.mockRejectedValue(new Error("response lost"));
    await transfer.transfer("to-device");
    expect(deps.setDevice).toHaveBeenCalledTimes(1);
    expect(deps.onSuccess).not.toHaveBeenCalled();
    const pending = deferred<DeviceClipboard>();
    deps.getDevice.mockReturnValue(pending.promise);
    const operation = transfer.transfer("to-host");
    transfer.dispose();
    pending.resolve({ kind: "text", text: "late" });
    await operation;
    expect(deps.writeHost).not.toHaveBeenCalled();
  });
});
