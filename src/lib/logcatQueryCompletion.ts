import {
  formatQueryValue,
  formatRegexQueryValue,
  LEVEL_NAMES,
  QUERY_IS_VALUES,
  QUERY_KEYS,
  QUERY_LEVEL_VALUES,
  type QueryKey,
} from "@/lib/logcatQuery";

export type QueryCompletionKind =
  | "key"
  | "operator"
  | "level"
  | "is"
  | "tag"
  | "package"
  | "process";

export interface QueryCompletionSources {
  tags: readonly string[];
  packages: readonly string[];
  processes: readonly string[];
}

export interface QueryCompletion {
  kind: QueryCompletionKind;
  label: string;
  insertText: string;
  detail?: string;
  replaceStart: number;
  replaceEnd: number;
}

export interface AppliedQueryCompletion {
  input: string;
  cursor: number;
}

interface TextRange {
  start: number;
  end: number;
}

interface QueryCompletionContext {
  term: TextRange;
  contentStart: number;
  negated: boolean;
  colon: number | null;
  modifier: "~" | "=" | null;
  keyEnd: number;
  key: QueryKey | null;
}

const EMPTY_SOURCES: QueryCompletionSources = { tags: [], packages: [], processes: [] };

function assertCursor(input: string, cursor: number): void {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > input.length) {
    throw new RangeError("Query completion cursor is outside the input");
  }
}

function isTermDelimiter(char: string): boolean {
  return /\s/.test(char) ||
    char === "&" ||
    char === "|" ||
    char === "-" ||
    char === "(" ||
    char === ")";
}

function collectTermRanges(input: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start: number | null = null;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }

    if (isTermDelimiter(char)) {
      if (start !== null) {
        ranges.push({ start, end: index });
        start = null;
      }
      continue;
    }

    if (start === null) {
      start = index;
    }
    if (char === '"') {
      quoted = true;
    }
  }

  if (start !== null) {
    ranges.push({ start, end: input.length });
  }
  return ranges;
}

function findTermRange(input: string, cursor: number): TextRange {
  const ranges = collectTermRanges(input);
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (cursor >= range.start && cursor <= range.end) {
      let start = range.start;
      while (start > 0 && input[start - 1] === "-") {
        start -= 1;
      }
      return { start, end: range.end };
    }
  }
  let start = cursor;
  while (start > 0 && input[start - 1] === "-") {
    start -= 1;
  }
  return { start, end: cursor };
}

function findKey(value: string): QueryKey | null {
  return QUERY_KEYS.find((key) => key === value) ?? null;
}

function supportsMatcherModifier(key: QueryKey): boolean {
  return key === "tag" || key === "message" || key === "process";
}

function queryCompletionContext(input: string, cursor: number): QueryCompletionContext {
  assertCursor(input, cursor);
  const term = findTermRange(input, cursor);
  let contentStart = term.start;
  while (contentStart < term.end && input[contentStart] === "-") {
    contentStart += 1;
  }
  const colonIndex = input.indexOf(":", contentStart);
  const colon = colonIndex >= contentStart && colonIndex < term.end ? colonIndex : null;
  const headerEnd = colon ?? term.end;
  const modifierChar = input[headerEnd - 1];
  const modifier = modifierChar === "~" || modifierChar === "=" ? modifierChar : null;
  const keyEnd = modifier === null ? headerEnd : headerEnd - 1;
  return {
    term,
    contentStart,
    negated: contentStart > term.start,
    colon,
    modifier,
    keyEnd,
    key: findKey(input.slice(contentStart, keyEnd)),
  };
}

export function getQueryValueKeyAtCursor(input: string, cursor: number): QueryKey | null {
  const context = queryCompletionContext(input, cursor);
  if (context.colon === null || cursor <= context.colon || context.key === null) {
    return null;
  }
  if (context.modifier !== null && !supportsMatcherModifier(context.key)) {
    return null;
  }
  return context.key;
}

