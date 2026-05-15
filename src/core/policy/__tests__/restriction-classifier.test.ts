import { describe, expect, test } from 'vitest';
import { classifyRestriction } from '../restriction-classifier';
import { buildRegionNeutralInit } from '../region-neutral-request';

describe('classifyRestriction', () => {
  test('flags HTTP 451 as overridable geo restriction', () => {
    expect(classifyRestriction({ statusCode: 451 })).toMatchObject({
      code: 'geo-restricted',
      overridable: true,
    });
  });

  test('detects geo restriction from playability status and body text', () => {
    expect(
      classifyRestriction({ playabilityStatus: 'CONTENT_GEO_BLOCKED' }),
    ).toMatchObject({ code: 'geo-restricted', overridable: true });

    expect(
      classifyRestriction({
        statusCode: 200,
        bodyText: 'This video is not available in your country.',
      }),
    ).toMatchObject({ code: 'geo-restricted', overridable: true });
  });

  test('keeps access/rate/block restrictions non-overridable', () => {
    const access = classifyRestriction({ statusCode: 403 });
    expect(access).toMatchObject({ code: 'access-restricted' });
    expect(access?.overridable).toBeUndefined();

    expect(classifyRestriction({ statusCode: 429 })).toMatchObject({
      code: 'rate-limited',
    });
    expect(classifyRestriction({ blocked: true })).toMatchObject({
      code: 'blocked-site',
    });
  });

  test('returns undefined for unrestricted input', () => {
    expect(classifyRestriction({ statusCode: 200 })).toBeUndefined();
  });
});

describe('buildRegionNeutralInit', () => {
  test('applies a broad Accept-Language and disables caching', () => {
    const init = buildRegionNeutralInit({ method: 'GET' });
    const headers = new Headers(init.headers);

    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
    expect(headers.get('Accept-Language')).toContain('*');
  });

  test('overrides an existing Accept-Language header', () => {
    const init = buildRegionNeutralInit({
      headers: { 'Accept-Language': 'fr-FR' },
    });
    expect(new Headers(init.headers).get('Accept-Language')).not.toBe('fr-FR');
  });
});
