import { describe, expect, it } from "vitest";
import type { LogcatEntry } from "@/lib/logcat";
import {
  compileQuery,
  evaluate,
  formatQueryValue,
  MAX_QUERY_LENGTH,
  MAX_QUERY_NESTING,
  type CompileFailure,
  type EvalContext,
  type QueryNode,
} from "@/lib/logcatQuery";

const EMPTY_CONTEXT: EvalContext = {
  currentPackage: "",
};

function entry(overrides: Partial<LogcatEntry> = {}): LogcatEntry {
  const tag = overrides.tag ?? "ExampleTag";
  const message = overrides.message ?? "hello from logcat";
  return {
    seq: 1,
    time: "08-30 12:00:00.000",
    level: "I",
    tag,
    pid: "123",
    tid: "456",
    message,
    raw: `${tag}: ${message}`,
    searchKey: `${tag}\u0000${message}`.toLowerCase(),
    crashKind: null,
    processName: null,
    packageName: null,
    ...overrides,
  };
}

function ast(input: string): QueryNode {
  const result = compileQuery(input);
  if (!result.ok) {
    throw new Error(`Expected valid query, got: ${result.message}`);
  }
  return result.ast;
}

function matches(
  input: string,
  log: LogcatEntry = entry(),
  context: EvalContext = EMPTY_CONTEXT,
): boolean {
  return evaluate(log, ast(input), context);
}

function compileFailure(input: string): CompileFailure {
  const result = compileQuery(input);
  if (result.ok) {
    throw new Error("Expected query compilation to fail");
  }
  return result;
}

