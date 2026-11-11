import { errorText, useT } from "@/i18n";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, Play, RefreshCw, Square } from "lucide-react";
import { MirrorPresetControl } from "@/components/settings/MirrorPreferences";
import { getDeviceBySerial, getDeviceDisplayLabel, isOnlineDevice } from "@/lib/device";
import {
  currentDetection,
  mirrorFailureText,
  mirrorRequest,
  mirrorToolView,
  type MirrorToolView,
} from "@/lib/mirror";
import { isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useMirrorStore } from "@/store/mirror";
import { requireSettings, useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

interface StatusLine {
  tone: "muted" | "ok" | "warn" | "err";
  text: string;
  title?: string;
  extra?: ReactNode;
}

export function MirrorTool({ active = true }: { active?: boolean }) {
  const t = useT();
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const serial = device?.serial ?? null;
  const available = useSettingsStore((state) => state.available);
  const scrcpyPath = useSettingsStore((state) => state.preferences.mirror.scrcpyPath);
  const detection = useMirrorStore((state) => state.detection);
  const session = useMirrorStore((state) => (serial ? state.sessions[serial] : undefined));
  const lastExit = useMirrorStore((state) => (serial ? state.lastExit[serial] : undefined));
  const openSettings = useUiStore((state) => state.openSettings);
  const native = isTauriRuntime();

  useEffect(() => {
    if (active && native) useMirrorStore.getState().ensureDetected(scrcpyPath);
  }, [active, native, scrcpyPath]);

  const view = mirrorToolView({
    native,
    online: isOnlineDevice(device),
    detection: currentDetection(detection, scrcpyPath),
    session,
    lastExit,
  });
  const live = view.kind === "running" || view.kind === "stopping";
  const pending = view.kind === "starting" || view.kind === "stopping";

  function toggle() {
    if (!serial) return;
    const store = useMirrorStore.getState();
    if (view.kind === "running") {
      void store.stop(serial);
    } else if (view.kind === "ready") {
      // Read preferences at click time; a settings failure lands on the status line.
      void store.start(serial, () => mirrorRequest(requireSettings().mirror));
    }
  }

  const redetect = (
    <button
      type="button"
      className="inline-flex items-center gap-1 self-start text-note underline-offset-2 hover:underline"
      onClick={() => void useMirrorStore.getState().detect(scrcpyPath)}
    >
      <RefreshCw className="h-3 w-3" />
      {t.tools.mirrorTool.redetect}
    </button>
  );
  const status = statusLine(view, t, {
    device: device ? getDeviceDisplayLabel(device) : "",
    redetect,
    openSettings: (
      <button
        type="button"
        className="self-start text-note underline-offset-2 hover:underline"
        onClick={() => openSettings("mirror")}
      >
        {t.tools.mirrorTool.openSettings}
      </button>
    ),
  });

  return (
    <div className="flex h-full min-w-0 flex-col">
      <button
        type="button"
        disabled={view.kind !== "ready" && view.kind !== "running"}
        onClick={toggle}
        className={cn(
          "flex h-9 w-full shrink-0 items-center justify-center gap-2 border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40",
          live ? "border-err text-err hover:bg-hover" : "border-ink bg-ink text-onink hover:bg-ink2",
        )}
      >
        {pending ? (
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        ) : live ? (
          <Square className="h-4 w-4 shrink-0" />
        ) : (
          <Play className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 truncate">
          {view.kind === "starting"
            ? t.tools.mirrorTool.starting
            : view.kind === "stopping"
              ? t.tools.mirrorTool.stopping
              : live
                ? t.tools.mirrorTool.stop
                : t.tools.mirrorTool.start}
        </span>
      </button>
      <MirrorPresetControl
        disabled={!available}
        className="mt-3 grid w-full grid-cols-3 [&>button]:px-1.5"
      />
      <div
        role="status"
        title={status?.title}
        className="mt-3 flex min-h-8 min-w-0 flex-col gap-1.5 border-y border-dashed border-rule2 py-2 text-[11px]"
      >
        {status && (
          <span
            className={cn(
              "line-clamp-3 break-words",
              status.tone === "ok" && "text-ok",
              status.tone === "warn" && "text-warn",
              status.tone === "err" && "text-err",
              status.tone === "muted" && "text-ink2",
            )}
          >
            {status.tone === "ok" && <span aria-hidden="true">● </span>}
            {status.text}
          </span>
        )}
        {status?.extra}
      </div>
      <button
        type="button"
        className="mt-auto inline-flex items-center gap-1 self-start pt-3 text-[11px] text-ink2 hover:text-ink"
        onClick={() => openSettings("mirror")}
      >
        {t.tools.mirrorTool.moreOptions}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function statusLine(
  view: MirrorToolView,
  t: ReturnType<typeof useT>,
  parts: { device: string; redetect: ReactNode; openSettings: ReactNode },
): StatusLine | null {
  switch (view.kind) {
    case "unavailable":
      return { tone: "muted", text: t.tools.mirrorTool.noDevice };
    case "detecting":
      return { tone: "muted", text: t.tools.mirrorTool.detecting };
    case "notFound":
      return { tone: "err", text: t.tools.mirrorTool.notFound, extra: parts.redetect };
    case "pathInvalid":
      return { tone: "err", text: errorText(view.error, t), title: errorText(view.error, t), extra: parts.openSettings };
    case "tooOld":
    case "detectionFailed":
      return {
        tone: "err",
        text: errorText(view.error, t),
        title: errorText(view.error, t),
        extra: (
          <>
            {parts.redetect}
            {parts.openSettings}
          </>
        ),
      };
    case "starting":
      return { tone: "muted", text: t.tools.mirrorTool.starting };
    case "stopping":
      return { tone: "muted", text: t.tools.mirrorTool.stopping };
    case "running":
      return view.stopError
        ? {
            tone: "err",
            text: t.tools.mirrorTool.stopFailed({ detail: errorText(view.stopError, t) }),
            title: errorText(view.stopError, t),
          }
        : { tone: "ok", text: t.tools.mirrorTool.running({ device: parts.device }) };
    case "ready":
      switch (view.last?.outcome) {
        case "closed":
          return { tone: "muted", text: t.tools.mirrorTool.closed };
        case "disconnected":
          return {
            tone: "warn",
            text: t.tools.mirrorTool.disconnected,
            title: view.last.error ? errorText(view.last.error, t) : undefined,
          };
        case "failed":
          return view.last.error
            ? {
                tone: "err",
                text: t.tools.mirrorTool.failed({ detail: mirrorFailureText(view.last.error, t) }),
                title: errorText(view.last.error, t),
              }
            : null;
        default:
          return null;
      }
  }
}
