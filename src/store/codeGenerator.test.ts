import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GENERATOR_DRAFT } from "@/lib/codeGenerator";
import { useCodeGeneratorStore } from "@/store/codeGenerator";

describe("useCodeGeneratorStore", () => {
  beforeEach(() => {
    useCodeGeneratorStore.setState({
      draft: { ...DEFAULT_GENERATOR_DRAFT },
      draftRevision: 0,
      generatedBatch: null,
      inputError: "",
    });
  });

  it("keeps the generated snapshot stable while the draft changes", () => {
    useCodeGeneratorStore.getState().setInput("first\nsecond");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);

    const generatedBatch = useCodeGeneratorStore.getState().generatedBatch;
    expect(generatedBatch?.values).toEqual(["first", "second"]);

    useCodeGeneratorStore.getState().setInput("changed");
    const changedState = useCodeGeneratorStore.getState();
    expect(changedState.generatedBatch).toBe(generatedBatch);
    expect(changedState.draftRevision).toBeGreaterThan(
      generatedBatch?.sourceRevision ?? 0,
    );
  });

  it("reports invalid custom separators without replacing old results", () => {
    useCodeGeneratorStore.getState().setInput("first\nsecond");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);
    const generatedBatch = useCodeGeneratorStore.getState().generatedBatch;

    useCodeGeneratorStore.getState().setSeparatorMode("custom");
    expect(useCodeGeneratorStore.getState().generate()).toBe(false);

    const invalidState = useCodeGeneratorStore.getState();
    expect(invalidState.inputError).toBe("请输入自定义分隔符");
    expect(invalidState.generatedBatch).toBe(generatedBatch);
  });

  it("clears the draft, result, and validation error together", () => {
    useCodeGeneratorStore.getState().setInput("value");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);

    useCodeGeneratorStore.getState().clear();

    const clearedState = useCodeGeneratorStore.getState();
    expect(clearedState.draft).toEqual(DEFAULT_GENERATOR_DRAFT);
    expect(clearedState.generatedBatch).toBeNull();
    expect(clearedState.inputError).toBe("");
  });
});
