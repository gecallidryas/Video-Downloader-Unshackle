import type {
  DetectionEvidence,
} from '@/video_downloader_types_skeleton';
import type {
  DetectorPlugin,
  DetectorPluginContext,
  PluginDetectionOutput,
  PluginRestriction,
} from './detector-plugin';
import { createPluginRegistry } from './plugin-registry';

export interface PluginRunError {
  pluginId: string;
  message: string;
}

export interface PluginRunInput {
  url: URL;
  document?: Document;
  evidence?: DetectionEvidence[];
  pageTitle?: string;
  globalData?: Record<string, unknown>;
  isAuthorizedFixture?: boolean;
  now?: () => number;
}

export interface PluginRunResult {
  matchedPluginIds: string[];
  evidence: DetectionEvidence[];
  restrictions: PluginRestriction[];
  errors: PluginRunError[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toArray(
  output: PluginDetectionOutput | PluginDetectionOutput[] | null | undefined,
): PluginDetectionOutput[] {
  if (!output) {
    return [];
  }

  return Array.isArray(output) ? output : [output];
}

function isDetectionEvidence(value: unknown): value is DetectionEvidence {
  const item = value as Partial<DetectionEvidence>;

  return (
    Boolean(item) &&
    typeof item.source === 'string' &&
    typeof item.confidence === 'number' &&
    typeof item.createdAt === 'number'
  );
}

function isPluginRestriction(value: unknown): value is PluginRestriction {
  const item = value as Partial<PluginRestriction>;

  return (
    Boolean(item) &&
    typeof item.status === 'string' &&
    typeof item.code === 'string' &&
    typeof item.message === 'string'
  );
}

function hasOnlyKeys(value: unknown, allowedKeys: string[]): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasUnsafeEvidenceNotes(evidence: DetectionEvidence): boolean {
  return (evidence.notes ?? []).some((note) =>
    /(?:credential|cookie|authorization|bearer|secret|token-extraction|start-download)/i.test(
      note,
    ),
  );
}

function isSafePluginOutput(value: unknown): value is PluginDetectionOutput {
  const item = value as Partial<PluginDetectionOutput>;

  if (!item || typeof item.kind !== 'string') {
    return false;
  }

  if (item.kind === 'evidence') {
    return (
      hasOnlyKeys(item, ['kind', 'evidence']) &&
      isDetectionEvidence(item.evidence) &&
      !hasUnsafeEvidenceNotes(item.evidence)
    );
  }

  if (item.kind === 'restriction') {
    return (
      hasOnlyKeys(item, ['kind', 'restriction']) &&
      isPluginRestriction(item.restriction)
    );
  }

  return false;
}

function buildContext(input: PluginRunInput): DetectorPluginContext {
  return {
    url: input.url,
    host: input.url.hostname.toLowerCase().replace(/^www\./, ''),
    document: input.document,
    evidence: input.evidence ?? [],
    now: input.now ?? (() => Date.now()),
    pageTitle: input.pageTitle,
    globalData: input.globalData,
    isAuthorizedFixture: input.isAuthorizedFixture,
  };
}

export async function runDetectorPlugins(
  plugins: DetectorPlugin[],
  input: PluginRunInput,
): Promise<PluginRunResult> {
  const registry = createPluginRegistry(plugins);
  const context = buildContext(input);
  const matchedPlugins = registry.match({
    url: context.url,
    document: context.document,
  });
  const result: PluginRunResult = {
    matchedPluginIds: matchedPlugins.map((plugin) => plugin.id),
    evidence: [],
    restrictions: [],
    errors: [],
  };

  for (const plugin of matchedPlugins) {
    try {
      const outputs = toArray(await plugin.detect(context));

      for (const output of outputs) {
        if (!isSafePluginOutput(output)) {
          result.errors.push({
            pluginId: plugin.id,
            message:
              typeof output === 'object' &&
              output !== null &&
              'kind' in output &&
              (output as { kind?: unknown }).kind === 'evidence'
                ? `Unsafe plugin output from ${plugin.id}`
                : `Unsupported plugin output from ${plugin.id}`,
          });
          continue;
        }

        if (output.kind === 'evidence') {
          result.evidence.push(output.evidence);
        } else {
          result.restrictions.push({
            ...output.restriction,
            sourcePluginId: output.restriction.sourcePluginId || plugin.id,
          });
        }
      }
    } catch (error) {
      result.errors.push({
        pluginId: plugin.id,
        message: errorMessage(error),
      });
    }
  }

  return result;
}
