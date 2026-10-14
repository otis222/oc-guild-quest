import { describe, expect, it } from 'vitest';
import { charSheetData, charSheetFileName, DEFAULT_SHEET_POSITIONS, recordSheetBest, sheetPositions } from '../../src/core/charSheet';
import { CARD_SIZE, messyLayout, scoreSheet, type CardPos, type SheetLayout } from '../../src/core/sheet';
import { addCommission, createGuildState, migrate } from '../../src/core/state';
import { submitCommission } from '../../src/core/submit';
import { templateLevels } from '../../src/core/templates';
import type { CourseType, GuildState, SheetCardId } from '../../src/core/types';

const OC = { name: '小鈴', sprite: 'maid_1.png' };
const placed = (x: number, y: number): CardPos => ({ x, y, placed: true, tilt: 0 });
const asLayout = (p: typeof DEFAULT_SHEET_POSITIONS): SheetLayout =>
  Object.fromEntries(Object.entries(p).map(([id, { x, y }]) => [id, placed(x, y)])) as Record<SheetCardId, CardPos>;

/** 接一張委託並交件 */
function submitted(s0: GuildState, course: CourseType, id: string, extra: { palette?: string[]; nameplatePhotoId?: string } = {}): GuildState {
  const s = addCommission(s0, { course, title: id, dueAt: 9e12, levels: templateLevels(course) }, 1, id);
  return submitCommission(s, id, { photoId: `photo-${id}`, ...extra }, 2);
}

describe('OC 設定圖成品：要放什麼', () => {
  it('還沒交過任何作業：部件都沒有、用預設排法，照樣做得出來', () => {
    expect(charSheetData(createGuildState(OC, 0))).toEqual({
      name: '小鈴', guildLevel: 1, palette: [], parts: [], positions: DEFAULT_SHEET_POSITIONS, fromGame: false,
    });
  });

  it('交過的部件都放進去（每個部位最近一次的成果），台詞也放', () => {
    let s = createGuildState(OC, 0);
    s = submitted(s, 'typography', 't', { nameplatePhotoId: 'plate-t' });
    s = submitted(s, 'color', 'c', { palette: ['#e5484d', '#2bb3a3'] });
    s = submitted(s, 'composition', 'k');
    s = submitted(s, 'drawing', 'd');
    s = { ...s, oc: { ...s.oc, quote: '今天也要畫圖' } };
    expect(charSheetData(s)).toMatchObject({
      quote: '今天也要畫圖', guildLevel: 5, nameplatePhotoId: 'plate-t', palette: ['#e5484d', '#2bb3a3'],
      layoutPhotoId: 'photo-k', sketchPhotoId: 'photo-d', parts: ['nameplate', 'palette', 'layout', 'sketch'],
    });
  });

  it('只交了一部分：只列出有的部位', () => {
    const s = submitted(createGuildState(OC, 0), 'drawing', 'd');
    const data = charSheetData(s);
    expect(data.parts).toEqual(['sketch']);
    expect('layoutPhotoId' in data).toBe(false);
  });

  it('預設排法照設定圖急救的規則是 100 分', () => {
    expect(scoreSheet(asLayout(DEFAULT_SHEET_POSITIONS)).score).toBe(100);
  });
});

describe('OC 設定圖成品：設定圖急救排得最好的那次', () => {
  const s0 = createGuildState(OC, 0);
  const mine = { ...DEFAULT_SHEET_POSITIONS, name: { x: 4, y: 0 }, quote: { x: 2, y: 1 } };

  it('排法要全部放進格線才記；位置照小卡左上角', () => {
    expect(sheetPositions(asLayout(mine))).toEqual(mine);
    expect(sheetPositions(messyLayout(() => 0.5))).toBeNull();
  });

  it('第一次就記；分數比較高或一樣高（留新的）才換；比較低不換', () => {
    const s1 = recordSheetBest(s0, mine, 70, 10);
    expect(s1.oc.sheetBest).toEqual({ positions: mine, score: 70, at: 10 });
    expect(charSheetData(s1)).toMatchObject({ positions: mine, fromGame: true });
    const s2 = recordSheetBest(s1, DEFAULT_SHEET_POSITIONS, 70, 20);
    expect(s2.oc.sheetBest).toEqual({ positions: DEFAULT_SHEET_POSITIONS, score: 70, at: 20 });
    expect(recordSheetBest(s2, mine, 50, 30)).toBe(s2);
    expect(recordSheetBest(s2, mine, 100, 40).oc.sheetBest?.score).toBe(100);
  });

  it('小卡的大小沒有變（設定圖成品照這個畫）', () => {
    expect(CARD_SIZE.name).toEqual({ w: 4, h: 1 });
    expect(CARD_SIZE.front).toEqual({ w: 2, h: 4 });
  });

  it('舊存檔沒有這欄，照樣讀得進來', () => {
    expect(migrate(structuredClone(s0))).toEqual(s0);
    const s1 = recordSheetBest(s0, mine, 85, 10);
    expect(migrate(structuredClone(s1))).toEqual(s1);
  });
});

describe('OC 設定圖成品：檔名', () => {
  it('帶日期時間', () => {
    expect(charSheetFileName(new Date(2026, 9, 14, 15, 3).getTime())).toBe('oc-sheet-20261014-1503.png');
  });
});
