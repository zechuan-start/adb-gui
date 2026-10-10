import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkEditor } from "@/components/files/BookmarkEditor";
import { BookmarkMenu } from "@/components/files/BookmarkMenu";
import { BookmarkStar } from "@/components/files/BookmarkStar";
import { defaultSettings } from "@/lib/settings";
import { useFileBookmarkStore } from "@/store/fileBookmarks";
import { useLocaleStore } from "@/store/locale";
import { useSettingsStore } from "@/store/settings";

// Server rendering reads a store's initial state, so feed selectors the current
// snapshot, as ToolLocalization.test.tsx does.
vi.mock("@/i18n", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/i18n")>(),
  useT: () => useLocaleStore.getState().messages,
}));
vi.mock("@/store/fileBookmarks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/fileBookmarks")>();
  const store = actual.useFileBookmarkStore;
  return { ...actual, useFileBookmarkStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});
vi.mock("@/store/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/settings")>();
  const store = actual.useSettingsStore;
  return { ...actual, useSettingsStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store,
  ) };
});

const PATH = "/sdcard/DCIM";

beforeEach(() => {
  useLocaleStore.getState().setPreference("zh-CN");
  useFileBookmarkStore.setState({ bookmarks: [] });
  useSettingsStore.setState({ preferences: defaultSettings(), available: true, error: null });
});

describe("BookmarkStar", () => {
  it("offers a one-click bookmark for an unbookmarked directory", () => {
    const html = renderToStaticMarkup(<BookmarkStar variant="toolbar" path={PATH} />);

    expect(html).toContain('aria-label="收藏此目录"');
    expect(html).not.toContain("aria-haspopup");
    expect(html).toContain('fill="none"');
    expect(html).not.toContain('disabled=""');
  });

  it("opens the editor for a bookmarked directory instead of removing it", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: null }] });
    const html = renderToStaticMarkup(<BookmarkStar variant="toolbar" path={PATH} />);

    expect(html).toContain('aria-label="编辑收藏"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("text-ink");
  });

  it("paints the star with the bookmark color", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: "blue" }] });
    const html = renderToStaticMarkup(<BookmarkStar variant="toolbar" path={PATH} />);

    expect(html).toContain("text-tag-blue");
  });

  it("labels the details button with visible text only", () => {
    const plain = renderToStaticMarkup(<BookmarkStar variant="details" path={PATH} />);
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: "pink" }] });
    const saved = renderToStaticMarkup(<BookmarkStar variant="details" path={PATH} />);

    expect(plain).toContain(">收藏</button>");
    expect(saved).toContain(">已收藏</button>");
    expect(saved).not.toContain("aria-label");
  });

  it("is disabled without a loaded directory", () => {
    expect(renderToStaticMarkup(<BookmarkStar variant="toolbar" path={null} />)).toContain(
      'disabled=""',
    );
  });

  it("renders English text from the current catalog", () => {
    useLocaleStore.getState().setPreference("en");
    expect(renderToStaticMarkup(<BookmarkStar variant="toolbar" path={PATH} />)).toContain(
      'aria-label="Bookmark this directory"',
    );
  });
});

describe("BookmarkEditor", () => {
  it("checks the swatch matching the bookmark color", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: "cyan" }] });
    const html = renderToStaticMarkup(<BookmarkEditor path={PATH} onRemoved={() => {}} />);

    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(6);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" aria-label="青"/);
    expect(html).toContain("bg-tag-cyan");
  });

  it("checks the no-color swatch for a colorless bookmark", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: null }] });
    const html = renderToStaticMarkup(<BookmarkEditor path={PATH} onRemoved={() => {}} />);

    expect(html).toMatch(/aria-checked="true" aria-label="无色"/);
  });

  it("marks the current start directory and disables setting it again", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: null }] });
    useSettingsStore.setState({
      preferences: {
        ...defaultSettings(),
        files: { ...defaultSettings().files, startDirectory: PATH },
      },
    });
    const html = renderToStaticMarkup(<BookmarkEditor path={PATH} onRemoved={() => {}} />);

    expect(html).toContain("已是起始目录");
    expect(html).toMatch(/disabled=""[^>]*>.*已是起始目录/);
  });

  it("disables the start directory action while settings are unavailable", () => {
    useFileBookmarkStore.setState({ bookmarks: [{ path: PATH, color: null }] });
    useSettingsStore.setState({ available: false });
    const html = renderToStaticMarkup(<BookmarkEditor path={PATH} onRemoved={() => {}} />);

    expect(html).toContain('title="设置不可用, 无法修改起始目录"');
    expect(html).toContain("设为起始目录");
  });
});

describe("BookmarkMenu", () => {
  it("renders a closed, labelled trigger that is never disabled", () => {
    const html = renderToStaticMarkup(
      <BookmarkMenu currentPath={null} navigationDisabled onNavigate={() => {}} />,
    );

    expect(html).toContain('aria-label="收藏夹"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('disabled=""');
  });

  it("labels the trigger in English", () => {
    useLocaleStore.getState().setPreference("en");
    expect(
      renderToStaticMarkup(
        <BookmarkMenu currentPath={null} navigationDisabled={false} onNavigate={() => {}} />,
      ),
    ).toContain('aria-label="Bookmarks"');
  });
});
