// 測試用的最小 PNG 解碼：只支援 8 位元、不交錯的 RGB／RGBA（tests/fixtures/ 的圖都是這種）。
// 不加套件：圖用 Vite 的 ?inline 讀成 data URL，解壓縮用 Node 和瀏覽器都有的 DecompressionStream。
import type { Pixels } from '../../src/core/cutout';

/** data:image/png;base64,... → 位元組 */
export function dataUrlBytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, width = 0, height = 0, channels = 0;
  const parts: Uint8Array[] = [];
  while (pos < bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('只支援 8 位元、不交錯的 RGB／RGBA PNG');
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      parts.push(data);
    }
    pos += 12 + len;
  }
  const packed = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => { packed.set(p, at); return at + p.length; }, 0);
  const raw = await inflate(packed);

  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      const add = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * channels;
      out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2];
      out[o + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/** 讀 tests/fixtures/ 的圖：import url from '../fixtures/x.png?inline' 之後 loadPng(url) */
export const loadPng = (dataUrl: string): Promise<Pixels> => decodePng(dataUrlBytes(dataUrl));
