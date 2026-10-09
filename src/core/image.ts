// 交件照片的尺寸計算（純數學，不碰 DOM）：縮圖大小、名牌的裁切框。
import { clamp, lerp } from './math';
import type { Box } from './cutout';

/** 交件照片的長邊（企劃表 T6：長邊縮到 1024px、JPEG 品質 0.85） */
export const PHOTO_MAX_SIDE = 1024;
export const PHOTO_QUALITY = 0.85;

/** 長邊縮到 max 以內（小圖不放大），寬高至少 1px */
export function fitLongSide(w: number, h: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** 名牌的寬高比（橫式，跟頭上的名字標籤一樣扁） */
export const NAMEPLATE_ASPECT = 3;
/** 框最小是最大的幾成 */
export const NAMEPLATE_MIN_SCALE = 0.3;

/**
 * 名牌的裁切框：固定寬高比，不超出照片。
 * size 0～1（最小～最大，最大是照片放得下的最大框），(cx, cy) 是框的中心，靠邊時框會被推回照片裡。
 */
export function nameplateCrop(imgW: number, imgH: number, size: number, cx: number, cy: number, aspect = NAMEPLATE_ASPECT): Box {
  const maxW = Math.min(imgW, imgH * aspect);
  const w = lerp(maxW * NAMEPLATE_MIN_SCALE, maxW, clamp(size, 0, 1));
  const h = w / aspect;
  return { x: clamp(cx - w / 2, 0, imgW - w), y: clamp(cy - h / 2, 0, imgH - h), w, h };
}
