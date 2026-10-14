// 設定圖急救（企劃表 T9，平面構成的加分關）：設定圖亂掉了，把 OC 的名字、台詞、三視圖小卡拖進格線排好，
// 依對齊和留白給分。這裡只有規則（格線、小卡大小、吸附、計分），畫面在 src/ui/sheetGame.ts。
// 座標用格子算：x 是第幾欄、y 是第幾列（0 起算），指的是小卡的左上角。
import { clamp } from './math';

/** 格線：8 欄 × 10 列（手機上一格大約 36px） */
export const SHEET_COLS = 8;
export const SHEET_ROWS = 10;

export type SheetCardId = 'name' | 'quote' | 'front' | 'side' | 'back';
/** 三視圖：正面、側面、背面 */
export const VIEW_CARDS: readonly SheetCardId[] = ['front', 'side', 'back'];
/** 文字：名字、台詞 */
export const TEXT_CARDS: readonly SheetCardId[] = ['name', 'quote'];
/** 全部小卡，也是一開始疊的順序：三視圖在下面，文字小卡疊在上面，亂掉的時候才不會被整張蓋住 */
export const SHEET_CARDS: readonly SheetCardId[] = [...VIEW_CARDS, 'quote', 'name'];

/** 小卡佔幾格：三視圖 2×4，名字 4×1，台詞 6×1 */
export const CARD_SIZE: Readonly<Record<SheetCardId, { readonly w: number; readonly h: number }>> = {
  name: { w: 4, h: 1 },
  quote: { w: 6, h: 1 },
  front: { w: 2, h: 4 },
  side: { w: 2, h: 4 },
  back: { w: 2, h: 4 },
};

export interface CardPos {
  x: number;
  y: number;
  /** 放進格線了（拖過、點過或用方向鍵移過）。還沒放進去的小卡是歪的，座標也不在格線上，計分不算 */
  placed: boolean;
  /** 歪幾度（只有還沒放進格線的小卡會歪） */
  tilt: number;
}

export type SheetLayout = Readonly<Record<SheetCardId, CardPos>>;

export type SheetRuleId = 'feet' | 'text' | 'spacing' | 'overlap' | 'breath' | 'close';

export interface SheetRule {
  id: SheetRuleId;
  /** 對齊或留白（企劃表 T9：依對齊和留白給分） */
  kind: 'align' | 'space';
  points: number;
}

/**
 * 計分規則：對齊 50 分、留白 50 分，滿分 100。
 * 對齊
 * - feet：三視圖腳底對齊（站在同一條線上）
 * - text：名字和台詞對齊（靠左、置中或靠右）
 * - spacing：三視圖等距排開（兩個間距一樣寬、至少一格；設計軟體裡「對齊與分布」的分布）
 * 留白
 * - overlap：小卡沒有疊在一起
 * - breath：文字和三視圖之間至少隔一格
 * - close：名字和台詞靠在一起（彼此的距離比跟三視圖近，也就是親密性）
 * 8 欄的格線裡，三視圖等距排開一定剛好佔滿整排，所以不另外算「文字對齊三視圖」：那條一定會成立，教不到東西。
 */
export const SHEET_RULES: readonly SheetRule[] = [
  { id: 'feet', kind: 'align', points: 20 },
  { id: 'text', kind: 'align', points: 15 },
  { id: 'spacing', kind: 'align', points: 15 },
  { id: 'overlap', kind: 'space', points: 20 },
  { id: 'breath', kind: 'space', points: 15 },
  { id: 'close', kind: 'space', points: 15 },
];
export const SHEET_FULL_SCORE = SHEET_RULES.reduce((sum, r) => sum + r.points, 0);

/** 亂掉的小卡歪幾度：3～7 度，往左或往右 */
const MIN_TILT = 3;
const MAX_TILT = 7;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxOf = (l: SheetLayout, id: SheetCardId): Box => ({ x: l[id].x, y: l[id].y, w: CARD_SIZE[id].w, h: CARD_SIZE[id].h });

/** 包住一群小卡的外框 */
function bounds(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 兩塊之間空了幾格（左右、上下取比較大的那個）；貼在一起是 0，疊在一起是負的 */
const gapBetween = (a: Box, b: Box): number =>
  Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));

