import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const APP_DIR = 'VideoDownloaderUnshackle';
export async function ensureHelperOutputDirs(baseDir = getHelperBaseDir()) {
    const dirs = {
        baseDir,
        outputsDir: path.join(baseDir, 'outputs'),
        previewsDir: path.join(baseDir, 'previews'),
        thumbsDir: path.join(baseDir, 'thumbs'),
        tmpDir: path.join(baseDir, 'tmp'),
    };
    await Promise.all(Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })));
    return dirs;
}
export function getHelperBaseDir(env = process.env) {
    const localAppData = env.LOCALAPPDATA;
    if (process.platform === 'win32' && localAppData) {
        return path.join(localAppData, APP_DIR);
    }
    return path.join(os.tmpdir(), APP_DIR);
}
export function helperOwnedPath(dirs, subdir, unsafeName, extension) {
    const dir = subdirPath(dirs, subdir);
    const sanitizedBase = sanitizeBaseName(unsafeName);
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    const pathApi = dir.includes('\\') ? path.win32 : path;
    return pathApi.join(dir, `${sanitizedBase}${normalizedExtension}`);
}
export function sanitizeBaseName(value) {
    const parsed = path.parse(value);
    const base = (parsed.name || value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'media';
}
function subdirPath(dirs, subdir) {
    switch (subdir) {
        case 'outputs':
            return dirs.outputsDir;
        case 'previews':
            return dirs.previewsDir;
        case 'thumbs':
            return dirs.thumbsDir;
        case 'tmp':
            return dirs.tmpDir;
        default:
            throw new Error(`Unknown helper output subdir: ${String(subdir)}`);
    }
}
//# sourceMappingURL=output-paths.js.map