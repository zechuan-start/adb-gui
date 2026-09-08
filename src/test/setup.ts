import { vi } from "vitest";

// Existing UI fixtures use Chinese. Language behavior tests override this
// explicit environment; the product still defaults to the actual system locale.
vi.stubGlobal("navigator", { languages: ["zh-CN"], language: "zh-CN" });
