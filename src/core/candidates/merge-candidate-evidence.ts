import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  classifyCandidate,
  type CandidateEvidence,
  type ClassifyCandidateInput,
} from './classify-candidate';

export interface MergeCandidateEvidenceInput
  extends Omit<ClassifyCandidateInput, 'evidence'> {
  evidence: CandidateEvidence[];
}

function getEvidenceUrl(evidence: CandidateEvidence): string | undefined {
  return 'url' in evidence ? evidence.url : undefined;
}

function getEvidenceProtocol(evidence: CandidateEvidence): string {
  if ('protocol' in evidence && evidence.protocol !== 'unknown') {
    return evidence.protocol;
  }

  return 'source' in evidence && evidence.source === 'dom' ? 'direct' : 'unknown';
}

function getEvidenceGroupKey(evidence: CandidateEvidence): string {
  return [getEvidenceProtocol(evidence), getEvidenceUrl(evidence) ?? 'unknown'].join(
    '|',
  );
}

export function mergeCandidateEvidence(
  input: MergeCandidateEvidenceInput,
): MediaCandidate[] {
  const groups = new Map<string, CandidateEvidence[]>();

  for (const evidence of input.evidence) {
    const groupKey = getEvidenceGroupKey(evidence);
    const group = groups.get(groupKey) ?? [];

    groups.set(groupKey, [...group, evidence]);
  }

  return Array.from(groups.values()).map((evidence) =>
    classifyCandidate({
      ...input,
      evidence,
    }),
  );
}
