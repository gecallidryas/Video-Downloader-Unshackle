import {
  buildHeaderFlags,
  wrapWithWarning,
  type CommandGenerationOptions,
  type GeneratedCommand,
} from './command-generation-policy';
import { renderTemplate, type TemplateVariables } from './template-engine';

export type CommandProfileId =
  | 'yt-dlp'
  | 'ffmpeg'
  | 'streamlink'
  | 'hlsdl'
  | 'n_m3u8dl-re'
  | 'custom';

export interface CommandProfile {
  id: CommandProfileId;
  label: string;
  binary: string;
  urlFlag: string;
  outputFlag: string;
}

export interface RenderProfileOptions {
  customTemplate?: string;
  advancedMode?: boolean;
}

export const BUILT_IN_PROFILES: CommandProfile[] = [
  {
    id: 'yt-dlp',
    label: 'yt-dlp',
    binary: 'yt-dlp',
    urlFlag: '',
    outputFlag: '--output',
  },
  {
    id: 'ffmpeg',
    label: 'FFmpeg',
    binary: 'ffmpeg',
    urlFlag: '-i',
    outputFlag: '',
  },
  {
    id: 'streamlink',
    label: 'Streamlink',
    binary: 'streamlink',
    urlFlag: '',
    outputFlag: '--output',
  },
  {
    id: 'hlsdl',
    label: 'hlsdl',
    binary: 'hlsdl',
    urlFlag: '',
    outputFlag: '-o',
  },
  {
    id: 'n_m3u8dl-re',
    label: 'N_m3u8DL-RE',
    binary: 'N_m3u8DL-RE',
    urlFlag: '',
    outputFlag: '--save-name',
  },
];

const PROFILES_BY_ID = new Map<string, CommandProfile>(
  BUILT_IN_PROFILES.map((profile) => [profile.id, profile]),
);

export function listProfileIds(): CommandProfileId[] {
  return BUILT_IN_PROFILES.map((profile) => profile.id);
}

export function getProfile(id: string): CommandProfile | null {
  return PROFILES_BY_ID.get(id) ?? null;
}

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function renderBuiltIn(profile: CommandProfile, opts: CommandGenerationOptions): GeneratedCommand {
  const { flags: headerFlags, containsSensitiveData } = buildHeaderFlags(opts);
  const parts: string[] = [profile.binary];

  if (profile.id === 'ffmpeg') {
    if (opts.referer) {
      parts.push(`-headers "Referer: ${opts.referer}\\r\\n"`);
    }
    if (opts.userAgent) {
      parts.push(`-user_agent ${quote(opts.userAgent)}`);
    }
    parts.push('-i', quote(opts.url));
    parts.push('-c copy');
    if (opts.filename) {
      parts.push('-y', quote(opts.filename));
    }
    if (opts.includeAuthHeaders) {
      if (opts.cookie) {
        parts.push(`-headers "Cookie: ${opts.cookie}\\r\\n"`);
      }
      if (opts.authorization) {
        parts.push(`-headers "Authorization: ${opts.authorization}\\r\\n"`);
      }
    }
    return wrapWithWarning(
      parts.join(' '),
      containsSensitiveData || Boolean(opts.includeAuthHeaders && (opts.cookie || opts.authorization)),
    );
  }

  parts.push(...headerFlags);

  if (profile.id === 'n_m3u8dl-re') {
    if (opts.filename) {
      parts.push(profile.outputFlag, quote(stripExtension(opts.filename)));
    }
    parts.push(quote(opts.url));
  } else {
    if (opts.filename && profile.outputFlag) {
      parts.push(profile.outputFlag, quote(opts.filename));
    }
    if (profile.urlFlag) {
      parts.push(profile.urlFlag, quote(opts.url));
    } else {
      parts.push(quote(opts.url));
    }
  }

  return wrapWithWarning(parts.join(' '), containsSensitiveData);
}

function renderCustom(
  opts: CommandGenerationOptions,
  template: string,
  advancedMode: boolean,
): GeneratedCommand {
  const variables: TemplateVariables = {
    url: opts.url,
  };
  if (opts.filename !== undefined) variables.filename = opts.filename;
  if (opts.referer !== undefined) variables.referer = opts.referer;
  if (opts.origin !== undefined) variables.origin = opts.origin;

  const allowSensitive = advancedMode && Boolean(opts.includeAuthHeaders);
  let containsSensitiveData = false;
  if (allowSensitive) {
    if (opts.cookie !== undefined) {
      variables.cookie = opts.cookie;
      containsSensitiveData = true;
    }
    if (opts.authorization !== undefined) {
      variables.authorization = opts.authorization;
      containsSensitiveData = true;
    }
  }

  const rendered = renderTemplate(template, variables, { advancedMode: allowSensitive });
  return wrapWithWarning(rendered, containsSensitiveData);
}

export function renderProfileCommand(
  profileId: string,
  opts: CommandGenerationOptions,
  renderOptions: RenderProfileOptions = {},
): GeneratedCommand {
  if (profileId === 'custom') {
    if (!renderOptions.customTemplate) {
      throw new Error('custom profile requires customTemplate');
    }
    return renderCustom(opts, renderOptions.customTemplate, Boolean(renderOptions.advancedMode));
  }

  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`unknown profile: ${profileId}`);
  }
  return renderBuiltIn(profile, opts);
}
