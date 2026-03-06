export interface ReleaseManifestInput {
  packageJson: {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
  };
  manifest: {
    name?: string;
    version?: string;
    icons?: Record<number, string>;
    permissions?: string[];
  };
  existingFiles: Set<string>;
}

const REQUIRED_ICON_SIZES = [16, 32, 48, 128] as const;

export function validateReleaseManifest(input: ReleaseManifestInput): string[] {
  const errors: string[] = [];
  const { packageJson, manifest, existingFiles } = input;

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

    const publicPath = `public/${iconPath.replace(/^\/+/, '')}`;
    if (!existingFiles.has(publicPath)) {
      errors.push(`Missing icon asset ${publicPath}.`);
    }
  }

  if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes('downloads')) {
    errors.push('Manifest must include downloads permission.');
  }

  return errors;
}
