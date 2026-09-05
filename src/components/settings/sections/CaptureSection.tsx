import { CaptureDirectoryPreference } from "@/components/settings/CaptureDirectoryPreference";
import { SettingsFieldset, Toggle } from "@/components/settings/SettingRow";
import { useSettingsStore } from "@/store/settings";

export function CaptureSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);

  return (
    <SettingsFieldset available={available}>
      <CaptureDirectoryPreference />
      <Toggle
        label="保存截图后打开图片"
        checked={preferences.screenshot.openAfterSave}
        onChange={(openAfterSave) =>
          update("screenshot", { ...preferences.screenshot, openAfterSave })
        }
      />
      <Toggle
        label="保存截图后定位所在目录"
        checked={preferences.screenshot.revealAfterSave}
        onChange={(revealAfterSave) =>
          update("screenshot", { ...preferences.screenshot, revealAfterSave })
        }
      />
      <Toggle
        label="保存录屏后打开视频"
        checked={preferences.recording.openAfterSave}
        onChange={(openAfterSave) => update("recording", { openAfterSave })}
      />
    </SettingsFieldset>
  );
}
