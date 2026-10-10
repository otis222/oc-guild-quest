// 研究模式（企劃表 T7）：網址加 ?research=1 才有入口（CLAUDE.md：唯一例外的設定類畫面，一般網址看不到）。
// 打開時直接從 IndexedDB 讀最新的存檔和事件；存檔讀不懂（例如壞掉）也照樣能看事件、匯出原始資料。
import { loadEvents } from './events';
import { migrate } from './state';
import { STATE_KEY, type KV } from './storage';
import type { GuildState, LogEvent } from './types';

/** 網址有沒有 ?research=1 */
export const isResearchMode = (search: string): boolean => new URLSearchParams(search).get('research') === '1';

export interface ResearchData {
  /** 存檔原本的樣子（還沒有存檔是 undefined） */
  raw: unknown;
  /** 讀得懂的存檔；還沒有或讀不懂是 null */
  state: GuildState | null;
  /** 讀不懂的原因 */
  stateError: string | null;
  events: LogEvent[];
}

export async function loadResearchData(kv: KV): Promise<ResearchData> {
  const raw = await kv.get<unknown>(STATE_KEY);
  let state: GuildState | null = null, stateError: string | null = null;
  if (raw !== undefined) {
    try {
      state = migrate(raw);
    } catch (err) {
      stateError = err instanceof Error ? err.message : String(err);
    }
  }
  const events = await loadEvents(kv);
  return { raw, state, stateError, events: Array.isArray(events) ? events : [] };
}
