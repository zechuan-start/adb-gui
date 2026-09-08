import { AppError, toAppError, type AppErrorPayload } from "@/i18n/errors";
import type { DeviceClipboard, DeviceInfo } from "@/lib/tauri";

export type ClipboardDirection = "to-device" | "to-host";
export const MAX_CLIPBOARD_TEXT_BYTES = 256 * 1024;

interface TransferDependencies {
  readHost: () => Promise<string>;
  writeHost: (text: string) => Promise<void>;
  getDevice: (serial: string) => Promise<DeviceClipboard>;
  setDevice: (serial: string, text: string) => Promise<void>;
  onBusy: (direction: ClipboardDirection | null) => void;
  onSuccess: (direction: ClipboardDirection) => void;
  onError: (message: AppErrorPayload) => void;
}

export function clipboardContextKey(device: DeviceInfo | null): string {
  return JSON.stringify(
    device
      ? [device.serial, device.state, device.transport, device.device_id]
      : null,
  );
}

function validateText(text: string) {
  if (text.length === 0)
    throw new AppError("clipboard_empty", {});
  if (new TextEncoder().encode(text).length > MAX_CLIPBOARD_TEXT_BYTES) {
    throw new AppError("clipboard_too_large", {});
  }
}

export function createClipboardTransfer(deps: TransferDependencies) {
  let contextRevision = 0;
  let operationId = 0;
  let key = "";
  let serial: string | null = null;
  let busy = false;
  let disposed = false;

  return {
    bind(device: DeviceInfo | null) {
      const nextKey = clipboardContextKey(device);
      if (key === nextKey || disposed) return;
      key = nextKey;
      serial = device?.state === "device" ? device.serial : null;
      contextRevision += 1;
      busy = false;
      deps.onBusy(null);
    },
    dispose() {
      disposed = true;
      contextRevision += 1;
    },
    async transfer(direction: ClipboardDirection) {
      if (disposed || busy || serial === null) return;
      const target = serial;
      const revision = contextRevision;
      const id = ++operationId;
      const current = () =>
        !disposed && revision === contextRevision && id === operationId;
      busy = true;
      deps.onBusy(direction);
      try {
        if (direction === "to-device") {
          const text = await deps.readHost();
          if (!current()) return;
          validateText(text);
          // No await between the context check and submission of the write side effect.
          await deps.setDevice(target, text);
        } else {
          const result = await deps.getDevice(target);
          if (!current()) return;
          if (result.kind === "no_text")
            throw new AppError("clipboard_device_empty", {});
          validateText(result.text);
          await deps.writeHost(result.text);
        }
        if (current()) deps.onSuccess(direction);
      } catch (error) {
        if (current())
          deps.onError(toAppError(error));
      } finally {
        if (current()) {
          busy = false;
          deps.onBusy(null);
        }
      }
    },
  };
}
