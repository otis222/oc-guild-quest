// 上傳圖去背（純像素運算，不碰 DOM）。
// 邊框大多是同一個顏色（白底或接近純色背景）時，從邊緣 flood fill，
// 把跟背景色差在容差以內、而且連得到邊緣的像素變透明；被線條圍起來的白色（眼白、白頭髮）不會被吃掉。
// 不接任何 AI 去背模型，去得不乾淨也沒關係。

/** 跟 ImageData 相容的像素資料（RGBA，一個像素 4 格） */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Box { x: number; y: number; w: number; h: number }
export type RGB = readonly [number, number, number];

/** 容差：每個顏色通道都差在這個值以內，就算跟背景同色（企劃表：約 24） */
export const CUTOUT_TOLERANCE = 24;
/** 不透明的邊框像素裡，至少這個比例接近同一個顏色，才當成白底或純色背景 */
export const UNIFORM_BORDER_RATIO = 0.6;
/** alpha 小於等於這個值就當透明 */
const CLEAR_ALPHA = 8;

const isClear = (px: Pixels, i: number): boolean => px.data[i * 4 + 3] <= CLEAR_ALPHA;

function isNear(px: Pixels, i: number, c: RGB, tol: number): boolean {
  const d = px.data, o = i * 4;
  return Math.abs(d[o] - c[0]) <= tol && Math.abs(d[o + 1] - c[1]) <= tol && Math.abs(d[o + 2] - c[2]) <= tol;
}

/** 外框一圈的像素索引（不重複） */
function borderIndices(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x);
  if (h > 1) for (let x = 0; x < w; x++) out.push((h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) {
    out.push(y * w);
    if (w > 1) out.push(y * w + w - 1);
  }
  return out;
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};

export interface BorderInfo {
  /** 邊框有多少比例已經是透明的（去過背的 PNG 會接近 1） */
  clearRatio: number;
  /** 不透明邊框像素的代表色（各通道中位數）；邊框全透明時是 null */
  color: RGB | null;
  /** 不透明邊框像素裡，接近代表色的比例 */
  uniformRatio: number;
}

export function analyzeBorder(px: Pixels, tol = CUTOUT_TOLERANCE): BorderInfo {
  const idx = borderIndices(px.width, px.height);
  const opaque = idx.filter((i) => !isClear(px, i));
  const clearRatio = 1 - opaque.length / idx.length;
  if (!opaque.length) return { clearRatio, color: null, uniformRatio: 0 };
  const d = px.data;
  const color: RGB = [median(opaque.map((i) => d[i * 4])), median(opaque.map((i) => d[i * 4 + 1])), median(opaque.map((i) => d[i * 4 + 2]))];
  const uniformRatio = opaque.filter((i) => isNear(px, i, color, tol)).length / opaque.length;
  return { clearRatio, color, uniformRatio };
}

/**
 * 從邊緣開始，把「已經透明、或跟 bg 差在容差以內」而且彼此相連（上下左右）的像素標出來。
 * 只回傳遮罩，不改原圖。
 */
export function floodFromEdges(px: Pixels, bg: RGB, tol = CUTOUT_TOLERANCE): { mask: Uint8Array; count: number } {
  const { width: w, height: h } = px;
  const mask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const pass = (i: number): boolean => isClear(px, i) || isNear(px, i, bg, tol);
  for (const i of borderIndices(w, h)) {
    if (!mask[i] && pass(i)) { mask[i] = 1; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < w * h ? i + w : -1];
    for (const n of next) {
      if (n >= 0 && !mask[n] && pass(n)) { mask[n] = 1; queue[tail++] = n; }
    }
  }
  return { mask, count: tail };
}

/** 不透明像素的外框；整張都透明時回傳 null */
export function opaqueBounds(px: Pixels): Box | null {
  const { width: w, height: h } = px;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isClear(px, y * w + x)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface CutoutResult {
  /** 這次變透明的像素數（沒有去背就是 0） */
  removed: number;
  /** 要裁切的範圍：不透明像素的外框 */
  box: Box;
}

/**
 * 去背＋算出裁切範圍。會直接改 px.data 的 alpha。
 * - 邊框本來就幾乎透明（去過背的 PNG）：不動，只算裁切範圍。
 * - 邊框是白底或接近純色：從邊緣 flood fill 去背。
 * - 其他（照片、花背景）：不去背，整張保留。
 */
export function cutout(px: Pixels, tol = CUTOUT_TOLERANCE): CutoutResult {
  const full: Box = { x: 0, y: 0, w: px.width, h: px.height };
  const border = analyzeBorder(px, tol);
  let removed = 0;
  if (border.clearRatio < 0.5 && border.color && border.uniformRatio >= UNIFORM_BORDER_RATIO) {
    const { mask, count } = floodFromEdges(px, border.color, tol);
    // 整張都跟背景同色（例如一張白紙）：去背會什麼都不剩，乾脆不去
    if (count < mask.length) {
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] && !isClear(px, i)) { px.data[i * 4 + 3] = 0; removed++; }
      }
    }
  }
  return { removed, box: opaqueBounds(px) ?? full };
}

/** 等比例縮放到指定高度，寬度至少 1px */
export function fitHeight(w: number, h: number, targetH: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round((w * targetH) / h)), height: targetH };
}
