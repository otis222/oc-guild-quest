import { describe, expect, it } from 'vitest';
import { BONUS_FULL_SCORE } from '../../src/core/bonus';
import {
  GAP_MAX, GAP_MIN, GLYPH, messyPlate, moveGlyph, nudgeGlyph, plateChars, plateGaps, PLATE_RULES, plateSize, scorePlate,
  type PlateLayout,
} from '../../src/core/plateGame';
import { seeded } from '../helpers/seeded';

/** 排好的名牌：字距 gap、上下置中、左右置中（分不平時左邊少一步） */
function neat(n: number, gap: number): PlateLayout {
  const size = plateSize(n);
  const width = n * GLYPH + (n - 1) * gap;
  const left = Math.floor((size.w - width) / 2), y = (size.h - GLYPH) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: left + i * (GLYPH + gap), y }));
}
const at = (...xy: [number, number][]): PlateLayout => xy.map(([x, y]) => ({ x, y }));

describe('名牌急救：名牌和字', () => {
  it('名牌的大小照字數算：最寬的字距（3 步）左右還各留 3 步，上下各留 3 步', () => {
    expect(plateSize(1)).toEqual({ w: 10, h: 10 });
    expect(plateSize(3)).toEqual({ w: 24, h: 10 });
    expect(plateSize(12)).toEqual({ w: 87, h: 10 });
    expect(() => plateSize(0)).toThrow();
  });

  it('名字拆成一個一個字，空白不算', () => {
    expect(plateChars('小鈴')).toEqual(['小', '鈴']);
    expect(plateChars(' Mira  Lin ')).toEqual(['M', 'i', 'r', 'a', 'L', 'i', 'n']);
  });

  it('移動：吸到整數步、不超出名牌', () => {
    const size = plateSize(2), l = at([2, 1], [9, 5]);
    expect(moveGlyph(l, 0, 3.4, 2.6, size)).toEqual(at([3, 3], [9, 5]));
    expect(moveGlyph(l, 1, 99, 99, size)).toEqual(at([2, 1], [size.w - GLYPH, size.h - GLYPH]));
    expect(moveGlyph(l, 0, -5, -5, size)).toEqual(at([0, 0], [9, 5]));
  });

  it('不能越過、也不能疊到旁邊的字；沒動就回傳原本的', () => {
    const size = plateSize(3), l = at([3, 3], [9, 3], [15, 3]);
    expect(moveGlyph(l, 1, 0, 3, size)[1].x).toBe(3 + GLYPH);
    expect(moveGlyph(l, 1, 20, 3, size)[1].x).toBe(15 - GLYPH);
    expect(moveGlyph(l, 0, 3, 3, size)).toBe(l);
    expect(() => moveGlyph(l, 5, 0, 0, size)).toThrow();
  });

  it('方向鍵一次移一步', () => {
    const size = plateSize(2), l = at([2, 3], [9, 3]);
    expect(nudgeGlyph(l, 1, 1, 0, size)).toEqual(at([2, 3], [10, 3]));
    expect(nudgeGlyph(l, 1, 0, -1, size)).toEqual(at([2, 3], [9, 2]));
    expect(nudgeGlyph(l, 0, 0, -9, size)).toEqual(at([2, 0], [9, 3]));
  });

  it('字距：相鄰兩個字中間空幾步', () => {
    expect(plateGaps(at([0, 0], [5, 0], [11, 0]))).toEqual([1, 2]);
    expect(plateGaps(at([0, 0]))).toEqual([]);
  });
});

