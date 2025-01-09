import { describe, expect, test } from 'vitest';
import {
  mergeRemoteConfigWithBlocklist,
  parseRemoteConfig,
} from '../remote-config';
import { classifyRestriction } from '../restriction-classifier';

describe('parseRemoteConfig', () => {
  test('normalizes domain mappings and filters comment values', () => {
    expect(
      parseRemoteConfig({
        version: 1,
        domainMappings: {
          '_comment': 'ignored',
          'mirror.example': 'doodstream',
        },
        blockedDomains: ['_comment_blocked: ignored', 'ads.example'],
      }),
    ).toEqual({
      version: 1,
      domainMappings: { 'mirror.example': 'doodstream' },
      blockedDomains: ['ads.example'],
    });
  });

  test('merges remote blocked domains into blocklist data', () => {
    expect(
      mergeRemoteConfigWithBlocklist(
        { blockedDomains: ['static.example'] },
        { version: 1, domainMappings: {}, blockedDomains: ['remote.example'] },
      ),
    ).toEqual({
      blockedDomains: ['static.example', 'remote.example'],
    });
  });
});

describe('classifyRestriction', () => {
  test('maps blocked and geo HTTP states into UI-safe restrictions', () => {
    expect(classifyRestriction({ blocked: true })).toMatchObject({
      status: 'unsupported',
      code: 'blocked-site',
    });
    expect(classifyRestriction({ statusCode: 451 })).toMatchObject({
      status: 'unsupported',
      code: 'geo-restricted',
    });
    expect(classifyRestriction({ statusCode: 403 })).toMatchObject({
      status: 'unsupported',
      code: 'access-restricted',
    });
  });
});
