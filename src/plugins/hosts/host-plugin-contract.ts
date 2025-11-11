import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StreamProtocol } from '@/video_downloader_types_skeleton';
import type { ExtractionFailureReason } from './extraction-failure';

export interface HostPluginInput {
  tabUrl: string;
  pageTitle?: string;
  pageMetadata?: Record<string, string>;
  fetchedData?: unknown;
}

export interface HostPluginCandidate {
  url: string;
  quality?: string;
  container?: string;
  protocol?: StreamProtocol;
  width?: number;
  height?: number;
  bitrate?: number;
  audioUrl?: string;
}

export interface HostPluginSubtitle {
  url: string;
  language?: string;
  label?: string;
  format?: 'vtt' | 'srt' | 'ttml' | 'dfxp' | 'unknown';
}

export interface HostPluginThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface HostPluginOutput {
  candidates: HostPluginCandidate[];
  subtitles: HostPluginSubtitle[];
  thumbnails: HostPluginThumbnail[];
  failureReason?: ExtractionFailureReason;
}

export interface HostPluginContract {
  id: string;
  hostPatterns: string[];
  extract(input: HostPluginInput): Promise<HostPluginOutput>;
}

export interface HostPluginFixture {
  input: HostPluginInput;
  expectedOutput: HostPluginOutput;
}

export interface PluginOutputValidation {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateUrlArrayItems(
  value: unknown[],
  fieldName: string,
  errors: string[],
): void {
  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.url !== 'string' || item.url.length === 0) {
      errors.push(`${fieldName}[${index}].url must be a non-empty string`);
    }
  });
}

export function validatePluginOutput(output: unknown): PluginOutputValidation {
  const errors: string[] = [];

  if (!isRecord(output)) {
    return { valid: false, errors: ['output must be an object'] };
  }

  if (!Array.isArray(output.candidates)) {
    errors.push('candidates must be an array');
  } else {
    validateUrlArrayItems(output.candidates, 'candidates', errors);
  }

  if (!Array.isArray(output.subtitles)) {
    errors.push('subtitles must be an array');
  } else {
    validateUrlArrayItems(output.subtitles, 'subtitles', errors);
  }

  if (!Array.isArray(output.thumbnails)) {
    errors.push('thumbnails must be an array');
  } else {
    validateUrlArrayItems(output.thumbnails, 'thumbnails', errors);
  }

  return { valid: errors.length === 0, errors };
}

function assertFixture(value: unknown): HostPluginFixture {
  if (!isRecord(value) || !isRecord(value.input) || !isRecord(value.expectedOutput)) {
    throw new Error('Host plugin fixture must include input and expectedOutput objects');
  }

  if (typeof value.input.tabUrl !== 'string') {
    throw new Error('Host plugin fixture input.tabUrl must be a string');
  }

  const validation = validatePluginOutput(value.expectedOutput);

  if (!validation.valid) {
    throw new Error(`Host plugin fixture expectedOutput is invalid: ${validation.errors.join(', ')}`);
  }

  return value as unknown as HostPluginFixture;
}

export async function loadFixture(name: string): Promise<HostPluginFixture> {
  const normalizedName = name.replace(/\.json$/, '');
  const fixturePath = join(
    process.cwd(),
    'src/plugins/hosts/__fixtures__',
    `${normalizedName}.json`,
  );
  const raw = await readFile(fixturePath, 'utf8');

  return assertFixture(JSON.parse(raw) as unknown);
}
