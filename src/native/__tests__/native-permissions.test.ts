import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  hasNativeMessagingPermission,
  requestNativeMessagingPermission,
} from '../native-permissions';

type PermissionQuery = { permissions: ['nativeMessaging'] };
type PermissionCallback = (granted: boolean) => void;

describe('native messaging permissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('hasNativeMessagingPermission returns true when Chrome grants it', async () => {
    const contains = vi.fn((_query: PermissionQuery, callback: PermissionCallback) => {
      callback(true);
    });
    vi.stubGlobal('chrome', { permissions: { contains } });

    await expect(hasNativeMessagingPermission()).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith(
      { permissions: ['nativeMessaging'] },
      expect.any(Function),
    );
  });

  test('hasNativeMessagingPermission returns false when Chrome denies it', async () => {
    const contains = vi.fn((_query: PermissionQuery, callback: PermissionCallback) => {
      callback(false);
    });
    vi.stubGlobal('chrome', { permissions: { contains } });

    await expect(hasNativeMessagingPermission()).resolves.toBe(false);
  });

  test('hasNativeMessagingPermission returns false when permissions API is absent', async () => {
    vi.stubGlobal('chrome', { runtime: {} });

    await expect(hasNativeMessagingPermission()).resolves.toBe(false);
  });

  test('requestNativeMessagingPermission requests nativeMessaging from Chrome', async () => {
    const request = vi.fn((_query: PermissionQuery, callback: PermissionCallback) => {
      callback(true);
    });
    vi.stubGlobal('chrome', { permissions: { request }, runtime: {} });

    await expect(requestNativeMessagingPermission()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      { permissions: ['nativeMessaging'] },
      expect.any(Function),
    );
  });

  test('requestNativeMessagingPermission returns false when runtime.lastError is set', async () => {
    const request = vi.fn((_query: PermissionQuery, callback: PermissionCallback) => {
      callback(true);
    });
    vi.stubGlobal('chrome', {
      permissions: { request },
      runtime: { lastError: { message: 'User denied permission.' } },
    });

    await expect(requestNativeMessagingPermission()).resolves.toBe(false);
  });
});
