import type {
  DetectionEvidence,
  ProtectionInfo,
} from '@/video_downloader_types_skeleton';

const drmNotePrefixes = ['drm:', 'eme:', 'key-system:'];
const drmNoteFragments = ['widevine', 'playready', 'fairplay'];
const drmUrlFragments = [
  ['widevine', 'widevine'],
  ['edef8ba9-79d6-4ace-a3c8-27dcd51d21ed', 'widevine'],
  ['playready', 'playready'],
  ['9a04f079-9840-4286-ab92-e65be0885f95', 'playready'],
  ['fairplay', 'fairplay'],
  ['com.apple.fps', 'fairplay'],
  ['skd://', 'fairplay'],
  ['94ce86fb-07ff-4f43-adb8-93d2fa968ca2', 'fairplay'],
] as const;
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

function getDrmSystems(notes: string[], evidence: DetectionEvidence[]): string[] {
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
  const urlSystems = drmUrlFragments
    .filter(([fragment]) =>
      evidence.some((item) => item.url?.toLowerCase().includes(fragment)),
    )
    .map(([, system]) => system);

  return Array.from(
    new Set([...explicitSystems, ...fragmentSystems, ...urlSystems]),
  );
}

export function classifyProtection(
  evidence: DetectionEvidence[],
): ProtectionInfo {
  const notes = getEvidenceNotes(evidence);
  const drmSystems = getDrmSystems(notes, evidence);

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

  if (method?.toLowerCase() === 'sample-aes') {
    return {
      kind: 'sample-aes',
      method,
      reason: 'Detected HLS DRM-style SAMPLE-AES encryption marker.',
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
