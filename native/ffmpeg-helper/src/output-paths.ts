import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type HelperOutputDirs = {
  baseDir: string;
  outputsDir: string;
  previewsDir: string;
  thumbsDir: string;
  tmpDir: string;
};

export type HelperOutputSubdir = 'outputs' | 'previews' | 'thumbs' | 'tmp';

const APP_DIR = 'VideoDownloaderUnshackle';

export async function ensureHelperOutputDirs(baseDir = getHelperBaseDir()): Promise<HelperOutputDirs> {
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

export function getHelperBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = env.LOCALAPPDATA;
  if (process.platform === 'win32' && localAppData) {
    return path.join(localAppData, APP_DIR);
  }

  return path.join(os.tmpdir(), APP_DIR);
}

export function helperOwnedPath(
  dirs: HelperOutputDirs,
  subdir: HelperOutputSubdir,
  unsafeName: string,
  extension: string,
): string {
  const dir = subdirPath(dirs, subdir);
  const sanitizedBase = sanitizeBaseName(unsafeName);
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;

  return path.join(dir, `${sanitizedBase}${normalizedExtension}`);
}

export function sanitizeBaseName(value: string): string {
  const parsed = path.parse(value);
  const base = (parsed.name || value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

  return base || 'media';
}

function subdirPath(dirs: HelperOutputDirs, subdir: HelperOutputSubdir): string {
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
