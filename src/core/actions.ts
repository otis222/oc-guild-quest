// 玩家的操作：改狀態 → 存檔 → 記事件（企劃表 7.6）。
// 事件只在狀態真的有變時才記：連按兩次「完成」、或兩個分頁都按，也只記一次、只點亮一片。
import { recordBonus, setOcQuote } from './bonus';
import { courseInfo } from './courses';
import { logEvent, type EventFields } from './events';
import { newId } from './id';
import {
  addCommission, completeLevel, extendLevel, findCommission, findLevel, pauseLevel, resumeLevel, startLevel, type CommissionDraft,
} from './state';
import { deletePhoto, putPhoto, type KV } from './storage';
import type { GuildStore } from './store';
import { commissionOfPhoto, submitCommission } from './submit';
import { EXTEND_MINUTES, timerPhase } from './timer';
import type { EventType, GuildState, Level } from './types';

/** 交件要存的東西（照片已經在瀏覽器裡縮好） */
export interface SubmitInput {
  /** 交件照片（長邊 1024px 的 JPEG） */
  photo: Blob;
  /** 部位是配色：抽出的色 */
  palette?: readonly string[];
  /** 部位是名牌：裁好的名牌圖 */
  nameplate?: Blob;
}

/** 加分關（設定圖急救）按「完成排版」時的結果 */
export interface BonusResult {
  /** 0～100 */
  score: number;
  /** 做到的規則（sheet.ts 的 SheetRuleId） */
  passed: readonly string[];
  /** 從這一局開始到按「完成排版」花了多久 */
  ms: number;
  /** 移動小卡幾次（拖曳、點一下放進格線、方向鍵） */
  moves: number;
}

export interface Actions {
  /** 接新委託（委託單上新加的課程一起建立），回傳委託 id */
  createCommission(draft: CommissionDraft): Promise<string>;
  /** 下面幾個回傳「狀態有沒有變」 */
  startLevel(commissionId: string, levelId: string): Promise<boolean>;
  pauseLevel(commissionId: string, levelId: string): Promise<boolean>;
  resumeLevel(commissionId: string, levelId: string): Promise<boolean>;
  extendLevel(commissionId: string, levelId: string): Promise<boolean>;
  completeLevel(commissionId: string, levelId: string): Promise<boolean>;
  /** 換造型：sprite 是 AI 小人檔名或 upload:<照片 id>；跟原本一樣就不記 */
  changeOcSprite(sprite: string): Promise<boolean>;
  /** 玩家自己打開 OC 設定卡（完成任務後自動跳出來的不算） */
  noteOcCardOpened(via: string): Promise<void>;
  /**
   * 交件：照片先存進 IndexedDB，再改存檔、記事件。回傳有沒有交成功；
   * 已經交過了（例如另一個分頁先交）就把剛存的照片刪掉、回傳 false。存檔失敗也會刪掉照片再丟錯。
   */
  submitCommission(commissionId: string, input: SubmitInput): Promise<boolean>;
  /** 點大廳展台上的展品（放大看） */
  noteExhibitOpened(slot: number, photoId: string): Promise<void>;
  /** 開始一局加分關（打開設定圖急救、或按「再排一次」） */
  startBonus(commissionId: string): Promise<void>;
  /** 加分關計分：記下這張委託的最高分，回傳最高分 */
  finishBonus(commissionId: string, result: BonusResult): Promise<number>;
  /** 改 OC 的台詞（設定圖上的台詞卡）；回傳有沒有變 */
  setOcQuote(quote: string): Promise<boolean>;
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
      const { before, after } = await apply((s) => addCommission(s, draft, now, id));
      const { course } = findCommission(after, id);
      // 委託單上新加的課程（同名的課程已經有了就不會新增，也不記）
      const created = after.customCourses.find((c) => c.id === course && !before.customCourses.some((b) => b.id === c.id));
      if (created) await log('course_created', { data: { course, label: created.label, part: created.part } }, now);
      await log('commission_created', { commissionId: id, data: { course, levels: draft.levels.length, dueAt: draft.dueAt } }, now);
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

    async changeOcSprite(sprite) {
      const now = clock();
      const { before, after } = await apply((s) => (s.oc.sprite === sprite ? s : { ...s, oc: { ...s.oc, sprite } }));
      if (before === after) return false;
      await log('oc_changed', { data: { from: before.oc.sprite, to: sprite } }, now);
      return true;
    },

    async noteOcCardOpened(via) {
      await log('oc_card_opened', { data: { via } }, clock());
    },

    async submitCommission(cId, input) {
      const now = clock();
      const photoId = await putPhoto(kv, input.photo);
      const nameplatePhotoId = input.nameplate ? await putPhoto(kv, input.nameplate) : undefined;
      const discard = (): Promise<unknown> => Promise.all([photoId, nameplatePhotoId].map((id) => (id ? deletePhoto(kv, id) : null)))
        .catch((err: unknown) => console.warn('刪掉沒用到的照片失敗', err));
      let changed: { before: GuildState; after: GuildState };
      try {
        changed = await apply((s) => submitCommission(s, cId, { photoId, palette: input.palette, nameplatePhotoId }, now));
      } catch (err) {
        await discard();
        throw err;
      }
      if (changed.before === changed.after) { await discard(); return false; }
      const c = findCommission(changed.after, cId);
      await log('photo_added', { commissionId: cId, data: { photoId, bytes: input.photo.size } }, now);
      await log('commission_submitted', {
        commissionId: cId,
        data: { photoId, part: courseInfo(changed.after, c.course).part, beforeDueMs: c.dueAt - now, guildLevel: changed.after.guildLevel },
      }, now);
      return true;
    },

    async noteExhibitOpened(slot, photoId) {
      const c = commissionOfPhoto(store.state, photoId);
      await log('exhibit_opened', { ...(c ? { commissionId: c.id } : {}), data: { slot, photoId } }, clock());
    },

    async startBonus(cId) {
      await log('bonus_started', { commissionId: cId }, clock());
    },

    async finishBonus(cId, r) {
      const now = clock();
      const { after } = await apply((s) => recordBonus(s, cId, r.score));
      const best = findCommission(after, cId).bonusBest ?? r.score;
      await log('bonus_finished', { commissionId: cId, data: { score: r.score, best, passed: [...r.passed], ms: r.ms, moves: r.moves } }, now);
      return best;
    },

    async setOcQuote(quote) {
      const { before, after } = await apply((s) => setOcQuote(s, quote));
      return before !== after;
    },
  };
}
