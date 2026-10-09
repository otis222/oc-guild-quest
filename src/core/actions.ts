// 玩家的操作：改狀態 → 存檔 → 記事件（企劃表 7.6）。
// 事件只在狀態真的有變時才記：連按兩次「完成」、或兩個分頁都按，也只記一次、只點亮一片。
import { logEvent, type EventFields } from './events';
import { newId } from './id';
import {
  addCommission, completeLevel, extendLevel, findLevel, pauseLevel, resumeLevel, startLevel, type CommissionDraft,
} from './state';
import type { KV } from './storage';
import type { GuildStore } from './store';
import { EXTEND_MINUTES, timerPhase } from './timer';
import type { EventType, GuildState, Level } from './types';

export interface Actions {
  /** 接新委託，回傳委託 id */
  createCommission(draft: CommissionDraft): Promise<string>;
  /** 下面幾個回傳「狀態有沒有變」 */
  startLevel(commissionId: string, levelId: string): Promise<boolean>;
  pauseLevel(commissionId: string, levelId: string): Promise<boolean>;
  resumeLevel(commissionId: string, levelId: string): Promise<boolean>;
  extendLevel(commissionId: string, levelId: string): Promise<boolean>;
  completeLevel(commissionId: string, levelId: string): Promise<boolean>;
}

type LevelOp = (s: GuildState, commissionId: string, levelId: string, now: number) => GuildState;

export function createActions(kv: KV, store: GuildStore, clock: () => number = Date.now): Actions {
  const log = (type: EventType, fields: EventFields, now: number): Promise<unknown> =>
    logEvent(kv, type, fields, now).catch((err: unknown) => console.warn('事件紀錄寫入失敗', err));

  /** 套用操作，回傳操作前、後的狀態（操作前是存檔裡最新的那份） */
  async function apply(fn: (s: GuildState) => GuildState): Promise<{ before: GuildState; after: GuildState }> {
    const seen: { before?: GuildState } = {};
    const after = await store.update((s) => { seen.before = s; return fn(s); });
    if (!seen.before) throw new Error('沒有讀到存檔');
    return { before: seen.before, after };
  }

  /** 因為開始／繼續另一個任務而被自動暫停的任務，各記一筆 level_paused */
  async function logAutoPaused(before: GuildState, after: GuildState, exceptLevelId: string, now: number): Promise<void> {
    for (const c of after.commissions) {
      for (const l of c.levels) {
        if (l.id === exceptLevelId || l.pausedAt === undefined) continue;
        const old = before.commissions.find((x) => x.id === c.id)?.levels.find((x) => x.id === l.id);
        if (old && old.pausedAt === undefined) await log('level_paused', { commissionId: c.id, levelId: l.id, data: { auto: true } }, now);
      }
    }
  }

  /** 對某一關做操作；有變化就交給 onChange 記事件 */
  async function levelAction(
    op: LevelOp, commissionId: string, levelId: string,
    onChange: (old: Level, next: Level, now: number, before: GuildState, after: GuildState) => Promise<void>,
  ): Promise<boolean> {
    const now = clock();
    const { before, after } = await apply((s) => op(s, commissionId, levelId, now));
    if (before === after) return false;
    await onChange(findLevel(before, commissionId, levelId).level, findLevel(after, commissionId, levelId).level, now, before, after);
    return true;
  }

  const ids = (commissionId: string, levelId: string): EventFields => ({ commissionId, levelId });

  return {
    async createCommission(draft) {
      const now = clock(), id = newId(now);
      await apply((s) => addCommission(s, draft, now, id));
      await log('commission_created', { commissionId: id, data: { course: draft.course, levels: draft.levels.length, dueAt: draft.dueAt } }, now);
      return id;
    },

    startLevel: (cId, lId) => levelAction(startLevel, cId, lId, async (_old, next, now, before, after) => {
      await logAutoPaused(before, after, lId, now);
      await log('level_started', { ...ids(cId, lId), data: { minutes: next.minutes } }, now);
    }),

    pauseLevel: (cId, lId) => levelAction(pauseLevel, cId, lId, async (_old, _next, now) => {
      await log('level_paused', ids(cId, lId), now);
    }),

    resumeLevel: (cId, lId) => levelAction(resumeLevel, cId, lId, async (old, _next, now, before, after) => {
      await logAutoPaused(before, after, lId, now);
      await log('level_resumed', { ...ids(cId, lId), data: { pausedForMs: Math.max(0, now - (old.pausedAt ?? now)) } }, now);
    }),

    extendLevel: (cId, lId) => levelAction(extendLevel, cId, lId, async (old, _next, now) => {
      await log('level_extended', { ...ids(cId, lId), data: { minutes: EXTEND_MINUTES, afterTimeUp: timerPhase(old, now) === 'expired' } }, now);
    }),

    completeLevel: (cId, lId) => levelAction(completeLevel, cId, lId, async (old, next, now) => {
      await log('level_completed', { ...ids(cId, lId), data: { focusMs: next.focusMs, early: timerPhase(old, now) !== 'expired' } }, now);
    }),
  };
}
