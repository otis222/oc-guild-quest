import { describe, expect, it } from 'vitest';
import {
  elapsedMs, extendTimer, finishTimer, formatClock, pauseTimer, remainingMs, resumeTimer, startTimer, timerPhase,
} from '../../src/core/timer';
import type { Level } from '../../src/core/types';

const MIN = 60_000;
const todo = (minutes = 10): Level => ({ id: 'l1', title: '上色（一）', minutes, kind: 'timed', status: 'todo', pausedMs: 0, focusMs: 0 });
const T0 = 1_000_000;

describe('倒數顯示', () => {
  it('mm:ss，秒數無條件進位', () => {
    expect(formatClock(10 * MIN)).toBe('10:00');
    expect(formatClock(10 * MIN - 1)).toBe('10:00');
    expect(formatClock(10 * MIN - 1000)).toBe('09:59');
    expect(formatClock(61_500)).toBe('01:02');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('計時', () => {
  it('開始後用時間戳算剩餘時間', () => {
    const l = startTimer(todo(), T0);
    expect(l).toMatchObject({ status: 'doing', startedAt: T0, pausedMs: 0 });
    expect(timerPhase(l, T0)).toBe('running');
    expect(remainingMs(l, T0 + 3 * MIN)).toBe(7 * MIN);
    expect(timerPhase(todo(), T0)).toBe('idle');
  });

  it('暫停的時間不算：暫停 2 分鐘再繼續，剩餘時間接著算', () => {
    let l = startTimer(todo(), T0);
    l = pauseTimer(l, T0 + 3 * MIN);
    expect(timerPhase(l, T0 + 4 * MIN)).toBe('paused');
    expect(remainingMs(l, T0 + 4 * MIN)).toBe(7 * MIN);
    l = resumeTimer(l, T0 + 5 * MIN);
    expect(l.pausedMs).toBe(2 * MIN);
    expect('pausedAt' in l).toBe(false);
    expect(remainingMs(l, T0 + 6 * MIN)).toBe(6 * MIN);
    expect(elapsedMs(l, T0 + 6 * MIN)).toBe(4 * MIN);
  });

  it('時間到就停在 0，等玩家決定', () => {
    const l = startTimer(todo(), T0);
    expect(timerPhase(l, T0 + 10 * MIN)).toBe('expired');
    expect(remainingMs(l, T0 + 30 * MIN)).toBe(0);
  });

  it('時間到以後才暫停：停在時間到的那一刻', () => {
    const l = pauseTimer(startTimer(todo(), T0), T0 + 13 * MIN);
    expect(l.pausedAt).toBe(T0 + 10 * MIN);
    expect(timerPhase(l, T0 + 20 * MIN)).toBe('expired');
  });

  it('還沒到時間就再 5 分鐘：多 5 分鐘', () => {
    const l = extendTimer(startTimer(todo(), T0), T0 + 8 * MIN);
    expect(l.minutes).toBe(15);
    expect(remainingMs(l, T0 + 8 * MIN)).toBe(7 * MIN);
  });

  it('時間到以後才按再 5 分鐘：中間放著的時間不算，從現在起 5 分鐘', () => {
    const l = extendTimer(startTimer(todo(), T0), T0 + 13 * MIN);
    expect(l.minutes).toBe(15);
    expect(l.pausedMs).toBe(3 * MIN);
    expect(timerPhase(l, T0 + 13 * MIN)).toBe('running');
    expect(remainingMs(l, T0 + 13 * MIN)).toBe(5 * MIN);
  });

  it('提早完成：專注時間照實際算', () => {
    const l = finishTimer(startTimer(todo(), T0), T0 + 6 * MIN);
    expect(l).toMatchObject({ status: 'done', doneAt: T0 + 6 * MIN, focusMs: 6 * MIN });
  });

  it('時間到很久才按完成：專注時間最多算到預定時間', () => {
    expect(finishTimer(startTimer(todo(), T0), T0 + 40 * MIN).focusMs).toBe(10 * MIN);
  });

  it('暫停中按完成：這段暫停也算進累計暫停', () => {
    const paused = pauseTimer(startTimer(todo(), T0), T0 + 4 * MIN);
    const l = finishTimer(paused, T0 + 9 * MIN);
    expect(l).toMatchObject({ status: 'done', focusMs: 4 * MIN, pausedMs: 5 * MIN });
    expect('pausedAt' in l).toBe(false);
  });

  it('不合理的操作不會改東西（回傳同一個物件）', () => {
    const t = todo();
    expect(pauseTimer(t, T0)).toBe(t);
    expect(resumeTimer(t, T0)).toBe(t);
    expect(extendTimer(t, T0)).toBe(t);
    const running = startTimer(t, T0);
    expect(startTimer(running, T0 + 1)).toBe(running);
    expect(resumeTimer(running, T0 + 1)).toBe(running);
    const done = finishTimer(running, T0 + 5);
    expect(finishTimer(done, T0 + 9)).toBe(done);
    const submit: Level = { ...t, kind: 'submit', minutes: 0 };
    expect(startTimer(submit, T0)).toBe(submit);
  });
});
