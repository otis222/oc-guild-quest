// 把玩家上傳的圖做成小人圖：解碼 → 去背（白底或純色背景才去）→ 裁掉空白 → 縮到高 360px → PNG。
// 全部在瀏覽器裡做，圖不會上傳到任何地方。
import { cutout, fitHeight } from '../core/cutout';

/** 跟 public/sprites/ 的小人一樣高 */
export const SPRITE_HEIGHT = 360;
/** 去背前先縮到長邊不超過這個值，手機拍的大照片才不會算很久 */
const WORK_MAX = 1024;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement, read = false): CanvasRenderingContext2D {
  const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!g) throw new Error('瀏覽器不支援 canvas 2D');
  g.imageSmoothingQuality = 'high';
  return g;
}

/** 用 <img> 解碼：會照 EXIF 轉正手機照片 */
async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeSpriteFromUpload(file: Blob): Promise<Blob> {
  const img = await decode(file);
  const k = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const work = canvas(w, h);
  const g = ctx2d(work, true);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const { box } = cutout(px);
  g.putImageData(px, 0, 0);

  const size = fitHeight(box.w, box.h, SPRITE_HEIGHT);
  const out = canvas(size.width, size.height);
  ctx2d(out).drawImage(work, box.x, box.y, box.w, box.h, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片轉檔失敗'))), 'image/png');
  });
}
