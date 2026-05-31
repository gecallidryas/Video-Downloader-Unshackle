import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { type JobRegistry } from './job-registry.js';
import { type YtDlpCommandPlan } from './ytdlp-command.js';
export type YtDlpProgressEvent = {
    type: 'PROGRESS';
    payload: {
        jobId: string;
        progressPct: number;
        phase: 'fetching' | 'completed';
    };
};
export type YtDlpJobResult = {
    jobId: string;
    outputPath: string;
    mimeType?: string;
    sizeBytes?: number;
};
export declare class YtDlpRunnerError extends Error {
    readonly code: 'YTDLP_START_FAILED' | 'YTDLP_FAILED' | 'YTDLP_CANCELLED';
    readonly stderr: string;
    readonly exitCode?: number | null | undefined;
    constructor(code: 'YTDLP_START_FAILED' | 'YTDLP_FAILED' | 'YTDLP_CANCELLED', message: string, stderr?: string, exitCode?: number | null | undefined);
}
export type SpawnYtDlp = (file: string, args: string[]) => ChildProcessByStdio<null, Readable, Readable>;
export type StatBytes = (outputPath: string) => Promise<number | undefined>;
export type RunYtDlpJobOptions = {
    jobId: string;
    plan: YtDlpCommandPlan;
    mimeType?: string;
    stderrLimitBytes?: number;
    registry?: JobRegistry;
    onProgress?: (event: YtDlpProgressEvent) => void;
    spawnProcess?: SpawnYtDlp;
    statBytes?: StatBytes;
};
export declare function runYtDlpJob(options: RunYtDlpJobOptions): Promise<YtDlpJobResult>;
