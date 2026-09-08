import { describe, expect, it, vi, afterEach } from "vitest";
import { isLocalePreference, resolveLocale, systemLanguages } from "./locale";

afterEach(() => vi.unstubAllGlobals());

describe("locale resolution", () => {
  it.each([
    [["zh-CN"], "zh-CN"],
    [["zh-TW"], "zh-CN"],
    [["zh-Hant"], "zh-CN"],
    [["ZH-hk"], "zh-CN"],
    [["", "zh"], "zh-CN"],
    [["en-US", "zh-CN"], "en"],
    [["fr"], "en"],
    [["ja-JP"], "en"],
    [[], "en"],
    [[""], "en"],
  ] as const)("resolves system %j to %s", (languages, expected) => {
    expect(resolveLocale("system", languages)).toBe(expected);
  });

  it("uses explicit preference without consulting the system", () => {
    expect(resolveLocale("zh-CN", ["fr"])).toBe("zh-CN");
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(isLocalePreference("zh-TW")).toBe(false);
    expect(isLocalePreference(null)).toBe(false);
  });

  it("handles inaccessible and absent system language APIs", () => {
    vi.stubGlobal("navigator", {
      get languages() {
        throw new Error("denied");
      },
    });
    expect(systemLanguages()).toEqual([]);
    vi.stubGlobal("navigator", { language: "zh-TW" });
    expect(systemLanguages()).toEqual(["zh-TW"]);
    vi.stubGlobal("navigator", { languages: [], language: "zh-TW" });
    expect(systemLanguages()).toEqual([]);
  });
});
