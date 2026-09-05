import { SettingRow, SettingsFieldset } from "@/components/settings/SettingRow";
import { SortPreferences } from "@/components/settings/SortPreferences";
import { useSettingsStore } from "@/store/settings";

export function AppsSection() {
  const available = useSettingsStore((s) => s.available);

  return (
    <SettingsFieldset available={available}>
      <SettingRow label="排序">
        <SortPreferences section="apps" />
      </SettingRow>
    </SettingsFieldset>
  );
}
