import { describe, expect, it, vi } from "vitest";
import { decodeSettings, defaultSettings, logcatPreset } from "@/lib/settings";
import { columnsMatch, COMPACT_COLUMNS } from "@/lib/logcatView";
import { createSettingsStore } from "@/store/settings";
import { useLogcatStore } from "@/store/logcat";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("settings persistence", () => {
  it("keeps a common capture directory across restart with independent directory and group resets", () => {
    const disk = storage('{"version":1,"settings":{"recording":{"openAfterSave":false}}}');
    const store = createSettingsStore(() => disk);
    expect(store.getState().preferences.capture.directory).toBeNull();
    store.getState().update("capture", { directory: "/Volumes/中文 空格" });
    expect(createSettingsStore(() => disk).getState().preferences.capture.directory).toBe("/Volumes/中文 空格");
    store.getState().update("capture", { directory: null });
    expect(store.getState().preferences.recording.openAfterSave).toBe(false);
    store.getState().update("capture", { directory: "/Volumes/test" });
    disk.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    store.getState().update("capture", { directory: "/Volumes/other" });
    expect(store.getState().preferences.capture.directory).toBe("/Volumes/test");
    store.getState().resetSection("capture");
    expect(store.getState().preferences.capture.directory).toBeNull();
    expect(store.getState().preferences.recording.openAfterSave).toBe(true);
    expect(store.getState().preferences.screenshot).toEqual(defaultSettings().screenshot);
  });
  it("persists browsing and generator options and resets one group without affecting the others", () => {
    const disk = storage('{"version":1,"settings":{"recording":{"openAfterSave":false}}}');
    const store = createSettingsStore(() => disk);
    const initial = store.getState().preferences;
    store.getState().update("files", { ...initial.files, sortBy: "size", showHidden: false, startDirectory: "/sdcard/中文 空格" });
    store.getState().update("apps", { sortBy: "apkSize", sortDirection: "desc" });
    store.getState().update("codegen", { codeType: "code128", separatorMode: "custom", customSeparator: "" });
    const saved = createSettingsStore(() => disk).getState().preferences;
    expect(saved.files.startDirectory).toBe("/sdcard/中文 空格");
    expect(saved.apps).toEqual({ sortBy: "apkSize", sortDirection: "desc" });
    expect(saved.codegen.customSeparator).toBe("");
    expect(saved.recording.openAfterSave).toBe(false);
    store.getState().resetSection("files");
    expect(store.getState().preferences).toEqual({ ...saved, files: defaultSettings().files });
    disk.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    store.getState().update("codegen", defaultSettings().codegen);
    expect(store.getState().preferences.codegen).toEqual(saved.codegen);
    expect(store.getState().error).toContain("未保存");
  });

  it.each([
    { files: { sortBy: "unknown" } }, { files: { sortDirection: "up" } },
    { files: { startDirectory: "relative/path" } }, { files: { startDirectory: "/bad\0path" } },
    { files: { showHidden: "false" } }, { files: { directoriesFirst: 1 } },
    { apps: { sortBy: "size" } }, { apps: { sortDirection: null } },
    { codegen: { codeType: "barcode" } }, { codegen: { separatorMode: "auto" } },
    { codegen: { customSeparator: null } },
  ])("rejects malformed new preferences: %j", (settings) => {
    expect(() => decodeSettings(JSON.stringify({ version: 1, settings }))).toThrow();
  });
  it("loads defaults and restores only persisted preferences after restart", () => {
    const disk = storage();
    const store = createSettingsStore(() => disk);
    expect(store.getState().preferences).toEqual(defaultSettings());
    store
      .getState()
      .update("logcat", {
        ...store.getState().preferences.logcat,
        columns: logcatPreset("compact"),
        softWrap: true,
      });
    store.getState().update("performance", { backgroundEnabled: true });
    expect(createSettingsStore(() => disk).getState().preferences).toEqual(
      store.getState().preferences,
    );
    expect(JSON.parse(disk.getItem()!).settings).not.toHaveProperty("paused");
    expect(JSON.parse(disk.getItem()!).settings.logcat).not.toHaveProperty(
      "buffer",
    );
    expect(
      columnsMatch(
        store.getState().preferences.logcat.columns,
        COMPACT_COLUMNS,
      ),
    ).toBe(true);
  });

  it("adds missing fields but rejects malformed values and unknown versions", () => {
    expect(
      decodeSettings(
        '{"version":1,"settings":{"recording":{"openAfterSave":false}}}',
      ),
    ).toEqual({ ...defaultSettings(), recording: { openAfterSave: false } });
    for (const raw of [
      "{",
      '{"version":2,"settings":{}}',
      '{"version":1,"settings":{"general":{"startupPane":null}}}',
      '{"version":1,"settings":{"logcat":{"softWrap":"false"}}}',
    ]) {
      const disk = storage(raw);
      const store = createSettingsStore(() => disk);
      expect(store.getState().available).toBe(false);
      expect(store.getState().error).toContain("无法读取设置");
      store.getState().update("performance", { backgroundEnabled: true });
      expect(disk.getItem()).toBe(raw);
      store.getState().restoreDefaults();
      expect(store.getState().available).toBe(true);
      expect(decodeSettings(disk.getItem())).toEqual(defaultSettings());
    }
  });

  it("keeps the previous effective value on write failure and permits retry", () => {
    const disk = storage();
    const store = createSettingsStore(() => disk);
    disk.setItem.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    store.getState().update("recording", { openAfterSave: false });
    expect(store.getState().preferences.recording.openAfterSave).toBe(true);
    expect(store.getState().error).toContain("未保存");
    store.getState().update("recording", { openAfterSave: false });
    expect(store.getState().error).toBeNull();
    expect(decodeSettings(disk.getItem()).recording.openAfterSave).toBe(false);
  });

  it("resets one group and never resets or persists live runtime state", () => {
    const disk = storage();
    const store = createSettingsStore(() => disk);
    const logs = useLogcatStore.getState();
    logs.beginSession("test", 9);
    logs.appendBatch(
      [
        {
          time: "now",
          level: "E",
          tag: "AndroidRuntime",
          pid: "1",
          tid: "1",
          message: "FATAL EXCEPTION: main",
          raw: "test",
        },
      ],
      9,
    );
    const seq = useLogcatStore.getState().buffer.at(0)!.seq;
    logs.setSelectedSeq(seq);
    logs.pause();
    useDeviceMetricsStore.getState().setPaused(true);
    const runtime = useLogcatStore.getState();
    store
      .getState()
      .update("logcat", {
        ...store.getState().preferences.logcat,
        softWrap: true,
        autoFold: false,
      });
    store.getState().update("recording", { openAfterSave: false });
    store.getState().resetSection("logcat");
    expect(store.getState().preferences.logcat).toEqual(
      defaultSettings().logcat,
    );
    expect(store.getState().preferences.recording.openAfterSave).toBe(false);
    expect(useLogcatStore.getState()).toBe(runtime);
    const writes = disk.setItem.mock.calls.length;
    logs.restart();
    useDeviceMetricsStore.getState().restart();
    expect(disk.setItem).toHaveBeenCalledTimes(writes);
    expect(store.getState().preferences.recording.openAfterSave).toBe(false);
  });
});
