import { Monitor, Moon, Sun } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import {
  SettingRow,
  SettingsFieldset,
  SettingSwitchRow,
} from "@/components/settings/SettingRow";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import { STARTUP_OPTIONS } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useThemeStore, type Theme } from "@/store/theme";

const THEMES = [
  { value: "system", label: "跟随系统", icon: Monitor },
  { value: "light", label: "亮色", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
] satisfies ReadonlyArray<{ value: Theme; label: string; icon: typeof Monitor }>;

export function GeneralSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <>
      {/* Theme ownership remains independent from adb-gui-settings. */}
      <SettingRow id="theme">
        <SegmentedControl
          value={theme}
          options={THEMES}
          onChange={setTheme}
          ariaLabel="主题"
        />
      </SettingRow>
      <SettingsFieldset available={available}>
        <SettingRow id="startupPane">
          <BlueprintSelect
            value={preferences.general.startupPane}
            options={STARTUP_OPTIONS}
            ariaLabel="启动页面"
            containerClassName="w-44 shrink-0"
            className="h-8"
            onValueChange={(value) => {
              const option = STARTUP_OPTIONS.find(
                (item) => item.value === value,
              );
              if (option) {
                update("general", {
                  ...preferences.general,
                  startupPane: option.value,
                });
              }
            }}
          />
        </SettingRow>
        <SettingSwitchRow
          id="checkUpdates"
          checked={preferences.general.checkUpdatesOnStartup}
          disabled={!available}
          onChange={(checkUpdatesOnStartup) =>
            update("general", { ...preferences.general, checkUpdatesOnStartup })
          }
        />
        <SettingSwitchRow
          id="background"
          checked={preferences.performance.backgroundEnabled}
          disabled={!available}
          onChange={(backgroundEnabled) =>
            update("performance", { backgroundEnabled })
          }
        />
      </SettingsFieldset>
    </>
  );
}
