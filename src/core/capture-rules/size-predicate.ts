export type SizePredicate = (sizeBytes: number) => boolean;

const unitMultipliers = new Map<string, number>([
  ['B', 1],
  ['KB', 1024],
  ['MB', 1024 * 1024],
  ['GB', 1024 * 1024 * 1024],
]);

const sizePattern = /^(?<value>\d+(?:\.\d+)?)(?<unit>B|KB|MB|GB)$/i;
const comparisonPattern = /^(?<operator>>=|<=|>|<|=)(?<size>\d+(?:\.\d+)?(?:B|KB|MB|GB))$/i;
const rangePattern = /^(?<min>\d+(?:\.\d+)?(?:B|KB|MB|GB))-(?<max>\d+(?:\.\d+)?(?:B|KB|MB|GB))$/i;

function parseSize(value: string): number {
  const match = sizePattern.exec(value.trim());

  if (!match?.groups) {
    throw new Error(`Invalid size predicate: ${value}`);
  }

  const amount = Number(match.groups.value);
  const multiplier = unitMultipliers.get(match.groups.unit.toUpperCase());

  if (!Number.isFinite(amount) || amount < 0 || multiplier === undefined) {
    throw new Error(`Invalid size predicate: ${value}`);
  }

  return Math.round(amount * multiplier);
}

export function parseSizePredicate(input: string): SizePredicate {
  const normalized = input.replace(/\s+/g, '');

  if (!normalized) {
    throw new Error('Invalid size predicate: empty');
  }

  const range = rangePattern.exec(normalized);
  if (range?.groups) {
    const min = parseSize(range.groups.min);
    const max = parseSize(range.groups.max);

    if (max < min) {
      throw new Error(`Invalid size range: ${input}`);
    }

    return (sizeBytes) => sizeBytes >= min && sizeBytes <= max;
  }

  const comparison = comparisonPattern.exec(normalized);
  if (!comparison?.groups) {
    throw new Error(`Invalid size predicate: ${input}`);
  }

  const expected = parseSize(comparison.groups.size);

  switch (comparison.groups.operator) {
    case '>=':
      return (sizeBytes) => sizeBytes >= expected;
    case '<=':
      return (sizeBytes) => sizeBytes <= expected;
    case '>':
      return (sizeBytes) => sizeBytes > expected;
    case '<':
      return (sizeBytes) => sizeBytes < expected;
    case '=':
      return (sizeBytes) => sizeBytes === expected;
    default:
      throw new Error(`Invalid size predicate: ${input}`);
  }
}
