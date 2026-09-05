import { SettingRow, SettingsFieldset } from "@/components/settings/SettingRow";
import { SortPreferences } from "@/components/settings/SortPreferences";
import { useSettingsStore } from "@/store/settings";

export function AppsSection() {
  const available = useSettingsStore((s) => s.available);

  return (
    <SettingsFieldset available={available}>
      <SettingRow id="appSort">
        <SortPreferences section="apps" />
      </SettingRow>
    </SettingsFieldset>
  );
}
