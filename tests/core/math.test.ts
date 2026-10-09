import { describe, expect, it } from 'vitest';
import { clamp, damp, lerp, pick, rand } from '../../src/core/math';

describe('math', () => {
  it('clamp 夾在範圍內', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('lerp 兩端與中點', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });

  it('damp：dt=0 不動，dt 很大就到達目標', () => {
    expect(damp(0, 10, 5, 0)).toBe(0);
    expect(damp(0, 10, 5, 100)).toBeCloseTo(10);
    const v = damp(0, 10, 5, 0.016);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
  });

  it('damp 跟切幀方式無關', () => {
    const once = damp(0, 10, 3, 0.1);
    const twice = damp(damp(0, 10, 3, 0.05), 10, 3, 0.05);
    expect(twice).toBeCloseTo(once, 10);
  });

  it('rand 落在 [a, b)', () => {
    for (let i = 0; i < 500; i++) {
      const v = rand(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
    }
  });

  it('pick 只會挑到陣列裡的元素', () => {
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(arr).toContain(pick(arr));
  });
});
