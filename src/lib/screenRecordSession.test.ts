import { describe, expect, it, vi } from "vitest";
import {
  createRecordingController,
  IDLE_RECORDING,
  type RecordingView,
} from "@/lib/screenRecordSession";
import type { ScreenRecordStatus } from "@/lib/tauri";

const session = (
  phase: ScreenRecordStatus["phase"] = "recording",
  id = "one",
): ScreenRecordStatus => ({
  ...IDLE_RECORDING,
  phase,
  session_id: id,
  serial: "device-a",
  local_path: "/original/video.mp4",
  remote_path: `/sdcard/${id}.mp4`,
});
const result = {
  path: "/original/video.mp4",
  opened: false,
  source_cleanup_error: null,
  serial: "device-a",
  remote_path: "/sdcard/one.mp4",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
  let view: RecordingView = {
    status: IDLE_RECORDING,
    busy: null,
    error: null,
    saved: null,
  };
  const deps = {
    getStatus: vi.fn(async () => session()),
    start: vi.fn(async () => session()),
    save: vi.fn(async () => result),
    discard: vi.fn(async () => ({
      serial: "device-a",
      remote_path: "/sdcard/one.mp4",
      source_cleanup_error: null as string | null,
    })),
    behavior: vi.fn(() => ({ openAfterSave: false })),
    choosePath: vi.fn(async (): Promise<string | null> => "/chosen/video.mp4"),
    confirmDiscard: vi.fn(async () => true),
    onChange: vi.fn((next: RecordingView) => {
      view = next;
    }),
    onSaved: vi.fn(),
    onDiscarded: vi.fn(),
    onError: vi.fn(),
  };
  const controller = createRecordingController(deps);
  controller.bindSerial("device-a");
  return { controller, deps, view: () => view };
}

describe("recording session actions", () => {
  it("attempts natural finalization once, including preferences failing before invoke", async () => {
    const { controller, deps, view } = setup();
    deps.behavior.mockImplementation(() => {
      throw new Error("settings unavailable");
    });
    deps.getStatus.mockResolvedValue(session("pending_save"));
    controller.acceptStatus(session("pending_save"));
    await flush();
    for (let i = 0; i < 3; i++) {
      controller.acceptStatus(session("pending_save"));
      await flush();
    }
    controller.dispose();
    controller.resume();
    controller.acceptStatus(session("pending_save"));
    await flush();
    expect(deps.behavior).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(view().error).toContain("settings unavailable");
    deps.behavior.mockReturnValue({ openAfterSave: true });
    await controller.save(false);
    expect(deps.save).toHaveBeenCalledWith({
      sessionId: "one",
      target: { kind: "session" },
      behavior: { openAfterSave: true },
    });
    expect(view().saved?.path).toBe(result.path);
  });

  it("deduplicates manual stop, natural finish and device switching during one save", async () => {
    const { controller, deps } = setup();
    const pending = deferred<typeof result>();
    deps.save.mockReturnValue(pending.promise);
    controller.acceptStatus(session());
    const saving = controller.save(false);
    controller.bindSerial("device-b");
    controller.acceptStatus(session("pending_save"));
    await controller.save(false);
    expect(deps.save).toHaveBeenCalledTimes(1);
    pending.resolve(result);
    await saving;
    expect(deps.onSaved).toHaveBeenCalledTimes(1);
  });

  it("retains failure without automatic retries and allows a manual retry of the original target", async () => {
    const { controller, deps, view } = setup();
    deps.save.mockRejectedValueOnce(new Error("pull failed"));
    deps.getStatus.mockResolvedValue({
      ...session("save_failed"),
      error: "pull failed",
    });
    controller.acceptStatus(session("pending_save"));
    await flush();
    controller.acceptStatus(session("save_failed"));
    await flush();
    expect(view().status.session_id).toBe("one");
    expect(deps.save).toHaveBeenCalledTimes(1);
    await controller.save(false);
    expect(deps.save).toHaveBeenLastCalledWith({
      sessionId: "one",
      target: { kind: "session" },
      behavior: { openAfterSave: false },
    });
    expect(view().status.phase).toBe("idle");
  });

  it("cancelling save-as or discard preserves the session without saving or deleting", async () => {
    const { controller, deps, view } = setup();
    controller.acceptStatus(session("save_failed"));
    deps.choosePath.mockResolvedValue(null);
    deps.confirmDiscard.mockResolvedValue(false);
    await controller.save(true);
    await controller.discard();
    expect(view().status.session_id).toBe("one");
    expect(view().busy).toBeNull();
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.discard).not.toHaveBeenCalled();
  });

  it("rejects a late dialog after the backend session changes", async () => {
    const { controller, deps, view } = setup();
    const dialog = deferred<string | null>();
    deps.choosePath.mockReturnValue(dialog.promise);
    controller.acceptStatus(session("save_failed"));
    const saving = controller.save(true);
    deps.getStatus.mockResolvedValue(session("recording", "new"));
    dialog.resolve("/new-target/video.mp4");
    await saving;
    expect(deps.save).not.toHaveBeenCalled();
    expect(view().status.session_id).toBe("new");
    expect(deps.onError).toHaveBeenCalledWith(
      expect.stringContaining("会话已变化"),
    );
  });

  it("binds save-as to its original device/session and does not mutate retry destination", async () => {
    const { controller, deps } = setup();
    deps.getStatus.mockResolvedValue(session("save_failed"));
    deps.save.mockRejectedValueOnce(new Error("chosen location unavailable"));
    controller.acceptStatus(session("save_failed"));
    controller.bindSerial("device-b");
    await controller.save(true);
    expect(deps.save).toHaveBeenCalledWith({
      sessionId: "one",
      target: { kind: "file", path: "/chosen/video.mp4" },
      behavior: { openAfterSave: false },
    });
    await controller.save(false);
    expect(deps.save).toHaveBeenLastCalledWith({
      sessionId: "one",
      target: { kind: "session" },
      behavior: { openAfterSave: false },
    });
  });

  it("drops stale polling responses and late dialogs across disposal/resume", async () => {
    const { controller, deps, view } = setup();
    const poll = deferred<ScreenRecordStatus>();
    deps.getStatus.mockReturnValueOnce(poll.promise);
    const polling = controller.readStatus();
    await controller.start("device-a");
    poll.resolve(IDLE_RECORDING);
    controller.acceptStatus(await polling);
    expect(view().status.session_id).toBe("one");
    controller.acceptStatus(session("save_failed"));
    const dialog = deferred<string | null>();
    deps.choosePath.mockReturnValue(dialog.promise);
    const saving = controller.save(true);
    controller.dispose();
    controller.resume();
    dialog.resolve("/late.mp4");
    await saving;
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("releases an explicitly discarded session while reporting leftover source errors", async () => {
    const { controller, deps, view } = setup();
    controller.acceptStatus(session("save_failed"));
    deps.discard.mockResolvedValue({
      serial: "device-a",
      remote_path: "/sdcard/one.mp4",
      source_cleanup_error: "offline",
    });
    await controller.discard();
    expect(deps.discard).toHaveBeenCalledWith("one");
    expect(deps.onDiscarded).toHaveBeenCalledWith(
      expect.objectContaining({ source_cleanup_error: "offline" }),
    );
    expect(view().status.phase).toBe("idle");
  });
});
