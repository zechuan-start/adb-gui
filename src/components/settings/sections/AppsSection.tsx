import { SettingsFieldset } from "@/components/settings/SettingRow";
import { SortRow } from "@/components/settings/SortPreferences";
import { useSettingsStore } from "@/store/settings";

export function AppsSection() {
  const available = useSettingsStore((s) => s.available);

  return (
    <SettingsFieldset available={available}>
      <SortRow section="apps" />
    </SettingsFieldset>
  );
}
