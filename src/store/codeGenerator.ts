import { create } from "zustand";
import {
  DEFAULT_GENERATOR_DRAFT,
  parseBatchInput,
  type CodeType,
  type GeneratedBatch,
  type GeneratorDraft,
  type SeparatorMode,
} from "@/lib/codeGenerator";

interface CodeGeneratorStore {
  draft: GeneratorDraft;
  draftRevision: number;
  generatedBatch: GeneratedBatch | null;
  inputError: string;
  setCodeType: (codeType: CodeType) => void;
  setSeparatorMode: (separatorMode: SeparatorMode) => void;
  setCustomSeparator: (customSeparator: string) => void;
  setInput: (input: string) => void;
  generate: () => boolean;
  clear: () => void;
}

let nextBatchId = 1;

export const useCodeGeneratorStore = create<CodeGeneratorStore>((set, get) => ({
  draft: { ...DEFAULT_GENERATOR_DRAFT },
  draftRevision: 0,
  generatedBatch: null,
  inputError: "",
  setCodeType: (codeType) => {
    set((state) => updateDraft(state, { ...state.draft, codeType }));
  },
  setSeparatorMode: (separatorMode) => {
    set((state) => updateDraft(state, { ...state.draft, separatorMode }));
  },
  setCustomSeparator: (customSeparator) => {
    set((state) => updateDraft(state, { ...state.draft, customSeparator }));
  },
  setInput: (input) => {
    set((state) => updateDraft(state, { ...state.draft, input }));
  },
  generate: () => {
    const state = get();
    const result = parseBatchInput(state.draft);
    if (!result.ok) {
      set({ inputError: result.message });
      return false;
    }

    const generatedBatch: GeneratedBatch = {
      id: nextBatchId,
      codeType: state.draft.codeType,
      sourceRevision: state.draftRevision,
      values: result.values,
    };
    nextBatchId += 1;
    set({ generatedBatch, inputError: "" });
    return true;
  },
  clear: () => {
    set((state) => ({
      draft: { ...DEFAULT_GENERATOR_DRAFT },
      draftRevision: state.draftRevision + 1,
      generatedBatch: null,
      inputError: "",
    }));
  },
}));

function updateDraft(
  state: Pick<CodeGeneratorStore, "draft" | "draftRevision" | "inputError">,
  draft: GeneratorDraft,
) {
  if (
    draft.codeType === state.draft.codeType &&
    draft.separatorMode === state.draft.separatorMode &&
    draft.customSeparator === state.draft.customSeparator &&
    draft.input === state.draft.input
  ) {
    return state;
  }

  return {
    draft,
    draftRevision: state.draftRevision + 1,
    inputError: "",
  };
}
