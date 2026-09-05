import { create } from "zustand";
import {
  decodeSettings,
  defaultSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  type SettingsPreferences,
} from "@/lib/settings";
import {
  resetSettingsSection,
  type SettingsSection,
} from "@/lib/settingsSections";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

interface SettingsState {
  preferences: SettingsPreferences;
  available: boolean;
  error: string | null;
  update: <K extends keyof SettingsPreferences>(
    key: K,
    value: SettingsPreferences[K],
  ) => void;
  resetSection: (section: SettingsSection) => void;
  restoreDefaults: () => void;
  reload: () => void;
}

export function createSettingsStore(storage: () => SettingsStorage) {
  function load() {
    try {
      return {
        preferences: decodeSettings(storage().getItem(SETTINGS_STORAGE_KEY)),
        available: true,
        error: null,
      };
    } catch (error) {
      return {
        preferences: defaultSettings(),
        available: false,
        error: `无法读取设置: ${String(error)}`,
      };
    }
  }

  return create<SettingsState>((set, get) => {
    function save(preferences: SettingsPreferences) {
      try {
        storage().setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ version: SETTINGS_VERSION, settings: preferences }),
        );
        set({ preferences, available: true, error: null });
      } catch (error) {
        set({ error: `设置未保存: ${String(error)}` });
      }
    }
    return {
      ...load(),
      update: (key, value) => {
        if (get().available) save({ ...get().preferences, [key]: value });
      },
      resetSection: (section) => {
        if (get().available)
          save(resetSettingsSection(get().preferences, section));
      },
      restoreDefaults: () => save(defaultSettings()),
      reload: () => set(load()),
    };
  });
}

export const useSettingsStore = createSettingsStore(
  () => globalThis.localStorage,
);

export function requireSettings(): SettingsPreferences {
  const { preferences, available, error } = useSettingsStore.getState();
  if (!available) throw new Error(error ?? "设置尚未加载");
  return preferences;
}
