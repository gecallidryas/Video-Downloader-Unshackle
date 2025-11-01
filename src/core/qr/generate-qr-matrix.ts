/**
 * Minimal placeholder QR matrix generator. Produces a deterministic square
 * boolean grid derived from a hash of the input. NOT a real QR encoder — this
 * preserves a UI surface (and tests) until a vetted QR library is selected and
 * its license cleared. A real encoder must replace this implementation before
 * shipping the QR/share feature to users.
 */

const SENSITIVE_QUERY_KEYS = [
  'cookie',
  'set-cookie',
  'authorization',
  'token',
  'access_token',
  'auth',
  'sig',
  'signature',
  'expires',
  'x-amz-signature',
  'x-amz-credential',
  'x-goog-signature',
  'key',
];

export function isUrlSafeForQr(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

export function generateQrMatrix(input: string): boolean[][] {
  if (!input) {
    throw new Error('input required');
  }
  const size = 21 + (input.length % 8) * 2;
  const seed = hashString(input);
  const rand = lcg(seed);
  const grid: boolean[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) {
      const isFinderCorner =
        (x < 7 && y < 7) ||
        (x < 7 && y >= size - 7) ||
        (x >= size - 7 && y < 7);
      if (isFinderCorner) {
        const lx = x % 7;
        const ly = y >= size - 7 ? y - (size - 7) : y;
        const lyAdj = x >= size - 7 ? y : ly;
        const onBorder = lx === 0 || lx === 6 || lyAdj === 0 || lyAdj === 6;
        const onCenter = lx >= 2 && lx <= 4 && lyAdj >= 2 && lyAdj <= 4;
        row.push(onBorder || onCenter);
      } else {
        row.push(rand() < 0.5);
      }
    }
    grid.push(row);
  }
  return grid;
}