function matchesPrefix(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function keyCompletions(
  prefix: string,
  modifier: "~" | "=" | null,
  replaceStart: number,
  replaceEnd: number,
  negated: boolean,
): QueryCompletion[] {
  const completions: QueryCompletion[] = [];
  if (!negated && prefix.length === 0 && modifier === null) {
    completions.push({
      kind: "operator",
      label: "-",
      insertText: "-",
      detail: "排除条件",
      replaceStart,
      replaceEnd,
    });
  }
  for (let index = 0; index < QUERY_KEYS.length; index += 1) {
    const key = QUERY_KEYS[index];
    if (!matchesPrefix(key, prefix)) {
      continue;
    }
    const supportedModifier = supportsMatcherModifier(key) ? modifier : null;
    const insertText = `${key}${supportedModifier ?? ""}:`;
    completions.push({
      kind: "key",
      label: insertText,
      insertText,
      replaceStart,
      replaceEnd,
    });
  }
  return completions;
}

function valueCompletion(
  kind: Exclude<QueryCompletionKind, "key" | "operator">,
  value: string,
  label: string,
  replaceStart: number,
  replaceEnd: number,
  detail?: string,
): QueryCompletion {
  return {
    kind,
    label,
    insertText: formatQueryValue(value),
    detail,
    replaceStart,
    replaceEnd,
  };
}

function decodeValuePrefix(raw: string): string {
  if (!raw.startsWith('"')) {
    return raw.split("\\").join(" ");
  }

  let value = "";
  for (let index = 1; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') {
      break;
    }
    if (char !== "\\") {
      value += char;
      continue;
    }

    const next = raw[index + 1];
    if (next === '"' || next === "\\") {
      value += next;
      index += 1;
    } else {
      value += "\\";
    }
  }
  return value;
}

function valueCompletions(
  key: QueryKey,
  modifier: "~" | "=" | null,
  prefix: string,
  replaceStart: number,
  replaceEnd: number,
  sources: QueryCompletionSources,
): QueryCompletion[] {
  switch (key) {
    case "level": {
      const completions: QueryCompletion[] = [];
      for (let index = 0; index < QUERY_LEVEL_VALUES.length; index += 1) {
        const value = QUERY_LEVEL_VALUES[index];
        const level = LEVEL_NAMES[value];
        if (level === undefined) {
          throw new Error(`Missing level mapping for query completion: ${value}`);
        }
        if (!matchesPrefix(value, prefix) && !matchesPrefix(level, prefix)) {
          continue;
        }
        completions.push(
          valueCompletion("level", value, `${value} (${level})`, replaceStart, replaceEnd),
        );
      }
      return completions;
    }
    case "is":
      return QUERY_IS_VALUES.filter((value) => matchesPrefix(value, prefix)).map((value) =>
        valueCompletion("is", value, value, replaceStart, replaceEnd),
      );
    case "tag":
      return uniqueNonEmpty(sources.tags)
        .filter((value) => matchesPrefix(value, prefix))
        .map((value) => {
          const completion = valueCompletion("tag", value, value, replaceStart, replaceEnd);
          return modifier === "~"
            ? { ...completion, insertText: formatRegexQueryValue(value) }
            : completion;
        });
    case "package":
      return uniqueNonEmpty(["mine", ...sources.packages])
        .filter((value) => matchesPrefix(value, prefix))
        .map((value) =>
          valueCompletion(
            "package",
            value,
            value,
            replaceStart,
            replaceEnd,
            value === "mine" ? "当前前台应用" : undefined,
          ),
        );
    case "process":
      return uniqueNonEmpty(sources.processes)
        .filter((value) => matchesPrefix(value, prefix))
        .map((value) => {
          const completion = valueCompletion("process", value, value, replaceStart, replaceEnd);
          return modifier === "~"
            ? { ...completion, insertText: formatRegexQueryValue(value) }
            : completion;
        });
    case "message":
      return [];
  }
}

export function getQueryCompletions(
  input: string,
  cursor: number,
  sources: QueryCompletionSources = EMPTY_SOURCES,
): QueryCompletion[] {
  const { term, contentStart, negated, colon, modifier, keyEnd, key } =
    queryCompletionContext(input, cursor);

  if (colon === null || cursor <= colon || key === null) {
    const prefixEnd = Math.max(contentStart, Math.min(cursor, keyEnd));
    return keyCompletions(
      input.slice(contentStart, prefixEnd),
      modifier,
      contentStart,
      colon === null ? term.end : colon + 1,
      negated,
    );
  }

  if (modifier !== null && !supportsMatcherModifier(key)) {
    return [];
  }

  const valueStart = colon + 1;
  const prefix = decodeValuePrefix(input.slice(valueStart, cursor));
  return valueCompletions(key, modifier, prefix, valueStart, term.end, sources);
}

export function applyQueryCompletion(
  input: string,
  completion: QueryCompletion,
): AppliedQueryCompletion {
  const { replaceStart, replaceEnd, insertText } = completion;
  if (
    !Number.isInteger(replaceStart) ||
    !Number.isInteger(replaceEnd) ||
    replaceStart < 0 ||
    replaceStart > replaceEnd ||
    replaceEnd > input.length
  ) {
    throw new RangeError("Query completion replacement is outside the input");
  }

  return {
    input: `${input.slice(0, replaceStart)}${insertText}${input.slice(replaceEnd)}`,
    cursor: replaceStart + insertText.length,
  };
}
