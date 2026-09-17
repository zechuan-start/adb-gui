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

  it("omits the grip handle when the module is not reorderable", () => {
    const html = renderToStaticMarkup(
      <ToolModule icon={null} title="截图" reference="A-01">
        内容
      </ToolModule>,
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("cursor-grab");
    expect(html).toContain("px-3 py-[7px]");
  });

  it("renders a focusable grip handle for a reorderable module", () => {
    const html = renderToStaticMarkup(
      <ToolModule
        icon={null}
        title="截图"
        reference="A-01"
        drag={{
          handleLabel: "拖动排序 截图, 第 1 项, 共 9 项",
          dragging: false,
          moduleRef: null,
          handleRef: null,
          headerProps: {},
          onHandleKeyDown: () => {},
        }}
      >
        内容
      </ToolModule>,
    );

    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-label="拖动排序 截图, 第 1 项, 共 9 项"');
    expect(html).toContain("touch-none");
    expect(html).toContain("cursor-grab");
    expect(html).not.toContain("cursor-grabbing");
  });

  it("marks the module being dragged", () => {
    const html = renderToStaticMarkup(
      <ToolModule
        icon={null}
        title="截图"
        reference="A-01"
        drag={{
          handleLabel: "拖动排序 截图, 第 1 项, 共 9 项",
          dragging: true,
          moduleRef: null,
          handleRef: null,
          style: { transform: "translate(12px, 20px)" },
          headerProps: {},
          onHandleKeyDown: () => {},
        }}
      >
        内容
      </ToolModule>,
    );

    expect(html).toContain("translate(12px, 20px)");
    expect(html).toContain("cursor-grabbing");
    expect(html).toContain("z-10");
    // Opaque so the card underneath does not read through the lifted one.
    expect(html).toContain("bg-paper");
  });
});
