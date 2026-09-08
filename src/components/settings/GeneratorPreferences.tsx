import { QrCode, ScanLine } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import {
  CODE_TYPE_OPTIONS,
  SEPARATOR_OPTIONS,
  isSeparatorMode,
  type CodeType,
} from "@/lib/codeGenerator";
import { findSettingsRow } from "@/lib/settingsSections";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";

const CODE_TYPE_SEGMENTS = CODE_TYPE_OPTIONS.map(({ value, label }) => ({
  value,
  label,
  icon: value === "qr" ? QrCode : ScanLine,
}));

export function CodeTypeControl({ disabled = false }: { disabled?: boolean }) {
  const preferences = useSettingsStore((state) => state.preferences.codegen);
  const update = useSettingsStore((state) => state.update);
  return (
    <SegmentedControl<CodeType>
      value={preferences.codeType}
      options={CODE_TYPE_SEGMENTS}
      disabled={disabled}
      ariaLabel="码类型"
      onChange={(codeType) =>
        update("codegen", { ...preferences, codeType })
      }
    />
  );
}

export function SeparatorControl({
  id,
  disabled = false,
  containerClassName,
}: {
  id?: string;
  disabled?: boolean;
  containerClassName?: string;
}) {
  const preferences = useSettingsStore((state) => state.preferences.codegen);
  const update = useSettingsStore((state) => state.update);
  const invalid =
    preferences.separatorMode === "custom" &&
    preferences.customSeparator.length === 0;

  return (
    <>
      <BlueprintSelect
        id={id}
        value={preferences.separatorMode}
        options={SEPARATOR_OPTIONS}
        disabled={disabled}
        ariaLabel="分隔符"
        containerClassName={containerClassName}
        onValueChange={(value) => {
          if (isSeparatorMode(value)) {
            update("codegen", { ...preferences, separatorMode: value });
          }
        }}
      />
      {preferences.separatorMode === "custom" && (
        <div className="mt-2">
          <input
            type="text"
            value={preferences.customSeparator}
            disabled={disabled}
            onChange={(event) =>
              update("codegen", {
                ...preferences,
                customSeparator: event.target.value,
              })
            }
            aria-label="自定义分隔符"
            aria-invalid={invalid}
            placeholder="输入自定义分隔符"
            className="h-8 w-full border border-rule bg-paper px-2.5 text-xs outline-none disabled:opacity-40"
          />
          {invalid && (
            <div className="pt-1 text-xs text-err">请输入自定义分隔符</div>
          )}
        </div>
      )}
    </>
  );
}

export function GeneratorPreferences({
  id = "code-separator",
}: {
  id?: string;
}) {
  const separator = findSettingsRow("separator");
  const available = useSettingsStore((state) => state.available);
  return (
    <fieldset disabled={!available} className="min-w-0 disabled:opacity-50">
      <CodeTypeControl disabled={!available} />
      <label className="mt-3 block text-xs text-ink2" htmlFor={id}>
        {separator.label}
      </label>
      <SeparatorControl id={id} disabled={!available} containerClassName="mt-1" />
      {separator.description && (
        <p className={cn("mt-1 text-[11px] leading-snug text-ink2")}>
          {separator.description}
        </p>
      )}
    </fieldset>
  );
}
