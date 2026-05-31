export type SidecarOutput = {
    outputPath: string;
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
};
export type ListSidecarsDeps = {
    readDir?: (dir: string) => Promise<string[]>;
    statBytes?: (filePath: string) => Promise<number | undefined>;
};
export declare function listYtDlpSidecars(videoOutputPath: string, deps?: ListSidecarsDeps): Promise<SidecarOutput[]>;
