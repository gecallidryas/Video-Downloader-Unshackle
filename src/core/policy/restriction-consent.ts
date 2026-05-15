// User-granted overrides that unblock an otherwise-refused download.
// 'protected' covers DRM/SAMPLE-AES/unknown protection; 'geo' covers
// region-restricted media the user chooses to attempt anyway.
export type RestrictionConsentKind = 'protected' | 'geo';

export type RestrictionConsentSnapshot = Record<string, RestrictionConsentKind[]>;

export interface RestrictionConsentRegistry {
  grant(candidateId: string, kind: RestrictionConsentKind): void;
  has(candidateId: string, kind: RestrictionConsentKind): boolean;
  list(candidateId: string): RestrictionConsentKind[];
  revoke(candidateId: string, kind?: RestrictionConsentKind): void;
  snapshot(): RestrictionConsentSnapshot;
}

const CONSENT_KINDS: readonly RestrictionConsentKind[] = ['protected', 'geo'];

function sanitize(snapshot: RestrictionConsentSnapshot | undefined): Map<string, Set<RestrictionConsentKind>> {
  const map = new Map<string, Set<RestrictionConsentKind>>();
  if (!snapshot) return map;

  for (const [candidateId, kinds] of Object.entries(snapshot)) {
    if (typeof candidateId !== 'string' || !Array.isArray(kinds)) continue;
    const valid = kinds.filter((kind): kind is RestrictionConsentKind =>
      CONSENT_KINDS.includes(kind as RestrictionConsentKind),
    );
    if (valid.length > 0) {
      map.set(candidateId, new Set(valid));
    }
  }

  return map;
}

export function createRestrictionConsentRegistry(
  initial?: RestrictionConsentSnapshot,
): RestrictionConsentRegistry {
  const grants = sanitize(initial);

  return {
    grant(candidateId, kind) {
      const existing = grants.get(candidateId) ?? new Set<RestrictionConsentKind>();
      existing.add(kind);
      grants.set(candidateId, existing);
    },

    has(candidateId, kind) {
      return grants.get(candidateId)?.has(kind) ?? false;
    },

    list(candidateId) {
      return [...(grants.get(candidateId) ?? [])];
    },

    revoke(candidateId, kind) {
      if (kind === undefined) {
        grants.delete(candidateId);
        return;
      }
      const existing = grants.get(candidateId);
      if (!existing) return;
      existing.delete(kind);
      if (existing.size === 0) {
        grants.delete(candidateId);
      }
    },

    snapshot() {
      const result: RestrictionConsentSnapshot = {};
      for (const [candidateId, kinds] of grants) {
        result[candidateId] = [...kinds];
      }
      return result;
    },
  };
}
