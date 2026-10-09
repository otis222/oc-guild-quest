import { describe, expect, it } from 'vitest';
import { analyzeBorder, cutout, CUTOUT_TOLERANCE, fitHeight, opaqueBounds, type Pixels } from '../../src/core/cutout';

type RGBA = [number, number, number, number];
const WHITE: RGBA = [255, 255, 255, 255];
const RED: RGBA = [220, 40, 60, 255];
const INK: RGBA = [40, 30, 60, 255];

function image(w: number, h: number, fill: RGBA): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { width: w, height: h, data };
}
function rect(px: Pixels, x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px.data.set(c, (j * px.width + i) * 4);
}
const alpha = (px: Pixels, x: number, y: number): number => px.data[(y * px.width + x) * 4 + 3];

describe('白底去背', () => {
  // 40×60 白底，中間一隻「角色」：深色外框包住紅色身體，身體裡有一塊白色（像眼白）
  const character = (): Pixels => {
    const px = image(40, 60, WHITE);
    rect(px, 10, 8, 20, 46, INK);
    rect(px, 12, 10, 16, 42, RED);
    rect(px, 16, 16, 6, 6, WHITE);
    return px;
  };

  it('背景變透明、角色不透明，被外框圍住的白色不會被吃掉', () => {
    const px = character();
    const { removed, box } = cutout(px);
    expect(removed).toBe(40 * 60 - 20 * 46);
    expect(alpha(px, 0, 0)).toBe(0);
    expect(alpha(px, 39, 59)).toBe(0);
    expect(alpha(px, 10, 8)).toBe(255);
    expect(alpha(px, 18, 18)).toBe(255);
    expect(box).toEqual({ x: 10, y: 8, w: 20, h: 46 });
  });

  it('紙張有點雜訊、不是純白，也去得掉', () => {
    const px = character();
    let seed = 7;
    const noise = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return 235 + (seed % 21); };
    for (let y = 0; y < 60; y++) for (let x = 0; x < 40; x++) {
      if (x >= 10 && x < 30 && y >= 8 && y < 54) continue;
      const v = noise();
      px.data.set([v, v, v - 3, 255], (y * 40 + x) * 4);
    }
    expect(cutout(px).box).toEqual({ x: 10, y: 8, w: 20, h: 46 });
  });

  it(`容差 ${CUTOUT_TOLERANCE}：跟背景差 ${CUTOUT_TOLERANCE} 以內會去掉，差 ${CUTOUT_TOLERANCE + 1} 會留下`, () => {
    const px = image(30, 10, WHITE);
    const g1 = 255 - CUTOUT_TOLERANCE, g2 = 255 - CUTOUT_TOLERANCE - 1;
    rect(px, 5, 3, 5, 4, [g1, g1, g1, 255]);
    rect(px, 15, 3, 5, 4, [g2, g2, g2, 255]);
    cutout(px);
    expect(alpha(px, 7, 5)).toBe(0);
    expect(alpha(px, 17, 5)).toBe(255);
  });

  it('角色碰到下緣（只畫半身）也照樣去背，裁切範圍到最下面', () => {
    const px = image(30, 40, WHITE);
    rect(px, 8, 12, 14, 28, RED);
    const { box } = cutout(px);
    expect(alpha(px, 0, 39)).toBe(0);
    expect(alpha(px, 10, 39)).toBe(255);
    expect(box).toEqual({ x: 8, y: 12, w: 14, h: 28 });
  });
});

describe('不該去背的圖', () => {
  it('已經去過背的 PNG：不動，只裁切', () => {
    const px = image(30, 30, [0, 0, 0, 0]);
    rect(px, 5, 6, 10, 20, [255, 255, 255, 255]);
    const before = px.data.slice();
    const { removed, box } = cutout(px);
    expect(removed).toBe(0);
    expect(px.data).toEqual(before);
    expect(box).toEqual({ x: 5, y: 6, w: 10, h: 20 });
  });

  it('背景不是純色（漸層、照片）：整張保留', () => {
    const px = image(64, 48, WHITE);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) px.data.set([x * 4, 128, 255 - x * 4, 255], (y * 64 + x) * 4);
    rect(px, 20, 10, 20, 30, RED);
    expect(analyzeBorder(px).uniformRatio).toBeLessThan(0.6);
    const { removed, box } = cutout(px);
    expect(removed).toBe(0);
    expect(box).toEqual({ x: 0, y: 0, w: 64, h: 48 });
  });

  it('整張都是白的：不去背（不然什麼都不剩）', () => {
    const px = image(20, 20, WHITE);
    const { removed, box } = cutout(px);
    expect(removed).toBe(0);
    expect(alpha(px, 10, 10)).toBe(255);
    expect(box).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });
});

describe('裁切與縮放', () => {
  it('整張透明時沒有外框', () => {
    expect(opaqueBounds(image(5, 5, [0, 0, 0, 0]))).toBeNull();
  });

  it('等比例縮到指定高度', () => {
    expect(fitHeight(100, 200, 360)).toEqual({ width: 180, height: 360 });
    expect(fitHeight(250, 100, 360)).toEqual({ width: 900, height: 360 });
    expect(fitHeight(1, 1000, 360)).toEqual({ width: 1, height: 360 });
  });
});
