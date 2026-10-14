// 名牌急救（企劃表 T16，字體設計的加分關）：名牌上 OC 名字的字距和高低亂掉了，把每個字拖整齊。
// 依對齊基線、置中、字距平均、字距適中給分。這裡只有規則（名牌大小、移動、計分、亂掉的樣子），畫面在 src/ui/plateGame.ts。
// 座標用「步」算：一個字是 4×4 步（一步是四分之一個字），x、y 是字的左上角。
// 字照名字的順序排，不能越過旁邊的字，也不會疊在一起（像活字一樣）。
import { clamp } from './math';

/** 一個字幾步寬、幾步高 */
export const GLYPH = 4;
/** 字距適中：1～3 步（四分之一到四分之三個字寬） */
export const GAP_MIN = 1;
export const GAP_MAX = 3;
/** 字距用到最寬時，名牌左右還各留幾步 */
const SIDE = 3;
/** 字的上下各留幾步可以移 */
const ROOM = 3;

export interface PlateSize {
  w: number;
  h: number;
}

/** 名牌的大小（步）：n 個字、字距用到最寬（3 步）時左右還各留 3 步；上下各留 3 步 */
export function plateSize(n: number): PlateSize {
  if (n < 1) throw new Error('名字是空的');
  return { w: n * GLYPH + (n - 1) * GAP_MAX + 2 * SIDE, h: GLYPH + 2 * ROOM };
}

/** 名字拆成一個一個字（空白不算） */
export const plateChars = (name: string): string[] => Array.from(name.replace(/\s+/g, ''));

export interface Glyph {
  x: number;
  y: number;
}
/** 每個字的位置，照名字的順序 */
export type PlateLayout = readonly Glyph[];

/** 第 i 個字左右可以放到哪：不超出名牌、不越過也不疊到旁邊的字 */
function xRange(l: PlateLayout, i: number, size: PlateSize): [number, number] {
  const lo = i > 0 ? l[i - 1].x + GLYPH : 0;
  const hi = i < l.length - 1 ? l[i + 1].x - GLYPH : size.w - GLYPH;
  return [lo, hi];
}

/** 把第 i 個字移到 (x, y)：吸到整數步，超出範圍的拉回來；沒動就回傳原本的 */
export function moveGlyph(l: PlateLayout, i: number, x: number, y: number, size: PlateSize): PlateLayout {
  if (!l[i]) throw new Error(`沒有第 ${i} 個字`);
  const [lo, hi] = xRange(l, i, size);
  const g = { x: clamp(Math.round(x), lo, hi), y: clamp(Math.round(y), 0, size.h - GLYPH) };
  if (g.x === l[i].x && g.y === l[i].y) return l;
  return l.map((old, k) => (k === i ? g : old));
}

/** 方向鍵：移一步 */
export const nudgeGlyph = (l: PlateLayout, i: number, dx: number, dy: number, size: PlateSize): PlateLayout =>
  moveGlyph(l, i, l[i].x + dx, l[i].y + dy, size);

/** 字距：每兩個相鄰的字中間空幾步 */
export const plateGaps = (l: PlateLayout): number[] => l.slice(1).map((g, i) => g.x - l[i].x - GLYPH);

export type PlateRuleId = 'baseline' | 'center' | 'even' | 'comfy';

export interface PlateRule {
  id: PlateRuleId;
  /** 對齊或字距 */
  kind: 'line' | 'space';
  points: number;
}

/**
 * 計分規則：對齊 50 分、字距 50 分，滿分 100。
 * 對齊
 * - baseline：每個字站在同一條基線上
 * - center：名字在名牌正中間（左右、上下留的空一樣；差一步也算，步數單雙的關係有時候剛好分不平）
 * 字距
 * - even：每個字距一樣寬
 * - comfy：字距不擠也不鬆（1～3 步，四分之一到四分之三個字寬）
 * 名牌的寬度照字數算好了：字距 1～3 步都排得出正中間，所以一定排得到滿分。
 */
export const PLATE_RULES: readonly PlateRule[] = [
  { id: 'baseline', kind: 'line', points: 25 },
  { id: 'center', kind: 'line', points: 25 },
  { id: 'even', kind: 'space', points: 25 },
  { id: 'comfy', kind: 'space', points: 25 },
];
export const PLATE_FULL_SCORE = PLATE_RULES.reduce((sum, r) => sum + r.points, 0);

export interface PlateScore {
  score: number;
  /** 做到的規則，照 PLATE_RULES 的順序 */
  passed: PlateRuleId[];
}

export function scorePlate(l: PlateLayout, size: PlateSize): PlateScore {
  if (!l.length) throw new Error('名字是空的');
  const gaps = plateGaps(l);
  const ys = l.map((g) => g.y);
  const top = Math.min(...ys), bottom = size.h - (Math.max(...ys) + GLYPH);
  const left = l[0].x, right = size.w - (l[l.length - 1].x + GLYPH);
  const ok: Record<PlateRuleId, boolean> = {
    baseline: ys.every((y) => y === ys[0]),
    center: Math.abs(left - right) <= 1 && Math.abs(top - bottom) <= 1,
    even: gaps.every((g) => g === gaps[0]),
    comfy: gaps.every((g) => g >= GAP_MIN && g <= GAP_MAX),
  };
  const rules = PLATE_RULES.filter((r) => ok[r.id]);
  return { score: rules.reduce((sum, r) => sum + r.points, 0), passed: rules.map((r) => r.id) };
}

/** 亂掉時字距最寬幾步 */
const MESSY_GAP_MAX = 5;

/**
 * 亂掉的名牌：字距有寬有窄（至少一個貼在一起或離太遠），字有高有低，整個名字不在正中間。
 * 兩個字以上時，基線一定是歪的，所以不會一開始就滿分。
 */
export function messyPlate(n: number, rand: () => number = Math.random): PlateLayout {
  const size = plateSize(n);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const gaps = Array.from({ length: n - 1 }, () => int(0, MESSY_GAP_MAX));
  if (gaps.length) gaps[int(0, gaps.length - 1)] = rand() < 0.5 ? 0 : MESSY_GAP_MAX;
  const width = (): number => n * GLYPH + gaps.reduce((a, b) => a + b, 0);
  // 放不下就把最寬的字距縮小
  while (width() > size.w) gaps[gaps.indexOf(Math.max(...gaps))]--;
  // 字距全部一樣寬的話，改掉一個（縮小一定放得下）
  if (gaps.length >= 2 && gaps.every((g) => g === gaps[0])) gaps[0] += gaps[0] > 0 ? -1 : 1;
  // 不在正中間：偏左或偏右
  const room = size.w - width();
  let x = int(0, room);
  if (Math.abs(x - (room - x)) <= 1) x = rand() < 0.5 ? 0 : room;
  // 有高有低
  const ys = Array.from({ length: n }, () => int(0, size.h - GLYPH));
  if (n >= 2 && ys.every((y) => y === ys[0])) ys[0] = ys[0] === 0 ? size.h - GLYPH : 0;
  return ys.map((y, i) => {
    const g = { x, y };
    x += GLYPH + (gaps[i] ?? 0);
    return g;
  });
}
