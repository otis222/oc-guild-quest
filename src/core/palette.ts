// 從交件照片抽主色（企劃表 T6）：中位切割的變形。
// 每次挑「顏色最分散」的那一箱切成兩箱，切在讓兩邊各自最集中的位置。
// 大片白紙的顏色很集中，不會被切成好幾格，作業本身的顏色才分得到格子。
// 純像素運算，不碰 DOM；照片先在瀏覽器裡縮小再傳進來（見 src/ui/photo.ts）。
import type { Pixels } from './cutout';

/** 抽幾個色 */
export const PALETTE_SIZE = 5;
/**
 * 一箱顏色的分散程度（跟平均色的 RGB 距離取均方根）小於這個值就不再切：
 * 照片的雜訊、紙的明暗不會被切成好幾個差不多的顏色。所以顏色很少的圖，抽出來會少於 5 色。
 */
export const MIN_SPREAD = 12;
/** alpha 小於這個值的像素不算（去過背的圖） */
const MIN_ALPHA = 128;

type Vec3 = [number, number, number];

/** 一格直方圖：同一格的像素數、RGB 總和、平方和 */
interface Bin { n: number; s: Vec3; q: number }
interface Box { bins: Bin[]; n: number; s: Vec3; q: number }

function boxOf(bins: Bin[]): Box {
  const s: Vec3 = [0, 0, 0];
  let n = 0, q = 0;
  for (const b of bins) { n += b.n; q += b.q; s[0] += b.s[0]; s[1] += b.s[1]; s[2] += b.s[2]; }
  return { bins, n, s, q };
}

/** 平方誤差總和：箱子裡每個像素跟平均色的距離平方加起來 */
const sse = (n: number, s: Vec3, q: number): number => (n ? q - (s[0] ** 2 + s[1] ** 2 + s[2] ** 2) / n : 0);
const spread = (b: Box): number => Math.sqrt(sse(b.n, b.s, b.q) / b.n);

/** 每個通道取前 5 位元分格，同時累加真正的像素值，平均色才不會偏 */
function histogram(px: Pixels): Bin[] {
  const bins = new Map<number, Bin>();
  const d = px.data;
  for (let i = 0; i < px.width * px.height; i++) {
    const o = i * 4;
    if (d[o + 3] < MIN_ALPHA) continue;
    const r = d[o], g = d[o + 1], b = d[o + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bin = bins.get(key);
    if (!bin) { bin = { n: 0, s: [0, 0, 0], q: 0 }; bins.set(key, bin); }
    bin.n++; bin.s[0] += r; bin.s[1] += g; bin.s[2] += b; bin.q += r * r + g * g + b * b;
  }
  return [...bins.values()];
}

/** 沿 R、G、B 其中一軸切成兩箱，挑兩邊誤差加起來最小的切法 */
function split(box: Box): [Box, Box] {
  let best: { bins: Bin[]; at: number; cost: number } | null = null;
  for (let axis = 0; axis < 3; axis++) {
    const sorted = [...box.bins].sort((a, b) => a.s[axis] / a.n - b.s[axis] / b.n);
    let n = 0, q = 0;
    const s: Vec3 = [0, 0, 0];
    for (let k = 1; k < sorted.length; k++) {
      const b = sorted[k - 1];
      n += b.n; q += b.q; s[0] += b.s[0]; s[1] += b.s[1]; s[2] += b.s[2];
      const rest: Vec3 = [box.s[0] - s[0], box.s[1] - s[1], box.s[2] - s[2]];
      const cost = sse(n, s, q) + sse(box.n - n, rest, box.q - q);
      if (!best || cost < best.cost) best = { bins: sorted, at: k, cost };
    }
  }
  if (!best) throw new Error('只有一格的箱子不能再切');
  return [boxOf(best.bins.slice(0, best.at)), boxOf(best.bins.slice(best.at))];
}

const hex = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
const toHex = (b: Box): string => `#${hex(b.s[0] / b.n)}${hex(b.s[1] / b.n)}${hex(b.s[2] / b.n)}`;

/** 抽出最多 size 個顏色（#rrggbb），佔的面積大的排前面；沒有不透明的像素就回傳空陣列 */
export function extractPalette(px: Pixels, size = PALETTE_SIZE): string[] {
  const bins = histogram(px);
  if (!bins.length) return [];
  const boxes = [boxOf(bins)];
  while (boxes.length < size) {
    let pick = -1, worst = 0;
    boxes.forEach((b, i) => {
      const err = sse(b.n, b.s, b.q);
      if (b.bins.length > 1 && spread(b) >= MIN_SPREAD && err > worst) { pick = i; worst = err; }
    });
    if (pick < 0) break;
    boxes.splice(pick, 1, ...split(boxes[pick]));
  }
  return boxes.sort((a, b) => b.n - a.n).map(toHex);
}

/** #rrggbb → [r, g, b] */
export function hexToRgb(color: string): Vec3 {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) throw new Error(`不是 #rrggbb 的顏色：${color}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 最鮮豔的顏色（最亮的通道減最暗的通道最大），主角腳下的光圈用；一樣鮮豔時取面積大的。沒有顏色回傳 null */
export function mostVivid(palette: readonly string[]): string | null {
  let best: string | null = null, bestChroma = -1;
  for (const c of palette) {
    const rgb = hexToRgb(c);
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    if (chroma > bestChroma) { best = c; bestChroma = chroma; }
  }
  return best;
}
