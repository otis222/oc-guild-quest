// 把玩家上傳的圖做成小人圖：解碼 → 去背（白底或純色背景才去）→ 裁掉空白 → 縮到高 360px → PNG。
// 全部在瀏覽器裡做，圖不會上傳到任何地方。
import { cutout, fitHeight } from '../core/cutout';
import { fitLongSide } from '../core/image';
import { canvas, ctx2d, decodeImage, toBlob } from './photo';

/** 跟 public/sprites/ 的小人一樣高 */
export const SPRITE_HEIGHT = 360;
/** 去背前先縮到長邊不超過這個值，手機拍的大照片才不會算很久 */
const WORK_MAX = 1024;

export async function makeSpriteFromUpload(file: Blob): Promise<Blob> {
  const img = await decodeImage(file);
  const { width: w, height: h } = fitLongSide(img.naturalWidth, img.naturalHeight, WORK_MAX);
  const work = canvas(w, h);
  const g = ctx2d(work, true);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const { box } = cutout(px);
  g.putImageData(px, 0, 0);

  const size = fitHeight(box.w, box.h, SPRITE_HEIGHT);
  const out = canvas(size.width, size.height);
  ctx2d(out).drawImage(work, box.x, box.y, box.w, box.h, 0, 0, size.width, size.height);
  return toBlob(out, 'image/png');
}
