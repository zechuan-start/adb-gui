import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATOR_DRAFT,
  parseBatchInput,
  type GeneratorDraft,
  type SeparatorMode,
} from "@/lib/codeGenerator";

function createDraft(
  input: string,
  separatorMode: SeparatorMode = "newline",
  customSeparator = "",
): GeneratorDraft {
  return {
    ...DEFAULT_GENERATOR_DRAFT,
    input,
    separatorMode,
    customSeparator,
  };
}

describe("parseBatchInput", () => {
  it("parses LF, CRLF, and CR without retaining line ending bytes", () => {
    expect(parseBatchInput(createDraft("alpha\nbeta\r\ngamma\rdelta"))).toEqual({
      ok: true,
      values: ["alpha", "beta", "gamma", "delta"],
    });
  });

  it.each([
    ["comma", "a,b,c"],
    ["semicolon", "a;b;c"],
    ["tab", "a\tb\tc"],
  ] satisfies readonly [SeparatorMode, string][])("parses the %s preset", (mode, input) => {
    expect(parseBatchInput(createDraft(input, mode))).toEqual({
      ok: true,
      values: ["a", "b", "c"],
    });
  });

  it("treats a custom separator as a complete literal string", () => {
    expect(parseBatchInput(createDraft("a.*b.*c", "custom", ".*"))).toEqual({
      ok: true,
      values: ["a", "b", "c"],
    });
  });

  it("preserves whitespace, duplicates, and input order", () => {
    expect(parseBatchInput(createDraft(" first \n   \n first \nlast"))).toEqual({
      ok: true,
      values: [" first ", "   ", " first ", "last"],
    });
  });

  it("filters only zero-length items", () => {
    expect(parseBatchInput(createDraft("\na\n\n b \n"))).toEqual({
      ok: true,
      values: ["a", " b "],
    });
  });

  it("rejects an empty input", () => {
    expect(parseBatchInput(createDraft(""))).toEqual({
      ok: false,
      code: "empty-input",
      message: "请输入要生成的数据",
    });
  });

  it("rejects an empty custom separator", () => {
    expect(parseBatchInput(createDraft("alpha", "custom"))).toEqual({
      ok: false,
      code: "empty-separator",
      message: "请输入自定义分隔符",
    });
  });

  it("rejects input that contains only separators", () => {
    expect(parseBatchInput(createDraft("\n\r\n\r"))).toEqual({
      ok: false,
      code: "no-values",
      message: "没有可生成的数据",
    });
  });
});
