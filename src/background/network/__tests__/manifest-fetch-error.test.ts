import { describe, expect, test } from 'vitest';
import {
  ManifestFetchError,
  candidateRestrictionFromError,
} from '../manifest-fetch-error';

describe('candidateRestrictionFromError', () => {
  test('maps a 451 manifest failure to an overridable geo restriction', () => {
    const restriction = candidateRestrictionFromError(
      new ManifestFetchError('Manifest request failed: 451', { statusCode: 451 }),
    );

    expect(restriction).toEqual({
      code: 'geo-restricted',
      message: expect.any(String),
      overridable: true,
    });
  });

  test('maps a geo body phrase to an overridable geo restriction', () => {
    const restriction = candidateRestrictionFromError(
      new ManifestFetchError('Manifest request failed: 200', {
        statusCode: 200,
        bodyText: 'This video is not available in your country.',
      }),
    );

    expect(restriction?.code).toBe('geo-restricted');
    expect(restriction?.overridable).toBe(true);
  });

  test('maps a 403 to a non-overridable access restriction', () => {
    const restriction = candidateRestrictionFromError(
      new ManifestFetchError('Manifest request failed: 403', { statusCode: 403 }),
    );

    expect(restriction?.code).toBe('access-restricted');
    expect(restriction?.overridable).toBeUndefined();
  });

  test('returns undefined for non-ManifestFetchError causes', () => {
    expect(candidateRestrictionFromError(new Error('parse failed'))).toBeUndefined();
    expect(candidateRestrictionFromError(undefined)).toBeUndefined();
  });

  test('returns undefined when the status does not classify as a restriction', () => {
    expect(
      candidateRestrictionFromError(
        new ManifestFetchError('Manifest request failed: 500', { statusCode: 500 }),
      ),
    ).toBeUndefined();
  });
});
