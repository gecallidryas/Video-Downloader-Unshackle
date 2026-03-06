import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ICON_SIZES = [16, 32, 48, 128];

export function validateReleaseManifest(input) {
  const errors = [];
  const packageJson = input.packageJson;
  const manifest = input.manifest;
  const existingFiles = input.existingFiles;

  if (!packageJson.name) {
    errors.push('package.json is missing name.');
  }

  if (!packageJson.version || packageJson.version !== manifest.version) {
    errors.push('package.json version must match manifest version.');
  }

  if (!packageJson.scripts?.build) {
    errors.push('package.json is missing build script.');
  }

  if (!packageJson.scripts?.['release:check']) {
    errors.push('package.json is missing release:check script.');
  }

  for (const size of REQUIRED_ICON_SIZES) {
    const iconPath = manifest.icons?.[size];
    if (!iconPath) {
      errors.push(`Missing manifest icon size ${size}.`);
      continue;
    }

    const publicPath = `public/${String(iconPath).replace(/^\/+/, '')}`;
    if (!existingFiles.has(publicPath)) {
      errors.push(`Missing icon asset ${publicPath}.`);
    }
  }

  if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes('downloads')) {
    errors.push('Manifest must include downloads permission.');
  }

  return errors;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectExistingFiles(rootDir) {
  const files = new Set();

  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        files.add(path.relative(rootDir, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  visit(path.join(rootDir, 'public'));
  return files;
}

async function main() {
  const rootDir = process.cwd();
  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const builtManifestPath = path.join(rootDir, '.output', 'chrome-mv3', 'manifest.json');
  const manifest = fs.existsSync(builtManifestPath)
    ? readJson(builtManifestPath)
    : {
        name: 'Video Downloader - Unshackle',
        version: packageJson.version,
        icons: {
          16: 'icon-16.png',
          32: 'icon-32.png',
          48: 'icon-48.png',
          128: 'icon-128.png',
        },
        permissions: [
          'downloads',
          'storage',
        ],
      };

  const errors = validateReleaseManifest({
    packageJson,
    manifest,
    existingFiles: collectExistingFiles(rootDir),
  });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`release-check: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('release-check: manifest, icons, and package metadata are valid');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
