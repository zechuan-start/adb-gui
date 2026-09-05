import { Monitor, Moon, Sun } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import {
  SettingRow,
  SettingsFieldset,
  SettingToggle,
} from "@/components/settings/SettingRow";
import { STARTUP_OPTIONS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useThemeStore } from "@/store/theme";

const THEMES = [
  { id: "system" as const, label: "跟随系统", icon: Monitor },
  { id: "light" as const, label: "亮色", icon: Sun },
  { id: "dark" as const, label: "暗色", icon: Moon },
];

export function GeneralSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <>
      {/* The theme lives in its own store and stays editable while settings are unreadable. */}
      <SettingRow id="theme">
        <div className="flex border border-rule" role="group" aria-label="主题">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-label={label}
              title={label}
              aria-pressed={theme === id}
              onClick={() => setTheme(id)}
              className={cn(
                "flex h-8 w-10 items-center justify-center border-r border-rule last:border-r-0 hover:bg-hover",
                theme === id && "bg-ink text-onink hover:bg-ink",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </SettingRow>
      <SettingsFieldset available={available}>
        <SettingRow id="startupPane">
          <BlueprintSelect
            value={preferences.general.startupPane}
            options={STARTUP_OPTIONS}
            ariaLabel="启动页面"
            containerClassName="w-44 shrink-0"
            onValueChange={(value) => {
              const option = STARTUP_OPTIONS.find(
                (item) => item.value === value,
              );
              if (option)
                update("general", {
                  ...preferences.general,
                  startupPane: option.value,
                });
            }}
          />
        </SettingRow>
        <SettingToggle
          id="checkUpdates"
          checked={preferences.general.checkUpdatesOnStartup}
          onChange={(checkUpdatesOnStartup) =>
            update("general", { ...preferences.general, checkUpdatesOnStartup })
          }
        />
        <SettingToggle
          id="background"
          checked={preferences.performance.backgroundEnabled}
          onChange={(backgroundEnabled) =>
            update("performance", { backgroundEnabled })
          }
        />
      </SettingsFieldset>
    </>
  );
}
