import {
  CodeTypeControl,
  SeparatorControl,
} from "@/components/settings/GeneratorPreferences";
import {
  SettingRow,
  SettingsFieldset,
} from "@/components/settings/SettingRow";
import { useSettingsStore } from "@/store/settings";

export function CodegenSection() {
  const available = useSettingsStore((state) => state.available);
  return (
    <SettingsFieldset available={available}>
      <SettingRow id="codeType">
        <CodeTypeControl disabled={!available} />
      </SettingRow>
      <SettingRow id="separator" layout="stacked">
        <SeparatorControl
          id="settings-code-separator"
          disabled={!available}
          containerClassName="w-44 max-w-full"
        />
      </SettingRow>
    </SettingsFieldset>
  );
}
