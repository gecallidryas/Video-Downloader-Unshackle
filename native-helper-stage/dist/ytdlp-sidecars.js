import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
// Subtitle containers yt-dlp writes with --write-subs. Mapped to MIME so the
// browser delivers them with a sensible type.
const SUBTITLE_MIME = {
    '.srt': 'application/x-subrip',
    '.vtt': 'text/vtt',
    '.ass': 'text/x-ass',
    '.ssa': 'text/x-ssa',
    '.lrc': 'text/plain',
    '.ttml': 'application/ttml+xml',
};
const defaultReadDir = (dir) => readdir(dir);
const defaultStatBytes = async (filePath) => {
    try {
        return (await stat(filePath)).size;
    }
    catch {
        return undefined;
    }
};
// yt-dlp names sidecars `<base>.<lang>.<ext>` next to the video output. Enumerate
// sibling subtitle files sharing the video's base name (excluding the video).
export async function listYtDlpSidecars(videoOutputPath, deps = {}) {
    const readDir = deps.readDir ?? defaultReadDir;
    const statBytes = deps.statBytes ?? defaultStatBytes;
    const pathApi = videoOutputPath.includes('\\') ? path.win32 : path.posix;
    const dir = pathApi.dirname(videoOutputPath);
    const videoFile = pathApi.basename(videoOutputPath);
    const videoExt = pathApi.extname(videoFile);
    const base = videoFile.slice(0, videoFile.length - videoExt.length);
    let entries;
    try {
        entries = await readDir(dir);
    }
    catch {
        return [];
    }
    const sidecars = [];
    for (const entry of entries) {
        if (entry === videoFile) {
            continue;
        }
        const ext = pathApi.extname(entry).toLowerCase();
        const mimeType = SUBTITLE_MIME[ext];
        if (!mimeType || !entry.startsWith(`${base}.`)) {
            continue;
        }
        const outputPath = pathApi.join(dir, entry);
        const sizeBytes = await statBytes(outputPath);
        sidecars.push({
            outputPath,
            fileName: entry,
            mimeType,
            ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        });
    }
    return sidecars.sort((a, b) => a.fileName.localeCompare(b.fileName));
}
//# sourceMappingURL=ytdlp-sidecars.js.map