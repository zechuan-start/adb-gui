import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingRow, SettingsView } from "@/components/settings/SettingRow";
import { ChipGroup } from "@/components/settings/controls/ChipGroup";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import { Switch } from "@/components/settings/controls/Switch";

describe("settings controls", () => {
  it("renders a switch with its checked and disabled state", () => {
    const markup = renderToStaticMarkup(
      <Switch
        checked
        disabled
        ariaLabel="后台采集"
        onCheckedChange={() => {}}
      />,
    );
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="后台采集"');
    expect(markup).toContain('disabled=""');
  });

  it("renders one selected radio in a segmented control", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        value="compact"
        options={[
          { value: "standard", label: "标准" },
          { value: "compact", label: "紧凑" },
        ]}
        onChange={() => {}}
        ariaLabel="显示格式"
      />,
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup.match(/role="radio"/g)).toHaveLength(2);
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(markup).toContain("bg-ink text-onink");
  });

  it("renders chip selection through aria-pressed", () => {
    const markup = renderToStaticMarkup(
      <ChipGroup
        options={[
          { value: "time", label: "时间" },
          { value: "tag", label: "Tag" },
        ]}
        selected={{ time: true, tag: false }}
        onToggle={() => {}}
        ariaLabel="显示列"
      />,
    );
    expect(markup).toContain('role="group"');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it("renders stacked rows and a readable modified marker", () => {
    const markup = renderToStaticMarkup(
      <SettingsView value={{ modified: (id) => id === "separator" }}>
        <SettingRow id="separator" layout="stacked">
          <input aria-label="测试输入" />
        </SettingRow>
      </SettingsView>,
    );
    expect(markup).toContain("flex-col items-stretch");
    expect(markup).toContain('title="当前值与默认不同"');
    expect(markup).toContain("已修改");
  });
});
