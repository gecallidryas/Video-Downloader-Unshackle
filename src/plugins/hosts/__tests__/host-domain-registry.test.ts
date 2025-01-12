import { describe, expect, test } from 'vitest';
import {
  HOST_DOMAIN_REGISTRY,
  getHostPluginByDomain,
  getHostPluginDomains,
  getHostPluginIds,
} from '../host-domain-registry';
import { createDomainMapper } from '../domain-mapper';

const expectedHostIds = [
  'doodstream',
  'voe',
  'filemoon',
  'streamtape',
  'vidoza',
  'mp4upload',
  'streamsb',
  'mixdrop',
  'upstream',
  'kwik',
  'vidmoly',
  'wolfstream',
  'supervideo',
  'userload',
  'sendvid',
  'vidlox',
  'yourupload',
  'dropload',
  'loadx',
  'luluvdo',
  'goodstream',
  'streama2z',
  'streamzz',
  'vupload',
  'newgrounds',
] as const;

const primaryDomainCases: Array<[string, string]> = [
  ['doodstream', 'doodstream.com'],
  ['voe', 'voe.sx'],
  ['filemoon', 'filemoon.sx'],
  ['streamtape', 'streamtape.com'],
  ['vidoza', 'vidoza.net'],
  ['mp4upload', 'mp4upload.com'],
  ['streamsb', 'streamsb.net'],
  ['mixdrop', 'mixdrop.co'],
  ['upstream', 'upstream.to'],
  ['kwik', 'kwik.cx'],
  ['vidmoly', 'vidmoly.me'],
  ['wolfstream', 'wolfstream.tv'],
  ['supervideo', 'supervideo.tv'],
  ['userload', 'userload.co'],
  ['sendvid', 'sendvid.com'],
  ['vidlox', 'vidlox.me'],
  ['yourupload', 'yourupload.com'],
  ['dropload', 'dropload.io'],
  ['loadx', 'loadx.ws'],
  ['luluvdo', 'luluvdo.com'],
  ['goodstream', 'goodstream.cc'],
  ['streama2z', 'streama2z.com'],
  ['streamzz', 'streamzz.to'],
  ['vupload', 'vupload.com'],
  ['newgrounds', 'newgrounds.com'],
];

describe('host domain registry', () => {
  test('ports the 25 source host plugin domain declarations', () => {
    expect(getHostPluginIds()).toEqual(expectedHostIds);
    expect(HOST_DOMAIN_REGISTRY).toHaveLength(25);

    for (const [pluginId, primaryDomain] of primaryDomainCases) {
      expect(getHostPluginByDomain(primaryDomain)?.id).toBe(pluginId);
    }
  });

  test('matches exact, www-normalized, and subdomain suffix domains', () => {
    expect(getHostPluginByDomain('streamtape.com')?.id).toBe('streamtape');
    expect(getHostPluginByDomain('www.sendvid.com')?.id).toBe('sendvid');
    expect(getHostPluginByDomain('embed.dood.wf')?.id).toBe('doodstream');
    expect(getHostPluginByDomain('cdn.vidmoly.to')?.id).toBe('vidmoly');
    expect(getHostPluginByDomain('media.example.invalid')).toBeUndefined();
  });

  test('exposes all domains for a host in source order', () => {
    expect(getHostPluginDomains('doodstream')).toEqual([
      'doodstream.com',
      'dood.pm',
      'dood.ws',
      'dood.wf',
      'dood.cx',
      'dood.sh',
      'dood.watch',
      'dood.work',
      'dood.to',
      'dood.so',
      'dood.la',
      'dood.li',
      'dood.re',
      'dood.yt',
      'doods.pro',
      'ds2play.com',
      'dooood.com',
      'd000d.com',
      'd0000d.com',
      'ds2video.com',
    ]);
  });

  test('uses source DomainMapper behavior for clone domains, dynamic override, and blocked hosts', () => {
    const mapper = createDomainMapper({
      dynamicMappings: {
        'temporary-video.example': 'sendvid',
        'streamtape.to': 'sendvid',
      },
      blockedDomains: ['blocked.example', 'dood.watch'],
    });

    expect(mapper.getPluginId('do0od.com')).toBe('doodstream');
    expect(mapper.getPluginId('cdn.voeun-block.net')).toBe('voe');
    expect(mapper.getPluginId('stape.me')).toBe('streamtape');
    expect(mapper.getPluginId('temporary-video.example')).toBe('sendvid');
    expect(mapper.getPluginId('streamtape.to')).toBe('sendvid');
    expect(mapper.getPluginId('media.blocked.example')).toBeNull();
    expect(mapper.getPluginId('www.dood.watch')).toBeNull();
  });

  test('falls back from registry matching to DomainMapper clone-domain matching', () => {
    const mapper = createDomainMapper();

    expect(getHostPluginByDomain('streamadblockplus.com', mapper)?.id).toBe(
      'streamtape',
    );
    expect(getHostPluginByDomain('cdn.sbembed2.com', mapper)?.id).toBe(
      'streamsb',
    );
    expect(getHostPluginByDomain('launchreliantclever.com', mapper)?.id).toBe(
      'voe',
    );
  });
});
