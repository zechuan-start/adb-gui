import type { AppErrorPayload } from "@/i18n/errors";
import { useT, errorText } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import {
  addPortForward,
  listPortForwards,
  removePortForward,
  type ForwardRule,
} from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

type Direction = ForwardRule["direction"];

const DIRECTION_OPTIONS = [
  { value: "forward", label: "forward" },
  { value: "reverse", label: "reverse" },
] as const;

interface PortForwardToolProps {
  active?: boolean;
}

function normalizePort(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return String(parsed);
}

export function PortForwardTool({ active = true }: PortForwardToolProps) {
  const t = useT();
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const serial = device?.serial ?? "";
  const online = Boolean(device && isOnlineDevice(device));

  const [rules, setRules] = useState<ForwardRule[]>([]);
  const [direction, setDirection] = useState<Direction>("forward");
  const [localPort, setLocalPort] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorPayload | null>(null);
  const refreshSeqRef = useRef(0);
  const currentSerialRef = useRef(serial);
  const currentOnlineRef = useRef(online);
  const currentActiveRef = useRef(active);

  currentSerialRef.current = serial;
  currentOnlineRef.current = online;
  currentActiveRef.current = active;

  const refreshRules = useCallback(async () => {
    const requestSeq = refreshSeqRef.current + 1;
    refreshSeqRef.current = requestSeq;
    const requestSerial = serial;

    if (!currentActiveRef.current) {
      return;
    }
    if (!requestSerial || !online) {
      setRules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextRules = await listPortForwards(requestSerial);
      if (
        !currentActiveRef.current ||
        !currentOnlineRef.current ||
        refreshSeqRef.current !== requestSeq ||
        currentSerialRef.current !== requestSerial
      ) {
        return;
      }
      setRules(nextRules);
    } catch (refreshError) {
      if (
        !currentActiveRef.current ||
        !currentOnlineRef.current ||
        refreshSeqRef.current !== requestSeq ||
        currentSerialRef.current !== requestSerial
      ) {
        return;
      }
      setRules([]);
      showToast("error", (t) => (t.tools.portForwardTool.couldNotRefreshPortForwarding({ detail: errorText(refreshError, t) })));
    } finally {
      if (
        refreshSeqRef.current === requestSeq &&
        currentSerialRef.current === requestSerial &&
        currentOnlineRef.current &&
        currentActiveRef.current
      ) {
        setLoading(false);
      }
    }
  }, [online, serial, showToast]);

  useEffect(() => {
    setError(null);
    if (!active) {
      refreshSeqRef.current += 1;
      setLoading(false);
      return;
    }
    void refreshRules();
  }, [active, refreshRules]);

  async function handleAdd() {
    if (!device || !online || busyKey) {
      return;
    }

    const normalizedLocal = normalizePort(localPort);
    const normalizedRemote = normalizePort(remotePort);
    if (!normalizedLocal || !normalizedRemote) {
      setError({ code: "port_invalid" });
      return;
    }

    setError(null);
    setBusyKey("add");
    try {
      const result = await addPortForward(device.serial, direction, normalizedLocal, normalizedRemote);
      showToast("success", (t) => (result || t.tools.portForwardTool.portForwardingRuleAdded));
      setLocalPort("");
      setRemotePort("");
      await refreshRules();
    } catch (addError) {
      showToast("error", (t) => (t.tools.portForwardTool.couldNotAddPortForwarding({ detail: errorText(addError, t) })));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(rule: ForwardRule) {
    if (!device || !online || busyKey) {
      return;
    }

    const removePort = rule.direction === "reverse" ? rule.remote_port : rule.local_port;
    const key = `${rule.direction}:${removePort}`;
    setBusyKey(key);
    try {
      const result = await removePortForward(device.serial, rule.direction, removePort);
      showToast("success", (t) => (result || t.tools.portForwardTool.portForwardingRuleDeleted));
      await refreshRules();
    } catch (removeError) {
      showToast("error", (t) => (t.tools.portForwardTool.couldNotDeletePortForwarding({ detail: errorText(removeError, t) })));
    } finally {
      setBusyKey(null);
    }
  }

  const controlsDisabled = !online || loading || Boolean(busyKey);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => void refreshRules()}
          disabled={!online || loading}
          className="inline-flex h-7 w-7 items-center justify-center text-ink2 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title={t.tools.portForwardTool.refreshPortForwarding}
          aria-label={t.tools.portForwardTool.refreshPortForwarding}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 min-[1180px]:grid-cols-[110px_1fr_1fr_auto]">
        <BlueprintSelect
          value={direction}
          options={DIRECTION_OPTIONS}
          onValueChange={(nextDirection) => {
            if (nextDirection === "forward" || nextDirection === "reverse") {
              setDirection(nextDirection);
            }
          }}
          ariaLabel={t.tools.portForwardTool.forwardingDirection}
          disabled={controlsDisabled}
          className="h-8 px-2.5 disabled:opacity-40"
        />
        <input
          type="number"
          min={1}
          max={65535}
          value={localPort}
          onChange={(event) => {
            setLocalPort(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleAdd();
            }
          }}
          disabled={controlsDisabled}
          placeholder={t.tools.portForwardTool.localPort}
          className="h-8 min-w-0 border border-rule bg-surface px-2.5 font-data text-xs outline-none focus:border-note disabled:cursor-not-allowed disabled:opacity-40"
        />
        <input
          type="number"
          min={1}
          max={65535}
          value={remotePort}
          onChange={(event) => {
            setRemotePort(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleAdd();
            }
          }}
          disabled={controlsDisabled}
          placeholder={t.tools.portForwardTool.devicePort}
          className="h-8 min-w-0 border border-rule bg-surface px-2.5 font-data text-xs outline-none focus:border-note disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={controlsDisabled || !localPort.trim() || !remotePort.trim()}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-2 border border-ink bg-ink px-3 font-data text-xs font-medium text-onink transition-colors hover:border-ink2 hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40",
            busyKey === "add" && "opacity-80",
          )}
        >
          {busyKey === "add" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t.tools.portForwardTool.add}
        </button>
      </div>

      <div className="mt-2 min-h-5 text-xs text-destructive">
        {error ? errorText(error, t) : ""}
      </div>

      <div className="mt-2 overflow-hidden border-t border-rule">
        {loading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t.tools.portForwardTool.refreshing}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            {online ? t.tools.portForwardTool.noPortForwardingRules : t.tools.portForwardTool.availableWhenTheDeviceIsOnline}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left font-data text-[11px]">
              <thead className="border-b border-rule text-ink3">
                <tr>
                  <th className="px-3 py-2 font-medium">{t.tools.portForwardTool.direction}</th>
                  <th className="px-3 py-2 font-medium">{t.tools.portForwardTool.localPort}</th>
                  <th className="px-3 py-2 font-medium">{t.tools.portForwardTool.devicePort}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.tools.portForwardTool.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const removePort = rule.direction === "reverse" ? rule.remote_port : rule.local_port;
                  const rowBusy = busyKey === `${rule.direction}:${removePort}`;

                  return (
                    <tr key={`${rule.direction}:${rule.local_port}:${rule.remote_port}:${rule.raw}`} className="border-b border-dashed border-rule2 last:border-0">
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex px-2 py-1 font-data",
                            rule.direction === "forward"
                              ? "text-note"
                              : "text-ink2",
                          )}
                        >
                          {rule.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{rule.local_port}</td>
                      <td className="px-3 py-2 font-mono">{rule.remote_port}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRemove(rule)}
                          disabled={controlsDisabled}
                          className="inline-flex h-7 w-7 items-center justify-center text-ink3 transition-colors hover:bg-err-band hover:text-err disabled:cursor-not-allowed disabled:opacity-40"
                          title={t.tools.portForwardTool.deleteRule}
                        >
                          {rowBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
