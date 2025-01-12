import type { MediaCandidate } from '@/video_downloader_types_skeleton';
import {
  classifyCandidate,
  type CandidateEvidence,
  type ClassifyCandidateInput,
} from './classify-candidate';
import {
  createCandidateFingerprint,
  getCandidateEvidenceMetadata,
} from './fingerprint-candidate';

export interface MergeCandidateEvidenceInput
  extends Omit<ClassifyCandidateInput, 'evidence'> {
  evidence: CandidateEvidence[];
}

export function mergeCandidateEvidence(
  input: MergeCandidateEvidenceInput,
): MediaCandidate[] {
  const groups = new Map<string, CandidateEvidence[]>();
  const dashManifestEvidenceByUrl = new Map<string, CandidateEvidence[]>();
  const dashRepresentationGroupKeysByManifestUrl = new Map<string, Set<string>>();

  for (const evidence of input.evidence) {
    const metadata = getCandidateEvidenceMetadata({
      pageUrl: input.pageUrl,
      evidence,
    });
    const groupKey = createCandidateFingerprint({
      pageUrl: input.pageUrl,
      evidence,
    });

    if (
      metadata.protocol === 'dash' &&
      metadata.manifestUrl &&
      !metadata.representationId
    ) {
      const manifestEvidence =
        dashManifestEvidenceByUrl.get(metadata.manifestUrl) ?? [];

      dashManifestEvidenceByUrl.set(metadata.manifestUrl, [
        ...manifestEvidence,
        evidence,
      ]);
    }

    if (
      metadata.protocol === 'dash' &&
      metadata.manifestUrl &&
      metadata.representationId
    ) {
      const keys =
        dashRepresentationGroupKeysByManifestUrl.get(metadata.manifestUrl) ??
        new Set<string>();

      keys.add(groupKey);
      dashRepresentationGroupKeysByManifestUrl.set(metadata.manifestUrl, keys);
    }

    const group = groups.get(groupKey) ?? [];

    groups.set(groupKey, [...group, evidence]);
  }

  for (const [
    manifestUrl,
    representationGroupKeys,
  ] of dashRepresentationGroupKeysByManifestUrl) {
    const manifestEvidence = dashManifestEvidenceByUrl.get(manifestUrl) ?? [];

    if (manifestEvidence.length === 0) {
      continue;
    }

    for (const groupKey of representationGroupKeys) {
      groups.set(groupKey, [...manifestEvidence, ...(groups.get(groupKey) ?? [])]);
    }

    const manifestGroupKey = createCandidateFingerprint({
      pageUrl: input.pageUrl,
      evidence: manifestEvidence[0]!,
    });

    groups.delete(manifestGroupKey);
  }

  return Array.from(groups.values()).map((evidence) =>
    classifyCandidate({
      ...input,
      evidence,
    }),
  );
}
