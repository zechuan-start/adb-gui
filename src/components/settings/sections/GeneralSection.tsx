import { useLocaleStore } from "@/store/locale";
import type { LocalePreference } from "@/i18n/locale";
import { useT } from "@/i18n";
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

export function GeneralSection() {
  const t = useT();
  const THEMES = [
    { value: "system", label: t.settings.theme.system, icon: Monitor },
    { value: "light", label: t.settings.theme.light, icon: Sun },
    { value: "dark", label: t.settings.theme.dark, icon: Moon },
  ] satisfies ReadonlyArray<{
    value: Theme;
    label: string;
    icon: typeof Monitor;
  }>;
  const localePreference = useLocaleStore((s) => s.preference);
  const setLocalePreference = useLocaleStore((s) => s.setPreference);
  const languageOptions: { value: LocalePreference; label: string }[] = [
    { value: "system", label: t.settings.general.language.system },
    { value: "zh-CN", label: t.settings.general.language.chinese },
    { value: "en", label: t.settings.general.language.english },
  ];
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <>
      <SettingRow id="language">
        <SegmentedControl
          value={localePreference}
          options={languageOptions}
          onChange={setLocalePreference}
          ariaLabel={t.settings.general.language.label}
        />
      </SettingRow>
      {/* Theme ownership remains independent from adb-gui-settings. */}
      <SettingRow id="theme">
        <SegmentedControl
          value={theme}
          options={THEMES}
          onChange={setTheme}
          ariaLabel={t.settings.rows.theme.label}
        />
      </SettingRow>
      <SettingsFieldset available={available}>
        <SettingRow id="startupPane">
          <BlueprintSelect
            value={preferences.general.startupPane}
            options={STARTUP_OPTIONS.map((option) => ({
              ...option,
              label: option.label(t),
            }))}
            ariaLabel={t.settings.rows.startupPane.label}
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
