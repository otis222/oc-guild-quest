// 作業換畫圖時間（企劃表 T17，Crazy 8s 第 4 格）：每完成一個計時任務，存 5 分鐘畫圖時間。
// 存了多少用算的：完成的計時任務數 × 5 分鐘，減掉已經用掉的。所以舊存檔一打開，之前做完的任務也算數。
// 「開始畫圖」把存著的全部拿來倒數，可以休息、提早結束；結束時用了多久扣多久，沒用完的留著下次用。
// 計時跟任務一樣用時間戳算（開始時間、累計休息、正在休息的起點），重新整理也不會歸零。
// 同時只算一個：開始畫圖時，正在跑的任務先暫停；開始任務時結束畫圖（在 actions.ts）。
import { pauseRunningLevels } from './state';
import type { DrawSession, GuildState } from './types';

/** 完成一個計時任務存幾分鐘 */
export const DRAW_PER_TASK_MIN = 5;
/** 存不到 1 秒就當作沒有（提早結束時零頭剩下的） */
export const DRAW_MIN_MS = 1000;
const MIN = 60_000;

/** 完成的計時任務數（全部委託，包括收進歷史的） */
export const doneTaskCount = (s: GuildState): number =>
  s.commissions.reduce((n, c) => n + c.levels.filter((l) => l.kind === 'timed' && l.status === 'done').length, 0);

/** 一共存過多少畫圖時間 */
export const drawEarnedMs = (s: GuildState): number => doneTaskCount(s) * DRAW_PER_TASK_MIN * MIN;

/** 存著還沒用的畫圖時間（正在畫的這一次另外算）；不到 1 秒當作 0 */
export function drawBankMs(s: GuildState): number {
  const bank = drawEarnedMs(s) - (s.drawUsedMs ?? 0);
  return bank >= DRAW_MIN_MS ? bank : 0;
}

export type DrawPhase = 'running' | 'paused' | 'timeUp';

/** 這次畫了多久（扣掉休息），最多到這次拿出來的時間 */
export function drawElapsedMs(d: DrawSession, now: number): number {
  return Math.min(d.plannedMs, Math.max(0, (d.pausedAt ?? now) - d.startedAt - d.pausedMs));
}

export const drawRemainingMs = (d: DrawSession, now: number): number => d.plannedMs - drawElapsedMs(d, now);

export function drawPhase(d: DrawSession, now: number): DrawPhase {
  if (drawRemainingMs(d, now) <= 0) return 'timeUp';
  return d.pausedAt !== undefined ? 'paused' : 'running';
}

/** 開始畫圖：存著的全部拿來倒數，正在跑的任務先暫停。已經在畫、或沒有存時間就回傳原本的狀態 */
export function startDrawing(s: GuildState, now: number): GuildState {
  const bank = drawBankMs(s);
  if (s.drawing || bank <= 0) return s;
  return { ...pauseRunningLevels(s, now), drawing: { startedAt: now, plannedMs: bank, pausedMs: 0, pauses: 0 } };
}

/** 休息一下（時間到了就不用休息） */
export function pauseDrawing(s: GuildState, now: number): GuildState {
  const d = s.drawing;
  if (!d || drawPhase(d, now) !== 'running') return s;
  return { ...s, drawing: { ...d, pausedAt: now, pauses: d.pauses + 1 } };
}

export function resumeDrawing(s: GuildState, now: number): GuildState {
  const d = s.drawing;
  if (!d || d.pausedAt === undefined) return s;
  const next: DrawSession = { ...d, pausedMs: d.pausedMs + Math.max(0, now - d.pausedAt) };
  delete next.pausedAt;
  return { ...s, drawing: next };
}

/** 結束畫圖：畫了多久扣多久，沒用完的留著。沒在畫就回傳原本的狀態 */
export function finishDrawing(s: GuildState, now: number): GuildState {
  const d = s.drawing;
  if (!d) return s;
  const next: GuildState = { ...s, drawUsedMs: (s.drawUsedMs ?? 0) + drawElapsedMs(d, now) };
  delete next.drawing;
  return next;
}
