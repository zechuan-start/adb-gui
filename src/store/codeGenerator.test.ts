import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isGeneratedBatchStale } from "@/lib/codeGenerator";
import { useCodeGeneratorStore } from "@/store/codeGenerator";
import { useSettingsStore } from "@/store/settings";

describe("useCodeGeneratorStore", () => {
  beforeEach(() => {
    let raw: string | null = null;
    vi.stubGlobal("localStorage", { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } });
    useSettingsStore.getState().reload();
    useCodeGeneratorStore.setState({
      input: "",
      inputRevision: 0,
      generatedBatch: null,
      inputError: null,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the generated snapshot stable while the draft changes", () => {
    useCodeGeneratorStore.getState().setInput("first\nsecond");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);

    const generatedBatch = useCodeGeneratorStore.getState().generatedBatch;
    expect(generatedBatch?.values).toEqual(["first", "second"]);

    useCodeGeneratorStore.getState().setInput("changed");
    const changedState = useCodeGeneratorStore.getState();
    expect(changedState.generatedBatch).toBe(generatedBatch);
    expect(changedState.inputRevision).toBeGreaterThan(
      generatedBatch?.sourceRevision ?? 0,
    );
  });

  it("reports invalid custom separators without replacing old results", () => {
    useCodeGeneratorStore.getState().setInput("first\nsecond");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);
    const generatedBatch = useCodeGeneratorStore.getState().generatedBatch;

    useSettingsStore.getState().update("codegen", { ...useSettingsStore.getState().preferences.codegen, separatorMode: "custom" });
    expect(useCodeGeneratorStore.getState().generate()).toBe(false);

    const invalidState = useCodeGeneratorStore.getState();
    expect(invalidState.inputError?.message).toBe("请输入自定义分隔符");
    expect(invalidState.generatedBatch).toBe(generatedBatch);
  });

  it("clears the draft, result, and validation error together", () => {
    useCodeGeneratorStore.getState().setInput("value");
    expect(useCodeGeneratorStore.getState().generate()).toBe(true);

    useCodeGeneratorStore.getState().clear();

    const clearedState = useCodeGeneratorStore.getState();
    expect(clearedState.input).toBe("");
    expect(clearedState.generatedBatch).toBeNull();
    expect(clearedState.inputError).toBeNull();
  });

  it("keeps parameters through clear and preserves snapshots through settings changes and reset", () => {
    const store = useCodeGeneratorStore.getState();
    const settings = useSettingsStore.getState();
    settings.update("codegen", { codeType: "code128", separatorMode: "custom", customSeparator: "::" });
    store.setInput("a::b");
    expect(store.generate()).toBe(true);
    const batch = useCodeGeneratorStore.getState().generatedBatch;
    expect(batch?.values).toEqual(["a", "b"]);
    settings.resetSection("codegen");
    expect(useCodeGeneratorStore.getState().generatedBatch).toBe(batch);
    expect(useCodeGeneratorStore.getState().input).toBe("a::b");
    expect(isGeneratedBatchStale(batch, useCodeGeneratorStore.getState().inputRevision, useSettingsStore.getState().preferences.codegen)).toBe(true);
    settings.update("codegen", { codeType: "code128", separatorMode: "custom", customSeparator: "::" });
    expect(isGeneratedBatchStale(batch, useCodeGeneratorStore.getState().inputRevision, useSettingsStore.getState().preferences.codegen)).toBe(false);
    store.clear();
    settings.reload();
    expect(useSettingsStore.getState().preferences.codegen).toEqual({ codeType: "code128", separatorMode: "custom", customSeparator: "::" });
    expect(useCodeGeneratorStore.getState().input).toBe("");
    expect(localStorage.getItem("adb-gui-settings")).not.toContain("a::b");
  });

  it("refuses generation when preferences are unavailable without replacing results", () => {
    useCodeGeneratorStore.getState().setInput("kept");
    useCodeGeneratorStore.getState().generate();
    const batch = useCodeGeneratorStore.getState().generatedBatch;
    useSettingsStore.setState({ available: false, error: "unreadable settings" });
    expect(useCodeGeneratorStore.getState().generate()).toBe(false);
    expect(useCodeGeneratorStore.getState().generatedBatch).toBe(batch);
    expect(useCodeGeneratorStore.getState().inputError?.message).toContain("unreadable settings");
  });
});
