import { describe, expect, it } from 'vitest';
import { createFpsGuard, LOW_FPS, LOW_SECONDS, WARMUP_SECONDS } from '../../src/core/fpsGuard';

// 用 32、64 FPS：1/32、1/64 秒加起來剛好是整數秒，不會有浮點誤差，每秒的計算區間跟測試的階段對得齊
const SLOW = 32, FAST = 64;

/** 用固定 FPS 跑 seconds 秒，回傳說要降畫質的次數 */
function run(guard: ReturnType<typeof createFpsGuard>, fps: number, seconds: number): number {
  let hits = 0;
  for (let i = 0; i < fps * seconds; i++) if (guard.tick(1 / fps)) hits++;
  return hits;
}

describe(`FPS 連續 ${LOW_SECONDS} 秒低於 ${LOW_FPS} 就降畫質`, () => {
  it('64 FPS 一直不會降', () => {
    const g = createFpsGuard();
    expect(run(g, FAST, 20)).toBe(0);
    expect(g.lowered).toBe(false);
  });

  it(`32 FPS：前 ${WARMUP_SECONDS} 秒不算，再連續 3 秒剛好降一次，之後不再通知`, () => {
    const g = createFpsGuard();
    expect(run(g, SLOW, WARMUP_SECONDS + LOW_SECONDS - 1)).toBe(0);
    expect(run(g, SLOW, 1)).toBe(1);
    expect(g.lowered).toBe(true);
    expect(run(g, SLOW, 10)).toBe(0);
  });

  it('要連續：卡 2 秒、順 1 秒、再卡 2 秒，不會降；再卡 1 秒才降', () => {
    const g = createFpsGuard();
    run(g, FAST, WARMUP_SECONDS);
    expect(run(g, SLOW, 2) + run(g, FAST, 1) + run(g, SLOW, 2)).toBe(0);
    expect(run(g, SLOW, 1)).toBe(1);
  });

  it('分頁切到背景再回來（一幀很久）不算卡，重新開始算', () => {
    const g = createFpsGuard();
    run(g, FAST, WARMUP_SECONDS);
    run(g, SLOW, 2);
    expect(g.tick(5)).toBe(false);
    expect(run(g, SLOW, 2)).toBe(0);
    expect(run(g, SLOW, 1)).toBe(1);
  });

  it('剛載入時很卡也不算（前 2 秒）', () => {
    const g = createFpsGuard();
    expect(run(g, 8, WARMUP_SECONDS)).toBe(0);
    expect(run(g, FAST, 10)).toBe(0);
  });
});
