import type { NativeJson } from './native-protocol.js';
import { type FfmpegCommandPlan, type FfmpegExportPayload, type FfmpegPreviewClipPayload, type FfmpegThumbnailPayload } from './ffmpeg-command.js';
import { type JobRegistry } from './job-registry.js';
import { type HelperOutputDirs } from './output-paths.js';
import { type ProcessJobResult, type RunProcessJobOptions } from './process-runner.js';
import { type YtDlpExportPayload } from './ytdlp-command.js';
import { type RunYtDlpJobOptions, type YtDlpJobResult } from './ytdlp-runner.js';
import { type SidecarOutput } from './ytdlp-sidecars.js';
export type NativeHelperRequest = {
    type: 'PING';
    requestId: string;
} | {
    type: 'PROBE';
    requestId: string;
    payload: {
        inputUrl: string;
    };
} | {
    type: 'EXPORT_MEDIA';
    requestId: string;
    payload: FfmpegExportPayload;
} | {
    type: 'EXPORT_YTDLP';
    requestId: string;
    payload: YtDlpExportPayload;
} | {
    type: 'EXTRACT_THUMBNAIL';
    requestId: string;
    payload: FfmpegThumbnailPayload;
} | {
    type: 'EXTRACT_PREVIEW_CLIP';
    requestId: string;
    payload: FfmpegPreviewClipPayload;
} | {
    type: 'READ_ASSET_BYTES';
    requestId: string;
    payload: {
        outputPath: string;
        maxBytes: number;
        offset?: number;
    };
} | {
    type: 'CANCEL_JOB';
    requestId: string;
    payload: {
        jobId: string;
    };
} | {
    type: 'CLEANUP_JOB';
    requestId: string;
    payload: {
        jobId: string;
    };
};
export type NativeHelperResponse = {
    type: 'PONG';
    requestId: string;
    payload: {
        version: string;
        ffmpegAvailable: boolean;
        ffprobeAvailable: boolean;
        ytDlpAvailable: boolean;
        platform: string;
        installKind?: 'dev' | 'per-user' | 'system';
    };
} | {
    type: 'PROBE_RESULT';
    requestId: string;
    payload: ProbeResult;
} | {
    type: 'PROGRESS';
    requestId: string;
    payload: {
        jobId: string;
        progressPct: number;
        phase: 'fetching' | 'exporting' | 'completed';
        timeSec?: number;
    };
} | {
    type: 'COMPLETED';
    requestId: string;
    payload: ProcessJobResult & {
        sidecarOutputs?: SidecarOutput[];
    };
} | {
    type: 'THUMBNAIL_RESULT';
    requestId: string;
    payload: AssetResultPayload;
} | {
    type: 'PREVIEW_CLIP_RESULT';
    requestId: string;
    payload: PreviewAssetResultPayload;
} | {
    type: 'ASSET_BYTES_RESULT';
    requestId: string;
    payload: AssetBytesPayload;
} | {
    type: 'CANCELLED';
    requestId: string;
    payload: {
        jobId: string;
    };
} | {
    type: 'CLEANED_UP';
    requestId: string;
    payload: {
        jobId: string;
    };
} | {
    type: 'ERROR';
    requestId: string;
    payload: {
        code: string;
        message: string;
        detail?: NativeJson;
    };
};
export type ProbeResult = {
    durationSec?: number;
    width?: number;
    height?: number;
    formatName?: string;
    codecs?: string[];
};
type AssetResultPayload = {
    candidateId: string;
    outputPath: string;
    mimeType: string;
    dataUrl: string;
};
type PreviewAssetResultPayload = {
    candidateId: string;
    outputPath: string;
    mimeType: string;
    sizeBytes?: number;
};
type AssetBytesPayload = {
    outputPath: string;
    sizeBytes: number;
    base64: string;
    eof?: boolean;
};
export type RangedReadResult = {
    buffer: Buffer;
    bytesRead: number;
    fileSize: number;
};
export type DispatcherDeps = {
    checkExecutable?: (file: 'ffmpeg' | 'ffprobe' | 'yt-dlp') => Promise<boolean>;
    ensureOutputDirs?: () => Promise<HelperOutputDirs>;
    runProbe?: (plan: FfmpegCommandPlan) => Promise<ProbeResult>;
    runProcessJob?: (options: RunProcessJobOptions) => Promise<ProcessJobResult>;
    runYtDlpJob?: (options: RunYtDlpJobOptions) => Promise<YtDlpJobResult>;
    readSidecarOutputs?: (videoOutputPath: string) => Promise<SidecarOutput[]>;
    resolveFfmpegLocation?: () => Promise<string | undefined>;
    readAsset?: (outputPath: string) => Promise<Buffer | Uint8Array>;
    readAssetRange?: (outputPath: string, offset: number, length: number) => Promise<RangedReadResult>;
    registry?: JobRegistry;
};
export type ProgressEmitter = (message: NativeHelperResponse) => void;
export declare function dispatchNativeRequest(request: unknown, deps?: DispatcherDeps, emit?: ProgressEmitter): Promise<NativeHelperResponse>;
export {};