describe('名牌急救：計分規則', () => {
  it('滿分 100：對齊 50、字距 50', () => {
    const sum = (kind: string): number => PLATE_RULES.filter((r) => r.kind === kind).reduce((a, r) => a + r.points, 0);
    expect([sum('line'), sum('space')]).toEqual([50, 50]);
    expect(sum('line') + sum('space')).toBe(BONUS_FULL_SCORE);
  });

  it('1～12 個字、字距 1～3 步，都排得到 100 分', () => {
    for (let n = 1; n <= 12; n++) {
      for (let gap = GAP_MIN; gap <= GAP_MAX; gap++) {
        expect([n, gap, scorePlate(neat(n, gap), plateSize(n)).score]).toEqual([n, gap, 100]);
      }
    }
  });

  it('對齊基線：有一個字高一步就不算', () => {
    const l = neat(3, 2);
    const off = l.map((g, i) => (i === 1 ? { ...g, y: g.y - 1 } : g));
    expect(scorePlate(off, plateSize(3)).passed).toEqual(['center', 'even', 'comfy']);
  });

  it('置中：左右或上下差兩步以上就不算；分不平差一步可以', () => {
    const size = plateSize(3);
    const shift = (l: PlateLayout, dx: number, dy: number): PlateLayout => l.map((g) => ({ x: g.x + dx, y: g.y + dy }));
    expect(scorePlate(shift(neat(3, 2), -1, 0), size).passed).not.toContain('center');
    expect(scorePlate(shift(neat(3, 2), 0, 1), size).passed).not.toContain('center');
    // 字距 1：名字 14 步寬，名牌 24 步，左右各 5 步；字距 2：16 步寬，左右各 4 步
    expect(scorePlate(neat(3, 1), size).passed).toContain('center');
    // 2 個字、字距 2：名字 10 步，名牌 17 步，左 3 右 4 也算
    const two = neat(2, 2);
    expect([two[0].x, plateSize(2).w - (two[1].x + GLYPH)]).toEqual([3, 4]);
    expect(scorePlate(two, plateSize(2)).passed).toContain('center');
  });

  it('字距平均：有一個字距不一樣就不算', () => {
    expect(scorePlate(at([3, 3], [8, 3], [14, 3]), plateSize(3)).passed).not.toContain('even');
  });

  it('字距不擠也不鬆：貼在一起（0 步）、離太遠（4 步）都不算，就算每個一樣寬', () => {
    const size = plateSize(3);
    const tight = scorePlate(at([6, 3], [10, 3], [14, 3]), size);
    expect(tight.passed).toEqual(['baseline', 'center', 'even']);
    expect(scorePlate(at([2, 3], [10, 3], [18, 3]), size).passed).toEqual(['baseline', 'center', 'even']);
  });

  it('只有一個字：放正中間就滿分', () => {
    expect(scorePlate(at([3, 3]), plateSize(1)).score).toBe(100);
    expect(scorePlate(at([0, 3]), plateSize(1)).passed).toEqual(['baseline', 'even', 'comfy']);
  });

  it('沒有字會丟錯', () => {
    expect(() => scorePlate([], plateSize(1))).toThrow();
  });
});

describe('名牌急救：亂掉的樣子', () => {
  it('在名牌裡、照順序、沒有疊在一起；不會一開始就滿分', () => {
    for (let n = 1; n <= 12; n++) {
      const size = plateSize(n);
      for (let seed = 1; seed <= 30; seed++) {
        const l = messyPlate(n, seeded(seed * 100 + n));
        expect(l).toHaveLength(n);
        for (const g of l) {
          expect(g.x).toBeGreaterThanOrEqual(0);
          expect(g.x + GLYPH).toBeLessThanOrEqual(size.w);
          expect(g.y).toBeGreaterThanOrEqual(0);
          expect(g.y + GLYPH).toBeLessThanOrEqual(size.h);
          expect(Number.isInteger(g.x) && Number.isInteger(g.y)).toBe(true);
        }
        expect(plateGaps(l).every((gap) => gap >= 0)).toBe(true);
        const { score, passed } = scorePlate(l, size);
        expect(score).toBeLessThanOrEqual(75);
        expect(passed).not.toContain(n >= 2 ? 'baseline' : 'center');
      }
    }
  });

  it('同一組亂數得到同一個樣子', () => {
    expect(messyPlate(4, seeded(9))).toEqual(messyPlate(4, seeded(9)));
    expect(messyPlate(4, seeded(9))).not.toEqual(messyPlate(4, seeded(10)));
  });
});
