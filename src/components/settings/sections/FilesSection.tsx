import {
  SettingsFieldset,
  SettingSwitchRow,
} from "@/components/settings/SettingRow";
import { SortRow } from "@/components/settings/SortPreferences";
import { StartDirectoryPreference } from "@/components/settings/StartDirectoryPreference";
import { useSettingsStore } from "@/store/settings";

export function FilesSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);

  return (
    <SettingsFieldset available={available}>
      <SortRow section="files" />
      <SettingSwitchRow
        id="directoriesFirst"
        checked={preferences.files.directoriesFirst}
        disabled={!available}
        onChange={(directoriesFirst) =>
          update("files", { ...preferences.files, directoriesFirst })
        }
      />
      <SettingSwitchRow
        id="showHidden"
        checked={preferences.files.showHidden}
        disabled={!available}
        onChange={(showHidden) =>
          update("files", { ...preferences.files, showHidden })
        }
      />
      <StartDirectoryPreference />
    </SettingsFieldset>
  );
}
