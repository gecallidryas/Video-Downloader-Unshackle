export type FfmpegCommandPlan = {
    file: 'ffmpeg' | 'ffprobe';
    args: string[];
};
export type FfmpegProtocol = 'direct' | 'hls' | 'dash';
export type FfmpegOutputKind = 'original' | 'mp4' | 'mkv' | 'webm' | 'audio-only';
export type FfmpegThumbnailFormat = 'jpg' | 'png' | 'webp';
export type FfmpegPreviewFormat = 'webm' | 'mp4' | 'gif';
export type FfmpegTrim = {
    startSec?: number;
    endSec?: number;
};
export type FfmpegExportPayload = {
    jobId: string;
    inputUrl: string;
    protocol: FfmpegProtocol;
    outputName: string;
    outputKind: FfmpegOutputKind;
    outputPath?: string;
    trim?: FfmpegTrim;
    headers?: Record<string, string>;
};
export type FfmpegThumbnailPayload = {
    candidateId: string;
    inputUrl: string;
    atSec?: number;
    format: FfmpegThumbnailFormat;
    headers?: Record<string, string>;
};
export type FfmpegPreviewClipPayload = {
    candidateId: string;
    inputUrl: string;
    startSec?: number;
    durationSec: number;
    format: FfmpegPreviewFormat;
    headers?: Record<string, string>;
};
export declare function buildProbeArgs(inputUrl: string): FfmpegCommandPlan;
export declare function buildExportArgs(payload: FfmpegExportPayload, outputPath: string): FfmpegCommandPlan;
export declare function buildThumbnailArgs(payload: FfmpegThumbnailPayload, outputPath: string): FfmpegCommandPlan;
export declare function buildPreviewClipArgs(payload: FfmpegPreviewClipPayload, outputPath: string): FfmpegCommandPlan;
