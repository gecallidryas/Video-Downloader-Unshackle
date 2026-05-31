export type HelperOutputDirs = {
    baseDir: string;
    outputsDir: string;
    previewsDir: string;
    thumbsDir: string;
    tmpDir: string;
};
export type HelperOutputSubdir = 'outputs' | 'previews' | 'thumbs' | 'tmp';
export declare function ensureHelperOutputDirs(baseDir?: string): Promise<HelperOutputDirs>;
export declare function getHelperBaseDir(env?: NodeJS.ProcessEnv): string;
export declare function helperOwnedPath(dirs: HelperOutputDirs, subdir: HelperOutputSubdir, unsafeName: string, extension: string): string;
export declare function sanitizeBaseName(value: string): string;
