import {
  SettingRow,
  SettingsFieldset,
  Toggle,
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
      <SettingRow label="排序">
        <SortPreferences section="files" />
      </SettingRow>
      <Toggle
        label="文件夹优先"
        checked={preferences.files.directoriesFirst}
        onChange={(directoriesFirst) =>
          update("files", { ...preferences.files, directoriesFirst })
        }
      />
      <Toggle
        label="显示隐藏文件"
        checked={preferences.files.showHidden}
        onChange={(showHidden) =>
          update("files", { ...preferences.files, showHidden })
        }
      />
      <StartDirectoryPreference />
    </SettingsFieldset>
  );
}
