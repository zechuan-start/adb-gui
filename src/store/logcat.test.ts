import { beforeEach, describe, expect, it } from "vitest";
import { LOGCAT_CAPACITY, type LogLevel } from "@/lib/logcat";
import { formatQueryValue } from "@/lib/logcatQuery";
import type { LogcatLine } from "@/lib/tauri";
import { PROCESS_MAP_TTL_MS, useLogcatStore } from "@/store/logcat";

function line(
  index: number,
  level: LogLevel = "I",
  overrides: Partial<LogcatLine> = {},
): LogcatLine {
  return {
    time: "08-29 22:00:00.000",
    level,
    tag: index % 2 === 0 ? "Even" : "Odd",
    pid: String(index % 3),
    tid: "1",
    message: `message-${index}`,
    raw: `raw-${index}`,
    ...overrides,
  };
}

function beginSession(sessionId = 7): void {
  useLogcatStore.getState().beginSession("device-a", sessionId);
}

describe("useLogcatStore", () => {
  beforeEach(() => {
    useLogcatStore.getState().reset();
    useLogcatStore.getState().commitQuery("");
    useLogcatStore.setState({ nextSeq: 0 });
  });

  it("drops batches and exit events from a different session", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(1)], 6);
    useLogcatStore.getState().markDisconnected(6, "old session");

    const state = useLogcatStore.getState();
    expect(state.totalCount).toBe(0);
    expect(state.streamState).toBe("live");
    expect(state.disconnectDetail).toBe("");
  });

  it("records a visible startup failure without inventing a session", () => {
    useLogcatStore.getState().failStart("device offline");

    const state = useLogcatStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.streamState).toBe("disconnected");
    expect(state.disconnectDetail).toBe("device offline");
  });

  it("keeps selection and crash expansion separate from the scroll anchor", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([
      line(0, "E", {
        tag: "AndroidRuntime",
        message: "FATAL EXCEPTION: main",
      }),
    ], 7);

    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().setSelectedSeq(0);
    useLogcatStore.getState().toggleCrashExpanded(0);

    const state = useLogcatStore.getState();
    expect(state.anchoredSeq).toBe(0);
    expect(state.selectedSeq).toBe(0);
    expect(state.expandedCrashSeqs).toEqual(new Set([0]));

    useLogcatStore.getState().setSelectedSeq(0);
    useLogcatStore.getState().toggleCrashExpanded(0);
    expect(useLogcatStore.getState().selectedSeq).toBe(0);
    expect(useLogcatStore.getState().expandedCrashSeqs.size).toBe(0);
  });

  it("marks a pending restart disconnected when the device disappears", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("message:Draft");
    useLogcatStore.getState().restart();

    useLogcatStore.getState().markDeviceUnavailable("设备已断开");

    const state = useLogcatStore.getState();
    expect(state.serial).toBe("device-a");
    expect(state.sessionId).toBeNull();
    expect(state.streamState).toBe("disconnected");
    expect(state.disconnectDetail).toBe("设备已断开");
    expect(state.queryInput).toBe("message:Draft");
    expect(state.activeQuery).toBe("message:Draft");
    expect(state.queryError).toBeNull();
  });

  it("appends rows incrementally through the active query", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("level:WARN");
    useLogcatStore.getState().appendBatch([line(1, "I"), line(2, "W"), line(3, "E")], 7);

    const state = useLogcatStore.getState();
    expect(state.totalCount).toBe(3);
    expect(state.filteredCount).toBe(2);
    expect(state.buffer.bySeq(state.filteredSeqs[state.filteredHead])?.level).toBe("W");
  });

  it("applies final rows and disconnect state in one store update", () => {
    beginSession();
    let updates = 0;
    const unsubscribe = useLogcatStore.subscribe(() => {
      updates += 1;
    });

    useLogcatStore.getState().flushFrame([line(1)], 7, "device offline");
    unsubscribe();

    const state = useLogcatStore.getState();
    expect(updates).toBe(1);
    expect(state.totalCount).toBe(1);
    expect(state.streamState).toBe("disconnected");
    expect(state.disconnectDetail).toBe("device offline");
  });

  it("skips evicted seq values and compacts the index head", () => {
    beginSession();
    const firstWindow = Array.from({ length: LOGCAT_CAPACITY }, (_, index) => line(index, "W"));
    useLogcatStore.getState().appendBatch(firstWindow, 7);

    const overflow = Array.from(
      { length: Math.floor(LOGCAT_CAPACITY / 2) + 1 },
      (_, index) => line(LOGCAT_CAPACITY + index, "W"),
    );
    useLogcatStore.getState().appendBatch(overflow, 7);

    const state = useLogcatStore.getState();
    expect(state.totalCount).toBe(LOGCAT_CAPACITY);
    expect(state.filteredCount).toBe(LOGCAT_CAPACITY);
    expect(state.filteredHead).toBe(0);
    expect(state.filteredSeqs).toHaveLength(LOGCAT_CAPACITY);
    expect(state.buffer.bySeq(state.filteredSeqs[0])).toBeDefined();
  });

  it("keeps query drafts inert, then rebuilds and incrementally extends the index on commit", () => {
    beginSession();
    useLogcatStore.getState().appendBatch(
      [line(1, "I"), line(2, "W"), line(3, "E"), line(4, "D")],
      7,
    );
    useLogcatStore.getState().setQueryInput("level:WARN tag:Even");
    expect(useLogcatStore.getState().filteredCount).toBe(4);

    useLogcatStore.getState().commitQuery("level:WARN tag:Even");
    expect(useLogcatStore.getState().filteredCount).toBe(1);
    useLogcatStore.getState().appendBatch([line(5, "E"), line(6, "E")], 7);

    const state = useLogcatStore.getState();
    expect(state.queryInput).toBe("level:WARN tag:Even");
    expect(state.activeQuery).toBe("level:WARN tag:Even");
    expect(state.queryError).toBeNull();
    expect(state.totalCount).toBe(6);
    expect(state.filteredCount).toBe(2);
    expect(
      Array.from({ length: state.filteredCount }, (_, index) =>
        state.buffer.bySeq(state.filteredSeqs[state.filteredHead + index]),
      ).map((entry) => entry?.tag),
    ).toEqual(["Even", "Even"]);
  });

  it("keeps the last valid AST and index active when a query is invalid", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(0), line(1)], 7);
    useLogcatStore.getState().commitQuery("tag:Even");
    const validState = useLogcatStore.getState();
    const activeAst = validState.compiledQuery;
    const filteredSeqs = validState.filteredSeqs.slice(validState.filteredHead);

    useLogcatStore.getState().commitQuery("tag:Even & ");
    let state = useLogcatStore.getState();
    expect(state.queryInput).toBe("tag:Even & ");
    expect(state.activeQuery).toBe("tag:Even");
    expect(state.compiledQuery).toBe(activeAst);
    expect(state.queryError).toMatchObject({ ok: false, start: 9, end: 10 });
    expect(state.filteredSeqs.slice(state.filteredHead)).toEqual(filteredSeqs);
    expect(state.filteredCount).toBe(1);

    useLogcatStore.getState().appendBatch([line(2), line(3)], 7);
    state = useLogcatStore.getState();
    expect(state.filteredCount).toBe(2);
    expect(state.buffer.bySeq(state.filteredSeqs[state.filteredSeqs.length - 1])?.tag).toBe("Even");
  });

  it("does not publish the same invalid query error repeatedly", () => {
    useLogcatStore.getState().commitQuery("tag:Even & ");
    const firstError = useLogcatStore.getState().queryError;
    let updates = 0;
    const unsubscribe = useLogcatStore.subscribe(() => {
      updates += 1;
    });

    useLogcatStore.getState().commitQuery("tag:Even & ");
    unsubscribe();

    expect(useLogcatStore.getState().queryError).toBe(firstError);
    expect(updates).toBe(0);
  });

  it("appends safely formatted tag queries and removes exact duplicates", () => {
    beginSession();
    const tag = 'Tag with (group) & pipe|quote"slash\\dash-';
    useLogcatStore.getState().appendBatch(
      [line(0, "I", { tag }), line(1, "I", { tag: "Other" })],
      7,
    );
    const fragment = `tag=:${formatQueryValue(tag)}`;

    useLogcatStore.getState().appendToQuery(fragment);
    let state = useLogcatStore.getState();
    expect(state.queryInput).toBe(fragment);
    expect(state.activeQuery).toBe(fragment);
    expect(state.filteredCount).toBe(1);
    const revision = state.revision;

    useLogcatStore.getState().appendToQuery(fragment);
    state = useLogcatStore.getState();
    expect(state.activeQuery).toBe(fragment);
    expect(state.revision).toBe(revision);

    useLogcatStore.getState().commitQuery("tag:");
    expect(useLogcatStore.getState().queryError).not.toBeNull();
    useLogcatStore.getState().appendToQuery(fragment);
    state = useLogcatStore.getState();
    expect(state.queryInput).toBe(fragment);
    expect(state.activeQuery).toBe(fragment);
    expect(state.queryError).toBeNull();
  });

  it("groups an OR query before appending a tag shortcut", () => {
    beginSession();
    useLogcatStore.getState().appendBatch(
      [
        line(0, "I", { tag: "Foo", message: "ordinary" }),
        line(1, "E", { tag: "Bar", message: "ordinary" }),
      ],
      7,
    );
    useLogcatStore.getState().commitQuery("tag:Foo | level:ERROR");

    useLogcatStore.getState().appendToQuery("tag:Bar");

    const state = useLogcatStore.getState();
    expect(state.activeQuery).toBe("(tag:Foo | level:ERROR) tag:Bar");
    expect(state.filteredCount).toBe(1);
    expect(state.buffer.bySeq(state.filteredSeqs[state.filteredHead])?.tag).toBe("Bar");
  });

  it("appends a tag shortcut to the latest valid input draft", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("message:ordinary");
    useLogcatStore.getState().setQueryInput("message:ordinary level:WARN");

    useLogcatStore.getState().appendToQuery("tag:Bar");

    const state = useLogcatStore.getState();
    expect(state.queryInput).toBe("message:ordinary level:WARN tag:Bar");
    expect(state.activeQuery).toBe("message:ordinary level:WARN tag:Bar");
    expect(state.queryError).toBeNull();
  });

  it("commits a valid draft when its tag shortcut is already present", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("message:old");
    useLogcatStore.getState().setQueryInput("message:new tag:Even");

    useLogcatStore.getState().appendToQuery("tag:Even");

    const state = useLogcatStore.getState();
    expect(state.queryInput).toBe("message:new tag:Even");
    expect(state.activeQuery).toBe("message:new tag:Even");
  });

  it("groups a valid OR draft before appending a tag shortcut", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("message:old");
    useLogcatStore.getState().setQueryInput("tag:Foo | level:ERROR");

    useLogcatStore.getState().appendToQuery("tag:Bar");

    expect(useLogcatStore.getState().activeQuery).toBe(
      "(tag:Foo | level:ERROR) tag:Bar",
    );
  });

  it("does not treat a negated tag reference as an existing positive shortcut", () => {
    beginSession();
    useLogcatStore.getState().appendBatch(
      [line(0, "I", { tag: "Noise", message: "keep" })],
      7,
    );
    useLogcatStore.getState().commitQuery("-tag:Noise | message:keep");

    useLogcatStore.getState().appendToQuery("tag:Noise");

    const state = useLogcatStore.getState();
    expect(state.activeQuery).toBe("(-tag:Noise | message:keep) tag:Noise");
    expect(state.filteredCount).toBe(1);
  });

  it("ignores invalid query fragments", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("tag:Even");
    const stateBefore = useLogcatStore.getState();

    useLogcatStore.getState().appendToQuery("tag:");

    const state = useLogcatStore.getState();
    expect(state.queryInput).toBe("tag:Even");
    expect(state.activeQuery).toBe("tag:Even");
    expect(state.compiledQuery).toBe(stateBefore.compiledQuery);
    expect(state.revision).toBe(stateBefore.revision);
  });

  it("freezes fresh process identities and resolves package:mine from the foreground package", () => {
    beginSession();
    const updatedAt = Date.now();
    useLogcatStore.getState().beginProcessMapSession("process-a");
    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [
        { pid: "100", name: "com.example.app" },
        { pid: "200", name: "com.example.app:remote" },
      ],
      updatedAt,
    );
    useLogcatStore.getState().appendBatch(
      [line(0, "I", { pid: "100" }), line(1, "I", { pid: "200" })],
      7,
    );
    useLogcatStore.getState().setCurrentPackage("com.example.app");
    useLogcatStore.getState().commitQuery("package:mine");

    let state = useLogcatStore.getState();
    expect(state.packageRefs).toEqual(["mine"]);
    expect(state.filteredCount).toBe(2);
    expect(state.buffer.at(0)?.processName).toBe("com.example.app");
    expect(state.buffer.at(1)?.processName).toBe("com.example.app:remote");
    expect(state.buffer.at(1)?.packageName).toBe("com.example.app");

    const revision = state.revision;
    useLogcatStore.getState().setCurrentPackage("com.other.app");
    state = useLogcatStore.getState();
    expect(state.filteredCount).toBe(0);
    expect(state.revision).toBe(revision + 1);
  });

  it("ignores a process snapshot from a stale generation", () => {
    useLogcatStore.getState().beginProcessMapSession("generation-a");
    useLogcatStore.getState().beginProcessMapSession("generation-b");
    const current = useLogcatStore.getState();

    useLogcatStore.getState().completeProcessMapRefresh(
      "generation-a",
      [{ pid: "100", name: "com.old.app" }],
      Date.now(),
    );
    let state = useLogcatStore.getState();
    expect(state.processMapKey).toBe("generation-b");
    expect(state.processMapLoading).toBe(true);
    expect(state.processMap).toBe(current.processMap);
    expect(state.processMapUpdatedAt).toBe(0);

    useLogcatStore.getState().completeProcessMapRefresh(
      "generation-b",
      [{ pid: "200", name: "com.current.app" }],
      Date.now(),
    );
    state = useLogcatStore.getState();
    expect(state.processMapLoading).toBe(false);
    expect(state.processMap).toEqual(new Map([["200", "com.current.app"]]));
  });

  it("retains a failed snapshot without extending its trust window", () => {
    beginSession();
    const expiredAt = Date.now() - PROCESS_MAP_TTL_MS - 1;
    useLogcatStore.getState().beginProcessMapSession("process-a");
    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [{ pid: "100", name: "com.example.app" }],
      expiredAt,
    );

    const previousMap = useLogcatStore.getState().processMap;
    useLogcatStore.getState().beginProcessMapRefresh("process-a");
    useLogcatStore.getState().failProcessMapRefresh("process-a", "device offline");
    useLogcatStore.getState().appendBatch([line(0, "I", { pid: "100" })], 7);

    const state = useLogcatStore.getState();
    expect(state.processMapLoading).toBe(false);
    expect(state.processMapError).toBe("device offline");
    expect(state.processMap).toBe(previousMap);
    expect(state.processMapUpdatedAt).toBe(expiredAt);
    expect(state.buffer.at(0)?.processName).toBeNull();
    expect(state.buffer.at(0)?.packageName).toBeNull();
  });

  it("never reinterprets historical rows after a PID is reused", () => {
    beginSession();
    useLogcatStore.getState().beginProcessMapSession("process-a");
    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [{ pid: "100", name: "com.first.app" }],
      Date.now(),
    );
    useLogcatStore.getState().appendBatch([line(0, "I", { pid: "100" })], 7);
    const revision = useLogcatStore.getState().revision;

    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [{ pid: "100", name: "com.second.app" }],
      Date.now(),
    );
    expect(useLogcatStore.getState().revision).toBe(revision);
    useLogcatStore.getState().appendBatch([line(1, "I", { pid: "100" })], 7);

    const state = useLogcatStore.getState();
    expect(state.buffer.at(0)?.packageName).toBe("com.first.app");
    expect(state.buffer.at(1)?.packageName).toBe("com.second.app");
  });

  it("queues rows while paused and filters them with the latest query on resume", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(0)], 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(1), line(2)], 7);

    expect(useLogcatStore.getState().totalCount).toBe(1);
    expect(useLogcatStore.getState().pausedBacklog).toBe(2);

    useLogcatStore.getState().commitQuery("tag:Odd");
    expect(useLogcatStore.getState().filteredCount).toBe(0);
    useLogcatStore.getState().resume();
    const state = useLogcatStore.getState();
    expect(state.streamMode).toBe("live");
    expect(state.followMode).toBe("follow");
    expect(state.detachedNewCount).toBe(0);
    expect(state.anchoredSeq).toBeNull();
    expect(state.pausedBacklog).toBe(0);
    expect(state.totalCount).toBe(3);
    expect(state.filteredCount).toBe(1);
    expect(state.buffer.bySeq(state.filteredSeqs[state.filteredHead])?.tag).toBe("Odd");
  });

  it("freezes paused process identity at arrival and never backfills unknown history", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(0, "I", { pid: "100" })], 7);
    useLogcatStore.getState().beginProcessMapSession("process-a");
    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [{ pid: "100", name: "com.first.app" }],
      Date.now(),
    );
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(1, "I", { pid: "100" })], 7);
    useLogcatStore.getState().completeProcessMapRefresh(
      "process-a",
      [{ pid: "100", name: "com.second.app" }],
      Date.now(),
    );

    useLogcatStore.getState().resume();

    const state = useLogcatStore.getState();
    expect(state.buffer.at(0)?.packageName).toBeNull();
    expect(state.buffer.at(1)?.packageName).toBe("com.first.app");
  });

  it("keeps an anchored visible snapshot unchanged across paused stream frames", () => {
    beginSession();
    useLogcatStore.getState().commitQuery("tag:Even");
    useLogcatStore.getState().appendBatch([line(0), line(1), line(2)], 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(2);
    useLogcatStore.getState().pause();

    const before = useLogcatStore.getState();
    const visibleRows = Array.from(
      { length: before.buffer.count },
      (_, index) => before.buffer.at(index)?.raw,
    );
    const filteredSeqs = before.filteredSeqs.slice();

    useLogcatStore.getState().flushFrame([line(3), line(4)], 7, null);
    useLogcatStore.getState().flushFrame([line(5), line(6)], 7, null);

    const after = useLogcatStore.getState();
    expect(after.streamMode).toBe("paused");
    expect(after.followMode).toBe("detached");
    expect(after.anchoredSeq).toBe(2);
    expect(after.buffer).toBe(before.buffer);
    expect(Array.from(
      { length: after.buffer.count },
      (_, index) => after.buffer.at(index)?.raw,
    )).toEqual(visibleRows);
    expect(after.filteredSeqs).toBe(before.filteredSeqs);
    expect(after.filteredSeqs).toEqual(filteredSeqs);
    expect(after.filteredHead).toBe(before.filteredHead);
    expect(after.filteredCount).toBe(before.filteredCount);
    expect(after.totalCount).toBe(before.totalCount);
    expect(after.revision).toBe(before.revision);
    expect(after.nextSeq).toBe(before.nextSeq);
    expect(after.detachedNewCount).toBe(before.detachedNewCount);
    expect(after.pendingLines.slice(after.pendingHead).map((entry) => entry.line.raw)).toEqual([
      "raw-3",
      "raw-4",
      "raw-5",
      "raw-6",
    ]);
    expect(after.pausedBacklog).toBe(4);
  });

  it.each([
    {
      streamMode: "live" as const,
      followMode: "follow" as const,
      expectedTotal: 1,
      expectedBacklog: 0,
      expectedDetached: 0,
    },
    {
      streamMode: "live" as const,
      followMode: "detached" as const,
      expectedTotal: 1,
      expectedBacklog: 0,
      expectedDetached: 1,
    },
    {
      streamMode: "paused" as const,
      followMode: "follow" as const,
      expectedTotal: 0,
      expectedBacklog: 1,
      expectedDetached: 0,
    },
    {
      streamMode: "paused" as const,
      followMode: "detached" as const,
      expectedTotal: 0,
      expectedBacklog: 1,
      expectedDetached: 0,
    },
  ])(
    "handles $streamMode + $followMode as independent states",
    ({ streamMode, followMode, expectedTotal, expectedBacklog, expectedDetached }) => {
      beginSession();
      if (streamMode === "paused") {
        useLogcatStore.getState().pause();
      }
      useLogcatStore.getState().setFollowMode(followMode);
      useLogcatStore.getState().appendBatch([line(0)], 7);

      const state = useLogcatStore.getState();
      expect(state.streamMode).toBe(streamMode);
      expect(state.followMode).toBe(followMode);
      expect(state.totalCount).toBe(expectedTotal);
      expect(state.pausedBacklog).toBe(expectedBacklog);
      expect(state.detachedNewCount).toBe(expectedDetached);
    },
  );

  it("counts live detached rows and clears detached state when following resumes", () => {
    beginSession();
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().appendBatch([line(0), line(1)], 7);

    expect(useLogcatStore.getState().detachedNewCount).toBe(2);
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(2)], 7);
    expect(useLogcatStore.getState().detachedNewCount).toBe(2);

    useLogcatStore.getState().setFollowMode("follow");
    const state = useLogcatStore.getState();
    expect(state.streamMode).toBe("paused");
    expect(state.followMode).toBe("follow");
    expect(state.detachedNewCount).toBe(0);
    expect(state.anchoredSeq).toBeNull();
  });

  it("counts detached arrivals after the ring reaches capacity", () => {
    beginSession();
    const fullWindow = Array.from({ length: LOGCAT_CAPACITY }, (_, index) => line(index));
    useLogcatStore.getState().appendBatch(fullWindow, 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().appendBatch([line(LOGCAT_CAPACITY)], 7);

    const state = useLogcatStore.getState();
    expect(state.totalCount).toBe(LOGCAT_CAPACITY);
    expect(state.detachedNewCount).toBe(1);
  });

  it("clears an anchor after its row is evicted", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([
      line(0, "E", {
        tag: "AndroidRuntime",
        message: "FATAL EXCEPTION: main",
      }),
    ], 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().setSelectedSeq(0);
    useLogcatStore.getState().toggleCrashExpanded(0);

    const overflow = Array.from({ length: LOGCAT_CAPACITY }, (_, index) => line(index + 1));
    useLogcatStore.getState().appendBatch(overflow, 7);

    const state = useLogcatStore.getState();
    expect(state.buffer.bySeq(0)).toBeUndefined();
    expect(state.anchoredSeq).toBeNull();
    expect(state.selectedSeq).toBeNull();
    expect(state.expandedCrashSeqs.size).toBe(0);
  });

  it("bounds a paused backlog and drops its oldest rows", () => {
    beginSession();
    useLogcatStore.getState().pause();
    const backlog = Array.from({ length: LOGCAT_CAPACITY + 1 }, (_, index) => line(index));
    useLogcatStore.getState().appendBatch(backlog, 7);

    expect(useLogcatStore.getState().pausedBacklog).toBe(LOGCAT_CAPACITY);
    useLogcatStore.getState().resume();

    const state = useLogcatStore.getState();
    expect(state.totalCount).toBe(LOGCAT_CAPACITY);
    expect(state.buffer.at(0)?.message).toBe("message-1");
    expect(state.buffer.at(LOGCAT_CAPACITY - 1)?.message).toBe(`message-${LOGCAT_CAPACITY}`);
  });

  it("clears screen data without changing session identity", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(1)], 7);
    useLogcatStore.getState().commitQuery("tag:Odd");
    const activeAst = useLogcatStore.getState().compiledQuery;
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(2)], 7);
    useLogcatStore.getState().clearScreen();

    const state = useLogcatStore.getState();
    expect(state.serial).toBe("device-a");
    expect(state.sessionId).toBe(7);
    expect(state.streamMode).toBe("paused");
    expect(state.followMode).toBe("follow");
    expect(state.detachedNewCount).toBe(0);
    expect(state.anchoredSeq).toBeNull();
    expect(state.pausedBacklog).toBe(0);
    expect(state.queryInput).toBe("tag:Odd");
    expect(state.activeQuery).toBe("tag:Odd");
    expect(state.compiledQuery).toBe(activeAst);
    expect(state.queryError).toBeNull();
    expect(state.totalCount).toBe(0);
    expect(state.filteredCount).toBe(0);
  });

  it("restarts with a fresh session while preserving the query", () => {
    beginSession();
    useLogcatStore.getState().beginProcessMapSession("restart-processes");
    useLogcatStore.getState().completeProcessMapRefresh(
      "restart-processes",
      [{ pid: "0", name: "com.example.app" }],
      Date.now(),
    );
    useLogcatStore.getState().setCurrentPackage("com.example.app");
    useLogcatStore.getState().commitQuery("package:mine level:WARN tag:Even");
    useLogcatStore.getState().appendBatch([line(0, "W")], 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(1)], 7);
    const activeAst = useLogcatStore.getState().compiledQuery;
    const previousNonce = useLogcatStore.getState().restartNonce;

    useLogcatStore.getState().restart();
    useLogcatStore.getState().flushFrame([line(2)], 7, "old session");

    const state = useLogcatStore.getState();
    expect(state.serial).toBe("device-a");
    expect(state.sessionId).toBeNull();
    expect(state.streamState).toBe("starting");
    expect(state.disconnectDetail).toBe("");
    expect(state.streamMode).toBe("live");
    expect(state.followMode).toBe("follow");
    expect(state.detachedNewCount).toBe(0);
    expect(state.anchoredSeq).toBeNull();
    expect(state.pausedBacklog).toBe(0);
    expect(state.totalCount).toBe(0);
    expect(state.nextSeq).toBe(1);
    expect(state.queryInput).toBe("package:mine level:WARN tag:Even");
    expect(state.activeQuery).toBe("package:mine level:WARN tag:Even");
    expect(state.compiledQuery).toBe(activeAst);
    expect(state.queryError).toBeNull();
    expect(state.packageRefs).toEqual(["mine"]);
    expect(state.processMap.size).toBe(0);
    expect(state.processMapUpdatedAt).toBe(0);
    expect(state.processMapKey).toBeNull();
    expect(state.restartNonce).toBe(previousNonce + 1);
  });

  it("resets session and device data while preserving the query", () => {
    beginSession();
    useLogcatStore.getState().beginProcessMapSession("device-a-processes");
    useLogcatStore.getState().completeProcessMapRefresh(
      "device-a-processes",
      [{ pid: "0", name: "com.example.app" }],
      Date.now(),
    );
    useLogcatStore.getState().setCurrentPackage("com.example.app");
    useLogcatStore.getState().commitQuery("package:mine tag:Even");
    useLogcatStore.getState().appendBatch([line(0)], 7);
    useLogcatStore.getState().pause();
    useLogcatStore.getState().appendBatch([line(1)], 7);
    useLogcatStore.getState().setFollowMode("detached");
    useLogcatStore.getState().setAnchoredSeq(0);
    const activeAst = useLogcatStore.getState().compiledQuery;
    const restartNonce = useLogcatStore.getState().restartNonce;
    useLogcatStore.getState().reset();

    const state = useLogcatStore.getState();
    expect(state.serial).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.streamState).toBe("idle");
    expect(state.streamMode).toBe("live");
    expect(state.followMode).toBe("follow");
    expect(state.detachedNewCount).toBe(0);
    expect(state.anchoredSeq).toBeNull();
    expect(state.pausedBacklog).toBe(0);
    expect(state.queryInput).toBe("package:mine tag:Even");
    expect(state.activeQuery).toBe("package:mine tag:Even");
    expect(state.compiledQuery).toBe(activeAst);
    expect(state.queryError).toBeNull();
    expect(state.packageRefs).toEqual(["mine"]);
    expect(state.currentPackage).toBe("");
    expect(state.processMap.size).toBe(0);
    expect(state.processMapUpdatedAt).toBe(0);
    expect(state.processMapLoading).toBe(false);
    expect(state.processMapKey).toBeNull();
    expect(state.totalCount).toBe(0);
    expect(state.nextSeq).toBe(1);
    expect(state.restartNonce).toBe(restartNonce);

    beginSession(8);
    useLogcatStore.getState().appendBatch([line(2, "I", { pid: "0" })], 8);
    expect(useLogcatStore.getState().totalCount).toBe(1);
    expect(useLogcatStore.getState().filteredCount).toBe(0);
  });

  it("never reuses sequence values after clearing or replacing a session", () => {
    beginSession();
    useLogcatStore.getState().appendBatch([line(0)], 7);
    expect(useLogcatStore.getState().buffer.at(0)?.seq).toBe(0);

    useLogcatStore.getState().clearScreen();
    useLogcatStore.getState().appendBatch([line(1)], 7);
    expect(useLogcatStore.getState().buffer.at(0)?.seq).toBe(1);

    useLogcatStore.getState().restart();
    beginSession(8);
    useLogcatStore.getState().appendBatch([line(2)], 8);
    expect(useLogcatStore.getState().buffer.at(0)?.seq).toBe(2);

    useLogcatStore.getState().reset();
    beginSession(9);
    useLogcatStore.getState().appendBatch([line(3)], 9);

    const state = useLogcatStore.getState();
    expect(state.buffer.at(0)?.seq).toBe(3);
    expect(state.nextSeq).toBe(4);
  });
});
