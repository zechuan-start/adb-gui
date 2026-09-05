import { describe, expect, it } from "vitest";
import {
  decodeSettings,
  defaultSettings,
  migrateSettings,
  SETTINGS_VERSION,
} from "@/lib/settings";

describe("settings migration", () => {
  it("passes the current version through untouched", () => {
    const stored = { recording: { openAfterSave: false } };
    expect(migrateSettings(SETTINGS_VERSION, stored)).toEqual(stored);
    expect(
      decodeSettings(
        JSON.stringify({ version: SETTINGS_VERSION, settings: stored }),
      ),
    ).toEqual({ ...defaultSettings(), recording: { openAfterSave: false } });
  });

  it("refuses a newer version instead of guessing its fields", () => {
    expect(() =>
      migrateSettings(SETTINGS_VERSION + 1, { general: {} }),
    ).toThrow("不支持此设置版本");
    expect(() =>
      decodeSettings(
        JSON.stringify({ version: SETTINGS_VERSION + 1, settings: {} }),
      ),
    ).toThrow("不支持此设置版本");
  });

  it("refuses an older version while no migration step exists for it", () => {
    expect(() => migrateSettings(SETTINGS_VERSION - 1, {})).toThrow(
      "不支持此设置版本",
    );
  });

  it.each([undefined, null, "1", 1.5, Number.NaN])(
    "refuses a non-version envelope field: %p",
    (version) => {
      expect(() => migrateSettings(version, {})).toThrow("不支持此设置版本");
    },
  );

  it("keeps rejecting a malformed settings body after the version check", () => {
    expect(() => migrateSettings(SETTINGS_VERSION, null)).toThrow(
      "设置格式无效",
    );
    expect(() => migrateSettings(SETTINGS_VERSION, [])).toThrow("设置格式无效");
  });
});
