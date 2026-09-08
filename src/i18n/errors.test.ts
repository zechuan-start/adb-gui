import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zhCN } from "./messages/zh-CN";
import { AppError, toAppError, translateError } from "./errors";

describe("error boundary", () => {
  it("keeps raw diagnostics and translates retained causes at rendering time", () => {
    const payload = toAppError(
      new AppError(
        "unknown",
        {},
        {
          detail: "EACCES /tmp/report",
          causes: [{ code: "invalid_payload", params: { code: "missing" } }],
        },
      ),
    );
    expect(translateError(payload, zhCN)).toBe(
      "操作失败: EACCES /tmp/report; 错误数据格式无效 (missing)",
    );
    expect(translateError(payload, en)).toBe(
      "Operation failed: EACCES /tmp/report; Invalid error data (missing)",
    );
  });

  it("rejects malformed parameters instead of interpolating undefined", () => {
    expect(translateError({ code: "invalid_payload", params: {} }, en)).toBe(
      "Invalid error data (invalid_payload)",
    );
    expect(
      toAppError({ code: "unknown", params: { count: Number.NaN } }).code,
    ).toBe("invalid_payload");
    const cycle: { code: string; causes?: unknown[] } = { code: "unknown" };
    cycle.causes = [cycle];
    expect(toAppError(cycle).code).toBe("invalid_payload");
  });

  it("keeps unknown codes and bare plugin errors diagnosable", () => {
    expect(translateError(toAppError("ENOENT"), en)).toBe(
      "Operation failed: ENOENT",
    );
    expect(
      translateError(
        toAppError({ code: "new.version", detail: "OS detail" }),
        en,
      ),
    ).toBe("Operation failed (new.version): OS detail");
  });
});
