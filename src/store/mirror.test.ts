import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/settings";
import { mirrorRequest } from "@/lib/mirror";
import type { MirrorExit, MirrorSessionInfo, ScrcpyInfo } from "@/lib/tauri";
import { useFeedbackStore } from "@/store/feedback";
import { createMirrorStore, type MirrorApi } from "@/store/mirror";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function api(overrides: Partial<MirrorApi> = {}): MirrorApi {
  return {
    detect: vi.fn(async (): Promise<ScrcpyInfo> => ({ path: "/Applications/ADB GUI.app/Contents/Resources/scrcpy/scrcpy", version: "5.0.1", source: "bundled" })),
    start: vi.fn(async (serial: string): Promise<MirrorSessionInfo> => ({ serial, session_id: 1 })),
    stop: vi.fn(async () => {}),
    list: vi.fn(async (): Promise<MirrorSessionInfo[]> => []),
    now: () => 1000,
    ...overrides,
  };
}

const request = () => mirrorRequest(defaultSettings().mirror);
const exit = (serial: string, sessionId: number, outcome: MirrorExit["outcome"], error: MirrorExit["error"] = null): MirrorExit => ({
  serial,
  session_id: sessionId,
  outcome,
  error,
});

describe("mirror runtime store", () => {
  it("runs one session per serial and ends it from the matching exit event", async () => {
    const native = api({
      start: vi.fn(async (serial: string) => ({ serial, session_id: serial === "A" ? 4 : 5 })),
    });
    const store = createMirrorStore(native);
    await store.getState().start("A", request);
    await store.getState().start("B", request);
    await store.getState().start("A", request);
    expect(native.start).toHaveBeenCalledTimes(2);
    expect(native.start).toHaveBeenCalledWith("A", mirrorRequest(defaultSettings().mirror));
    expect(store.getState().sessions).toEqual({
      A: { phase: "running", sessionId: 4, stopError: null },
      B: { phase: "running", sessionId: 5, stopError: null },
    });

    // A stale exit from an older A session leaves the current one alone.
    store.getState().acceptExit(exit("A", 3, "closed"));
    expect(store.getState().sessions.A).toEqual({ phase: "running", sessionId: 4, stopError: null });

    store.getState().acceptExit(exit("A", 4, "disconnected", { code: "mirror.disconnected" }));
    expect(store.getState().sessions.A).toBeUndefined();
    expect(store.getState().sessions.B?.phase).toBe("running");
    expect(store.getState().lastExit.A).toEqual({
      outcome: "disconnected",
      error: { code: "mirror.disconnected" },
      at: 1000,
    });
  });

  it("applies an exit that overtakes the start response", async () => {
    const started = deferred<MirrorSessionInfo>();
    const store = createMirrorStore(api({ start: () => started.promise }));
    const pending = store.getState().start("A", request);
    expect(store.getState().sessions.A).toEqual({ phase: "starting" });
    store.getState().acceptExit(exit("A", 9, "failed", { code: "mirror.exitFailed", params: { code: 1 }, detail: "boom" }));
    started.resolve({ serial: "A", session_id: 9 });
    await pending;
    expect(store.getState().sessions.A).toBeUndefined();
    expect(store.getState().lastExit.A?.error).toEqual({ code: "mirror.exitFailed", params: { code: 1 }, detail: "boom" });
  });

  it("keeps start failures on the status line instead of a toast", async () => {
    useFeedbackStore.getState().clearToast();
    const store = createMirrorStore(api({
      start: vi.fn(async () => {
        throw { code: "mirror.extraArgsForbidden", params: { option: "-s" } };
      }),
    }));
    await store.getState().start("A", request);
    expect(store.getState().sessions.A).toBeUndefined();
    expect(store.getState().lastExit.A).toEqual({
      outcome: "failed",
      error: { code: "mirror.extraArgsForbidden", params: { option: "-s" } },
      at: 1000,
    });
    expect(store.getState().detection).toEqual({ status: "idle" });
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("records a settings read failure without invoking scrcpy", async () => {
    const native = api();
    const store = createMirrorStore(native);
    await store.getState().start("A", () => {
      throw { code: "settings.load" };
    });
    expect(native.start).not.toHaveBeenCalled();
    expect(store.getState().lastExit.A?.error).toEqual({ code: "settings.load" });
  });

  it("moves detection to the installation error a start reported", async () => {
    const store = createMirrorStore(api({
      start: vi.fn(async () => {
        throw { code: "mirror.tooOld", params: { version: "1.21", minimum: "2.0" } };
      }),
    }));
    await store.getState().detect(null);
    await store.getState().start("A", request);
    expect(store.getState().detection).toEqual({
      status: "error",
      scrcpyPath: null,
      error: { code: "mirror.tooOld", params: { version: "1.21", minimum: "2.0" } },
    });
  });

  it("drops a detection result that a newer request replaced", async () => {
    const first = deferred<ScrcpyInfo>();
    const second = deferred<ScrcpyInfo>();
    const detect = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = createMirrorStore(api({ detect }));
    const older = store.getState().detect(null);
    const newer = store.getState().detect("/usr/local/bin/scrcpy");
    second.resolve({ path: "/usr/local/bin/scrcpy", version: "3.3.3", source: "custom" });
    await newer;
    first.reject({ code: "mirror.notFound" });
    await older;
    expect(store.getState().detection).toEqual({
      status: "ready",
      scrcpyPath: "/usr/local/bin/scrcpy",
      info: { path: "/usr/local/bin/scrcpy", version: "3.3.3", source: "custom" },
    });
  });

  it("detects once per stored path", async () => {
    const native = api();
    const store = createMirrorStore(native);
    store.getState().ensureDetected(null);
    store.getState().ensureDetected(null);
    await vi.waitFor(() => expect(store.getState().detection.status).toBe("ready"));
    store.getState().ensureDetected(null);
    expect(native.detect).toHaveBeenCalledTimes(1);
    store.getState().ensureDetected("/usr/bin/scrcpy");
    expect(native.detect).toHaveBeenLastCalledWith("/usr/bin/scrcpy");
    expect(native.detect).toHaveBeenCalledTimes(2);
  });

  it("waits for the exit event after a stop and restores the session when stopping fails", async () => {
    const stop = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: "mirror.stopFailed" });
    const store = createMirrorStore(api({ stop }));
    await store.getState().start("A", request);
    await store.getState().stop("A");
    expect(stop).toHaveBeenCalledWith("A", 1);
    expect(store.getState().sessions.A).toEqual({ phase: "stopping", sessionId: 1 });
    store.getState().acceptExit(exit("A", 1, "stopped"));
    expect(store.getState().sessions.A).toBeUndefined();
    expect(store.getState().lastExit.A?.outcome).toBe("stopped");

    await store.getState().start("A", request);
    await store.getState().stop("A");
    expect(store.getState().sessions.A).toEqual({
      phase: "running",
      sessionId: 1,
      stopError: { code: "mirror.stopFailed" },
    });
  });

  it("restores live sessions after a reload without resurrecting one that already ended", async () => {
    const listed = deferred<MirrorSessionInfo[]>();
    const store = createMirrorStore(api({ list: () => listed.promise }));
    const restoring = store.getState().restore();
    store.getState().acceptExit(exit("B", 8, "closed"));
    listed.resolve([
      { serial: "A", session_id: 7 },
      { serial: "B", session_id: 8 },
    ]);
    await restoring;
    expect(store.getState().sessions).toEqual({
      A: { phase: "running", sessionId: 7, stopError: null },
    });
    expect(store.getState().lastExit.B?.outcome).toBe("closed");
    store.getState().acceptExit(exit("A", 7, "closed"));
    expect(store.getState().sessions).toEqual({});
  });
});