/** 左邊、中線或右邊對在同一條線上（中線用兩倍算，不會有小數） */
const aligned = (a: Box, b: Box): boolean =>
  a.x === b.x || a.x + a.w === b.x + b.w || 2 * a.x + a.w === 2 * b.x + b.w;

/** 三視圖從左到右排，兩個間距一樣寬，而且至少空一格 */
function evenGaps(views: readonly Box[]): boolean {
  const [a, b, c] = [...views].sort((p, q) => p.x - q.x);
  const g1 = b.x - (a.x + a.w), g2 = c.x - (b.x + b.w);
  return g1 === g2 && g1 >= 1;
}

export interface SheetScore {
  /** 0～100 */
  score: number;
  /** 做到的規則（照 SHEET_RULES 的順序） */
  passed: SheetRuleId[];
  /** 跟別張疊在一起的小卡（放進格線的才算），畫面上標紅框 */
  clashes: SheetCardId[];
}

/** 計分。還沒放進格線的小卡，跟它有關的規則都不算做到 */
export function scoreSheet(l: SheetLayout): SheetScore {
  const placed = (ids: readonly SheetCardId[]): boolean => ids.every((id) => l[id].placed);
  const all = placed(SHEET_CARDS);
  const views = VIEW_CARDS.map((id) => boxOf(l, id));
  const texts = TEXT_CARDS.map((id) => boxOf(l, id));
  const clashes = SHEET_CARDS.filter((id) => l[id].placed
    && SHEET_CARDS.some((other) => other !== id && l[other].placed && overlaps(boxOf(l, id), boxOf(l, other))));
  /** 文字和三視圖之間、名字和台詞之間空了幾格 */
  const apart = gapBetween(bounds(texts), bounds(views)), textGap = gapBetween(texts[0], texts[1]);
  const ok: Record<SheetRuleId, boolean> = {
    feet: placed(VIEW_CARDS) && new Set(views.map((b) => b.y + b.h)).size === 1,
    text: placed(TEXT_CARDS) && aligned(texts[0], texts[1]),
    spacing: placed(VIEW_CARDS) && evenGaps(views),
    overlap: all && clashes.length === 0,
    breath: all && apart >= 1,
    close: all && textGap >= 0 && textGap < apart,
  };
  const passed = SHEET_RULES.filter((r) => ok[r.id]);
  return { score: passed.reduce((sum, r) => sum + r.points, 0), passed: passed.map((r) => r.id), clashes };
}

/** 還沒放進格線的小卡 */
export const looseCards = (l: SheetLayout): SheetCardId[] => SHEET_CARDS.filter((id) => !l[id].placed);

/** 拖曳中的位置：跟著手指走、不吸附，但不會拖出格線 */
export function clampToSheet(id: SheetCardId, x: number, y: number): { x: number; y: number } {
  const { w, h } = CARD_SIZE[id];
  return { x: clamp(x, 0, SHEET_COLS - w), y: clamp(y, 0, SHEET_ROWS - h) };
}

/** 放進格線：吸到最近的格子、不超出格線、轉正 */
export function snapCard(id: SheetCardId, x: number, y: number): CardPos {
  const p = clampToSheet(id, Math.round(x), Math.round(y));
  return { x: p.x, y: p.y, placed: true, tilt: 0 };
}

/** 方向鍵：移一格。還沒放進格線的，先吸到原地最近的格子再移 */
export function nudgeCard(id: SheetCardId, p: CardPos, dx: number, dy: number): CardPos {
  const from = p.placed ? p : snapCard(id, p.x, p.y);
  return snapCard(id, from.x + dx, from.y + dy);
}

/** 亂掉的設定圖：小卡散在格線上、歪歪的、都還沒放進格線。rand 回傳 0～1（測試可以換掉） */
export function messyLayout(rand: () => number = Math.random): SheetLayout {
  const entries = SHEET_CARDS.map((id): [SheetCardId, CardPos] => {
    const { w, h } = CARD_SIZE[id];
    const x = rand() * (SHEET_COLS - w), y = rand() * (SHEET_ROWS - h);
    const tilt = (rand() < 0.5 ? -1 : 1) * (MIN_TILT + rand() * (MAX_TILT - MIN_TILT));
    return [id, { x, y, placed: false, tilt }];
  });
  return Object.fromEntries(entries) as Record<SheetCardId, CardPos>;
}

