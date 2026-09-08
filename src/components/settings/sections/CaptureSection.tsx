import { CaptureDirectoryPreference } from "@/components/settings/CaptureDirectoryPreference";
import {
  SettingsFieldset,
  SettingSwitchRow,
} from "@/components/settings/SettingRow";
import { useSettingsStore } from "@/store/settings";

export function CaptureSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);

  return (
    <SettingsFieldset available={available}>
      <CaptureDirectoryPreference />
      <SettingSwitchRow
        id="screenshotOpen"
        checked={preferences.screenshot.openAfterSave}
        disabled={!available}
        onChange={(openAfterSave) =>
          update("screenshot", { ...preferences.screenshot, openAfterSave })
        }
      />
      <SettingSwitchRow
        id="screenshotReveal"
        checked={preferences.screenshot.revealAfterSave}
        disabled={!available}
        onChange={(revealAfterSave) =>
          update("screenshot", { ...preferences.screenshot, revealAfterSave })
        }
      />
      <SettingSwitchRow
        id="recordingOpen"
        checked={preferences.recording.openAfterSave}
        disabled={!available}
        onChange={(openAfterSave) => update("recording", { openAfterSave })}
      />
    </SettingsFieldset>
  );
}
