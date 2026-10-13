import { describe, expect, it } from 'vitest';
import {
  CARD_SIZE, clampToSheet, looseCards, messyLayout, nudgeCard, scoreSheet, SHEET_CARDS, SHEET_COLS, SHEET_FULL_SCORE, SHEET_ROWS,
  SHEET_RULES, sheetGrade, snapCard, type CardPos, type SheetCardId, type SheetLayout,
} from '../../src/core/sheet';

const at = (x: number, y: number): CardPos => ({ x, y, placed: true, tilt: 0 });
const loose = (x: number, y: number): CardPos => ({ x, y, placed: false, tilt: 5 });
/** 滿分的排法：名字和台詞靠左放上面，空一列，三視圖 0、3、6 欄站在同一條線上 */
const PERFECT: SheetLayout = { name: at(0, 0), quote: at(0, 1), front: at(0, 3), side: at(3, 3), back: at(6, 3) };
const layout = (changes: Partial<Record<SheetCardId, CardPos>>): SheetLayout => ({ ...PERFECT, ...changes });
const passed = (l: SheetLayout): string[] => scoreSheet(l).passed;

/** 測試用的固定亂數 */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('設定圖急救：計分規則', () => {
  it('對齊 50 分、留白 50 分，滿分 100', () => {
    const sum = (kind: string): number => SHEET_RULES.filter((r) => r.kind === kind).reduce((a, r) => a + r.points, 0);
    expect(sum('align')).toBe(50);
    expect(sum('space')).toBe(50);
    expect(SHEET_FULL_SCORE).toBe(100);
  });

  it('好的排法都是 100 分：靠左、置中、靠右，文字放上面或下面都可以', () => {
    const layouts: SheetLayout[] = [
      PERFECT,
      // 文字置中：名字 2～6 欄、台詞 1～7 欄，中線都在第 4 欄，跟三視圖的中線一樣
      layout({ name: at(2, 0), quote: at(1, 1) }),
      // 文字靠右
      layout({ name: at(4, 0), quote: at(2, 1) }),
      // 三視圖在上面，文字在下面
      { front: at(0, 0), side: at(3, 0), back: at(6, 0), name: at(2, 5), quote: at(1, 6) },
      // 三視圖排成 背面、正面、側面 也可以（不規定順序）
      layout({ front: at(3, 5), side: at(6, 5), back: at(0, 5) }),
    ];
    for (const l of layouts) expect(scoreSheet(l)).toEqual({ score: 100, passed: SHEET_RULES.map((r) => r.id), clashes: [] });
  });

  it('還沒放進格線的小卡：跟它有關的規則都不算', () => {
    expect(scoreSheet(messyLayout(seeded(1)))).toEqual({ score: 0, passed: [], clashes: [] });
    // 三視圖排好了、文字還沒放：只有三視圖自己的兩條
    const viewsOnly = layout({ name: loose(0.4, 0.2), quote: loose(1.3, 1.1) });
    expect(scoreSheet(viewsOnly)).toMatchObject({ score: 35, passed: ['feet', 'spacing'] });
    // 文字排好了、有一張三視圖還沒放
    expect(passed(layout({ side: loose(3.2, 3) }))).toEqual(['text']);
  });

  it('三視圖腳底對齊：有一張高一格就不算', () => {
    expect(passed(layout({ side: at(3, 2) }))).not.toContain('feet');
    expect(passed(layout({ side: at(3, 4) }))).not.toContain('feet');
  });

  it('名字和台詞：左邊、中線或右邊對齊才算', () => {
    // 名字寬 4、台詞寬 6：名字比台詞右邊 0 格是靠左、1 格是置中、2 格是靠右
    expect(passed(layout({ name: at(0, 0), quote: at(0, 1) }))).toContain('text');
    expect(passed(layout({ name: at(2, 0), quote: at(1, 1) }))).toContain('text');
    expect(passed(layout({ name: at(4, 0), quote: at(2, 1) }))).toContain('text');
    expect(passed(layout({ name: at(0, 0), quote: at(1, 1) }))).not.toContain('text');
    expect(passed(layout({ name: at(3, 0), quote: at(0, 1) }))).not.toContain('text');
  });

  it('名字和台詞靠在一起：彼此的距離要比跟三視圖近', () => {
    // 名字和台詞中間空一列，跟三視圖也只空一列：一樣遠，不算
    expect(passed(layout({ name: at(0, 0), quote: at(0, 2), front: at(0, 4), side: at(3, 4), back: at(6, 4) }))).not.toContain('close');
    // 三視圖再往下一列：名字和台詞比較近，算
    expect(passed(layout({ name: at(0, 0), quote: at(0, 2), front: at(0, 5), side: at(3, 5), back: at(6, 5) }))).toContain('close');
    // 名字在上、台詞在三視圖下面
    expect(passed(layout({ quote: at(0, 8) }))).not.toContain('close');
    // 疊在一起也不算
    expect(passed(layout({ quote: at(0, 0) }))).not.toContain('close');
  });

  it('疊在一起：不算，而且標出疊到的小卡；貼在一起不算疊', () => {
    const r = scoreSheet(layout({ quote: at(0, 3) }));
    expect(r.passed).not.toContain('overlap');
    // 台詞橫跨第 0～5 欄，壓到正面和側面；背面從第 6 欄開始，只是貼著
    expect(r.clashes).toEqual(['front', 'side', 'quote']);
    expect(scoreSheet(layout({ quote: at(0, 2) })).clashes).toEqual([]);
    // 還沒放進格線的小卡不標
    expect(scoreSheet(layout({ quote: loose(0, 3) })).clashes).toEqual([]);
  });

  it('三視圖間距：一樣寬而且至少空一格', () => {
    // 貼在一起（間距 0）：一樣寬也不算
    expect(passed(layout({ front: at(1, 3), side: at(3, 3), back: at(5, 3) }))).not.toContain('spacing');
    // 間距 1 和 0
    expect(passed(layout({ front: at(0, 3), side: at(3, 3), back: at(5, 3) }))).not.toContain('spacing');
    // 順序不影響：照左右位置算
    expect(passed(layout({ front: at(6, 3), side: at(0, 3), back: at(3, 3) }))).toContain('spacing');
  });

  it('文字和三視圖之間至少空一格', () => {
    // 台詞緊貼在三視圖上面
    expect(passed(layout({ name: at(0, 1), quote: at(0, 2) }))).not.toContain('breath');
    // 空兩格也可以
    expect(passed(layout({ front: at(0, 4), side: at(3, 4), back: at(6, 4) }))).toContain('breath');
    // 名字在上、台詞在下，把三視圖夾在中間：不算
    expect(passed(layout({ quote: at(0, 8) }))).not.toContain('breath');
  });
});

