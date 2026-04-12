import type {
  DownloadJob,
  JobOutput,
  SegmentPlan,
} from '@/video_downloader_types_skeleton';
import { createMuxPlan, type MuxPlan } from '@/src/core/mux/mux-plan';

export type ChromeDownload = (
  options: chrome.downloads.DownloadOptions,
) => Promise<number>;

export interface DirectDownloadExportInput {
  url: string;
  filename: string;
  mimeType: string;
  saveAs?: boolean;
  download?: ChromeDownload;
}

export interface SegmentedExportPlanInput {
  job: DownloadJob;
  plan: SegmentPlan;
  outputName: string;
  estimatedBytes?: number;
  durationSec?: number;
  memoryCeilingBytes?: number;
  opfsAvailable: boolean;
}

export interface BlobDownloadExportInput {
  blob: Blob;
  filename: string;
  mimeType: string;
  saveAs?: boolean;
  writeFile?: (filename: string, data: Uint8Array) => Promise<void>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  download?: ChromeDownload;
}

export interface RawSegmentOutputNameInput {
  displayName: string;
  protocol: 'hls' | 'dash';
  extension?: string;
}

export async function exportDirectDownload(
  input: DirectDownloadExportInput,
): Promise<JobOutput> {
  const download = input.download ?? chrome.downloads.download;
  const downloadId = await download({
    url: input.url,
    filename: input.filename,
    saveAs: Boolean(input.saveAs),
  });

  return {
    fileName: input.filename,
    mimeType: input.mimeType,
    outputUrl: input.url,
    downloadId,
  };
}

export function createSegmentedExportPlan(
  input: SegmentedExportPlanInput,
): MuxPlan {
  return createMuxPlan({
    job: input.job,
    segmentPlan: input.plan,
    outputName: input.outputName,
    estimatedBytes: input.estimatedBytes ?? input.job.bytesTotal,
    durationSec: input.durationSec,
    memoryCeilingBytes: input.memoryCeilingBytes,
    opfsAvailable: input.opfsAvailable,
  });
}

export function joinSegmentsToBlob(parts: Uint8Array[], mimeType: string): Blob {
  return new Blob(parts.map((part) => {
    const buffer = new ArrayBuffer(part.byteLength);
    new Uint8Array(buffer).set(part);
    return buffer;
  }), { type: mimeType });
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const buffer =
    typeof blob.arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve(reader.result);
              return;
            }

            reject(new Error('Blob reader did not return bytes.'));
          });
          reader.addEventListener(
            'error',
            () => reject(reader.error ?? new Error('Blob read failed.')),
          );
          reader.readAsArrayBuffer(blob);
        });
  return new Uint8Array(buffer);
}

export async function exportBlobDownload(
  input: BlobDownloadExportInput,
): Promise<JobOutput> {
  if (input.writeFile) {
    const bytes = await blobToBytes(input.blob);

    await input.writeFile(input.filename, bytes);

    return {
      fileName: input.filename,
      mimeType: input.mimeType,
      outputUrl: `file-system-access://${input.filename}`,
      sizeBytes: bytes.byteLength,
      notes: ['Saved directly to the selected output folder.'],
    };
  }

  const createObjectUrl =
    input.createObjectUrl ??
    (typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL.bind(URL)
      : undefined);

  if (!createObjectUrl) {
    throw new Error(
      'URL.createObjectURL is unavailable in this context (MV3 service worker). ' +
      'Use an offscreen document or defer to the native download path instead.',
    );
  }

  const revokeObjectUrl =
    input.revokeObjectUrl ??
    (typeof URL.revokeObjectURL === 'function'
      ? URL.revokeObjectURL.bind(URL)
      : undefined);
  const download = input.download ?? chrome.downloads.download;
  const outputUrl = createObjectUrl(input.blob);
  const downloadId = await download({
    url: outputUrl,
    filename: input.filename,
    saveAs: Boolean(input.saveAs),
  });

  if (revokeObjectUrl) {
    setTimeout(() => revokeObjectUrl(outputUrl), 30_000);
  }

  return {
    fileName: input.filename,
    mimeType: input.mimeType,
    outputUrl,
    downloadId,
    sizeBytes: input.blob.size,
  };
}

export function rawSegmentOutputName(input: RawSegmentOutputNameInput): string {
  const extension = input.extension ?? (input.protocol === 'hls' ? 'ts' : 'bin');
  const normalizedExtension = extension.replace(/^\.+/, '').toLowerCase();
  const baseName = input.displayName.replace(/\.[^./\\]+$/, '');
  const safeBaseName = baseName.length > 0 ? baseName : 'download';

  return `${safeBaseName}.${normalizedExtension}`;
}