describe("compileQuery and evaluate", () => {
  it("compiles every supported key and collects package/process/tag references once", () => {
    const result = compileQuery(
      "tag:Example message:hello level:WARN package:mine package:mine -process:com.example process=:com.example is:crash tag:Example",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packageRefs).toEqual(["mine"]);
    expect(result.processRefs).toEqual(["com.example"]);
    expect(result.tagRefs).toEqual(["Example"]);
    expect(result.ast.type).toBe("and");
  });

  it("treats bare text as a case-insensitive message predicate", () => {
    const log = entry({ tag: "HELLO_TAG", message: "Say HeLLo World" });
    expect(matches("hello", log)).toBe(true);
    expect(matches("world", log)).toBe(true);
    expect(matches("hello_tag", log)).toBe(false);
  });

  it("combines adjacent bare terms with implicit AND", () => {
    const log = entry({ message: "hello from sample" });
    expect(matches("hello sample", log)).toBe(true);
    expect(matches("hello missing", log)).toBe(false);
  });

  it("makes implicit and explicit AND equivalent", () => {
    const logs = [
      entry({ tag: "Foo", level: "W" }),
      entry({ tag: "Foo", level: "D" }),
      entry({ tag: "Bar", level: "E" }),
    ];
    const implicit = ast("tag:Foo level:WARN");
    const explicit = ast("tag:Foo & level:WARN");

    expect(logs.map((log) => evaluate(log, implicit, EMPTY_CONTEXT))).toEqual(
      logs.map((log) => evaluate(log, explicit, EMPTY_CONTEXT)),
    );
  });

  it("supports explicit AND and OR", () => {
    expect(matches("tag:Foo & message:hello", entry({ tag: "Foo", message: "hello" }))).toBe(
      true,
    );
    expect(matches("tag:Foo & tag:Bar", entry({ tag: "Foo" }))).toBe(false);
    expect(matches("tag:Foo | tag:Bar", entry({ tag: "Bar" }))).toBe(true);
  });

  it("gives AND higher precedence than OR", () => {
    const context: EvalContext = {
      currentPackage: "com.example.app",
    };
    const query = ast("tag:foo | level:ERROR & package:mine");

    expect(evaluate(entry({ tag: "foo", level: "D" }), query, context)).toBe(true);
    expect(
      evaluate(entry({ tag: "bar", level: "E", packageName: "com.example.app" }), query, context),
    ).toBe(true);
    expect(
      evaluate(entry({ tag: "bar", level: "E", packageName: "com.example.other" }), query, context),
    ).toBe(false);
  });

  it("lets parentheses override precedence", () => {
    const context: EvalContext = {
      currentPackage: "com.example.app",
    };
    const query = ast("(tag:foo | level:ERROR) & package:mine");

    expect(
      evaluate(entry({ tag: "foo", level: "D", packageName: "com.example.other" }), query, context),
    ).toBe(false);
    expect(
      evaluate(entry({ tag: "foo", level: "D", packageName: "com.example.app" }), query, context),
    ).toBe(true);
  });

  it("supports negated terms, modifiers, and groups", () => {
    expect(matches("-tag:foo", entry({ tag: "bar" }))).toBe(true);
    expect(matches("-tag~:Foo.*", entry({ tag: "FooService" }))).toBe(false);
    expect(matches("-(tag:a | tag:b)", entry({ tag: "c" }))).toBe(true);
    expect(matches("-(tag:a | tag:b)", entry({ tag: "b" }))).toBe(false);
    expect(matches("tag:foo-tag:bar", entry({ tag: "foo" }))).toBe(true);
    expect(matches("tag:foo-tag:bar", entry({ tag: "foobar" }))).toBe(false);
  });

  it("constructs regex matchers at compile time", () => {
    const query = ast("tag~:Activ.*");
    expect(query).toMatchObject({ type: "tag", match: { kind: "regex" } });
    expect(matches("tag~:Activ.*", entry({ tag: "ActivityManager" }))).toBe(true);
    expect(matches("tag~:Activ.*", entry({ tag: "WindowManager" }))).toBe(false);
  });

  it("evaluates nested quantifiers with the linear-time regex engine", () => {
    const query = ast('message~:"^(a+)+$"');
    const log = entry({ message: `${"a".repeat(25)}!` });
    let matchCount = 0;

    for (let index = 0; index < 10_000; index += 1) {
      if (evaluate(log, query, EMPTY_CONTEXT)) {
        matchCount += 1;
      }
    }

    expect(matchCount).toBe(0);
  });

  it("distinguishes exact from case-insensitive contains matching", () => {
    expect(matches("tag=:Activity", entry({ tag: "Activity" }))).toBe(true);
    expect(matches("tag=:Activity", entry({ tag: "ActivityManager" }))).toBe(false);
    expect(matches("tag:activity", entry({ tag: "ActivityManager" }))).toBe(true);
    expect(matches("message=:Ready", entry({ message: "ready" }))).toBe(false);
  });

  it("matches the frozen process name with contains, exact, regex, and negation", () => {
    const remote = entry({
      processName: "com.example.app:remote",
      packageName: "com.example.app",
    });

    expect(matches("process:EXAMPLE.APP", remote)).toBe(true);
    expect(matches("process=:com.example.app:remote", remote)).toBe(true);
    expect(matches("process=:com.example.app", remote)).toBe(false);
    expect(matches('process~:"^com\\.example\\.app:remote$"', remote)).toBe(true);
    expect(matches("-process:system", remote)).toBe(true);
    expect(matches("-process:example", remote)).toBe(false);
    expect(matches("process:example", entry({ processName: null }))).toBe(false);
    expect(matches("-process:example", entry({ processName: null }))).toBe(true);
  });

  it("supports backslash spaces and quoted values", () => {
    const log = entry({ message: 'This is sample with "quotes"' });
    expect(matches("message:This\\is\\sample", log)).toBe(true);
    expect(matches('message:"This is sample"', log)).toBe(true);
    expect(matches('message:"with \\"quotes\\""', log)).toBe(true);
    expect(matches('message~:"\\d+"', entry({ message: "build 123 ready" }))).toBe(true);
  });

  it("formats dynamic values without changing their query meaning", () => {
    expect(formatQueryValue("ActivityManager")).toBe("ActivityManager");
    expect(formatQueryValue("Activity-Manager")).toBe('"Activity-Manager"');
    expect(formatQueryValue("Tag with (group) & pipe|quote\"slash\\")).toBe(
      '"Tag with (group) & pipe|quote\\"slash\\\\"',
    );
    const tag = 'Tag with (group) & pipe|quote"slash\\';
    expect(matches(`tag=:${formatQueryValue(tag)}`, entry({ tag }))).toBe(true);
    expect(() => formatQueryValue("")).toThrow(RangeError);
  });

  it("maps level names and letters case-insensitively with threshold semantics", () => {
    const levels: LogcatEntry["level"][] = ["V", "D", "I", "W", "E", "F"];
    const logs = levels.map((level) => entry({ level }));
    const expected = [false, false, false, true, true, true];

    expect(logs.map((log) => matches("level:WARN", log))).toEqual(expected);
    expect(logs.map((log) => matches("level:w", log))).toEqual(expected);
    expect(logs.map((log) => matches("level:INFO", log))).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    for (const [name, level] of [
      ["VERBOSE", "V"],
      ["DEBUG", "D"],
      ["INFO", "I"],
      ["WARN", "W"],
      ["ERROR", "E"],
      ["ASSERT", "F"],
    ] as const) {
      expect(matches(`level:${name}`, entry({ level }))).toBe(true);
      expect(matches(`level:${level.toLowerCase()}`, entry({ level }))).toBe(true);
    }
    expect(matches("level:ASSERT", entry({ level: "E" }))).toBe(false);
  });

  it("allows every entry for an empty or whitespace-only query", () => {
    expect(matches("", entry())).toBe(true);
    expect(matches("   \t\n", entry())).toBe(true);
  });

  it("matches frozen package names exactly and resolves package:mine from context", () => {
    const remote = entry({
      processName: "com.example.app:remote",
      packageName: "com.example.app",
    });

    expect(matches("package:com.example.app", remote)).toBe(true);
    expect(matches("package:com.example", remote)).toBe(false);
    expect(matches("package:COM.EXAMPLE.APP", remote)).toBe(false);
    expect(matches("package:com.example.app", entry({ packageName: null }))).toBe(false);
    expect(matches("package:mine", remote)).toBe(false);
    expect(matches("package:mine", remote, { currentPackage: "com.example.app" })).toBe(true);
    expect(matches("package:mine", remote, { currentPackage: "com.example.other" })).toBe(false);
  });

  it("matches is predicates from the precomputed crashKind field", () => {
    expect(matches("is:crash", entry({ crashKind: "crash", level: "D" }))).toBe(true);
    expect(matches("is:stacktrace", entry({ crashKind: "stacktrace", level: "D" }))).toBe(true);
    expect(matches("is:crash", entry({ crashKind: null }))).toBe(false);
  });
});

