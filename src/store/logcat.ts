import { create } from "zustand";
import {
  LOGCAT_CAPACITY,
  LogcatRingBuffer,
  normalizeLine,
  type LogcatEntry,
  type LogcatProcessIdentity,
} from "@/lib/logcat";
import {
  packageFromProcessName,
} from "@/lib/logcatView";
import {
  compileQuery,
  evaluate,
  type CompileFailure,
  type CompileSuccess,
  type EvalContext,
  type QueryNode,
} from "@/lib/logcatQuery";
import type {
  LogcatLine as BackendLogcatLine,
  ProcessEntry,
} from "@/lib/tauri";

export type LogcatStreamState = "idle" | "starting" | "live" | "disconnected";
export type LogcatStreamMode = "live" | "paused";
export type LogcatFollowMode = "follow" | "detached";

export const PROCESS_MAP_TTL_MS = 5_000;

interface PendingLogcatLine {
  line: BackendLogcatLine;
  identity: LogcatProcessIdentity;
}

export interface LogcatStore {
  serial: string | null;
  sessionId: number | null;
  streamState: LogcatStreamState;
  disconnectDetail: string;
  buffer: LogcatRingBuffer;
  filteredSeqs: number[];
  filteredHead: number;
  totalCount: number;
  filteredCount: number;
  revision: number;
  streamMode: LogcatStreamMode;
  followMode: LogcatFollowMode;
  detachedNewCount: number;
  anchoredSeq: number | null;
  selectedSeq: number | null;
  pausedBacklog: number;
  queryInput: string;
  activeQuery: string;
  compiledQuery: QueryNode;
  queryError: CompileFailure | null;
  packageRefs: string[];
  processRefs: string[];
  currentPackage: string;
  processMap: Map<string, string>;
  processMapUpdatedAt: number;
  processMapLoading: boolean;
  processMapKey: string | null;
  processMapError: string | null;
  expandedCrashSeqs: Set<number>;
  pendingLines: PendingLogcatLine[];
  pendingHead: number;
  nextSeq: number;
  restartNonce: number;
  beginSession: (serial: string, sessionId: number) => void;
  flushFrame: (
    lines: BackendLogcatLine[],
    sessionId: number,
    disconnectDetail: string | null,
  ) => void;
  appendBatch: (lines: BackendLogcatLine[], sessionId: number) => void;
  markDisconnected: (sessionId: number, detail: string) => void;
  markDeviceUnavailable: (detail: string) => void;
  failStart: (detail: string) => void;
  setStreamState: (state: LogcatStreamState) => void;
  setQueryInput: (value: string) => void;
  commitQuery: (value: string) => void;
  appendToQuery: (fragment: string) => void;
  setCurrentPackage: (packageName: string) => void;
  beginProcessMapSession: (key: string) => void;
  beginProcessMapRefresh: (key: string) => void;
  completeProcessMapRefresh: (
    key: string,
    entries: ProcessEntry[],
    updatedAt: number,
  ) => void;
  failProcessMapRefresh: (key: string, error: string) => void;
  clearProcessMap: () => void;
  setFollowMode: (mode: LogcatFollowMode) => void;
  setAnchoredSeq: (seq: number | null) => void;
  setSelectedSeq: (seq: number | null) => void;
  toggleCrashExpanded: (seq: number) => void;
  pause: () => void;
  resume: () => void;
  clearScreen: () => void;
  restart: () => void;
  reset: () => void;
}

const FILTER_COMPACTION_THRESHOLD = Math.floor(LOGCAT_CAPACITY / 2);
const EMPTY_QUERY: QueryNode = { type: "always" };

function retainedExpandedCrashSeqs(state: LogcatStore): Set<number> {
  let retained: Set<number> | null = null;
  for (const seq of state.expandedCrashSeqs) {
    if (state.buffer.bySeq(seq)?.crashKind === "crash") {
      continue;
    }
    retained ??= new Set(state.expandedCrashSeqs);
    retained.delete(seq);
  }
  return retained ?? state.expandedCrashSeqs;
}

function sameCompileFailure(left: CompileFailure | null, right: CompileFailure): boolean {
  return left !== null &&
    left.message === right.message &&
    left.start === right.start &&
    left.end === right.end;
}

