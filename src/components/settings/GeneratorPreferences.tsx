import { QrCode, ScanLine } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import {
  CODE_TYPE_OPTIONS,
  SEPARATOR_OPTIONS,
  isSeparatorMode,
} from "@/lib/codeGenerator";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";

export function GeneratorPreferences({
  id = "code-separator",
}: {
  id?: string;
}) {
  const preferences = useSettingsStore((state) => state.preferences.codegen);
  const available = useSettingsStore((state) => state.available);
  const update = useSettingsStore((state) => state.update);
  const invalid =
    preferences.separatorMode === "custom" &&
    preferences.customSeparator.length === 0;
  return (
    <fieldset disabled={!available} className="min-w-0 disabled:opacity-50">
      <div
        className="grid grid-cols-2 border border-rule"
        role="group"
        aria-label="码类型"
      >
        {CODE_TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              update("codegen", { ...preferences, codeType: value })
            }
            aria-pressed={preferences.codeType === value}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 border-r border-rule text-xs last:border-r-0",
              preferences.codeType === value
                ? "bg-ink text-onink"
                : "text-ink2 hover:bg-hover",
            )}
          >
            {value === "qr" ? (
              <QrCode className="h-4 w-4" />
            ) : (
              <ScanLine className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-ink3" htmlFor={id}>
        分隔符
      </label>
      <BlueprintSelect
        id={id}
        value={preferences.separatorMode}
        options={SEPARATOR_OPTIONS}
        disabled={!available}
        ariaLabel="分隔符"
        containerClassName="mt-1"
        onValueChange={(value) => {
          if (isSeparatorMode(value))
            update("codegen", { ...preferences, separatorMode: value });
        }}
      />
      {preferences.separatorMode === "custom" && (
        <div className="mt-2">
          <input
            type="text"
            value={preferences.customSeparator}
            onChange={(event) =>
              update("codegen", {
                ...preferences,
                customSeparator: event.target.value,
              })
            }
            aria-label="自定义分隔符"
            aria-invalid={invalid}
            placeholder="输入自定义分隔符"
            className="h-8 w-full border border-rule bg-paper px-2.5 text-xs outline-none"
          />
          {invalid && (
            <div className="pt-1 text-xs text-err">请输入自定义分隔符</div>
          )}
        </div>
      )}
    </fieldset>
  );
}
