export type YtDlpQuality = 'best' | 'best-mp4' | 'worst' | 'audio-only';
export type YtDlpTrim = {
    startSec?: number;
    endSec?: number;
};
export type YtDlpExportPayload = {
    jobId: string;
    inputUrl: string;
    outputName: string;
    outputPath?: string;
    quality: YtDlpQuality;
    subtitleLanguages?: string[];
    embedSubtitles?: boolean;
    writeSubtitles?: boolean;
    trim?: YtDlpTrim;
    headers?: Record<string, string>;
    binaryPath?: string;
    extraArgs?: string[];
};
export type YtDlpCommandPlan = {
    file: string;
    args: string[];
    outputPath: string;
};
export type BuildYtDlpArgsOptions = {
    outputPath: string;
    ffmpegLocation?: string;
};
export declare const YTDLP_PROGRESS_PREFIX = "[unshackle-progress]";
export declare function extensionForYtDlpQuality(quality: YtDlpQuality): string;
export declare function buildYtDlpArgs(payload: YtDlpExportPayload, options: BuildYtDlpArgsOptions): YtDlpCommandPlan;
