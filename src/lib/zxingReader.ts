import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import {
  prepareZXingModule,
  readBarcodes,
  type ReadResult,
} from "zxing-wasm/reader";

const THUMBNAIL_MAX_EDGE = 96;

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建图片解码画布");
    }
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export async function decodeImageData(input: ImageData): Promise<ReadResult[]> {
  return readBarcodes(input, {
    formats: [],
    tryHarder: true,
    maxNumberOfSymbols: 0,
  });
}

export function imageDataToThumbnail(imageData: ImageData): string {
  try {
    const scale = Math.min(
      1,
      THUMBNAIL_MAX_EDGE / Math.max(imageData.width, imageData.height),
    );
    const width = Math.max(1, Math.round(imageData.width * scale));
    const height = Math.max(1, Math.round(imageData.height * scale));

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = imageData.width;
    sourceCanvas.height = imageData.height;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) {
      return "";
    }
    sourceContext.putImageData(imageData, 0, 0);

    const thumbnailCanvas = document.createElement("canvas");
    thumbnailCanvas.width = width;
    thumbnailCanvas.height = height;
    const thumbnailContext = thumbnailCanvas.getContext("2d");
    if (!thumbnailContext) {
      return "";
    }
    thumbnailContext.imageSmoothingEnabled = true;
    thumbnailContext.imageSmoothingQuality = "high";
    thumbnailContext.drawImage(sourceCanvas, 0, 0, width, height);
    return thumbnailCanvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
