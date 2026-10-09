import { describe, expect, it } from 'vitest';
import { extractPalette, hexToRgb, mostVivid } from '../../src/core/palette';
import noisy from '../fixtures/palette-noisy.png?inline';
import paper from '../fixtures/palette-paper.png?inline';
import stripes from '../fixtures/palette-stripes.png?inline';
import { loadPng } from '../helpers/png';

const dist = (a: string, b: string): number => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe('抽配色（tests/fixtures/ 的 3 張測試圖）', () => {
  it('五條純色條紋：剛好抽出這 5 色，面積大的排前面', async () => {
    expect(extractPalette(await loadPng(stripes))).toEqual(['#ff8fae', '#7fb6ff', '#ffc85c', '#7fd48f', '#b49bff']);
  });

  it('白紙上 3 塊顏色：紙只佔 1 色，作業的 3 色都抽得到；光圈用最鮮豔的紅色', async () => {
    const palette = extractPalette(await loadPng(paper));
    expect(palette).toEqual(['#f7f4ee', '#e5484d', '#2bb3a3', '#2c3e75']);
    expect(mostVivid(palette)).toBe('#e5484d');
  });

  it('加了雜訊的 3 色：還是抽出 3 色，跟原本的顏色差不到 4；每次抽都一樣', async () => {
    const px = await loadPng(noisy);
    const palette = extractPalette(px);
    expect(palette).toHaveLength(3);
    ['#e86a92', '#4f86c6', '#f2c14e'].forEach((c, i) => expect(dist(palette[i], c)).toBeLessThan(4));
    expect(extractPalette(px)).toEqual(palette);
  });
});

describe('抽配色的邊界情況', () => {
  const solid = (w: number, h: number, rgba: [number, number, number, number]) =>
    ({ width: w, height: h, data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => rgba[i % 4]) });

  it('透明的像素不算；整張透明回傳空陣列', () => {
    expect(extractPalette(solid(4, 4, [255, 0, 0, 0]))).toEqual([]);
    const px = solid(4, 2, [0, 0, 255, 255]);
    for (let i = 0; i < 4; i++) px.data[i * 4 + 3] = 0;
    expect(extractPalette(px)).toEqual(['#0000ff']);
  });

  it('size 可以改', async () => {
    expect(extractPalette(await loadPng(stripes), 2)).toHaveLength(2);
  });

  it('最鮮豔的顏色：灰階不會被選到；沒有顏色回傳 null', () => {
    expect(mostVivid(['#ffffff', '#202020', '#7f9fbf'])).toBe('#7f9fbf');
    expect(mostVivid([])).toBeNull();
    expect(() => hexToRgb('red')).toThrow();
  });
});
