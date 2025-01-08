import type {
  DetectionEvidence,
  ProtectionInfo,
} from '@/video_downloader_types_skeleton';

const drmNotePrefixes = ['drm:', 'eme:', 'key-system:'];
const drmNoteFragments = ['widevine', 'playready', 'fairplay'];
const unknownProtectionFragments = [
  'content-protection:unknown',
  'protection:unknown',
  'encrypted',
];

function getEvidenceNotes(evidence: DetectionEvidence[]): string[] {
  return evidence.flatMap((item) => item.notes ?? []).map((note) => note.trim());
}

function getNoteValue(notes: string[], prefix: string): string | undefined {
  const note = notes.find((entry) =>
    entry.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  return note?.slice(prefix.length);
}

function hasAnyNoteMarker(notes: string[], markers: string[]): boolean {
  return notes.some((note) => {
    const normalizedNote = note.toLowerCase();

    return markers.some((marker) => normalizedNote.includes(marker));
  });
}

function getDrmSystems(notes: string[]): string[] {
  const explicitSystems = notes
    .filter((note) =>
      drmNotePrefixes.some((prefix) =>
        note.toLowerCase().startsWith(prefix),
      ),
    )
    .map((note) => note.split(':').slice(1).join(':').trim().toLowerCase())
    .filter(Boolean);
  const fragmentSystems = drmNoteFragments.filter((fragment) =>
    notes.some((note) => note.toLowerCase().includes(fragment)),
  );

  return Array.from(new Set([...explicitSystems, ...fragmentSystems]));
}

export function classifyProtection(
  evidence: DetectionEvidence[],
): ProtectionInfo {
  const notes = getEvidenceNotes(evidence);
  const drmSystems = getDrmSystems(notes);

  if (drmSystems.length > 0 || hasAnyNoteMarker(notes, ['content-protection:cenc'])) {
    return {
      kind: 'drm',
      reason: 'Detected DRM or protected-media marker in evidence.',
      drmSystems,
    };
  }

  const method = getNoteValue(notes, 'hls-key-method:');

  if (method?.toLowerCase() === 'aes-128') {
    return {
      kind: 'aes-128',
      method,
      keyUri: getNoteValue(notes, 'key-uri:'),
      reason: 'Detected HLS clear-key encryption marker.',
    };
  }

  if (hasAnyNoteMarker(notes, unknownProtectionFragments)) {
    return {
      kind: 'unknown',
      reason: 'Detected protection marker that could not be classified.',
    };
  }

  return { kind: 'none' };
}
