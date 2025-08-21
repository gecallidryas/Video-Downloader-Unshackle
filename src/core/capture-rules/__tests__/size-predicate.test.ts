import { describe, expect, test } from 'vitest';
import { parseSizePredicate } from '../size-predicate';

describe('parseSizePredicate', () => {
  test('parses comparison predicates with binary units', () => {
    const atLeast10Mb = parseSizePredicate('>=10MB');
    const below5Kb = parseSizePredicate('<5KB');
    const exactly1Gb = parseSizePredicate('=1GB');

    expect(atLeast10Mb(10 * 1024 * 1024)).toBe(true);
    expect(atLeast10Mb(5 * 1024 * 1024)).toBe(false);
    expect(below5Kb(4 * 1024)).toBe(true);
    expect(below5Kb(5 * 1024)).toBe(false);
    expect(exactly1Gb(1024 * 1024 * 1024)).toBe(true);
    expect(exactly1Gb(1024 * 1024 * 1024 - 1)).toBe(false);
  });

  test('parses inclusive size ranges', () => {
    const pred = parseSizePredicate('1KB-5MB');

    expect(pred(2048)).toBe(true);
    expect(pred(1024)).toBe(true);
    expect(pred(5 * 1024 * 1024)).toBe(true);
    expect(pred(100)).toBe(false);
    expect(pred(6 * 1024 * 1024)).toBe(false);
  });

  test('throws for invalid size predicates', () => {
    expect(() => parseSizePredicate('')).toThrow(/Invalid size predicate/);
    expect(() => parseSizePredicate('10XB')).toThrow(/Invalid size predicate/);
    expect(() => parseSizePredicate('5MB-1KB')).toThrow(/Invalid size range/);
    expect(() => parseSizePredicate('=>10MB')).toThrow(/Invalid size predicate/);
    expect(() => parseSizePredicate('10')).toThrow(/Invalid size predicate/);
  });
});
