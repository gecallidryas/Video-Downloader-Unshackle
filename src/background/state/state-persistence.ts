export interface StatePersistence {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ChromeStorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

const KEY_PREFIX = 'unshackle:state:';

function namespacedKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export function createInMemoryPersistence(
  backing: Record<string, unknown> = {},
): StatePersistence {
  return {
    async read<T>(key: string): Promise<T | undefined> {
      const value = backing[namespacedKey(key)];
      return value === undefined ? undefined : (structuredClone(value) as T);
    },
    async write<T>(key: string, value: T): Promise<void> {
      backing[namespacedKey(key)] = structuredClone(value);
    },
    async remove(key: string): Promise<void> {
      delete backing[namespacedKey(key)];
    },
  };
}

export function createChromeAreaPersistence(
  area: ChromeStorageAreaLike,
): StatePersistence {
  return {
    async read<T>(key: string): Promise<T | undefined> {
      const fullKey = namespacedKey(key);
      const stored = await area.get(fullKey);
      const value = stored[fullKey];
      return value === undefined ? undefined : (value as T);
    },
    async write<T>(key: string, value: T): Promise<void> {
      await area.set({ [namespacedKey(key)]: value });
    },
    async remove(key: string): Promise<void> {
      await area.remove(namespacedKey(key));
    },
  };
}

export function getDefaultSessionPersistence(): StatePersistence | undefined {
  const area = globalThis.chrome?.storage?.session as
    | ChromeStorageAreaLike
    | undefined;

  return area ? createChromeAreaPersistence(area) : undefined;
}

export interface DebouncedWriter {
  schedule(): void;
  flushNow(): Promise<void>;
}

export function createDebouncedWriter(
  flush: () => Promise<void>,
  delayMs: number,
): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  async function run(): Promise<void> {
    timer = undefined;
    pending = false;
    await flush();
  }

  return {
    schedule() {
      pending = true;
      if (timer !== undefined) {
        return;
      }
      timer = setTimeout(() => {
        void run();
      }, delayMs);
    },
    async flushNow() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (pending) {
        await run();
      }
    },
  };
}
