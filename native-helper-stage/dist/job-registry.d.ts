import type { EventEmitter } from 'node:events';
export type KillableProcess = EventEmitter & {
    kill(signal?: NodeJS.Signals | number): boolean;
};
export declare class JobRegistry {
    #private;
    register(jobId: string, process: KillableProcess): void;
    has(jobId: string): boolean;
    cancel(jobId: string): boolean;
    wasCancelled(jobId: string): boolean;
    cleanup(jobId: string): boolean;
}
export declare const defaultJobRegistry: JobRegistry;
