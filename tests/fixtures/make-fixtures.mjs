// 產生 palette.ts 測試用的 3 張純色塊圖（PNG）。圖已經放在這個資料夾裡，要改圖再重跑：
//   node tests/fixtures/make-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** pixel(x, y) 回傳 [r, g, b] */
function png(file, width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // 不用濾波
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 位元 RGB
  writeFileSync(new URL(file, import.meta.url), Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// 1. 五條直條紋，寬 30／25／20／15／10：抽出來要剛好是這 5 色，照面積排
const STRIPES = [[30, '#ff8fae'], [25, '#7fb6ff'], [20, '#ffc85c'], [15, '#7fd48f'], [10, '#b49bff']];
png('palette-stripes.png', 100, 40, (x) => {
  let edge = 0;
  for (const [w, c] of STRIPES) { edge += w; if (x < edge) return rgb(c); }
  return rgb(STRIPES.at(-1)[1]);
});

// 2. 白紙上 3 塊顏色：紙只佔 1 個顏色，不會擠掉作業的顏色
const BLOCKS = [[10, 10, 30, 20, '#e5484d'], [60, 15, 24, 20, '#2bb3a3'], [20, 55, 40, 10, '#2c3e75']];
png('palette-paper.png', 100, 80, (x, y) => {
  for (const [bx, by, bw, bh, c] of BLOCKS) if (x >= bx && x < bx + bw && y >= by && y < by + bh) return rgb(c);
  return rgb('#f7f4ee');
});

// 3. 三條橫帶（高 30／20／10），每個像素加 ±8 的雜訊：抽出來還是 3 色，很接近原本的顏色
const BANDS = [[30, '#e86a92'], [20, '#4f86c6'], [10, '#f2c14e']];
let seed = 20261010;
const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed % 17) - 8; };
png('palette-noisy.png', 90, 60, (_x, y) => {
  let edge = 0, base = rgb(BANDS.at(-1)[1]);
  for (const [h, c] of BANDS) { edge += h; if (y < edge) { base = rgb(c); break; } }
  return base.map((v) => Math.max(0, Math.min(255, v + noise())));
});