function sameTagPredicate(left: QueryNode, right: QueryNode): boolean {
  if (left.type !== "tag" || right.type !== "tag" || left.match.kind !== right.match.kind) {
    return false;
  }
  switch (left.match.kind) {
    case "contains":
      return right.match.kind === "contains" && left.match.lowered === right.match.lowered;
    case "exact":
      return right.match.kind === "exact" && left.match.value === right.match.value;
    case "regex":
      return false;
  }
}

function hasTopLevelTagConjunct(query: QueryNode, candidate: QueryNode): boolean {
  if (sameTagPredicate(query, candidate)) {
    return true;
  }
  return query.type === "and" && query.children.some((child) => sameTagPredicate(child, candidate));
}

function rebuildFilteredIndex(
  state: LogcatStore,
  query: QueryNode,
  currentPackage: string,
): void {
  const context: EvalContext = { currentPackage };
  state.filteredSeqs.length = 0;
  state.filteredHead = 0;
  for (let index = 0; index < state.buffer.count; index += 1) {
    const entry = state.buffer.at(index);
    if (entry && evaluate(entry, query, context)) {
      state.filteredSeqs.push(entry.seq);
    }
  }
}

function appendEntries(state: LogcatStore, entries: LogcatEntry[]): void {
  const context: EvalContext = { currentPackage: state.currentPackage };
  for (const entry of entries) {
    state.buffer.push(entry);
    if (evaluate(entry, state.compiledQuery, context)) {
      state.filteredSeqs.push(entry.seq);
    }
  }

  if (state.buffer.count > 0) {
    const oldestSeq = state.buffer.oldestSeq;
    while (
      state.filteredHead < state.filteredSeqs.length &&
      state.filteredSeqs[state.filteredHead] < oldestSeq
    ) {
      state.filteredHead += 1;
    }
  }

  if (state.filteredHead > FILTER_COMPACTION_THRESHOLD) {
    state.filteredSeqs.splice(0, state.filteredHead);
    state.filteredHead = 0;
  }
}

export function isProcessMapFresh(updatedAt: number, now: number): boolean {
  const age = now - updatedAt;
  return updatedAt > 0 && age >= 0 && age <= PROCESS_MAP_TTL_MS;
}

function processIdentityForPid(
  processMap: ReadonlyMap<string, string>,
  processMapUpdatedAt: number,
  pid: string,
  now: number,
): LogcatProcessIdentity {
  if (!isProcessMapFresh(processMapUpdatedAt, now)) {
    return { processName: null, packageName: null };
  }
  const processName = processMap.get(pid) ?? null;
  return {
    processName,
    packageName: processName === null ? null : packageFromProcessName(processName),
  };
}

function normalizeBatch(
  lines: BackendLogcatLine[],
  firstSeq: number,
  processMap: ReadonlyMap<string, string>,
  processMapUpdatedAt: number,
  now: number,
): { entries: LogcatEntry[]; nextSeq: number } {
  let nextSeq = firstSeq;
  const entries = lines.map((line) => {
    const entry = normalizeLine(
      line,
      nextSeq,
      processIdentityForPid(processMap, processMapUpdatedAt, line.pid, now),
    );
    nextSeq += 1;
    return entry;
  });
  return { entries, nextSeq };
}

function normalizePendingBatch(
  pendingLines: PendingLogcatLine[],
  firstSeq: number,
): { entries: LogcatEntry[]; nextSeq: number } {
  let nextSeq = firstSeq;
  const entries = pendingLines.map(({ line, identity }) => {
    const entry = normalizeLine(line, nextSeq, identity);
    nextSeq += 1;
    return entry;
  });
  return { entries, nextSeq };
}

function queuePausedLines(state: LogcatStore, lines: BackendLogcatLine[], now: number): void {
  state.pendingLines.push(
    ...lines.map((line) => ({
      line,
      identity: processIdentityForPid(
        state.processMap,
        state.processMapUpdatedAt,
        line.pid,
        now,
      ),
    })),
  );
  const pendingCount = state.pendingLines.length - state.pendingHead;
  if (pendingCount > LOGCAT_CAPACITY) {
    state.pendingHead += pendingCount - LOGCAT_CAPACITY;
  }
  if (state.pendingHead > LOGCAT_CAPACITY) {
    state.pendingLines.splice(0, state.pendingHead);
    state.pendingHead = 0;
  }
}

