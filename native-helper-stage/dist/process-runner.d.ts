import type { FfmpegCommandPlan } from './ffmpeg-command.js';
import { type JobRegistry } from './job-registry.js';
export type ProcessProgressEvent = {
    type: 'PROGRESS';
    payload: {
        jobId: string;
        progressPct: number;
        phase: 'exporting' | 'completed';
        timeSec?: number;
    };
};
export type ProcessJobResult = {
    jobId: string;
    outputPath: string;
    sizeBytes?: number;
    mimeType?: string;
};
export type RunProcessJobOptions = {
    jobId: string;
    plan: FfmpegCommandPlan;
    outputPath: string;
    expectedDurationSec?: number;
    mimeType?: string;
    stderrLimitBytes?: number;
    registry?: JobRegistry;
    onProgress?: (event: ProcessProgressEvent) => void;
};
export declare class ProcessRunnerError extends Error {
    readonly code: 'PROCESS_START_FAILED' | 'PROCESS_FAILED' | 'PROCESS_CANCELLED';
    readonly stderr: string;
    readonly exitCode?: number | null | undefined;
    constructor(code: 'PROCESS_START_FAILED' | 'PROCESS_FAILED' | 'PROCESS_CANCELLED', message: string, stderr?: string, exitCode?: number | null | undefined);
}
export declare function runProcessJob(options: RunProcessJobOptions): Promise<ProcessJobResult>;
