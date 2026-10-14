// 蓋在大廳上的圖層（委託板、任務計時、之後的設定卡）。一次只開一個；Esc 關閉。
import { COPY } from './copy';
import { el, on } from './dom';

let closeCurrent: (() => void) | null = null;

/** 把 root 放到畫面上（先關掉原本開著的圖層），回傳關閉函式 */
export function openLayer(root: HTMLElement, opts: { onClose?: () => void; focus?: HTMLElement } = {}): () => void {
  closeCurrent?.();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  function close(): void {
    if (closed) return;
    closed = true;
    root.remove();
    removeEventListener('keydown', onKey);
    if (closeCurrent === close) closeCurrent = null;
    opts.onClose?.();
    // onClose 打開了下一個圖層（例：關掉放大的照片回到作品集）：焦點留在新的圖層，不要跳回後面的按鈕
    if (!closeCurrent && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  addEventListener('keydown', onKey);
  document.body.append(root);
  opts.focus?.focus({ preventScroll: true });
  closeCurrent = close;
  return close;
}

export interface Dialog {
  /** 內容放這裡 */
  readonly body: HTMLElement;
  setTitle(title: string): void;
  close(): void;
}

/** 置中的卡片對話框，右上角有 ✕ */
export function openDialog(opts: { title: string; onClose?: () => void }): Dialog {
  const titleEl = el('h2', { id: 'dialogTitle', tabindex: -1 }, opts.title);
  const body = el('div', { class: 'card-body' });
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': COPY.dialog.close }, '✕');
  const card = el('div', { class: 'card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialogTitle' },
    el('div', { class: 'card-head' }, titleEl, closeBtn), body);
  const close = openLayer(el('div', { class: 'overlay' }, card), { onClose: opts.onClose, focus: titleEl });
  on(closeBtn, 'click', close);
  return { body, setTitle: (title) => { titleEl.textContent = title; }, close };
}
