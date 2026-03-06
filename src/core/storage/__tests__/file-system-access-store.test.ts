import { describe, expect, test, vi } from 'vitest';
import { createFileSystemAccessStore } from '../file-system-access-store';

function directoryHandle(permission: PermissionState = 'granted') {
  const writes: Record<string, Uint8Array> = {};
  const handle = {
    kind: 'directory' as const,
    name: 'Downloads',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    getFileHandle: vi.fn(async (name: string) => ({
      createWritable: vi.fn(async () => ({
        write: vi.fn(async (data: Uint8Array) => {
          writes[name] = new Uint8Array(data);
        }),
        close: vi.fn(async () => undefined),
      })),
    })),
    writes,
  };

  return handle;
}

describe('File System Access store', () => {
  test('requires a user gesture before requesting a directory handle', async () => {
    const showDirectoryPicker = vi.fn();
    const store = createFileSystemAccessStore({ showDirectoryPicker });

    await expect(store.chooseDirectory({ userGesture: false, remember: false }))
      .rejects.toThrow('Choosing an output folder requires a user gesture.');
    expect(showDirectoryPicker).not.toHaveBeenCalled();
  });

  test('persists a directory handle only after explicit remember opt-in', async () => {
    const handle = directoryHandle();
    const persist = vi.fn(async () => undefined);
    const store = createFileSystemAccessStore({
      showDirectoryPicker: vi.fn(async () => handle),
      persistDirectoryHandle: persist,
    });

    await store.chooseDirectory({ userGesture: true, remember: false });
    expect(persist).not.toHaveBeenCalled();

    await store.chooseDirectory({ userGesture: true, remember: true });
    expect(persist).toHaveBeenCalledWith(handle);
  });

  test('verifies write permission before writing', async () => {
    const handle = directoryHandle('granted');
    const store = createFileSystemAccessStore({
      showDirectoryPicker: vi.fn(async () => handle),
    });

    await store.chooseDirectory({ userGesture: true, remember: false });
    await store.writeFile('video.ts', new Uint8Array([1, 2, 3]));

    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.writes['video.ts']).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('falls back cleanly when permission is denied', async () => {
    const handle = directoryHandle('denied');
    const store = createFileSystemAccessStore({
      showDirectoryPicker: vi.fn(async () => handle),
    });

    await store.chooseDirectory({ userGesture: true, remember: false });

    await expect(store.writeFile('video.ts', new Uint8Array([1])))
      .rejects.toThrow('Output folder write permission was denied.');
  });
});
