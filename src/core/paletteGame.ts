// 配色急救（企劃表 T16，色彩學的加分關）：設定圖的顏色亂掉了，幫背景、文字、主色、強調色各選一個顏色。
// 可以選的顏色是 OC 圖上抽出的顏色（palette.ts，最多 5 色）加上白、灰、黑。依明度對比和色彩搭配給分。
// 這裡只有規則（明度對比、彩度、計分、亂掉的樣子），畫面在 src/ui/paletteGame.ts。
import { chroma, hexToRgb } from './palette';

export type PaletteRole = 'bg' | 'text' | 'main' | 'accent';
/** 設定圖上要配色的地方：背景、文字（名字和台詞）、主色（OC 後面的圓）、強調色（名字下面的線和星星） */
export const PALETTE_ROLES: readonly PaletteRole[] = ['bg', 'text', 'main', 'accent'];

/** 接在 OC 顏色後面的白、灰、黑 */
export const NEUTRALS: readonly string[] = ['#ffffff', '#8c8c8c', '#222222'];

export interface Swatch {
  color: string;
  /** 從 OC 圖上抽出來的（不是後面加的白、灰、黑） */
  fromOc: boolean;
}

/** 可以選的顏色：OC 的顏色在前（重複的只留一個），白、灰、黑接在後面（OC 已經有的就不重複） */
export function paletteSwatches(ocColors: readonly string[]): Swatch[] {
  const seen = new Set<string>();
  const out: Swatch[] = [];
  const add = (color: string, fromOc: boolean): void => {
    const c = color.toLowerCase();
    hexToRgb(c); // 不是 #rrggbb 就丟錯
    if (seen.has(c)) return;
    seen.add(c);
    out.push({ color: c, fromOc });
  };
  ocColors.forEach((c) => add(c, true));
  NEUTRALS.forEach((c) => add(c, false));
  return out;
}

/** 每個地方選了第幾個顏色（paletteSwatches 的索引） */
export type PalettePick = Readonly<Record<PaletteRole, number>>;

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** 相對亮度：0（黑）～1（白），算明度對比用（WCAG 的算法） */
export function luminance(color: string): number {
  const [r, g, b] = hexToRgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** 兩個顏色的明度對比：1（一樣亮）～21（黑配白） */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 文字和背景至少要這麼大的對比才看得清楚（WCAG 一般文字的標準） */
export const READ_CONTRAST = 4.5;
/** 主色、強調色和背景至少要這麼大的對比，才會從背景跳出來（WCAG 圖形的標準） */
export const FIGURE_CONTRAST = 3;
/** 背景的彩度不超過這個值才算「不搶戲」：白、灰、黑或很淡的顏色（彩度 0～255，見 palette.ts） */
export const QUIET_CHROMA = 40;

export type PaletteRuleId = 'read' | 'figure' | 'mark' | 'quiet' | 'own' | 'pop';

export interface PaletteRule {
  id: PaletteRuleId;
  /** 明度對比或色彩搭配 */
  kind: 'value' | 'color';
  points: number;
}

/**
 * 計分規則：明度對比 50 分、色彩搭配 50 分，滿分 100。
 * 明度對比
 * - read：文字看得清楚（文字和背景的對比 4.5 以上）
 * - figure：主色從背景跳出來（主色和背景的對比 3 以上）
 * - mark：強調色從背景跳出來（強調色和背景的對比 3 以上）
 * 色彩搭配
 * - quiet：背景不搶戲（彩度 40 以下：白、灰、黑或很淡的顏色）
 * - own：主色和強調色是 OC 身上的兩個不同顏色
 * - pop：強調色比主色鮮豔
 * 預設小人裡的白髮女僕幾乎沒有彩色，「主色和強調色色相差多少」這種規則排不到滿分，所以色彩搭配看彩度，不看色相差。
 * 10 隻預設小人和備用剪影都排得到滿分（測試裡一個一個試過）。上傳的圖顏色很少或很集中的話，可能排不到。
 */
export const PALETTE_RULES: readonly PaletteRule[] = [
  { id: 'read', kind: 'value', points: 20 },
  { id: 'figure', kind: 'value', points: 15 },
  { id: 'mark', kind: 'value', points: 15 },
  { id: 'quiet', kind: 'color', points: 15 },
  { id: 'own', kind: 'color', points: 15 },
  { id: 'pop', kind: 'color', points: 20 },
];
export const PALETTE_FULL_SCORE = PALETTE_RULES.reduce((sum, r) => sum + r.points, 0);

export interface PaletteScore {
  score: number;
  /** 做到的規則，照 PALETTE_RULES 的順序 */
  passed: PaletteRuleId[];
}

function swatchAt(swatches: readonly Swatch[], i: number): Swatch {
  const s = swatches[i];
  if (!s) throw new Error(`沒有第 ${i} 個顏色`);
  return s;
}

export function scorePalette(swatches: readonly Swatch[], pick: PalettePick): PaletteScore {
  const bg = swatchAt(swatches, pick.bg).color, text = swatchAt(swatches, pick.text).color;
  const main = swatchAt(swatches, pick.main), accent = swatchAt(swatches, pick.accent);
  const ok: Record<PaletteRuleId, boolean> = {
    read: contrast(text, bg) >= READ_CONTRAST,
    figure: contrast(main.color, bg) >= FIGURE_CONTRAST,
    mark: contrast(accent.color, bg) >= FIGURE_CONTRAST,
    quiet: chroma(bg) <= QUIET_CHROMA,
    own: main.fromOc && accent.fromOc && pick.main !== pick.accent,
    pop: chroma(accent.color) > chroma(main.color),
  };
  const rules = PALETTE_RULES.filter((r) => ok[r.id]);
  return { score: rules.reduce((sum, r) => sum + r.points, 0), passed: rules.map((r) => r.id) };
}

/** 亂掉的配色要試幾次（取分數最低的） */
const MESSY_TRIES = 40;
/** 亂掉的時候，文字和背景至少有這麼一點對比：名字還看得到一點，才知道文字在哪 */
const MESSY_TEXT_CONTRAST = 1.3;

/** 亂掉的配色：隨機試幾次，取分數最低的那一組 */
export function messyPick(swatches: readonly Swatch[], rand: () => number = Math.random): PalettePick {
  const n = swatches.length;
  if (!n) throw new Error('沒有顏色可以選');
  const any = (): number => Math.floor(rand() * n);
  let best: PalettePick | null = null, bestScore = Infinity;
  for (let k = 0; k < MESSY_TRIES; k++) {
    const pick = { bg: any(), text: any(), main: any(), accent: any() };
    if (contrast(swatches[pick.text].color, swatches[pick.bg].color) < MESSY_TEXT_CONTRAST) continue;
    const { score } = scorePalette(swatches, pick);
    if (score < bestScore) { best = pick; bestScore = score; }
  }
  return best ?? { bg: 0, text: n - 1, main: 0, accent: 0 };
}
