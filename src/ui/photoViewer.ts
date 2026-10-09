// 放大看照片：大廳的展品、設定卡上交件的成果。
import { el } from './dom';
import { openDialog } from './overlay';

export interface PhotoViewerOptions {
  url: string;
  title: string;
  /** 照片下面的說明（例：色彩學・色相環　10/14 交件） */
  caption?: string;
  /** 圖片的替代文字 */
  alt: string;
  onClose?(): void;
}

export function openPhotoViewer(o: PhotoViewerOptions): void {
  const dialog = openDialog({ title: o.title, onClose: o.onClose });
  dialog.body.replaceChildren(
    el('figure', { class: 'viewer' },
      el('img', { src: o.url, alt: o.alt, draggable: 'false' }),
      o.caption ? el('figcaption', {}, o.caption) : null),
  );
}
