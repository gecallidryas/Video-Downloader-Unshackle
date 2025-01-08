import type {
  BinaryStore,
  ResumeSnapshot,
} from '@/video_downloader_types_skeleton';

export interface ResumeStore {
  save(snapshot: ResumeSnapshot): Promise<void>;
  load(jobId: string): Promise<ResumeSnapshot | undefined>;
  delete(jobId: string): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function resumePath(jobId: string): string {
  return `resume/${jobId}.json`;
}

async function readBlobText(blob: Blob): Promise<string> {
  const blobWithText = blob as Blob & { text?: () => Promise<string> };
  const blobWithArrayBuffer = blob as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof blobWithText.text === 'function') {
    return blobWithText.text();
  }

  if (typeof blobWithArrayBuffer.arrayBuffer === 'function') {
    return decoder.decode(await blobWithArrayBuffer.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

export function createResumeStore(binaryStore: BinaryStore): ResumeStore {
  return {
    async save(snapshot) {
      await binaryStore.put(
        resumePath(snapshot.jobId),
        encoder.encode(JSON.stringify(snapshot)),
      );
    },

    async load(jobId) {
      const path = resumePath(jobId);

      if (!await binaryStore.exists(path)) {
        return undefined;
      }

      const file = await binaryStore.get(path);
      const text = await readBlobText(file);

      return JSON.parse(text) as ResumeSnapshot;
    },

    async delete(jobId) {
      await binaryStore.delete(resumePath(jobId));
    },
  };
}
