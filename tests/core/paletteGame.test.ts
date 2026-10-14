import { describe, expect, it } from 'vitest';
import { BONUS_FULL_SCORE } from '../../src/core/bonus';
import { chroma } from '../../src/core/palette';
import {
  contrast, FIGURE_CONTRAST, luminance, messyPick, PALETTE_ROLES, PALETTE_RULES, paletteSwatches, QUIET_CHROMA, READ_CONTRAST,
  scorePalette, type PalettePick, type Swatch,
} from '../../src/core/paletteGame';
import { seeded } from '../helpers/seeded';

/** 10 隻預設小人和備用剪影：palette.ts 從圖上抽出的顏色（10/14 在瀏覽器裡用 samplePixels＋extractPalette 抽的） */
const PRESETS: Readonly<Record<string, readonly string[]>> = {
  maid_1: ['#f5f3f2', '#c1bbbb', '#444343', '#7d6e6e', '#1e1c1c'],
  bunny_1: ['#e8e3e7', '#b0798b', '#578ab3', '#85c1db', '#594559'],
  nurse_1: ['#efe7e7', '#beaab2', '#36272f', '#75626c', '#cf376f'],
  chick_1: ['#393c50', '#ece8e6', '#64828e', '#45b8ea', '#e9d411'],
  maid_2: ['#f5f3f3', '#c6bfbf', '#4f4e52', '#333234', '#8a797c'],
  bunny_2: ['#eee5ec', '#acd0e6', '#6285b7', '#d397b9', '#bc6688'],
  nurse_2: ['#eee6e8', '#cda4b3', '#3b3237', '#b82f5d', '#90737e'],
  chick_2: ['#32344e', '#f2f1f1', '#a3aeb4', '#606e8b', '#fae86a'],
  maid_3: ['#f1f0f0', '#c8c6cb', '#38393e', '#77646a', '#aea6aa'],
  maid_4: ['#f2f0ef', '#3a3838', '#bab7b7', '#7a6261', '#8b8687'],
  silhouette: ['#d5cfe1', '#a096b2', '#8e84a3', '#b0a7c0', '#786c8f'],
};

/** 全部配法裡最高幾分（8 色以內，最多 8^4 = 4096 種） */
function bestScore(sw: readonly Swatch[]): number {
  let best = 0;
  const n = sw.length;
  for (let bg = 0; bg < n; bg++) {
    for (let text = 0; text < n; text++) {
      for (let main = 0; main < n; main++) {
        for (let accent = 0; accent < n; accent++) best = Math.max(best, scorePalette(sw, { bg, text, main, accent }).score);
      }
    }
  }
  return best;
}

// 0 鮮豔的粉紅、1 灰粉紅、2 接近白，後面是白、灰、黑
const SW = paletteSwatches(['#cf376f', '#beaab2', '#efe7e7']);
const PERFECT: PalettePick = { bg: 5, text: 3, main: 1, accent: 0 };
const pick = (changes: Partial<PalettePick>): PalettePick => ({ ...PERFECT, ...changes });
const passed = (p: PalettePick): string[] => scorePalette(SW, p).passed;

describe('配色急救：顏色', () => {
  it('明度對比：黑配白 21、一樣的顏色 1，前後順序不影響', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#cf376f', '#cf376f')).toBe(1);
    expect(contrast('#cf376f', '#222222')).toBeCloseTo(contrast('#222222', '#cf376f'), 10);
  });

  it('彩度：白灰黑是 0，越鮮豔越大', () => {
    expect(['#ffffff', '#8c8c8c', '#222222'].map(chroma)).toEqual([0, 0, 0]);
    expect(chroma('#ff0000')).toBe(255);
    expect(chroma('#cf376f')).toBeGreaterThan(chroma('#beaab2'));
  });

  it('可以選的顏色：OC 的在前、重複的去掉，後面接白、灰、黑（OC 已經有的不重複）', () => {
    expect(paletteSwatches(['#B0798B', '#b0798b', '#FFFFFF'])).toEqual([
      { color: '#b0798b', fromOc: true }, { color: '#ffffff', fromOc: true },
      { color: '#8c8c8c', fromOc: false }, { color: '#222222', fromOc: false },
    ]);
    expect(paletteSwatches([]).map((s) => s.color)).toEqual(['#ffffff', '#8c8c8c', '#222222']);
    expect(() => paletteSwatches(['red'])).toThrow();
  });
});

