import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zhCN } from "@/i18n/messages/zh-CN";
import {
  currentDetection,
  mirrorFailureText,
  mirrorOptionChips,
  mirrorRequest,
  mirrorToolView,
  type MirrorDetection,
} from "@/lib/mirror";
import { defaultSettings } from "@/lib/settings";

const ready: MirrorDetection = {
  status: "ready",
  scrcpyPath: null,
  info: { path: "/Applications/ADB GUI.app/Contents/Resources/scrcpy/scrcpy", version: "5.0.1", source: "bundled" },
};
const base = { native: true, online: true, detection: ready, session: undefined, lastExit: undefined };
const failed = (code: string, params?: Record<string, string>): MirrorDetection => ({
  status: "error",
  scrcpyPath: null,
  error: { code, params },
});

describe("mirror tool view", () => {
  it("needs the desktop runtime and an online device before anything else", () => {
    expect(mirrorToolView({ ...base, native: false })).toEqual({ kind: "unavailable" });
    expect(mirrorToolView({ ...base, online: false })).toEqual({ kind: "unavailable" });
  });

  it("maps each detection state", () => {
    expect(mirrorToolView({ ...base, detection: { status: "idle" } }).kind).toBe("detecting");
    expect(mirrorToolView({ ...base, detection: { status: "detecting", scrcpyPath: null } }).kind).toBe("detecting");
    expect(mirrorToolView({ ...base, detection: failed("mirror.notFound") })).toEqual({ kind: "notFound" });
    expect(mirrorToolView({ ...base, detection: failed("mirror.tooOld", { version: "1.21", minimum: "2.0" }) }).kind).toBe("tooOld");
    expect(mirrorToolView({ ...base, detection: failed("mirror.customPathInvalid", { path: "/x" }) }).kind).toBe("pathInvalid");
    expect(mirrorToolView({ ...base, detection: failed("mirror.versionTimeout") }).kind).toBe("detectionFailed");
    expect(mirrorToolView(base)).toEqual({ kind: "ready", last: null });
  });

  it("keeps a live session in charge of the button even after the device drops", () => {
    expect(mirrorToolView({ ...base, online: false, session: { phase: "starting" } })).toEqual({ kind: "starting" });
    expect(
      mirrorToolView({ ...base, online: false, detection: failed("mirror.notFound"), session: { phase: "running", sessionId: 2, stopError: null } }),
    ).toEqual({ kind: "running", stopError: null });
    expect(mirrorToolView({ ...base, session: { phase: "stopping", sessionId: 2 } })).toEqual({ kind: "stopping" });
  });

  it("offers the last result of a ready device", () => {
    const lastExit = { outcome: "closed" as const, error: null, at: 1 };
    expect(mirrorToolView({ ...base, lastExit })).toEqual({ kind: "ready", last: lastExit });
  });

  it("treats a result for another scrcpy path as still detecting", () => {
    expect(currentDetection(ready, "/usr/bin/scrcpy")).toEqual({ status: "detecting", scrcpyPath: "/usr/bin/scrcpy" });
    expect(currentDetection(ready, null)).toBe(ready);
    expect(currentDetection({ status: "idle" }, "/usr/bin/scrcpy")).toEqual({ status: "idle" });
  });
});

describe("mirror presentation helpers", () => {
  it("shows scrcpy's own ERROR text for a failed exit and translations otherwise", () => {
    expect(mirrorFailureText({ code: "mirror.exitFailed", params: { code: 1 }, detail: "Could not find any ADB device" }, zhCN))
      .toBe("Could not find any ADB device");
    expect(mirrorFailureText({ code: "mirror.exitFailed", params: { code: 1 } }, en)).toBe("scrcpy exited with code 1");
    expect(mirrorFailureText({ code: "mirror.extraArgsForbidden", params: { option: "--serial" } }, zhCN))
      .toBe("额外参数不能包含 --serial, 投屏设备由应用指定");
  });

  it("disables the control-only options while view-only is on without changing them", () => {
    const options = { ...defaultSettings().mirror.options, stayAwake: true };
    expect(mirrorOptionChips(options, zhCN).filter((chip) => chip.disabled)).toEqual([]);
    const viewOnly = { ...options, viewOnly: true };
    expect(mirrorOptionChips(viewOnly, en).filter((chip) => chip.disabled).map((chip) => chip.label)).toEqual([
      "Screen off",
      "Stay awake",
      "Show touches",
    ]);
    expect(mirrorRequest({ ...defaultSettings().mirror, options: viewOnly }).options).toEqual(viewOnly);
  });
});
