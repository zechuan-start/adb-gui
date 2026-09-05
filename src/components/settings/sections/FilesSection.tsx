import {
  SettingRow,
  SettingsFieldset,
  SettingsGroup,
  SettingsRowGate,
  SettingToggle,
} from "@/components/settings/SettingRow";
import { SortPreferences } from "@/components/settings/SortPreferences";
import { StartDirectoryPreference } from "@/components/settings/StartDirectoryPreference";
import { useSettingsStore } from "@/store/settings";

export function FilesSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);

  return (
    <SettingsFieldset available={available}>
      <SettingsGroup
        title="排序与显示"
        rowIds={["fileSort", "directoriesFirst", "showHidden"]}
      >
        <SettingRow id="fileSort">
          <SortPreferences section="files" />
        </SettingRow>
        <SettingToggle
          id="directoriesFirst"
          checked={preferences.files.directoriesFirst}
          onChange={(directoriesFirst) =>
            update("files", { ...preferences.files, directoriesFirst })
          }
        />
        <SettingToggle
          id="showHidden"
          checked={preferences.files.showHidden}
          onChange={(showHidden) =>
            update("files", { ...preferences.files, showHidden })
          }
        />
      </SettingsGroup>
      <SettingsGroup title="起始目录" rowIds={["startDirectory"]}>
        <SettingsRowGate id="startDirectory">
          <StartDirectoryPreference />
        </SettingsRowGate>
      </SettingsGroup>
    </SettingsFieldset>
  );
}
