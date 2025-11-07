import { isSensitiveHeader } from '@/src/core/export/command-generation-policy';
import type { ExternalPlayerProfile } from '@/src/background/settings/settings-store';

export interface PlayerLaunchInput {
  profile: ExternalPlayerProfile;
  url: string;
  headers?: Record<string, string>;
  allowSensitive?: boolean;
}

export interface PlayerLauncher {
  launch(input: PlayerLaunchInput): Promise<{ ok: boolean }>;
}

export interface PlayerLauncherOptions {
  sendNativeMessage: (payload: Record<string, unknown>) => Promise<{ ok: boolean }>;
}

function filterHeaders(
  headers: Record<string, string> | undefined,
  allowSensitive: boolean,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (isSensitiveHeader(name) && !allowSensitive) continue;
    out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createPlayerLauncher(options: PlayerLauncherOptions): PlayerLauncher {
  return {
    async launch(input) {
      if (!input.url) {
        throw new Error('URL required to launch player');
      }
      if (!input.profile.path) {
        throw new Error('Player path required to launch');
      }
      const headers = filterHeaders(input.headers, Boolean(input.allowSensitive));
      const payload: Record<string, unknown> = {
        action: 'launch-player',
        playerPath: input.profile.path,
        url: input.url,
      };
      if (headers) payload.headers = headers;
      return options.sendNativeMessage(payload);
    },
  };
}
