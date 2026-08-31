import { describe, expect, it } from "vitest";
import {
  buildCopyAllText,
  isHttpUrl,
  isSupportedImagePath,
  normalizeReadResults,
  partitionImagePaths,
  summarizeBatch,
  type DecodedBatch,
  type DecodedImage,
} from "@/lib/codeDecoder";

function createImage(overrides: Partial<DecodedImage> = {}): DecodedImage {
  return {
    id: 1,
    name: "image.png",
    path: "/tmp/image.png",
    thumbnail: "",
    codes: [],
    error: "",
    ...overrides,
  };
}

describe("isSupportedImagePath", () => {
  it.each(["png", "jpg", "jpeg", "gif", "bmp", "webp"])(
    "accepts the .%s extension",
    (extension) => {
      expect(isSupportedImagePath(`/tmp/code.${extension}`)).toBe(true);
    },
  );

  it("matches extensions case-insensitively", () => {
    expect(isSupportedImagePath("C:\\images\\code.JpEg")).toBe(true);
  });

  it.each(["/tmp/code.svg", "/tmp/code", "/tmp/code."])("rejects %s", (path) => {
    expect(isSupportedImagePath(path)).toBe(false);
  });
});

describe("partitionImagePaths", () => {
  it("filters unsupported paths before applying the 50-image limit", () => {
    const supported = Array.from({ length: 51 }, (_, index) => `/tmp/code-${index}.png`);
    const paths = ["/tmp/readme.txt", ...supported, "/tmp/vector.svg"];

    expect(partitionImagePaths(paths)).toEqual({
      accepted: supported.slice(0, 50),
      rejectedCount: 2,
      truncatedCount: 1,
    });
  });

  it("preserves the order and duplicates of accepted paths", () => {
    expect(partitionImagePaths(["a.png", "b.jpg", "a.png"])).toEqual({
      accepted: ["a.png", "b.jpg", "a.png"],
      rejectedCount: 0,
      truncatedCount: 0,
    });
  });
});

describe("normalizeReadResults", () => {
  it("filters invalid results and preserves text and canonical format names", () => {
    expect(
      normalizeReadResults([
        { text: "plain text", format: "QRCode", isValid: true },
        { text: "discarded", format: "None", isValid: false },
        { text: " HTTPS://example.com/path ", format: "Code128", isValid: true },
      ]),
    ).toEqual([
      { text: "plain text", format: "QRCode", isUrl: false },
      { text: " HTTPS://example.com/path ", format: "Code128", isUrl: true },
    ]);
  });

  it("returns an empty array when no valid result remains", () => {
    expect(normalizeReadResults([{ text: "bad", format: "None", isValid: false }])).toEqual([]);
  });
});

describe("isHttpUrl", () => {
  it.each(["http://example.com", " HTTPS://example.com/path "])("accepts %s", (text) => {
    expect(isHttpUrl(text)).toBe(true);
  });

  it.each(["ftp://example.com", "visit https://example.com", "example.com"])(
    "rejects %s",
    (text) => {
      expect(isHttpUrl(text)).toBe(false);
    },
  );
});

describe("buildCopyAllText", () => {
  it("joins every code by image order and code order", () => {
    const batch: DecodedBatch = {
      id: 10,
      images: [
        createImage({
          codes: [
            { text: "first", format: "QRCode", isUrl: false },
            { text: "second", format: "Code128", isUrl: false },
          ],
        }),
        createImage({ id: 2, codes: [] }),
        createImage({
          id: 3,
          codes: [{ text: "third", format: "EAN13", isUrl: false }],
        }),
      ],
    };

    expect(buildCopyAllText(batch)).toBe("first\nsecond\nthird");
  });

  it("returns an empty string for a batch without decoded codes", () => {
    expect(buildCopyAllText({ id: 1, images: [createImage()] })).toBe("");
  });
});

describe("summarizeBatch", () => {
  it("counts images, images with codes, and all decoded codes", () => {
    const batch: DecodedBatch = {
      id: 1,
      images: [
        createImage({
          codes: [
            { text: "one", format: "QRCode", isUrl: false },
            { text: "two", format: "Code128", isUrl: false },
          ],
        }),
        createImage({ id: 2, codes: [], error: "" }),
        createImage({ id: 3, codes: [], error: "cannot decode" }),
        createImage({
          id: 4,
          codes: [{ text: "three", format: "EAN13", isUrl: false }],
        }),
      ],
    };

    expect(summarizeBatch(batch)).toEqual({
      imageCount: 4,
      decodedImageCount: 2,
      codeCount: 3,
    });
  });

  it("returns zero counts for an empty batch", () => {
    expect(summarizeBatch({ id: 1, images: [] })).toEqual({
      imageCount: 0,
      decodedImageCount: 0,
      codeCount: 0,
    });
  });
});
