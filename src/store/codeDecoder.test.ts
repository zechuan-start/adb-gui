import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BATCH_SIZE,
  type DecodeInput,
  type DecodeSource,
} from "@/lib/codeDecoder";
import { decodeImageData, imageDataToThumbnail } from "@/lib/zxingReader";
import { useCodeDecoderStore } from "@/store/codeDecoder";

vi.mock("@/lib/tauri", () => ({}));
vi.mock("@/lib/zxingReader", () => ({
  decodeImageData: vi.fn(),
  imageDataToThumbnail: vi.fn(),
}));

const decodeImageDataMock = vi.mocked(decodeImageData);
const imageDataToThumbnailMock = vi.mocked(imageDataToThumbnail);

beforeEach(() => {
  vi.clearAllMocks();
  decodeImageDataMock.mockResolvedValue([]);
  imageDataToThumbnailMock.mockReturnValue("data:image/png;base64,thumb");
  useCodeDecoderStore.setState({ batch: null, progress: null, runToken: 0 });
});

describe("useCodeDecoderStore", () => {
  it("逐张推进进度并增量写回结果", async () => {
    const secondInput = deferred<DecodeInput>();
    decodeImageDataMock
      .mockResolvedValueOnce([readResult("first")])
      .mockResolvedValueOnce([readResult("second", "Code128")]);

    const run = useCodeDecoderStore.getState().decodeSources([
      source("first.png"),
      source("second.png", () => secondInput.promise),
    ]);

    await vi.waitFor(() => {
      expect(useCodeDecoderStore.getState().progress).toEqual({ done: 1, total: 2 });
      expect(useCodeDecoderStore.getState().batch?.images).toHaveLength(1);
    });
    secondInput.resolve(TEST_INPUT);
    await run;

    expect(useCodeDecoderStore.getState().progress).toBeNull();
    expect(useCodeDecoderStore.getState().batch?.images.map((image) => image.name)).toEqual([
      "first.png",
      "second.png",
    ]);
  });

  it("隔离单张失败并继续后续图片", async () => {
    await useCodeDecoderStore.getState().decodeSources([
      source("broken.png", () => Promise.reject(new Error("图片损坏"))),
      source("valid.png"),
    ]);

    const images = useCodeDecoderStore.getState().batch?.images;
    expect(images).toHaveLength(2);
    expect(images?.[0]).toMatchObject({ error: "图片损坏", codes: [] });
    expect(images?.[1]).toMatchObject({ error: "", codes: [] });
    expect(decodeImageDataMock).toHaveBeenCalledTimes(1);
  });

  it("清空后丢弃旧异步任务的回写", async () => {
    const pendingInput = deferred<DecodeInput>();
    const run = useCodeDecoderStore
      .getState()
      .decodeSources([source("slow.png", () => pendingInput.promise)]);

    expect(useCodeDecoderStore.getState().progress).toEqual({ done: 0, total: 1 });
    useCodeDecoderStore.getState().clear();
    pendingInput.resolve(TEST_INPUT);
    await run;

    expect(useCodeDecoderStore.getState()).toMatchObject({
      batch: null,
      progress: null,
      runToken: 2,
    });
    expect(decodeImageDataMock).not.toHaveBeenCalled();
  });

  it("解码中拒绝重复提交且不中断当前批次", async () => {
    const pendingInput = deferred<DecodeInput>();
    const firstRun = useCodeDecoderStore
      .getState()
      .decodeSources([source("first.png", () => pendingInput.promise)]);
    const rejectedLoad = vi.fn(async () => TEST_INPUT);

    await useCodeDecoderStore
      .getState()
      .decodeSources([source("rejected.png", rejectedLoad)]);

    expect(rejectedLoad).not.toHaveBeenCalled();
    expect(useCodeDecoderStore.getState().progress).toEqual({ done: 0, total: 1 });
    expect(useCodeDecoderStore.getState().runToken).toBe(1);
    pendingInput.resolve(TEST_INPUT);
    await firstRun;
    expect(useCodeDecoderStore.getState().batch?.images[0]?.name).toBe("first.png");
  });

  it("区分正常零结果与图片失败", async () => {
    await useCodeDecoderStore.getState().decodeSources([
      source("empty.png"),
      source("failed.png", () => Promise.reject("无法读取")),
    ]);

    expect(useCodeDecoderStore.getState().batch?.images).toEqual([
      expect.objectContaining({ name: "empty.png", codes: [], error: "" }),
      expect.objectContaining({ name: "failed.png", codes: [], error: "无法读取" }),
    ]);
  });

  it("最多处理 50 个来源", async () => {
    const loaders = Array.from({ length: MAX_IMAGE_BATCH_SIZE + 1 }, () =>
      vi.fn(async () => TEST_INPUT),
    );

    await useCodeDecoderStore
      .getState()
      .decodeSources(loaders.map((loadInput, index) => source(`${index}.png`, loadInput)));

    expect(useCodeDecoderStore.getState().batch?.images).toHaveLength(MAX_IMAGE_BATCH_SIZE);
    expect(decodeImageDataMock).toHaveBeenCalledTimes(MAX_IMAGE_BATCH_SIZE);
    expect(loaders[MAX_IMAGE_BATCH_SIZE]).not.toHaveBeenCalled();
  });
});

const TEST_INPUT = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(4),
  colorSpace: "srgb",
} as DecodeInput;

function source(
  name: string,
  loadInput: () => Promise<DecodeInput> = async () => TEST_INPUT,
): DecodeSource {
  return { name, path: `/tmp/${name}`, loadInput };
}

function readResult(text: string, format = "QRCode") {
  return { text, format, isValid: true } as Awaited<
    ReturnType<typeof decodeImageData>
  >[number];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
