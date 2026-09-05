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
  label: string;
}

export const SEPARATOR_OPTIONS: readonly SeparatorOption[] = [
  { value: "newline", label: "换行" },
  { value: "comma", label: "逗号" },
  { value: "semicolon", label: "分号" },
  { value: "tab", label: "制表符" },
  { value: "custom", label: "自定义" },
];

export const CODE_TYPE_OPTIONS = [
  { value: "qr", label: "二维码" },
  { value: "code128", label: "Code 128" },
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

type ParseBatchErrorCode = "empty-input" | "empty-separator" | "no-values";

interface ParseBatchSuccess {
  ok: true;
  values: string[];
}

interface ParseBatchFailure {
  ok: false;
  code: ParseBatchErrorCode;
  message: string;
}

export type ParseBatchResult = ParseBatchSuccess | ParseBatchFailure;

export function isSeparatorMode(value: string): value is SeparatorMode {
  return SEPARATOR_OPTIONS.some((option) => option.value === value);
}

export function parseBatchInput(draft: GeneratorDraft): ParseBatchResult {
  if (draft.input.length === 0) {
    return { ok: false, code: "empty-input", message: "请输入要生成的数据" };
  }

  const splitResult = splitInput(draft);
  if (!splitResult.ok) {
    return splitResult;
  }

  const values = splitResult.values.filter((value) => value.length > 0);
  if (values.length === 0) {
    return { ok: false, code: "no-values", message: "没有可生成的数据" };
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
        return { ok: false, code: "empty-separator", message: "请输入自定义分隔符" };
      }
      return { ok: true, values: draft.input.split(draft.customSeparator) };
  }
}
