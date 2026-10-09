// 儲存：資料只存在玩家自己瀏覽器的 IndexedDB（用 idb-keyval），不上傳任何地方。
//
// key 一覽：
//   'state'        整個 GuildState（state.ts）
//   'events'       事件陣列（events.ts）
//   'photo:<id>'   照片 Blob；狀態裡只放 id
import { createStore, del, get, set, update } from 'idb-keyval';
import { newId } from './id';

export const STATE_KEY = 'state';
export const EVENTS_KEY = 'events';
export const photoKey = (id: string): string => `photo:${id}`;

/** 最小的 key-value 介面。正式環境用 idbKV()；測試可以換成記憶體版。 */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /**
   * 在同一個交易裡讀出舊值、寫入 fn 的回傳值，再把新值回傳。
   * 開了兩個分頁同時寫，也不會互相蓋掉。fn 必須是同步函式；fn 丟錯就什麼都不寫。
   */
  update<T>(key: string, fn: (old: T | undefined) => T): Promise<T>;
  /** 刪掉一個 key（換造型時刪掉舊的上傳圖、交件沒存成功時刪掉剛存的照片） */
  del(key: string): Promise<void>;
}

/**
 * IndexedDB 版的 KV。資料庫名稱要專屬於這個專案：
 * GitHub Pages 上同一個帳號的所有專案共用同一個網域，用預設名稱會跟別的專案撞在一起。
 */
export function idbKV(dbName = 'oc-guild-quest', storeName = 'kv'): KV {
  const store = createStore(dbName, storeName);
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    async update<T>(key: string, fn: (old: T | undefined) => T): Promise<T> {
      let next!: T;
      await update<T>(key, (old) => (next = fn(old)), store);
      return next;
    },
    del: (key) => del(key, store),
  };
}

/** 存一張照片，回傳它的 id（狀態裡只存這個 id） */
export async function putPhoto(kv: KV, photo: Blob): Promise<string> {
  const id = newId();
  await kv.set(photoKey(id), photo);
  return id;
}

export function getPhoto(kv: KV, id: string): Promise<Blob | undefined> {
  return kv.get<Blob>(photoKey(id));
}

export function deletePhoto(kv: KV, id: string): Promise<void> {
  return kv.del(photoKey(id));
}
