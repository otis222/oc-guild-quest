// 截止前的氣氛提醒：截止前一天大廳變黃昏（T12）、委託板上的紙變色（T13）。
// 只改變大廳的樣子，不跳通知、不推播（企劃表第 4 節：不做推播通知）。
import { isOverdue } from './due';
import { activeCommissions } from './state';
import type { Commission, GuildState } from './types';

const HOUR = 3_600_000;
/** 還沒交件的委託剩不到這麼久（含已逾期），大廳就變黃昏 */
export const DUSK_WITHIN_MS = 24 * HOUR;
/** 委託板上的紙：剩不到這麼久就變粉紅、會晃 */
export const SOON_WITHIN_MS = 48 * HOUR;

/** 有沒有還沒交件、剩不到 24 小時（含已逾期）的委託 */
export const needsDusk = (s: GuildState, now: number): boolean =>
  activeCommissions(s).some((c) => c.dueAt - now < DUSK_WITHIN_MS);

/**
 * 天色要不要跟著變：只在「急／不急」改變的那一刻回傳要變成什麼，沒變就回傳 null，
 * 所以玩家用右上的按鈕手動切換的天色，在下一次改變之前不會被蓋掉。
 * prev 是上一次的結果；剛打開頁面時是 null：急就變黃昏，不急就維持原本的白天。
 */
export function duskChange(prev: boolean | null, urgent: boolean): 'dusk' | 'day' | null {
  if (prev === urgent) return null;
  if (prev === null) return urgent ? 'dusk' : null;
  return urgent ? 'dusk' : 'day';
}

/** 委託板上那張紙的樣子：平常、快截止（剩不到 48 小時）、已逾期 */
export type PaperUrgency = 'calm' | 'soon' | 'overdue';

export function paperUrgency(c: Commission, now: number): PaperUrgency {
  if (isOverdue(c.dueAt, now)) return 'overdue';
  return c.dueAt - now < SOON_WITHIN_MS ? 'soon' : 'calm';
}

/** 3D 委託板上最多釘幾張紙 */
export const BOARD_PAPERS_MAX = 6;

/** 委託板上的一張紙（顏色由畫面決定） */
export interface BoardPaper {
  commissionId: string;
  title: string;
  course: Commission['course'];
  dueAt: number;
  urgency: PaperUrgency;
}

/** 委託板上要釘的紙：還沒交件的委託，截止早的在前，最多 6 張 */
export function boardPapers(s: GuildState, now: number, max = BOARD_PAPERS_MAX): BoardPaper[] {
  return activeCommissions(s).slice(0, max).map((c) => ({
    commissionId: c.id, title: c.title, course: c.course, dueAt: c.dueAt, urgency: paperUrgency(c, now),
  }));
}