describe("compileQuery errors", () => {
  it("reports an unclosed parenthesis with its opening position", () => {
    expect(compileFailure("(tag:foo")).toMatchObject({
      message: "缺少右括号",
      start: 0,
      end: 1,
    });
  });

  it("reports dangling binary and unary operators", () => {
    expect(compileFailure("tag:foo & ")).toMatchObject({ start: 8, end: 9 });
    expect(compileFailure("tag:foo |")).toMatchObject({ start: 8, end: 9 });
    expect(compileFailure("-")).toMatchObject({ start: 0, end: 1 });
  });

  it("reports unknown keys and empty values at their source positions", () => {
    expect(compileFailure("unknown:value")).toMatchObject({ start: 0, end: 7 });
    expect(compileFailure("tag:")).toMatchObject({ start: 4, end: 4 });
  });

  it("reports invalid regexes without throwing", () => {
    expect(compileFailure("tag~:[unterminated")).toMatchObject({
      message: "无效的正则表达式",
      start: 5,
      end: 18,
    });
    expect(compileFailure("process~:[unterminated")).toMatchObject({
      message: "无效的正则表达式",
      start: 9,
      end: 22,
    });
  });

  it("rejects modifiers on level, package, and is", () => {
    expect(compileFailure("level~:WARN").message).toContain("不支持正则修饰符");
    expect(compileFailure("package=:mine").message).toContain("不支持精确修饰符");
    expect(compileFailure("is~:crash").message).toContain("不支持正则修饰符");
  });

  it("reports invalid enum values and quote errors", () => {
    expect(compileFailure("level:FATAL").message).toContain("未知日志等级");
    expect(compileFailure("is:firebase").message).toContain("未知 is: 值");
    expect(compileFailure('message:"unfinished').message).toContain("引号未闭合");
    expect(compileFailure('message:""').message).toContain("缺少值");
  });

  it("reports empty and unmatched groups", () => {
    expect(compileFailure("()").message).toContain("括号内缺少表达式");
    expect(compileFailure("tag:foo)").message).toContain("多余的右括号");
  });

  it("accepts the exact query length and nesting limits", () => {
    const atLengthLimit = `message:${"a".repeat(MAX_QUERY_LENGTH - "message:".length)}`;
    expect(compileQuery(atLengthLimit).ok).toBe(true);

    const atNotLimit = `${"-".repeat(MAX_QUERY_NESTING)}tag:foo`;
    expect(compileQuery(atNotLimit).ok).toBe(true);

    const atGroupLimit =
      `${"(".repeat(MAX_QUERY_NESTING)}tag:foo${")".repeat(MAX_QUERY_NESTING)}`;
    expect(compileQuery(atGroupLimit).ok).toBe(true);
  });

  it("reports queries beyond length and nesting limits instead of overflowing the stack", () => {
    const tooLong = compileFailure("a".repeat(MAX_QUERY_LENGTH + 1));
    expect(tooLong.message).toContain(`${MAX_QUERY_LENGTH}`);
    expect(tooLong.start).toBe(MAX_QUERY_LENGTH);

    const tooManyNots = compileFailure(`${"-".repeat(MAX_QUERY_NESTING + 1)}tag:foo`);
    expect(tooManyNots.message).toContain(`${MAX_QUERY_NESTING}`);

    const tooManyGroups = compileFailure(
      `${"(".repeat(MAX_QUERY_NESTING + 1)}tag:foo${")".repeat(MAX_QUERY_NESTING + 1)}`,
    );
    expect(tooManyGroups.message).toContain(`${MAX_QUERY_NESTING}`);
  });
});
