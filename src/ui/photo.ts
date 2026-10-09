// 在瀏覽器裡處理圖片（照片不會上傳到任何地方）：解碼、縮圖、取樣算配色、裁名牌。
// 上傳 OC 圖（uploadSprite.ts）和交件照片共用。
import type { Box, Pixels } from '../core/cutout';
import { fitLongSide, PHOTO_MAX_SIDE, PHOTO_QUALITY } from '../core/image';

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement, read = false): CanvasRenderingContext2D {
  const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!g) throw new Error('瀏覽器不支援 canvas 2D');
  g.imageSmoothingQuality = 'high';
  return g;
}

/** 用 <img> 解碼：會照 EXIF 轉正手機照片 */
export async function decodeImage(file: Blob): Promise<HTMLImageElement> {
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

export function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片轉檔失敗'))), type, quality);
  });
}

/** 交件照片：長邊縮到 1024px、JPEG 品質 0.85（企劃表 T6） */
export function shrinkPhoto(img: HTMLImageElement): Promise<Blob> {
  const size = fitLongSide(img.naturalWidth, img.naturalHeight, PHOTO_MAX_SIDE);
  const c = canvas(size.width, size.height);
  const g = ctx2d(c);
  // JPEG 沒有透明：透明的地方墊白色，不然會變黑
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size.width, size.height);
  g.drawImage(img, 0, 0, size.width, size.height);
  return toBlob(c, 'image/jpeg', PHOTO_QUALITY);
}

/** 縮到長邊 max 的像素資料（算配色用，像素少算得快） */
export function samplePixels(img: HTMLImageElement, max = 128): Pixels {
  const size = fitLongSide(img.naturalWidth, img.naturalHeight, max);
  const c = canvas(size.width, size.height);
  const g = ctx2d(c, true);
  g.drawImage(img, 0, 0, size.width, size.height);
  return g.getImageData(0, 0, size.width, size.height);
}

/** 裁出 box（原圖座標）畫進 out 這個 canvas，填滿整個 canvas */
export function drawCrop(img: HTMLImageElement, box: Box, out: HTMLCanvasElement): void {
  ctx2d(out).drawImage(img, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
}

/** 裁一塊存成 JPEG（名牌用） */
export function cropToJpeg(img: HTMLImageElement, box: Box, width: number, height: number): Promise<Blob> {
  const c = canvas(width, height);
  drawCrop(img, box, c);
  return toBlob(c, 'image/jpeg', 0.9);
}
