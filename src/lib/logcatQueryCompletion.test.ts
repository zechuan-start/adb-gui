import { describe, expect, it } from "vitest";
import {
  applyQueryCompletion,
  getQueryCompletions,
  getQueryValueKeyAtCursor,
  type QueryCompletion,
  type QueryCompletionSources,
} from "@/lib/logcatQueryCompletion";
import { compileQuery, QUERY_KEYS } from "@/lib/logcatQuery";

const SOURCES: QueryCompletionSources = {
  tags: ["ActivityManager", "AudioService", "Tag with spaces", "ActivityManager", ""],
  packages: ["com.example.app", "mine", "my.example.app", ""],
  processes: [
    "com.example.app",
    "com.example.app:remote",
    "system_server",
    "com.example.app:remote",
    "",
  ],
};

function completion(input: string, cursor: number, label: string): QueryCompletion {
  const result = getQueryCompletions(input, cursor, SOURCES).find(
    (candidate) => candidate.label === label,
  );
  if (result === undefined) {
    throw new Error(`Missing completion ${label}`);
  }
  return result;
}

describe("getQueryCompletions", () => {
  it("offers every parser-owned key for an empty term", () => {
    const results = getQueryCompletions("", 0);

    expect(results.map((candidate) => candidate.label)).toEqual([
      "-",
      ...QUERY_KEYS.map((key) => `${key}:`),
    ]);
    expect(results.every((candidate) => candidate.replaceStart === 0)).toBe(true);
    expect(results.every((candidate) => candidate.replaceEnd === 0)).toBe(true);
  });

  it("offers negation once at the start of a term", () => {
    const negation = completion("", 0, "-");
    expect(negation).toMatchObject({
      kind: "operator",
      insertText: "-",
      detail: "排除条件",
    });
    expect(applyQueryCompletion("", negation)).toEqual({ input: "-", cursor: 1 });
    expect(getQueryCompletions("-", 1).map((candidate) => candidate.label)).not.toContain("-");
  });

  it("filters key names by the prefix and replaces the whole current token", () => {
    const candidate = completion("levxx", 3, "level:");

    expect(candidate).toMatchObject({
      kind: "key",
      insertText: "level:",
      replaceStart: 0,
      replaceEnd: 5,
    });
    expect(applyQueryCompletion("levxx", candidate)).toEqual({ input: "level:", cursor: 6 });
  });

  it("preserves leading negation while replacing a partial key", () => {
    const candidate = completion("-lev", 4, "level:");

    expect(candidate).toMatchObject({ replaceStart: 1, replaceEnd: 4 });
    expect(applyQueryCompletion("-lev", candidate)).toEqual({ input: "-level:", cursor: 7 });
  });

  it("preserves supported tag, message, and process modifiers", () => {
    expect(completion("ta~", 3, "tag~:")).toMatchObject({ insertText: "tag~:" });
    expect(completion("message=", 8, "message=:")).toMatchObject({ insertText: "message=:" });
    expect(completion("process~", 8, "process~:")).toMatchObject({ insertText: "process~:" });
    expect(completion("process=", 8, "process=:")).toMatchObject({ insertText: "process=:" });
  });

  it("repairs an unknown key header without deleting its value", () => {
    const input = "lev:WARN";
    const candidate = completion(input, input.length, "level:");

    expect(candidate).toMatchObject({ replaceStart: 0, replaceEnd: 4 });
    expect(applyQueryCompletion(input, candidate)).toEqual({ input: "level:WARN", cursor: 6 });
  });

  it("offers level values with their parser-owned letter mapping", () => {
    const results = getQueryCompletions("level:w", 7);

    expect(results).toEqual([
      {
        kind: "level",
        label: "WARN (W)",
        insertText: "WARN",
        replaceStart: 6,
        replaceEnd: 7,
      },
    ]);
  });

  it("filters ASSERT by its accepted F letter alias", () => {
    expect(getQueryCompletions("level:F", 7).map((candidate) => candidate.label)).toEqual([
      "ASSERT (F)",
    ]);
  });

  it("replaces the complete value token when the cursor is in its middle", () => {
    const input = "tag:Foo level:WXYZ message:ready";
    const cursor = input.indexOf("WXYZ") + 1;
    const candidate = completion(input, cursor, "WARN (W)");

    expect(candidate).toMatchObject({
      replaceStart: input.indexOf("WXYZ"),
      replaceEnd: input.indexOf("WXYZ") + 4,
    });
    expect(applyQueryCompletion(input, candidate)).toEqual({
      input: "tag:Foo level:WARN message:ready",
      cursor: input.indexOf("WXYZ") + 4,
    });
  });

  it("filters is values case-insensitively", () => {
    expect(getQueryCompletions("is:ST", 5).map((candidate) => candidate.label)).toEqual([
      "stacktrace",
    ]);
  });

  it("uses sampled tags, removes exact duplicates, and formats inserted values", () => {
    const results = getQueryCompletions("tag:", 4, SOURCES);

    expect(results.map((candidate) => candidate.label)).toEqual([
      "ActivityManager",
      "AudioService",
      "Tag with spaces",
    ]);
    const spaced = results[2];
    expect(spaced.insertText).toBe('"Tag with spaces"');
    expect(applyQueryCompletion("tag:", spaced)).toEqual({
      input: 'tag:"Tag with spaces"',
      cursor: 21,
    });
  });

  it("preserves leading negation and a regex modifier for tag values", () => {
    const input = "-tag~:Act";
    const candidate = completion(input, input.length, "ActivityManager");

    expect(candidate).toMatchObject({ replaceStart: 6, replaceEnd: 9 });
    expect(applyQueryCompletion(input, candidate).input).toBe("-tag~:ActivityManager");
  });

  it("keeps an adjacent negated term when completing its value", () => {
    const input = 'tag:"ActivityManager"-tag:Aud';
    const candidate = completion(input, input.length, "AudioService");

    expect(applyQueryCompletion(input, candidate).input).toBe(
      'tag:"ActivityManager"-tag:AudioService',
    );
  });

  it("repairs key casing before offering value completions", () => {
    const input = "LEVEL:w";
    const results = getQueryCompletions(input, input.length, SOURCES);

    expect(results.map((candidate) => candidate.label)).toEqual(["level:"]);
    expect(applyQueryCompletion(input, results[0])).toEqual({ input: "level:w", cursor: 6 });
  });

  it("escapes sampled tags when inserting them into a regex query", () => {
    const sources: QueryCompletionSources = {
      tags: ["Foo[bar", "Foo.Bar"],
      packages: [],
      processes: [],
    };

    for (const [tag, nonMatch] of [
      ["Foo[bar", "FooXbar"],
      ["Foo.Bar", "FooXBar"],
    ]) {
      const input = "tag~:Foo";
      const candidate = getQueryCompletions(input, input.length, sources).find(
        (item) => item.label === tag,
      );
      if (candidate === undefined) {
        throw new Error(`Missing completion ${tag}`);
      }
      const applied = applyQueryCompletion(input, candidate);
      const compiled = compileQuery(applied.input);
      if (!compiled.ok || compiled.ast.type !== "tag" || compiled.ast.match.kind !== "regex") {
        throw new Error(`Regex completion did not compile: ${applied.input}`);
      }
      expect(compiled.ast.match.regex.test(tag)).toBe(true);
      expect(compiled.ast.match.regex.test(nonMatch)).toBe(false);
    }
  });

  it("offers mine first with its semantic detail and loaded packages after it", () => {
    const results = getQueryCompletions("package:m", 9, SOURCES);

    expect(results.map((candidate) => candidate.label)).toEqual(["mine", "my.example.app"]);
    expect(results[0].detail).toBe("当前前台应用");
    expect(results[1].detail).toBeUndefined();
  });

  it("offers unique process names including remote processes", () => {
    const results = getQueryCompletions("process:com", 11, SOURCES);

    expect(results.map((candidate) => candidate.label)).toEqual([
      "com.example.app",
      "com.example.app:remote",
    ]);
    expect(results.every((candidate) => candidate.kind === "process")).toBe(true);
    const remote = results[1];
    expect(applyQueryCompletion("process:com", remote)).toEqual({
      input: "process:com.example.app:remote",
      cursor: 30,
    });
  });

  it("escapes process regex candidates before insertion", () => {
    const processName = "com.example[beta]:remote";
    const sources: QueryCompletionSources = {
      tags: [],
      packages: [],
      processes: [processName],
    };
    const input = "process~:com";
    const candidate = getQueryCompletions(input, input.length, sources)[0];
    const applied = applyQueryCompletion(input, candidate);
    const compiled = compileQuery(applied.input);

    if (!compiled.ok || compiled.ast.type !== "process" || compiled.ast.match.kind !== "regex") {
      throw new Error(`Process regex completion did not compile: ${applied.input}`);
    }
    expect(compiled.ast.match.regex.test(processName)).toBe(true);
    expect(compiled.ast.match.regex.test("comXexamplebeta:remote")).toBe(false);
  });

  it("decodes quoted and backslash-space prefixes before filtering tags", () => {
    const quoted = 'tag:"Tag wi garbage"';
    const quotedCursor = quoted.indexOf(" garbage");
    const quotedCandidate = completion(quoted, quotedCursor, "Tag with spaces");
    expect(applyQueryCompletion(quoted, quotedCandidate).input).toBe('tag:"Tag with spaces"');

    const escaped = "tag:Tag\\wi";
    expect(getQueryCompletions(escaped, escaped.length, SOURCES).map((item) => item.label)).toEqual([
      "Tag with spaces",
    ]);
  });

  it("recognizes quoted tag, package, and process value contexts with the parser casing rules", () => {
    const tagInput = 'tag:"Tag with spaces"';
    expect(getQueryValueKeyAtCursor(tagInput, tagInput.length)).toBe("tag");
    expect(getQueryValueKeyAtCursor("-package:mine", 13)).toBe("package");
    expect(getQueryValueKeyAtCursor("-process~:com.example", 21)).toBe("process");
    expect(getQueryValueKeyAtCursor("LEVEL:W", 7)).toBeNull();
    expect(getQueryValueKeyAtCursor("tag:Foo ", 8)).toBeNull();
  });

  it("returns no value candidates for message or invalid enum modifiers", () => {
    expect(getQueryCompletions("message:", 8, SOURCES)).toEqual([]);
    expect(getQueryCompletions("level~:W", 8, SOURCES)).toEqual([]);
    expect(getQueryCompletions("package=:m", 10, SOURCES)).toEqual([]);
  });

  it("offers a new key after whitespace without replacing the previous term", () => {
    const input = "tag:ActivityManager ";
    const candidate = completion(input, input.length, "level:");

    expect(candidate).toMatchObject({ replaceStart: input.length, replaceEnd: input.length });
    expect(applyQueryCompletion(input, candidate).input).toBe("tag:ActivityManager level:");
  });

  it("rejects cursors outside the query", () => {
    expect(() => getQueryCompletions("tag:Foo", -1)).toThrow(RangeError);
    expect(() => getQueryCompletions("tag:Foo", 8)).toThrow(RangeError);
    expect(() => getQueryCompletions("tag:Foo", 1.5)).toThrow(RangeError);
  });
});

describe("applyQueryCompletion", () => {
  it("rejects stale or malformed replacement ranges", () => {
    const base: QueryCompletion = {
      kind: "key",
      label: "tag:",
      insertText: "tag:",
      replaceStart: 0,
      replaceEnd: 1,
    };

    expect(() => applyQueryCompletion("", base)).toThrow(RangeError);
    expect(() => applyQueryCompletion("x", { ...base, replaceStart: 1, replaceEnd: 0 })).toThrow(
      RangeError,
    );
    expect(() => applyQueryCompletion("x", { ...base, replaceStart: 0.5 })).toThrow(RangeError);
  });
});
