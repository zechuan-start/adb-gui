import { useEffect, useRef, useState } from "react";
import { FolderOpen, RotateCcw } from "lucide-react";
import { SettingRowLabel } from "@/components/settings/SettingRow";
import {
  captureDestination,
  isTauriRuntime,
  pickCaptureDirectory,
  resolveCaptureDirectory,
} from "@/lib/tauri";
import { useSettingsStore } from "@/store/settings";

export function CaptureDirectoryPreference() {
  const directory = useSettingsStore(
    (state) => state.preferences.capture.directory,
  );
  const update = useSettingsStore((state) => state.update);
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const native = isTauriRuntime();

  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe((state, previous) => {
      if (state.preferences.capture !== previous.preferences.capture) {
        generation.current += 1;
        setBusy(false);
      }
    });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let current = true;
    setResolved(null);
    setError(null);
    if (!native) return;
    void resolveCaptureDirectory(captureDestination(directory))
      .then((path) => {
        if (current) setResolved(path);
      })
      .catch((failure) => {
        if (current) setError(String(failure));
      });
    return () => {
      current = false;
    };
  }, [directory, native]);

  async function choose() {
    const operation = ++generation.current;
    setBusy(true);
    setError(null);
    function restoreFocus() {
      const settled = generation.current;
      requestAnimationFrame(() => {
        if (settled === generation.current) chooseRef.current?.focus();
      });
    }
    try {
      const selected = await pickCaptureDirectory();
      if (selected === null || operation !== generation.current) return;
      await resolveCaptureDirectory({ kind: "directory", path: selected });
      if (operation === generation.current) {
        update("capture", { directory: selected });
        restoreFocus();
      }
    } catch (failure) {
      if (operation === generation.current) setError(String(failure));
    } finally {
      if (operation === generation.current) {
        setBusy(false);
        restoreFocus();
      }
    }
  }

  const buttonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center border border-rule hover:bg-hover disabled:opacity-40";
  return (
    <div className="border-b border-rule py-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SettingRowLabel id="captureDirectory" />
          <div className="mt-2 min-h-8 select-text break-all font-data text-ink2">
            {resolved ??
              directory ??
              (native
                ? error
                  ? "默认目录不可用"
                  : "读取目录..."
                : "本机目录不可用")}
          </div>
        </div>
        <button
          ref={chooseRef}
          type="button"
          disabled={!native || busy}
          className={buttonClass}
          title="选择保存目录"
          aria-label="选择保存目录"
          onClick={() => void choose()}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={directory === null}
          className={buttonClass}
          title="恢复默认保存目录"
          aria-label="恢复默认保存目录"
          onClick={() => update("capture", { directory: null })}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 break-all text-err">
          {error}
        </p>
      )}
    </div>
  );
}
