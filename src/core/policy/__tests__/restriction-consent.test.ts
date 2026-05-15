import { describe, expect, test } from 'vitest';
import { createRestrictionConsentRegistry } from '../restriction-consent';

describe('createRestrictionConsentRegistry', () => {
  test('grants, reads, and lists per-candidate consent', () => {
    const registry = createRestrictionConsentRegistry();

    expect(registry.has('c1', 'protected')).toBe(false);

    registry.grant('c1', 'protected');
    registry.grant('c1', 'geo');

    expect(registry.has('c1', 'protected')).toBe(true);
    expect(registry.has('c1', 'geo')).toBe(true);
    expect(registry.list('c1').sort()).toEqual(['geo', 'protected']);
    expect(registry.has('c2', 'protected')).toBe(false);
  });

  test('revokes a single kind and clears the candidate when empty', () => {
    const registry = createRestrictionConsentRegistry();
    registry.grant('c1', 'protected');
    registry.grant('c1', 'geo');

    registry.revoke('c1', 'protected');
    expect(registry.has('c1', 'protected')).toBe(false);
    expect(registry.has('c1', 'geo')).toBe(true);

    registry.revoke('c1', 'geo');
    expect(registry.list('c1')).toEqual([]);
    expect(registry.snapshot()).toEqual({});
  });

  test('round-trips through snapshot and rehydration, dropping invalid kinds', () => {
    const registry = createRestrictionConsentRegistry({
      c1: ['protected', 'bogus' as never],
      c2: ['geo'],
      '': ['protected'],
    });

    expect(registry.has('c1', 'protected')).toBe(true);
    expect(registry.list('c1')).toEqual(['protected']);
    expect(registry.has('c2', 'geo')).toBe(true);

    const restored = createRestrictionConsentRegistry(registry.snapshot());
    expect(restored.has('c1', 'protected')).toBe(true);
    expect(restored.has('c2', 'geo')).toBe(true);
  });
});
