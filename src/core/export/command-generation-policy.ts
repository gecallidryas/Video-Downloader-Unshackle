/**
 * Policy for generating external tool commands (yt-dlp, FFmpeg, Streamlink, etc).
 *
 * SAFETY RULE: Default command output must NEVER include:
 * - Cookie or Set-Cookie headers
 * - Authorization headers
 * - --cookies-from-browser flags
 *
 * Sensitive headers may only be included when:
 * 1. advancedMode is enabled in settings
 * 2. includeAuthHeaders is explicitly true for this generation call
 *
 * When auth headers ARE included, the output must contain a warning comment.
 */

export interface CommandGenerationOptions {
  url: string;
  filename?: string;
  referer?: string;
  origin?: string;
  userAgent?: string;
  cookie?: string;
  authorization?: string;
  proxy?: string;
  includeAuthHeaders?: boolean;
}

export interface GeneratedCommand {
  command: string;
  containsSensitiveData: boolean;
}

const AUTH_WARNING = '# WARNING: This command contains authentication data. Do not share.';

const SAFE_HEADER_KEYS = new Set(['referer', 'origin', 'user-agent']);

export function isSensitiveHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'cookie' || lower === 'set-cookie' || lower === 'authorization';
}

export function buildHeaderFlags(
  options: CommandGenerationOptions,
): { flags: string[]; containsSensitiveData: boolean } {
  const flags: string[] = [];
  let containsSensitiveData = false;

  if (options.referer) {
    flags.push(`--referer "${options.referer}"`);
  }
  if (options.userAgent) {
    flags.push(`--user-agent "${options.userAgent}"`);
  }

  if (options.includeAuthHeaders) {
    if (options.cookie) {
      flags.push(`--add-header "Cookie: ${options.cookie}"`);
      containsSensitiveData = true;
    }
    if (options.authorization) {
      flags.push(`--add-header "Authorization: ${options.authorization}"`);
      containsSensitiveData = true;
    }
  }

  return { flags, containsSensitiveData };
}

export function wrapWithWarning(command: string, containsSensitiveData: boolean): GeneratedCommand {
  return {
    command: containsSensitiveData ? `${AUTH_WARNING}\n${command}` : command,
    containsSensitiveData,
  };
}