describe('設定圖急救：移動小卡', () => {
  it('放進格線：吸到最近的格子、轉正、不超出格線', () => {
    expect(snapCard('front', 2.4, 3.6)).toEqual({ x: 2, y: 4, placed: true, tilt: 0 });
    expect(snapCard('quote', 5.8, -0.7)).toEqual({ x: SHEET_COLS - CARD_SIZE.quote.w, y: 0, placed: true, tilt: 0 });
    expect(snapCard('back', 9, 9)).toEqual({ x: 6, y: 6, placed: true, tilt: 0 });
  });

  it('拖曳中不吸附，但不會拖出格線', () => {
    expect(clampToSheet('name', 1.25, 3.5)).toEqual({ x: 1.25, y: 3.5 });
    expect(clampToSheet('name', -2, 20)).toEqual({ x: 0, y: SHEET_ROWS - 1 });
  });

  it('方向鍵：一次移一格，到邊就停；還沒放進格線的先吸到原地', () => {
    expect(nudgeCard('front', at(2, 3), 1, 0)).toEqual(at(3, 3));
    expect(nudgeCard('front', at(6, 3), 1, 0)).toEqual(at(6, 3));
    expect(nudgeCard('front', at(2, 0), 0, -1)).toEqual(at(2, 0));
    expect(nudgeCard('name', loose(1.6, 4.2), 0, 1)).toEqual(at(2, 5));
  });

  it('數還沒放進格線的小卡', () => {
    expect(looseCards(PERFECT)).toEqual([]);
    expect(looseCards(layout({ name: loose(1, 1), back: loose(2, 2) }))).toEqual(['back', 'name']);
  });
});

describe('設定圖急救：一開始亂掉的樣子', () => {
  it('全部還沒放進格線、都在格線裡面、歪 3～7 度', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const l = messyLayout(seeded(seed));
      expect(looseCards(l)).toEqual([...SHEET_CARDS]);
      for (const id of SHEET_CARDS) {
        const { w, h } = CARD_SIZE[id], p = l[id];
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(SHEET_COLS - w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(SHEET_ROWS - h);
        expect(Math.abs(p.tilt)).toBeGreaterThanOrEqual(3);
        expect(Math.abs(p.tilt)).toBeLessThanOrEqual(7);
      }
    }
  });

  it('同一組亂數得到同一個樣子', () => {
    expect(messyLayout(seeded(7))).toEqual(messyLayout(seeded(7)));
    expect(messyLayout(seeded(7))).not.toEqual(messyLayout(seeded(8)));
  });
});

describe('設定圖急救：評語', () => {
  it('滿分、70 分以上、其他', () => {
    expect(sheetGrade(100)).toBe('perfect');
    expect(sheetGrade(85)).toBe('good');
    expect(sheetGrade(70)).toBe('good');
    expect(sheetGrade(65)).toBe('retry');
    expect(sheetGrade(0)).toBe('retry');
  });
});
