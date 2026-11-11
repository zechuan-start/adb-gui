import { useT } from "@/i18n";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import { MIRROR_PRESETS, type MirrorPreset } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";

// The tool module and the settings row render this one control, so both
// write the preset through the same settings action.
export function MirrorPresetControl({
  disabled = false,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const mirror = useSettingsStore((state) => state.preferences.mirror);
  const update = useSettingsStore((state) => state.update);
  return (
    <SegmentedControl<MirrorPreset>
      value={mirror.preset}
      options={MIRROR_PRESETS.map(({ value, label }) => ({ value, label: label(t) }))}
      disabled={disabled}
      ariaLabel={t.settings.rows.mirrorPreset.label}
      className={className}
      onChange={(preset) => update("mirror", { ...mirror, preset })}
    />
  );
}