describe('配色急救：計分規則', () => {
  it('滿分 100：明度對比 50、色彩搭配 50', () => {
    const sum = (kind: string): number => PALETTE_RULES.filter((r) => r.kind === kind).reduce((a, r) => a + r.points, 0);
    expect([sum('value'), sum('color')]).toEqual([50, 50]);
    expect(sum('value') + sum('color')).toBe(BONUS_FULL_SCORE);
    expect(PALETTE_ROLES).toEqual(['bg', 'text', 'main', 'accent']);
  });

  it('黑底、白字、灰粉紅當主色、鮮豔的粉紅當強調色：100 分', () => {
    expect(scorePalette(SW, PERFECT)).toEqual({ score: 100, passed: ['read', 'figure', 'mark', 'quiet', 'own', 'pop'] });
  });

  it('文字看得清楚：文字和背景的對比要 4.5 以上', () => {
    expect(contrast('#cf376f', '#222222')).toBeLessThan(READ_CONTRAST);
    expect(passed(pick({ text: 0 }))).not.toContain('read');
    expect(scorePalette(SW, pick({ text: 0 })).score).toBe(80);
  });

  it('主色從背景跳出來：主色和背景的對比要 3 以上', () => {
    // 白底、黑字，主色是接近白的那個
    const p = pick({ bg: 3, text: 5, main: 2 });
    expect(contrast(SW[2].color, SW[3].color)).toBeLessThan(FIGURE_CONTRAST);
    expect(passed(p)).toEqual(['read', 'mark', 'quiet', 'own', 'pop']);
  });

  it('強調色從背景跳出來：強調色和背景的對比要 3 以上', () => {
    // 0 深灰紫、1 深紅粉（鮮豔）、2 灰粉紅，後面是白、灰、黑
    const sw = paletteSwatches(['#3b3237', '#b82f5d', '#cda4b3']);
    expect(scorePalette(sw, { bg: 3, text: 5, main: 0, accent: 1 }).passed).toContain('mark');
    // 換成黑底：深紅粉跟黑色的對比不到 3，看不太出來
    expect(contrast('#b82f5d', '#222222')).toBeLessThan(FIGURE_CONTRAST);
    expect(scorePalette(sw, { bg: 5, text: 3, main: 2, accent: 1 }).passed).toEqual(['read', 'figure', 'quiet', 'own', 'pop']);
  });

  it('背景不搶戲：彩度 40 以下（白、灰、黑或很淡的顏色）', () => {
    const sw = paletteSwatches(['#786450', '#796450', '#cf376f']);
    expect([chroma('#786450'), chroma('#796450')]).toEqual([QUIET_CHROMA, QUIET_CHROMA + 1]);
    expect(scorePalette(sw, { bg: 0, text: 3, main: 1, accent: 2 }).passed).toContain('quiet');
    expect(scorePalette(sw, { bg: 1, text: 3, main: 0, accent: 2 }).passed).not.toContain('quiet');
    expect(passed(pick({ bg: 0, text: 3 }))).not.toContain('quiet');
  });

  it('主色、強調色要是 OC 身上的兩個不同顏色', () => {
    expect(passed(pick({ main: 4 }))).toEqual(['read', 'figure', 'mark', 'quiet', 'pop']);
    expect(passed(pick({ accent: 3 }))).not.toContain('own');
    expect(passed(pick({ main: 0, accent: 0 }))).not.toContain('own');
  });

  it('強調色要比主色鮮豔（一樣鮮豔也不算）', () => {
    expect(passed(pick({ main: 0, accent: 1 }))).toEqual(['read', 'figure', 'mark', 'quiet', 'own']);
    expect(passed(pick({ main: 0, accent: 0 }))).not.toContain('pop');
  });

  it('沒有這個顏色會丟錯', () => {
    expect(() => scorePalette(SW, pick({ bg: 99 }))).toThrow();
  });
});

describe('配色急救：一定排得到滿分', () => {
  it('10 隻預設小人和備用剪影都排得到 100 分（連幾乎沒有彩色的白髮女僕也是）', () => {
    for (const [name, colors] of Object.entries(PRESETS)) {
      expect([name, bestScore(paletteSwatches(colors))]).toEqual([name, 100]);
    }
  });

  it('OC 圖只抽得出一個顏色時排不到滿分：主色和強調色要兩個不同的 OC 顏色，最高 85 分', () => {
    expect(bestScore(paletteSwatches(['#cf376f']))).toBe(85);
  });
});

describe('配色急救：亂掉的樣子', () => {
  it('分數低（50 分以下）、文字還看得到一點；每個顏色都選得到', () => {
    for (const colors of Object.values(PRESETS)) {
      const sw = paletteSwatches(colors);
      for (let seed = 1; seed <= 20; seed++) {
        const p = messyPick(sw, seeded(seed));
        for (const role of PALETTE_ROLES) expect(sw[p[role]]).toBeDefined();
        expect(scorePalette(sw, p).score).toBeLessThanOrEqual(50);
        expect(contrast(sw[p.text].color, sw[p.bg].color)).toBeGreaterThanOrEqual(1.3);
      }
    }
  });

  it('同一組亂數得到同一個樣子', () => {
    const sw = paletteSwatches(PRESETS.bunny_1);
    expect(messyPick(sw, seeded(3))).toEqual(messyPick(sw, seeded(3)));
  });

  it('沒有顏色會丟錯', () => {
    expect(() => messyPick([])).toThrow();
  });
});
