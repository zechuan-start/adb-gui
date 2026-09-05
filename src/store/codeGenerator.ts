import { create } from "zustand";
import {
  parseBatchInput,
  type GeneratedBatch,
  type GeneratorOptions,
} from "@/lib/codeGenerator";
import { requireSettings } from "@/store/settings";

interface CodeGeneratorStore {
  input: string;
  inputRevision: number;
  generatedBatch: GeneratedBatch | null;
  inputError: { message: string; options: GeneratorOptions | null } | null;
  setInput: (input: string) => void;
  generate: () => boolean;
  clear: () => void;
}

let nextBatchId = 1;

export const useCodeGeneratorStore = create<CodeGeneratorStore>((set, get) => ({
  input: "",
  inputRevision: 0,
  generatedBatch: null,
  inputError: null,
  setInput: (input) => {
    if (input !== get().input)
      set((state) => ({
        input,
        inputRevision: state.inputRevision + 1,
        inputError: null,
      }));
  },
  generate: () => {
    let options: GeneratorOptions;
    try {
      options = { ...requireSettings().codegen };
    } catch (error) {
      set({ inputError: { message: String(error), options: null } });
      return false;
    }
    const state = get();
    const result = parseBatchInput({ ...options, input: state.input });
    if (!result.ok) {
      set({ inputError: { message: result.message, options } });
      return false;
    }

    const generatedBatch: GeneratedBatch = {
      id: nextBatchId,
      ...options,
      sourceRevision: state.inputRevision,
      values: result.values,
    };
    nextBatchId += 1;
    set({ generatedBatch, inputError: null });
    return true;
  },
  clear: () => {
    set((state) => ({
      input: "",
      inputRevision: state.inputRevision + 1,
      generatedBatch: null,
      inputError: null,
    }));
  },
}));
