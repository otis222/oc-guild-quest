// 遊戲進行中的狀態：記憶體裡放一份最新的 GuildState，修改時寫進 IndexedDB，再通知畫面更新。
import { updateState } from './state';
import type { KV } from './storage';
import type { GuildState } from './types';

export type StateListener = (s: GuildState) => void;

export interface GuildStore {
  readonly state: GuildState;
  /** 套用修改並存檔（見 updateState），成功後通知所有訂閱者 */
  update(fn: (s: GuildState) => GuildState): Promise<GuildState>;
  /** 訂閱狀態變化，回傳取消訂閱的函式 */
  subscribe(fn: StateListener): () => void;
}

export function createGuildStore(kv: KV, initial: GuildState): GuildStore {
  let state = initial;
  const listeners = new Set<StateListener>();
  return {
    get state() { return state; },
    async update(fn) {
      state = await updateState(kv, fn);
      for (const l of listeners) l(state);
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
