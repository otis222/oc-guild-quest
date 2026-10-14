// 放大看照片：大廳的展品、設定卡上交件的成果、作品集。
import { el, on } from './dom';
import { openDialog } from './overlay';

export interface PhotoViewerOptions {
  url: string;
  title: string;
  /** 照片下面的說明（例：色彩學・色相環　10/14 交件） */
  caption?: string;
  /** 圖片的替代文字 */
  alt: string;
  /** 照片下面多一顆按鈕（例：大廳展品的「看全部作品」） */
  action?: { label: string; onClick(): void };
  onClose?(): void;
}

export function openPhotoViewer(o: PhotoViewerOptions): void {
  const dialog = openDialog({ title: o.title, onClose: o.onClose });
  dialog.body.replaceChildren(
    el('figure', { class: 'viewer' },
      el('img', { src: o.url, alt: o.alt, draggable: 'false' }),
      o.caption ? el('figcaption', {}, o.caption) : null),
    ...(o.action ? [on(el('button', { type: 'button', class: 'viewer-action' }, o.action.label), 'click', o.action.onClick)] : []),
  );
}
