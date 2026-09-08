import { afterEach, describe, expect, it } from "vitest";
import { useFeedbackStore } from "@/store/feedback";
import { createSettingsStore } from "@/store/settings";
import { en } from "./messages/en";
import { zhCN } from "./messages/zh-CN";
import { translateError } from "./errors";

afterEach(() => useFeedbackStore.getState().clearToast());

describe("retained messages", () => {
  it("translates a queued success notification without replacing it", () => {
    useFeedbackStore.getState().showToast("success", (t) => t.common.copied);
    const { toast, toastId } = useFeedbackStore.getState();
    if (!toast || typeof toast.message !== "function")
      throw new Error("Expected a catalog message");
    expect(toast.message(zhCN)).toBe("已复制");
    expect(toast.message(en)).toBe("Copied");
    expect(useFeedbackStore.getState().toastId).toBe(toastId);
  });

  it("retains settings failure causes and renders the same failure in either language", () => {
    const store = createSettingsStore(() => ({
      getItem: () => JSON.stringify({ version: 99, settings: {} }),
      setItem: () => {
        throw new Error("Read must not write");
      },
    }));
    const error = store.getState().error;
    if (!error) throw new Error("Expected a settings failure");
    expect(error.causes).toEqual([
      { code: "settings.unsupportedVersion", params: {} },
    ]);
    expect(translateError(error, zhCN)).toBe("无法读取设置: 不支持此设置版本");
    expect(translateError(error, en)).toBe(
      "Could not read settings: Unsupported settings version",
    );
    expect(store.getState().available).toBe(false);
    expect(store.getState().error).toBe(error);
  });
});
