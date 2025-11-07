import { isSensitiveHeader } from '@/src/core/export/command-generation-policy';
import type { ExternalPlayerProfile } from '@/src/background/settings/settings-store';
import type { Aria2Client } from './aria2-client';
import type { PlayerLauncher } from './player-launcher';

export interface ExternalHubOptions {
  aria2Enabled: boolean;
  webhookEnabled: boolean;
  webhookUrl?: string;
  aria2Client: Aria2Client;
  webhookFetch: typeof fetch;
  playerLauncher: PlayerLauncher;
}

export interface DispatchInput {
  url: string;
  filename?: string;
  referer?: string;
  origin?: string;
  headers?: Record<string, string>;
  advancedMode?: boolean;
  includeAuthHeaders?: boolean;
}

export interface DispatchResult {
  aria2Gid?: string;
  webhookOk: boolean;
}

export interface ExternalHub {
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  launchPlayer(
    profile: ExternalPlayerProfile,
    input: { url: string; headers?: Record<string, string>; allowSensitive?: boolean },
  ): Promise<{ ok: boolean }>;
}

function redactHeaders(
  headers: Record<string, string> | undefined,
  allow: boolean,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (isSensitiveHeader(name) && !allow) continue;
    out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createExternalHub(options: ExternalHubOptions): ExternalHub {
  return {
    async dispatch(input) {
      const allowSensitive = Boolean(input.advancedMode && input.includeAuthHeaders);
      const result: DispatchResult = { webhookOk: false };

      if (options.aria2Enabled) {
        const filteredHeaders = redactHeaders(input.headers, allowSensitive);
        result.aria2Gid = await options.aria2Client.addUri(input.url, {
          referer: input.referer,
          headers: filteredHeaders,
          filename: input.filename,
          allowSensitive,
        });
      }

      if (options.webhookEnabled && options.webhookUrl) {
        const payload = {
          url: input.url,
          filename: input.filename,
          referer: input.referer,
          origin: input.origin,
          headers: redactHeaders(input.headers, allowSensitive),
        };
        const response = await options.webhookFetch(options.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        result.webhookOk = response.ok;
      }

      return result;
    },

    async launchPlayer(profile, input) {
      return options.playerLauncher.launch({
        profile,
        url: input.url,
        headers: input.headers,
        allowSensitive: input.allowSensitive,
      });
    },
  };
}