function applyStreamFrame(
  state: LogcatStore,
  lines: BackendLogcatLine[],
  sessionId: number,
  disconnectDetail: string | null,
): Partial<LogcatStore> | LogcatStore {
  if (state.sessionId !== sessionId) {
    return state;
  }

  const update: Partial<LogcatStore> = {};
  if (lines.length > 0) {
    const now = Date.now();
    if (state.streamMode === "paused") {
      queuePausedLines(state, lines, now);
      update.pausedBacklog = state.pendingLines.length - state.pendingHead;
    } else {
      const { entries, nextSeq } = normalizeBatch(
        lines,
        state.nextSeq,
        state.processMap,
        state.processMapUpdatedAt,
        now,
      );
      appendEntries(state, entries);
      update.nextSeq = nextSeq;
      update.totalCount = state.buffer.count;
      update.filteredCount = state.filteredSeqs.length - state.filteredHead;
      update.revision = state.revision + 1;
      if (state.followMode === "detached") {
        update.detachedNewCount = state.detachedNewCount + lines.length;
      }
      if (state.anchoredSeq !== null && state.buffer.bySeq(state.anchoredSeq) === undefined) {
        update.anchoredSeq = null;
      }
      if (state.selectedSeq !== null && state.buffer.bySeq(state.selectedSeq) === undefined) {
        update.selectedSeq = null;
      }
      const expandedCrashSeqs = retainedExpandedCrashSeqs(state);
      if (expandedCrashSeqs !== state.expandedCrashSeqs) {
        update.expandedCrashSeqs = expandedCrashSeqs;
      }
    }
  }

  if (disconnectDetail !== null) {
    update.streamState = "disconnected";
    update.disconnectDetail = disconnectDetail;
  }

  return Object.keys(update).length === 0 ? state : update;
}

function applyCompiledQuery(
  state: LogcatStore,
  input: string,
  result: CompileSuccess,
): Partial<LogcatStore> {
  rebuildFilteredIndex(state, result.ast, state.currentPackage);
  return {
    queryInput: input,
    activeQuery: input,
    compiledQuery: result.ast,
    queryError: null,
    packageRefs: result.packageRefs,
    processRefs: result.processRefs,
    filteredCount: state.filteredSeqs.length,
    revision: state.revision + 1,
  };
}

