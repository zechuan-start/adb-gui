import { describe, expect, it, vi } from "vitest";
import { applyStartupPane, createStartupCheck } from "@/lib/startup";
import { defaultSettings } from "@/lib/settings";

describe("cold startup", () => {
  it("preserves last pane and unavailable settings, applies an explicit pane", () => {
    const setPane = vi.fn();
    applyStartupPane(null, setPane);
    applyStartupPane(defaultSettings(), setPane);
    expect(setPane).not.toHaveBeenCalled();
    const settings = defaultSettings();
    settings.general.startupPane = "perf";
    applyStartupPane(settings, setPane);
    expect(setPane).toHaveBeenCalledExactlyOnceWith("perf");
  });

  it("makes no request when disabled at launch", async () => {
    const check = vi.fn(async () => "update");
    expect(await createStartupCheck(false, check).run()).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("shares StrictMode requests and discards in-flight results after disabling", async () => {
    let resolve!: (result: string) => void;
    const check = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const startup = createStartupCheck(true, check);
    const first = startup.run();
    const second = startup.run();
    expect(check).toHaveBeenCalledTimes(1);
    startup.disable();
    resolve("update");
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(await startup.run()).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
  });
});
