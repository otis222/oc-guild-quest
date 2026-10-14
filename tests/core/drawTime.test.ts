import { describe, expect, it } from 'vitest';
import {
  doneTaskCount, DRAW_MIN_MS, DRAW_PER_TASK_MIN, drawBankMs, drawEarnedMs, drawElapsedMs, drawPhase, drawRemainingMs, finishDrawing,
  pauseDrawing, resumeDrawing, startDrawing,
} from '../../src/core/drawTime';
import { addCommission, completeLevel, createGuildState, findCommission, findLevel, migrate, pauseRunningLevels, startLevel } from '../../src/core/state';
import { submitCommission } from '../../src/core/submit';
import { templateLevels } from '../../src/core/templates';
import type { GuildState } from '../../src/core/types';

const MIN = 60_000;
const OC = { name: '小鈴', sprite: 'maid_1.png' };

/** 接一張委託，把前 n 個計時任務做完 */
function withDone(s0: GuildState, id: string, n: number): GuildState {
  let s = addCommission(s0, { course: 'color', title: id, dueAt: 9e12, levels: templateLevels('color') }, 1, id);
  for (const l of findCommission(s, id).levels.filter((x) => x.kind === 'timed').slice(0, n)) {
    s = completeLevel(startLevel(s, id, l.id, 10), id, l.id, 20);
  }
  return s;
}

describe('畫圖時間：存了多少', () => {
  it('每完成一個計時任務存 5 分鐘；兩張委託加起來、交件關不算', () => {
    let s = withDone(createGuildState(OC, 0), 'a', 2);
    s = withDone(s, 'b', 5);
    s = submitCommission(s, 'b', { photoId: 'p', palette: ['#e5484d'] }, 30);
    expect(DRAW_PER_TASK_MIN).toBe(5);
    expect(doneTaskCount(s)).toBe(7);
    expect(drawEarnedMs(s)).toBe(35 * MIN);
    expect(drawBankMs(s)).toBe(35 * MIN);
  });

  it('還沒完成任務是 0；用掉的扣掉，剩不到 1 秒當作 0', () => {
    const s = withDone(createGuildState(OC, 0), 'a', 1);
    expect(drawBankMs(createGuildState(OC, 0))).toBe(0);
    expect(drawBankMs({ ...s, drawUsedMs: 2 * MIN })).toBe(3 * MIN);
    expect(drawBankMs({ ...s, drawUsedMs: 5 * MIN - DRAW_MIN_MS + 1 })).toBe(0);
    expect(drawBankMs({ ...s, drawUsedMs: 5 * MIN - DRAW_MIN_MS })).toBe(DRAW_MIN_MS);
  });

  it('舊存檔沒有畫圖的欄位，照樣讀得進來；之前完成的任務也算數', () => {
    const s = withDone(createGuildState(OC, 0), 'a', 3);
    const loaded = migrate(structuredClone(s));
    expect(loaded).toEqual(s);
    expect(drawBankMs(loaded)).toBe(15 * MIN);
  });
});

describe('畫圖計時', () => {
  const s0 = withDone(createGuildState(OC, 0), 'a', 2); // 存了 10 分鐘
  const t0 = 1_000_000;

  it('開始：存著的全部拿來倒數；已經在畫、或沒有存時間就不變', () => {
    const s = startDrawing(s0, t0);
    expect(s.drawing).toEqual({ startedAt: t0, plannedMs: 10 * MIN, pausedMs: 0, pauses: 0 });
    expect(startDrawing(s, t0 + 5)).toBe(s);
    const none = createGuildState(OC, 0);
    expect(startDrawing(none, t0)).toBe(none);
  });

  it('開始畫圖時，正在跑的任務先暫停', () => {
    let s = addCommission(s0, { course: 'drawing', title: 'k', dueAt: 9e12, levels: templateLevels('drawing') }, 1, 'k');
    const lId = findCommission(s, 'k').levels[0].id;
    s = startLevel(s, 'k', lId, t0 - MIN);
    const next = startDrawing(s, t0);
    expect(findLevel(next, 'k', lId).level.pausedAt).toBe(t0);
    expect(next.drawing?.startedAt).toBe(t0);
  });

  it('休息不算時間；重新整理（從存檔重新算）剩下的時間一樣', () => {
    let s = startDrawing(s0, t0);
    s = pauseDrawing(s, t0 + 1 * MIN);
    expect(drawPhase(s.drawing!, t0 + 2 * MIN)).toBe('paused');
    expect(drawRemainingMs(s.drawing!, t0 + 2 * MIN)).toBe(9 * MIN);
    s = resumeDrawing(s, t0 + 3 * MIN);
    expect(s.drawing).toEqual({ startedAt: t0, plannedMs: 10 * MIN, pausedMs: 2 * MIN, pauses: 1 });
    expect('pausedAt' in s.drawing!).toBe(false);
    const reloaded = migrate(structuredClone(s));
    expect(drawElapsedMs(reloaded.drawing!, t0 + 4 * MIN)).toBe(2 * MIN);
    expect(drawRemainingMs(reloaded.drawing!, t0 + 4 * MIN)).toBe(8 * MIN);
    expect(drawPhase(reloaded.drawing!, t0 + 4 * MIN)).toBe('running');
  });

  it('時間到：停在 0，放著也不會多扣；時間到之後不能休息', () => {
    const s = startDrawing(s0, t0);
    const late = t0 + 60 * MIN;
    expect(drawPhase(s.drawing!, t0 + 10 * MIN)).toBe('timeUp');
    expect(drawRemainingMs(s.drawing!, late)).toBe(0);
    expect(pauseDrawing(s, late)).toBe(s);
    const done = finishDrawing(s, late);
    expect(done.drawUsedMs).toBe(10 * MIN);
    expect(drawBankMs(done)).toBe(0);
  });

  it('提早結束：畫了多久扣多久，沒用完的留著；休息中結束也一樣', () => {
    let s = startDrawing(s0, t0);
    s = pauseDrawing(s, t0 + 3 * MIN);
    const done = finishDrawing(s, t0 + 8 * MIN);
    expect('drawing' in done).toBe(false);
    expect(done.drawUsedMs).toBe(3 * MIN);
    expect(drawBankMs(done)).toBe(7 * MIN);
    // 下一次從剩下的 7 分鐘開始
    expect(startDrawing(done, t0 + 9 * MIN).drawing?.plannedMs).toBe(7 * MIN);
  });

  it('沒在畫：休息、繼續、結束都不變', () => {
    expect(pauseDrawing(s0, t0)).toBe(s0);
    expect(resumeDrawing(s0, t0)).toBe(s0);
    expect(finishDrawing(s0, t0)).toBe(s0);
  });

  it('沒有任務在跑時，暫停全部任務不變', () => {
    expect(pauseRunningLevels(s0, t0)).toBe(s0);
  });
});
