import { describe, expect, it } from "vitest";
import { detectCrashKind } from "@/lib/logcatCrash";

describe("detectCrashKind", () => {
  it("recognizes a Java fatal exception independently of tag and level", () => {
    expect(detectCrashKind("I", "ExampleApp", "FATAL EXCEPTION: main")).toBe("crash");
  });

  it("recognizes an AndroidRuntime process exception on error levels", () => {
    const message = "Process: com.example.app, PID: 31876, Exception: java.lang.IllegalStateException";

    expect(detectCrashKind("E", "AndroidRuntime", message)).toBe("crash");
    expect(detectCrashKind("F", "AndroidRuntime", message)).toBe("crash");
  });

  it("requires the complete AndroidRuntime crash signature", () => {
    const message = "Process: com.example.app, PID: 31876, Exception: java.lang.IllegalStateException";

    expect(detectCrashKind("W", "AndroidRuntime", message)).toBeNull();
    expect(detectCrashKind("E", "OtherTag", message)).toBeNull();
    expect(detectCrashKind("E", "AndroidRuntime", "Process: com.example.app, PID: 31876")).toBeNull();
    expect(detectCrashKind("E", "AndroidRuntime", "java.lang.IllegalStateException")).toBe(
      "stacktrace",
    );
  });

  it("recognizes a native tombstone marker only for the DEBUG tag", () => {
    const tombstone = "*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***";

    expect(detectCrashKind("F", "DEBUG", tombstone)).toBe("crash");
    expect(detectCrashKind("F", "NativeCrash", tombstone)).toBeNull();
  });

  it("recognizes ANR headers only at the start of a message", () => {
    expect(detectCrashKind("E", "ActivityManager", "ANR in com.example.app")).toBe("crash");
    expect(detectCrashKind("E", "ActivityManager", "Detected ANR in com.example.app")).toBeNull();
  });

  it.each([
    ["\tat com.example.Main.run(Main.java:1)", "stack frame"],
    ["Caused by: java.lang.NullPointerException: missing value", "cause"],
    ["    ... 12 more", "elided frames"],
    ["java.lang.IllegalStateException: invalid state", "exception header"],
    ["java.lang.AssertionError: expected true", "error header"],
    ["com.example.CustomThrowable", "throwable header"],
  ])("recognizes a %s as a stacktrace (%s)", (message) => {
    expect(detectCrashKind("I", "ExampleTag", message)).toBe("stacktrace");
  });

  it("recognizes stack frames regardless of log level", () => {
    expect(detectCrashKind("D", "ExampleTag", "\tat com.example.Main.run(Main.java:1)")).toBe(
      "stacktrace",
    );
  });

  it.each([
    "",
    "Application startup completed",
    "Meet me at com.example.Main.run(Main.java:1)",
    "Retry caused by: a transient network response",
    "Rendered ... 12 more items in the list",
    "java.lang.String: ordinary class header",
  ])("does not classify ordinary text: %j", (message) => {
    expect(detectCrashKind("I", "ExampleTag", message)).toBeNull();
  });

  it("gives crash classification precedence over stacktrace classification", () => {
    expect(
      detectCrashKind("D", "ExampleTag", "java.lang.RuntimeException: FATAL EXCEPTION"),
    ).toBe("crash");
  });
});
