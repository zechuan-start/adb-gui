import { toAppError, type AppErrorPayload } from "@/i18n/errors";
import { errorText, useT } from "@/i18n";
import { useEffect, useId, useState } from "react";
import { FolderOpen, RefreshCw, RotateCcw } from "lucide-react";
import { ChipGroup } from "@/components/settings/controls/ChipGroup";
import { MirrorPresetControl } from "@/components/settings/MirrorPreferences";
import { SettingRow, SettingsFieldset } from "@/components/settings/SettingRow";
import { currentDetection, mirrorOptionChips } from "@/lib/mirror";
import { scrcpyPathError } from "@/lib/settings";
import {
  isTauriRuntime,
  parseScrcpyExtraArgs,
  pickScrcpyExecutable,
} from "@/lib/tauri";
import { useMirrorStore } from "@/store/mirror";
import { useSettingsStore } from "@/store/settings";

const EXTRA_ARGS_DEBOUNCE_MS = 300;

export function MirrorSection() {
  const t = useT();
  const mirror = useSettingsStore((state) => state.preferences.mirror);
  const available = useSettingsStore((state) => state.available);
  const update = useSettingsStore((state) => state.update);

  return (
    <SettingsFieldset available={available}>
      <ScrcpyPathPreference />
      <SettingRow id="mirrorPreset">
        <MirrorPresetControl disabled={!available} />
      </SettingRow>
      <SettingRow id="mirrorOptions" layout="stacked">
        <ChipGroup
          options={mirrorOptionChips(mirror.options, t)}
          selected={mirror.options}
          disabled={!available}
          ariaLabel={t.settings.rows.mirrorOptions.label}
          onToggle={(option, selected) =>
            update("mirror", {
              ...mirror,
              options: { ...mirror.options, [option]: selected },
            })
          }
        />
        {mirror.options.viewOnly && (
          <p className="mt-2 text-[11px] leading-snug text-ink2">
            {t.settings.mirror.viewOnlyNote}
          </p>
        )}
      </SettingRow>
      <ExtraArgsPreference />
    </SettingsFieldset>
  );
}

function ScrcpyPathPreference() {
  const t = useT();
  const mirror = useSettingsStore((state) => state.preferences.mirror);
  const available = useSettingsStore((state) => state.available);
  const update = useSettingsStore((state) => state.update);
  const detection = useMirrorStore((state) =>
    currentDetection(state.detection, mirror.scrcpyPath),
  );
  const [pickError, setPickError] = useState<AppErrorPayload | null>(null);
  const native = isTauriRuntime();

  useEffect(() => {
    if (native) useMirrorStore.getState().ensureDetected(mirror.scrcpyPath);
  }, [native, mirror.scrcpyPath]);

  async function choose() {
    setPickError(null);
    try {
      const selected = await pickScrcpyExecutable();
      if (selected === null) return;
      const invalid = scrcpyPathError(selected);
      if (invalid) {
        setPickError(invalid);
        return;
      }
      // An unusable file is still saved: detection reports it instead of
      // silently falling back to another scrcpy.
      update("mirror", { ...useSettingsStore.getState().preferences.mirror, scrcpyPath: selected });
    } catch (failure) {
      setPickError(toAppError(failure));
    }
  }

  const buttonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center border border-rule hover:bg-hover disabled:opacity-40";
  const detecting = native && detection.status !== "ready" && detection.status !== "error";
  return (
    <SettingRow id="scrcpyPath" layout="stacked">
      <div className="text-xs">
        <div className="flex items-start gap-2">
          <div className="min-h-8 min-w-0 flex-1 break-all">
            {!native ? (
              <span className="text-ink2">{t.settings.mirror.desktopOnly}</span>
            ) : detection.status === "ready" ? (
              <>
                <div className="select-text font-data text-ink2">{detection.info.path}</div>
                <div className="mt-0.5 text-[11px] text-ink3">
                  {t.settings.mirror.version({
                    version: detection.info.version,
                    source: t.settings.mirror.sources[detection.info.source],
                  })}
                </div>
              </>
            ) : detection.status === "error" ? (
              <div role="alert" className="text-err">
                {errorText(detection.error, t)}
              </div>
            ) : (
              <span className="text-ink2">{t.settings.mirror.detecting}</span>
            )}
          </div>
          <button
            type="button"
            disabled={!native || !available}
            className={buttonClass}
            title={t.settings.mirror.choose}
            aria-label={t.settings.mirror.choose}
            onClick={() => void choose()}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={mirror.scrcpyPath === null || !available}
            className={buttonClass}
            title={t.settings.mirror.reset}
            aria-label={t.settings.mirror.reset}
            onClick={() => update("mirror", { ...mirror, scrcpyPath: null })}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!native || detecting}
            className={buttonClass}
            title={t.settings.mirror.redetect}
            aria-label={t.settings.mirror.redetect}
            onClick={() => void useMirrorStore.getState().detect(mirror.scrcpyPath)}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {pickError && (
          <p role="alert" className="mt-2 break-all text-err">
            {errorText(pickError, t)}
          </p>
        )}
      </div>
    </SettingRow>
  );
}

function ExtraArgsPreference() {
  const t = useT();
  const mirror = useSettingsStore((state) => state.preferences.mirror);
  const available = useSettingsStore((state) => state.available);
  const update = useSettingsStore((state) => state.update);
  const [parseError, setParseError] = useState<AppErrorPayload | null>(null);
  const errorId = useId();
  const native = isTauriRuntime();

  // Rust is the only parser; the row only previews what a start would reject.
  useEffect(() => {
    if (!native) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void parseScrcpyExtraArgs(mirror.extraArgs)
        .then(() => {
          if (current) setParseError(null);
        })
        .catch((failure) => {
          if (current) setParseError(toAppError(failure));
        });
    }, EXTRA_ARGS_DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [native, mirror.extraArgs]);

  return (
    <SettingRow id="mirrorExtraArgs" layout="stacked">
      <input
        type="text"
        value={mirror.extraArgs}
        disabled={!available}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={t.settings.rows.mirrorExtraArgs.label}
        aria-invalid={parseError !== null}
        aria-describedby={parseError ? errorId : undefined}
        placeholder="--max-fps=60"
        onChange={(event) =>
          update("mirror", { ...mirror, extraArgs: event.target.value })
        }
        className="h-8 w-full border border-rule bg-paper px-2.5 font-data text-xs outline-none focus-visible:border-note disabled:opacity-40"
      />
      {parseError && (
        <p id={errorId} role="alert" className="mt-1 break-all text-xs text-err">
          {errorText(parseError, t)}
        </p>
      )}
    </SettingRow>
  );
}
