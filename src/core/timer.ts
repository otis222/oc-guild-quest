// 10 分鐘任務的計時。剩餘時間一律用時間戳算（開始時間、累計暫停、正在暫停的起點），重新整理也不會歸零。
// 時間到以後就停在 0，不再算進專注時間；按「再 5 分鐘」才從按下去的那一刻接著算。
import type { Level } from './types';

/** 「再 5 分鐘」加幾分鐘 */
export const EXTEND_MINUTES = 5;
const MIN = 60_000;

export type TimerPhase =
  | 'idle'     // 還沒開始
  | 'running'  // 計時中
  | 'paused'   // 暫停中
  | 'expired'  // 時間到，等玩家決定完成或再 5 分鐘
  | 'done';    // 完成了

export const plannedMs = (l: Level): number => l.minutes * MIN;

/** 已經專注的時間（扣掉暫停）；超過預定時間也照算，要不要封頂由呼叫的人決定 */
export function elapsedMs(l: Level, now: number): number {
  if (l.startedAt === undefined) return 0;
  return Math.max(0, (l.pausedAt ?? now) - l.startedAt - l.pausedMs);
}

export const remainingMs = (l: Level, now: number): number => Math.max(0, plannedMs(l) - elapsedMs(l, now));

/** 沒在暫停的話，時間到的那一刻 */
const expiryAt = (l: Level): number => (l.startedAt ?? 0) + l.pausedMs + plannedMs(l);

export function timerPhase(l: Level, now: number): TimerPhase {
  if (l.status === 'done') return 'done';
  if (l.status !== 'doing' || l.startedAt === undefined) return 'idle';
  if (remainingMs(l, now) <= 0) return 'expired';
  return l.pausedAt !== undefined ? 'paused' : 'running';
}

/** 倒數顯示：mm:ss，秒數無條件進位（剛開始顯示 10:00，不會一開始就是 9:59） */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- 狀態轉換（回傳新的 Level；沒有變化就回傳原本那個）

/** 拿掉「正在暫停」的標記（直接刪掉欄位，不留一個 undefined 在存檔裡） */
function unpaused(l: Level): Level {
  const copy = { ...l };
  delete copy.pausedAt;
  return copy;
}

export function startTimer(l: Level, now: number): Level {
  if (l.kind !== 'timed' || l.status !== 'todo') return l;
  return unpaused({ ...l, status: 'doing', startedAt: now, pausedMs: 0 });
}

/** 暫停：時間到以後再暫停，就停在時間到的那一刻（之後放著不算專注） */
export function pauseTimer(l: Level, now: number): Level {
  if (l.status !== 'doing' || l.startedAt === undefined || l.pausedAt !== undefined) return l;
  return { ...l, pausedAt: Math.min(now, expiryAt(l)) };
}

export function resumeTimer(l: Level, now: number): Level {
  if (l.status !== 'doing' || l.pausedAt === undefined) return l;
  return unpaused({ ...l, pausedMs: l.pausedMs + Math.max(0, now - l.pausedAt) });
}

/** 再 N 分鐘。時間到之後才按的話，中間放著的時間不算專注，從現在接著算 */
export function extendTimer(l: Level, now: number, minutes = EXTEND_MINUTES): Level {
  if (l.status !== 'doing' || l.startedAt === undefined) return l;
  let next: Level = { ...l, minutes: l.minutes + minutes };
  if (timerPhase(l, now) === 'expired' && l.pausedAt === undefined) {
    next = { ...next, pausedMs: l.pausedMs + Math.max(0, now - expiryAt(l)) };
  }
  return next;
}

/** 完成：專注時間最多算到預定時間；正在暫停的話，這段暫停也算進累計暫停 */
export function finishTimer(l: Level, now: number): Level {
  if (l.status === 'done') return l;
  const focusMs = Math.min(elapsedMs(l, now), plannedMs(l));
  const pausedMs = l.pausedAt !== undefined ? l.pausedMs + Math.max(0, now - l.pausedAt) : l.pausedMs;
  return unpaused({ ...l, status: 'done', doneAt: now, focusMs, pausedMs });
}
