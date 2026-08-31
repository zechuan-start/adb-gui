export const SUPPORTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp"] as const;

export const MAX_IMAGE_BATCH_SIZE = 50;
const SUPPORTED_IMAGE_EXTENSION_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

export type DecodeInput = ImageData;

export interface DecodedCode {
  text: string;
  format: string;
  isUrl: boolean;
}

export interface DecodedImage {
  id: number;
  name: string;
  path: string | null;
  thumbnail: string;
  codes: readonly DecodedCode[];
  error: string;
}

export interface DecodedBatch {
  id: number;
  images: readonly DecodedImage[];
}

export interface DecodeSource {
  name: string;
  path: string | null;
  loadInput: () => Promise<DecodeInput>;
}

export interface ReadResultLike {
  text: string;
  format: string;
  isValid: boolean;
}

export function isSupportedImagePath(path: string): boolean {
  const separatorIndex = path.lastIndexOf(".");
  if (separatorIndex < 0 || separatorIndex === path.length - 1) {
    return false;
  }

  return SUPPORTED_IMAGE_EXTENSION_SET.has(path.slice(separatorIndex + 1).toLowerCase());
}

export function partitionImagePaths(paths: readonly string[]): {
  accepted: string[];
  rejectedCount: number;
  truncatedCount: number;
} {
  const supportedPaths = paths.filter(isSupportedImagePath);
  const accepted = supportedPaths.slice(0, MAX_IMAGE_BATCH_SIZE);

  return {
    accepted,
    rejectedCount: paths.length - supportedPaths.length,
    truncatedCount: supportedPaths.length - accepted.length,
  };
}

export function normalizeReadResults(results: readonly ReadResultLike[]): DecodedCode[] {
  return results
    .filter((result) => result.isValid !== false)
    .map((result) => ({
      text: result.text,
      format: result.format,
      isUrl: isHttpUrl(result.text),
    }));
}

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

export function buildCopyAllText(batch: DecodedBatch): string {
  return batch.images.flatMap((image) => image.codes.map((code) => code.text)).join("\n");
}

export function summarizeBatch(batch: DecodedBatch): {
  imageCount: number;
  decodedImageCount: number;
  codeCount: number;
} {
  return {
    imageCount: batch.images.length,
    decodedImageCount: batch.images.filter((image) => image.codes.length > 0).length,
    codeCount: batch.images.reduce((count, image) => count + image.codes.length, 0),
  };
}