export const useLogcatStore = create<LogcatStore>((set) => ({
  serial: null,
  sessionId: null,
  streamState: "idle",
  disconnectDetail: "",
  buffer: new LogcatRingBuffer(),
  filteredSeqs: [],
  filteredHead: 0,
  totalCount: 0,
  filteredCount: 0,
  revision: 0,
  streamMode: "live",
  followMode: "follow",
  detachedNewCount: 0,
  anchoredSeq: null,
  selectedSeq: null,
  pausedBacklog: 0,
  queryInput: "",
  activeQuery: "",
  compiledQuery: EMPTY_QUERY,
  queryError: null,
  packageRefs: [],
  processRefs: [],
  currentPackage: "",
  processMap: new Map(),
  processMapUpdatedAt: 0,
  processMapLoading: false,
  processMapKey: null,
  processMapError: null,
  expandedCrashSeqs: new Set(),
  pendingLines: [],
  pendingHead: 0,
  nextSeq: 0,
  restartNonce: 0,
  beginSession: (serial, sessionId) => {
    set({ serial, sessionId, streamState: "live", disconnectDetail: "" });
  },
  flushFrame: (lines, sessionId, disconnectDetail) => {
    if (lines.length === 0 && disconnectDetail === null) {
      return;
    }
    set((state) => applyStreamFrame(state, lines, sessionId, disconnectDetail));
  },
  appendBatch: (lines, sessionId) => {
    if (lines.length === 0) {
      return;
    }
    set((state) => applyStreamFrame(state, lines, sessionId, null));
  },
  markDisconnected: (sessionId, detail) => {
    set((state) => applyStreamFrame(state, [], sessionId, detail));
  },
  markDeviceUnavailable: (disconnectDetail) => {
    set((state) =>
      state.serial === null
        ? state
        : { streamState: "disconnected", disconnectDetail },
    );
  },
  failStart: (disconnectDetail) => {
    set({ streamState: "disconnected", disconnectDetail });
  },
  setStreamState: (streamState) => set({ streamState }),
  setQueryInput: (queryInput) => {
    set((state) => (state.queryInput === queryInput ? state : { queryInput }));
  },
  commitQuery: (value) => {
    const result = compileQuery(value);
    set((state) => {
      if (result.ok) {
        return state.queryInput === value &&
          state.activeQuery === value &&
          state.queryError === null
          ? state
          : applyCompiledQuery(state, value, result);
      }
      return state.queryInput === value && sameCompileFailure(state.queryError, result)
        ? state
        : { queryInput: value, queryError: result };
    });
  },
  appendToQuery: (fragment) => {
    const fragmentResult = compileQuery(fragment);
    if (!fragmentResult.ok) {
      return;
    }
    set((state) => {
      let baseInput = state.queryInput;
      let baseResult = compileQuery(baseInput);
      if (!baseResult.ok) {
        baseInput = state.activeQuery;
        baseResult = compileQuery(baseInput);
      }
      if (!baseResult.ok) {
        return state;
      }
      if (hasTopLevelTagConjunct(baseResult.ast, fragmentResult.ast)) {
        if (baseInput !== state.activeQuery) {
          return applyCompiledQuery(state, baseInput, baseResult);
        }
        return state.queryInput === state.activeQuery && state.queryError === null
          ? state
          : { queryInput: state.activeQuery, queryError: null };
      }
      const base = baseInput.trim();
      const groupedBase = baseResult.ast.type === "or" ? `(${base})` : base;
      const input = groupedBase ? `${groupedBase} ${fragment}` : fragment;
      const result = compileQuery(input);
      return result.ok ? applyCompiledQuery(state, input, result) : state;
    });
  },
  setCurrentPackage: (currentPackage) => {
    set((state) => {
      if (state.currentPackage === currentPackage) {
        return state;
      }
      if (!state.packageRefs.includes("mine")) {
        return { currentPackage };
      }
      rebuildFilteredIndex(state, state.compiledQuery, currentPackage);
      return {
        currentPackage,
        filteredCount: state.filteredSeqs.length,
        revision: state.revision + 1,
      };
    });
  },
  beginProcessMapSession: (key) => {
    set({
      processMap: new Map(),
      processMapUpdatedAt: 0,
      processMapLoading: true,
      processMapKey: key,
      processMapError: null,
    });
  },
  beginProcessMapRefresh: (key) => {
    set((state) => {
      if (state.processMapKey !== key) {
        return state;
      }
      return state.processMapLoading && state.processMapError === null
        ? state
        : { processMapLoading: true, processMapError: null };
    });
  },
  completeProcessMapRefresh: (key, entries, processMapUpdatedAt) => {
    set((state) => {
      if (state.processMapKey !== key) {
        return state;
      }
      const processMap = new Map<string, string>();
      for (const entry of entries) {
        processMap.set(entry.pid, entry.name);
      }
      return {
        processMap,
        processMapUpdatedAt,
        processMapLoading: false,
        processMapError: null,
      };
    });
  },
  failProcessMapRefresh: (key, processMapError) => {
    set((state) => {
      if (state.processMapKey !== key) {
        return state;
      }
      if (!state.processMapLoading && state.processMapError === processMapError) {
        return state;
      }
      return { processMapLoading: false, processMapError };
    });
  },
  clearProcessMap: () => {
    set((state) =>
      state.processMap.size === 0 &&
      state.processMapUpdatedAt === 0 &&
      !state.processMapLoading &&
      state.processMapKey === null &&
      state.processMapError === null
        ? state
        : {
            processMap: new Map(),
            processMapUpdatedAt: 0,
            processMapLoading: false,
            processMapKey: null,
            processMapError: null,
          },
    );
  },
  setFollowMode: (followMode) => {
    set((state) => {
      if (
        state.followMode === followMode &&
        (followMode === "detached" ||
          (state.detachedNewCount === 0 && state.anchoredSeq === null))
      ) {
        return state;
      }
      if (followMode === "follow") {
        return {
          followMode,
          detachedNewCount: 0,
          anchoredSeq: null,
        };
      }
      return { followMode };
    });
  },
  setAnchoredSeq: (anchoredSeq) => {
    set((state) => (state.anchoredSeq === anchoredSeq ? state : { anchoredSeq }));
  },
  setSelectedSeq: (selectedSeq) => {
    set((state) => {
      if (
        state.selectedSeq === selectedSeq ||
        (selectedSeq !== null && state.buffer.bySeq(selectedSeq) === undefined)
      ) {
        return state;
      }
      return { selectedSeq };
    });
  },
  toggleCrashExpanded: (seq) => {
    set((state) => {
      if (state.buffer.bySeq(seq)?.crashKind !== "crash") {
        return state;
      }
      const expandedCrashSeqs = new Set(state.expandedCrashSeqs);
      if (expandedCrashSeqs.has(seq)) {
        expandedCrashSeqs.delete(seq);
      } else {
        expandedCrashSeqs.add(seq);
      }
      return { expandedCrashSeqs };
    });
  },
  pause: () => {
    set((state) => (state.streamMode === "paused" ? state : { streamMode: "paused" }));
  },
  resume: () => {
    set((state) => {
      const pendingLines = state.pendingLines.slice(state.pendingHead);
      state.pendingLines.length = 0;
      state.pendingHead = 0;
      if (pendingLines.length === 0) {
        if (
          state.streamMode === "live" &&
          state.followMode === "follow" &&
          state.detachedNewCount === 0 &&
          state.anchoredSeq === null &&
          state.pausedBacklog === 0
        ) {
          return state;
        }
        return {
          streamMode: "live",
          followMode: "follow",
          detachedNewCount: 0,
          anchoredSeq: null,
          pausedBacklog: 0,
        };
      }

      const { entries, nextSeq } = normalizePendingBatch(pendingLines, state.nextSeq);
      appendEntries(state, entries);
      const expandedCrashSeqs = retainedExpandedCrashSeqs(state);
      return {
        streamMode: "live",
        followMode: "follow",
        detachedNewCount: 0,
        anchoredSeq: null,
        selectedSeq:
          state.selectedSeq !== null && state.buffer.bySeq(state.selectedSeq) !== undefined
            ? state.selectedSeq
            : null,
        expandedCrashSeqs,
        pausedBacklog: 0,
        nextSeq,
        totalCount: state.buffer.count,
        filteredCount: state.filteredSeqs.length - state.filteredHead,
        revision: state.revision + 1,
      };
    });
  },
  clearScreen: () => {
    set((state) => {
      state.buffer.clear();
      state.filteredSeqs.length = 0;
      state.pendingLines.length = 0;
      return {
        filteredHead: 0,
        pendingHead: 0,
        totalCount: 0,
        filteredCount: 0,
        pausedBacklog: 0,
        followMode: "follow",
        detachedNewCount: 0,
        anchoredSeq: null,
        selectedSeq: null,
        expandedCrashSeqs: new Set(),
        revision: state.revision + 1,
      };
    });
  },
  restart: () => {
    set((state) => {
      state.buffer.clear();
      state.filteredSeqs.length = 0;
      state.pendingLines.length = 0;
      return {
        sessionId: null,
        streamState: "starting",
        disconnectDetail: "",
        filteredHead: 0,
        pendingHead: 0,
        totalCount: 0,
        filteredCount: 0,
        revision: state.revision + 1,
        streamMode: "live",
        followMode: "follow",
        detachedNewCount: 0,
        anchoredSeq: null,
        selectedSeq: null,
        expandedCrashSeqs: new Set(),
        pausedBacklog: 0,
        processMap: new Map(),
        processMapUpdatedAt: 0,
        processMapLoading: false,
        processMapKey: null,
        processMapError: null,
        restartNonce: state.restartNonce + 1,
      };
    });
  },
  reset: () => {
    set((state) => ({
      serial: null,
      sessionId: null,
      streamState: "idle",
      disconnectDetail: "",
      buffer: new LogcatRingBuffer(),
      filteredSeqs: [],
      filteredHead: 0,
      totalCount: 0,
      filteredCount: 0,
      revision: state.revision + 1,
      streamMode: "live",
      followMode: "follow",
      detachedNewCount: 0,
      anchoredSeq: null,
      selectedSeq: null,
      expandedCrashSeqs: new Set(),
      pausedBacklog: 0,
      currentPackage: "",
      processMap: new Map(),
      processMapUpdatedAt: 0,
      processMapLoading: false,
      processMapKey: null,
      processMapError: null,
      pendingLines: [],
      pendingHead: 0,
    }));
  },
}));
