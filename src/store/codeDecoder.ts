import { create } from "zustand";
import {
  MAX_IMAGE_BATCH_SIZE,
  normalizeReadResults,
  type DecodedBatch,
  type DecodedImage,
  type DecodeSource,
} from "@/lib/codeDecoder";
import { decodeImageData, imageDataToThumbnail } from "@/lib/zxingReader";

export interface DecodeProgress {
  done: number;
  total: number;
}

interface CodeDecoderStore {
  batch: DecodedBatch | null;
  progress: DecodeProgress | null;
  runToken: number;
  decodeSources: (sources: DecodeSource[]) => Promise<void>;
  clear: () => void;
}

let nextBatchId = 1;

export const useCodeDecoderStore = create<CodeDecoderStore>((set, get) => ({
  batch: null,
  progress: null,
  runToken: 0,
  decodeSources: async (sources) => {
    const currentState = get();
    if (currentState.progress !== null || sources.length === 0) {
      return;
    }

    const acceptedSources = sources.slice(0, MAX_IMAGE_BATCH_SIZE);
    const batchId = nextBatchId;
    nextBatchId += 1;
    const runToken = currentState.runToken + 1;
    set({
      batch: { id: batchId, images: [] },
      progress: { done: 0, total: acceptedSources.length },
      runToken,
    });

    for (const [index, source] of acceptedSources.entries()) {
      if (get().runToken !== runToken) {
        return;
      }

      const decodedImage = await decodeSource(source, index + 1, () => {
        return get().runToken === runToken;
      });
      if (decodedImage === null || get().runToken !== runToken) {
        return;
      }

      set((state) => {
        if (state.runToken !== runToken || state.batch?.id !== batchId) {
          return state;
        }
        return {
          batch: {
            ...state.batch,
            images: [...state.batch.images, decodedImage],
          },
          progress: {
            done: index + 1,
            total: acceptedSources.length,
          },
        };
      });
    }

    if (get().runToken === runToken) {
      set({ progress: null });
    }
  },
  clear: () => {
    set((state) => ({
      batch: null,
      progress: null,
      runToken: state.runToken + 1,
    }));
  },
}));

async function decodeSource(
  source: DecodeSource,
  id: number,
  isCurrentRun: () => boolean,
): Promise<DecodedImage | null> {
  try {
    const input = await source.loadInput();
    if (!isCurrentRun()) {
      return null;
    }
    const results = await decodeImageData(input);
    if (!isCurrentRun()) {
      return null;
    }
    const thumbnail = imageDataToThumbnail(input);
    return {
      id,
      name: source.name,
      path: source.path,
      thumbnail,
      codes: normalizeReadResults(results),
      error: "",
    };
  } catch (error) {
    if (!isCurrentRun()) {
      return null;
    }
    return {
      id,
      name: source.name,
      path: source.path,
      thumbnail: "",
      codes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
