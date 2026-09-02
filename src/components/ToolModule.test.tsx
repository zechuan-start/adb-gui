import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolModule } from "@/components/ToolModule";

describe("ToolModule", () => {
  it("renders the shared header and body without owning business state", () => {
    const html = renderToStaticMarkup(
      <ToolModule
        icon={<svg data-testid="tool-icon" />}
        title="截图"
        reference="A-01"
      >
        <p>工具内容</p>
      </ToolModule>,
    );

    expect(html).toContain("截图");
    expect(html).toContain("A-01");
    expect(html).toContain("工具内容");
    expect(html).toContain("rounded-[2px]");
    expect(html).toContain("border-rule");
    expect(html).toContain("px-3 py-[7px]");
    expect(html).toContain("font-data text-[10.5px] text-ink3");
  });

  it("adds the desktop two-column span only for wide modules", () => {
    const regular = renderToStaticMarkup(
      <ToolModule icon={null} title="普通模块" reference="A-01">
        内容
      </ToolModule>,
    );
    const wide = renderToStaticMarkup(
      <ToolModule icon={null} title="宽模块" reference="A-05" wide>
        内容
      </ToolModule>,
    );

    expect(regular).not.toContain("min-[1180px]:col-span-2");
    expect(wide).toContain("min-[1180px]:col-span-2");
  });
});
