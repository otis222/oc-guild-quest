import type { KV } from '../../src/core/storage';

/**
 * 測試用的 KV：存在記憶體。讀寫都用 structuredClone 複製一份，跟 IndexedDB 的行為一樣，
 * 所以存進去的東西如果複製不了（例如函式），測試也會失敗。
 */
export function memoryKV(): KV & { raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>();
  const read = <T>(key: string): T | undefined => (raw.has(key) ? (structuredClone(raw.get(key)) as T) : undefined);
  return {
    raw,
    async get<T>(key: string) {
      return read<T>(key);
    },
    async set(key, value) {
      raw.set(key, structuredClone(value));
    },
    async update<T>(key: string, fn: (old: T | undefined) => T) {
      const next = fn(read<T>(key));
      raw.set(key, structuredClone(next));
      return next;
    },
  };
}
