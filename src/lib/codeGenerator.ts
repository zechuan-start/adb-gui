import type { Messages } from "@/i18n";
export type CodeType = "qr" | "code128";

export type SeparatorMode = "newline" | "comma" | "semicolon" | "tab" | "custom";

export interface GeneratorOptions {
  codeType: CodeType;
  separatorMode: SeparatorMode;
  customSeparator: string;
}

export interface GeneratorDraft extends GeneratorOptions {
  input: string;
}

export interface GeneratedBatch extends GeneratorOptions {
  id: number;
  sourceRevision: number;
  values: readonly string[];
}

interface SeparatorOption {
  value: SeparatorMode;
  label: (t: Messages) => string;
}

export const SEPARATOR_OPTIONS: readonly SeparatorOption[] = [
  { value: "newline", label: (t: Messages) => t.codegen.options.newline },
  { value: "comma", label: (t: Messages) => t.codegen.options.comma },
  { value: "semicolon", label: (t: Messages) => t.codegen.options.semicolon },
  { value: "tab", label: (t: Messages) => t.codegen.options.tab },
  { value: "custom", label: (t: Messages) => t.codegen.options.custom },
];

export const CODE_TYPE_OPTIONS = [
  { value: "qr", label: (t: Messages) => t.codegen.options.qr },
  { value: "code128", label: (_t: Messages) => "Code 128" },
] as const;

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  codeType: "qr",
  separatorMode: "newline",
  customSeparator: "",
};

export const DEFAULT_GENERATOR_DRAFT: GeneratorDraft = {
  ...DEFAULT_GENERATOR_OPTIONS,
  input: "",
};

export function generatorOptionsMatch(left: GeneratorOptions, right: GeneratorOptions): boolean {
  return left.codeType === right.codeType && left.separatorMode === right.separatorMode &&
    left.customSeparator === right.customSeparator;
}

export function isGeneratedBatchStale(batch: GeneratedBatch | null, revision: number, options: GeneratorOptions): boolean {
  return Boolean(batch && (batch.sourceRevision !== revision || !generatorOptionsMatch(batch, options)));
}

type ParseBatchErrorCode = "generator_empty_input" | "generator_empty_separator" | "generator_no_values";

interface ParseBatchSuccess {
  ok: true;
  values: string[];
}

interface ParseBatchFailure {
  ok: false;
  code: ParseBatchErrorCode;
}

export type ParseBatchResult = ParseBatchSuccess | ParseBatchFailure;

export function isSeparatorMode(value: string): value is SeparatorMode {
  return SEPARATOR_OPTIONS.some((option) => option.value === value);
}

export function parseBatchInput(draft: GeneratorDraft): ParseBatchResult {
  if (draft.input.length === 0) {
    return { ok: false, code: "generator_empty_input" };
  }

  const splitResult = splitInput(draft);
  if (!splitResult.ok) {
    return splitResult;
  }

  const values = splitResult.values.filter((value) => value.length > 0);
  if (values.length === 0) {
    return { ok: false, code: "generator_no_values" };
  }

  return { ok: true, values };
}

function splitInput(draft: GeneratorDraft): ParseBatchResult {
  switch (draft.separatorMode) {
    case "newline":
      return { ok: true, values: draft.input.split(/\r\n|\n|\r/) };
    case "comma":
      return { ok: true, values: draft.input.split(",") };
    case "semicolon":
      return { ok: true, values: draft.input.split(";") };
    case "tab":
      return { ok: true, values: draft.input.split("\t") };
    case "custom":
      if (draft.customSeparator.length === 0) {
        return { ok: false, code: "generator_empty_separator" };
      }
      return { ok: true, values: draft.input.split(draft.customSeparator) };
  }
}
