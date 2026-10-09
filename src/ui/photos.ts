// 存在 IndexedDB 的照片 → 畫面上用的網址。同一張照片整場只建一次網址（不收回：設定卡、展品會一直用到）。
import { getPhoto, type KV } from '../core/storage';

export interface PhotoUrls {
  /** 已經讀好的網址；還沒讀過、或讀不到就是 undefined */
  now(id: string): string | undefined;
  /** 讀照片、建網址；照片不見了回傳 null */
  get(id: string): Promise<string | null>;
  /** 一次讀好幾張（讀不到的略過） */
  load(ids: readonly (string | undefined)[]): Promise<void>;
  /** 剛存好的照片：直接用手上的檔案建網址，不用再讀一次 */
  remember(id: string, blob: Blob): void;
}

export function createPhotoUrls(kv: KV): PhotoUrls {
  const ready = new Map<string, string>();
  const pending = new Map<string, Promise<string | null>>();

  function get(id: string): Promise<string | null> {
    const url = ready.get(id);
    if (url) return Promise.resolve(url);
    let p = pending.get(id);
    if (!p) {
      p = getPhoto(kv, id).then((blob) => {
        // 讀的時候剛好用 remember 建過網址了：用那一個，不要建兩個
        const known = ready.get(id);
        if (known || !blob) return known ?? null;
        const u = URL.createObjectURL(blob);
        ready.set(id, u);
        return u;
      }).catch((err: unknown) => {
        console.warn('照片讀取失敗', id, err);
        return null;
      }).finally(() => pending.delete(id));
      pending.set(id, p);
    }
    return p;
  }

  return {
    now: (id) => ready.get(id),
    get,
    async load(ids) {
      await Promise.all(ids.filter((id): id is string => !!id).map(get));
    },
    remember(id, blob) {
      if (!ready.has(id)) ready.set(id, URL.createObjectURL(blob));
    },
  };
}
