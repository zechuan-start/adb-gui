import type { SaveBehavior } from "@/lib/settings";
import type {
  DiscardRecordingResult,
  SaveRecordingRequest,
  ScreenRecordResult,
  ScreenRecordStatus,
} from "@/lib/tauri";

export const IDLE_RECORDING: ScreenRecordStatus = {
  phase: "idle",
  session_id: null,
  serial: null,
  elapsed_secs: 0,
  local_path: null,
  remote_path: null,
  error: null,
  attempted_path: null,
};

export interface RecordingView {
  status: ScreenRecordStatus;
  busy: "start" | "save" | "save_as" | "discard" | null;
  error: string | null;
  saved: ScreenRecordResult | null;
}

interface RecordingDependencies {
  getStatus: () => Promise<ScreenRecordStatus>;
  start: (serial: string) => Promise<ScreenRecordStatus>;
  save: (request: SaveRecordingRequest) => Promise<ScreenRecordResult>;
  discard: (id: string) => Promise<DiscardRecordingResult>;
  behavior: () => SaveBehavior;
  choosePath: (path: string) => Promise<string | null>;
  confirmDiscard: (serial: string, path: string) => Promise<boolean>;
  onChange: (view: RecordingView) => void;
  onSaved: (result: ScreenRecordResult, behavior: SaveBehavior) => void;
  onDiscarded: (result: DiscardRecordingResult) => void;
  onError: (message: string) => void;
}

export function createRecordingController(deps: RecordingDependencies) {
  let view: RecordingView = {
    status: IDLE_RECORDING,
    busy: null,
    error: null,
    saved: null,
  };
  let selectedSerial: string | null = null;
  let alive = true;
  let revision = 0;
  let automaticAttempt: string | null = null;

  function publish(patch: Partial<RecordingView>) {
    view = { ...view, ...patch };
    if (alive) deps.onChange(view);
  }

  function acceptStatus(status: ScreenRecordStatus) {
    if (!alive || view.busy) return;
    publish({
      status,
      error: status.session_id !== view.status.session_id ? null : view.error,
    });
    autoSave();
  }

  async function readStatus() {
    const version = revision;
    const status = await deps.getStatus();
    return version === revision && alive ? status : view.status;
  }

  async function run(
    busy: NonNullable<RecordingView["busy"]>,
    action: (current: () => boolean) => Promise<void>,
  ) {
    if (!alive || view.busy) return;
    const version = ++revision;
    const current = () => alive && version === revision;
    publish({ busy, error: null });
    try {
      await action(current);
    } catch (error) {
      if (!current()) return;
      const message = String(error);
      publish({ error: message });
      deps.onError(message);
      try {
        const status = await deps.getStatus();
        if (current()) publish({ status });
      } catch (refreshError) {
        if (current())
          publish({
            error: `${message}; 无法刷新会话: ${String(refreshError)}`,
          });
      }
    } finally {
      if (current()) {
        publish({ busy: null });
        autoSave();
      }
    }
  }

  function autoSave() {
    const status = view.status;
    if (
      !alive ||
      view.busy ||
      !status.session_id ||
      automaticAttempt === status.session_id
    )
      return;
    if (
      status.phase === "pending_save" ||
      (status.phase === "recording" && status.serial !== selectedSerial)
    ) {
      void save(false);
    }
  }

  async function validateSession(
    id: string,
    current: () => boolean,
  ): Promise<boolean> {
    const status = await deps.getStatus();
    if (!current()) return false;
    publish({ status });
    if (status.session_id !== id) throw new Error("录屏会话已变化, 操作已取消");
    return true;
  }

  async function save(saveAs: boolean) {
    const snapshot = view.status;
    const id = snapshot.session_id;
    if (!id || view.busy || !alive) return;
    automaticAttempt = id;
    await run(saveAs ? "save_as" : "save", async (current) => {
      let target: SaveRecordingRequest["target"] = { kind: "session" };
      if (saveAs) {
        if (!snapshot.local_path) throw new Error("录屏会话缺少原保存路径");
        const path = await deps.choosePath(snapshot.local_path);
        if (!current() || path === null) return;
        if (!(await validateSession(id, current))) return;
        target = { kind: "file", path };
      }
      const behavior = { ...deps.behavior() };
      const result = await deps.save({ sessionId: id, behavior, target });
      if (!current()) return;
      publish({ status: IDLE_RECORDING, saved: result, error: null });
      deps.onSaved(result, behavior);
    });
  }

  return {
    acceptStatus,
    readStatus,
    save,
    bindSerial(serial: string | null) {
      selectedSerial = serial;
      autoSave();
    },
    resume() {
      alive = true;
      publish({ busy: null });
    },
    dispose() {
      alive = false;
      revision += 1;
      view = { ...view, busy: null };
    },
    start(serial: string) {
      if (view.status.phase !== "idle") return Promise.resolve();
      return run("start", async (current) => {
        const status = await deps.start(serial);
        if (current()) publish({ status, saved: null });
      });
    },
    discard() {
      const snapshot = view.status;
      const id = snapshot.session_id;
      const serial = snapshot.serial;
      const remotePath = snapshot.remote_path;
      if (!id || !serial || !remotePath || view.busy || !alive)
        return Promise.resolve();
      automaticAttempt = id;
      return run("discard", async (current) => {
        const confirmed = await deps.confirmDiscard(serial, remotePath);
        if (!current() || !confirmed) return;
        if (!(await validateSession(id, current))) return;
        const result = await deps.discard(id);
        if (!current()) return;
        publish({ status: IDLE_RECORDING, error: null });
        deps.onDiscarded(result);
      });
    },
  };
}
