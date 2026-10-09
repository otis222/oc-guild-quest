// 「接新委託」表單：關卡清單的編輯規則與送出前的檢查。交件關固定在最後，不能刪、不能移動。
import type { CommissionDraft, LevelDraft } from './state';
import { LEVEL_MINUTES } from './templates';
import { cleanText } from './text';
import type { CourseType } from './types';

/** 計時關卡至少幾關、最多幾關 */
export const MIN_TIMED_LEVELS = 1;
export const MAX_TIMED_LEVELS = 10;
/** 作業名稱、關卡名稱最多幾個字 */
export const COMMISSION_TITLE_MAX = 30;
export const LEVEL_TITLE_MAX = 20;

type Levels = readonly LevelDraft[];

const timedCount = (levels: Levels): number => levels.filter((l) => l.kind === 'timed').length;
const isTimedAt = (levels: Levels, i: number): boolean => levels[i]?.kind === 'timed';

export function renameLevel(levels: Levels, i: number, title: string): LevelDraft[] {
  return levels.map((l, j) => (j === i && l.kind === 'timed' ? { ...l, title } : l));
}

export const canRemoveLevel = (levels: Levels, i: number): boolean => isTimedAt(levels, i) && timedCount(levels) > MIN_TIMED_LEVELS;

export function removeLevel(levels: Levels, i: number): LevelDraft[] {
  return canRemoveLevel(levels, i) ? levels.filter((_, j) => j !== i) : [...levels];
}

/** delta：-1 上移、1 下移。只能在計時關卡之間移動，不能越過交件關 */
export const canMoveLevel = (levels: Levels, i: number, delta: -1 | 1): boolean => isTimedAt(levels, i) && isTimedAt(levels, i + delta);

export function moveLevel(levels: Levels, i: number, delta: -1 | 1): LevelDraft[] {
  const out = [...levels];
  if (canMoveLevel(levels, i, delta)) [out[i], out[i + delta]] = [out[i + delta], out[i]];
  return out;
}

export const canAddLevel = (levels: Levels): boolean => timedCount(levels) < MAX_TIMED_LEVELS;

/** 在交件關前面加一個計時關卡（名稱先空著，讓玩家自己打） */
export function addLevel(levels: Levels, title = ''): LevelDraft[] {
  if (!canAddLevel(levels)) return [...levels];
  const submitAt = levels.findIndex((l) => l.kind === 'submit');
  const at = submitAt < 0 ? levels.length : submitAt;
  return [...levels.slice(0, at), { title, minutes: LEVEL_MINUTES, kind: 'timed' }, ...levels.slice(at)];
}

export interface DraftForm {
  course: CourseType | null;
  title: string;
  dueAt: number;
  levels: Levels;
}

/** 表單哪裡還沒填好（畫面上的說法在 src/ui/copy.ts） */
export type DraftProblem = 'course' | 'title' | 'due' | 'taskTitle';

/** 表單還缺什麼；可以送出就回傳 null */
export function draftProblem(f: DraftForm): DraftProblem | null {
  if (!f.course) return 'course';
  if (!cleanText(f.title, COMMISSION_TITLE_MAX)) return 'title';
  if (!Number.isFinite(f.dueAt)) return 'due';
  if (f.levels.some((l) => l.kind === 'timed' && !cleanText(l.title, LEVEL_TITLE_MAX))) return 'taskTitle';
  return null;
}

/** 整理成可以建立委託的草稿：去掉多餘空白、確定最後一關是交件關。表單有問題會丟錯。 */
export function toCommissionDraft(f: DraftForm): CommissionDraft {
  const problem = draftProblem(f);
  if (problem || !f.course) throw new Error(`委託單還沒填好：${problem ?? 'course'}`);
  const levels = f.levels.map((l) => (l.kind === 'timed' ? { ...l, title: cleanText(l.title, LEVEL_TITLE_MAX) } : { ...l }));
  if (levels.filter((l) => l.kind === 'submit').length !== 1 || levels[levels.length - 1].kind !== 'submit') {
    throw new Error('最後一關要是交件');
  }
  return { course: f.course, title: cleanText(f.title, COMMISSION_TITLE_MAX), dueAt: f.dueAt, levels };
}
