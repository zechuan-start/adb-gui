import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { LogcatRow } from "@/components/logcat/LogcatRow";
import { ProcessTable } from "@/components/performance/ProcessTable";
import { normalizeLine } from "@/lib/logcat";
import { STANDARD_COLUMNS, LOGCAT_COLUMNS } from "@/lib/logcatView";
import { getQueryCompletions } from "@/lib/logcatQueryCompletion";
import { useLocaleStore } from "@/store/locale";
import { useLogcatStore } from "@/store/logcat";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";

// Static markup uses Zustand's server snapshot. Feed it the current catalog
// explicitly here; actual subscriptions and layout are covered by browser smoke.
vi.mock("@/i18n", async (original) => {
  const actual = await original<typeof import("@/i18n")>();
  return { ...actual, useT: () => actual.messages() };
});

afterEach(() => {
  useLocaleStore.getState().setPreference("zh-CN");
  useLogcatStore.getState().reset();
  useLogcatStore.getState().commitQuery("");
  useDeviceMetricsStore.getState().bindDevice(null, null);
});

describe("stream localization", () => {
  it("translates a retained query error without mutating stream or query state", () => {
    useLogcatStore.getState().beginSession("device-a", 7);
    useLogcatStore.getState().commitQuery("level:WARN");
    useLogcatStore.getState().commitQuery("level:FATAL");
    const snapshot = useLogcatStore.getState();
    const metrics = useDeviceMetricsStore.getState();
    const failure = snapshot.queryError;
    expect(failure).toMatchObject({ error: { code: "query_unknown_level", params: { value: "FATAL" } } });
    if (!failure) throw new Error("Expected query failure");
    expect(errorText(failure.error, messages())).toBe("未知日志等级: FATAL");

    useLocaleStore.getState().setPreference("en");

    expect(errorText(failure.error, messages())).toBe("Unknown log level: FATAL");
    expect(useLogcatStore.getState()).toBe(snapshot);
    expect(useDeviceMetricsStore.getState()).toBe(metrics);
    expect(snapshot.sessionId).toBe(7);
    expect(snapshot.activeQuery).toBe("level:WARN");
    expect(snapshot.queryInput).toBe("level:FATAL");
    expect(snapshot.queryError).toBe(failure);
  });

  it("updates completion descriptions and column labels without translating query syntax", () => {
    expect(getQueryCompletions("", 0)[0]).toMatchObject({ insertText: "-", detail: "排除条件" });
    expect(LOGCAT_COLUMNS.find(({ column }) => column === "date")?.label).toBe("日期");
    useLocaleStore.getState().setPreference("en");
    expect(getQueryCompletions("", 0)[0]).toMatchObject({ insertText: "-", detail: "Exclude condition" });
    expect(getQueryCompletions("package:m", 9)[0]).toMatchObject({ insertText: "mine", detail: "Foreground app" });
    expect(LOGCAT_COLUMNS.find(({ column }) => column === "date")?.label).toBe("Date");
  });

  it("renders English stack controls and performance empty state while retaining device text", () => {
    useLocaleStore.getState().setPreference("en");
    const entry = normalizeLine({ time: "09-08 10:00:00.000", level: "E", tag: "AndroidRuntime", pid: "1", tid: "1", message: "设备日志原文", raw: "设备日志原文" }, 1);
    const html = renderToStaticMarkup(<LogcatRow entry={entry} selected={false}
      columns={STANDARD_COLUMNS} softWrap={false} cozy={false} traceCount={2}
      traceExpanded={false} onTagClick={() => {}} onToggleTrace={() => {}} />);
    expect(html).toContain('title="Expand stack"');
    expect(html).toContain("+2 stack lines");
    expect(html).toContain("设备日志原文");
    const performance = renderToStaticMarkup(<ProcessTable />);
    expect(performance).toContain("Process usage");
    expect(performance).toContain("Waiting for process snapshot");
  });
});
