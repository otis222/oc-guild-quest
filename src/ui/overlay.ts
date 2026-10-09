// 蓋在大廳上的對話框（委託板、之後的計時、設定卡）。一次只開一個；Esc 或右上角 ✕ 關閉。
import { COPY } from './copy';
import { el, on } from './dom';

export interface Dialog {
  /** 內容放這裡 */
  readonly body: HTMLElement;
  setTitle(title: string): void;
  close(): void;
}

let current: Dialog | null = null;

export function openDialog(opts: { title: string; onClose?: () => void }): Dialog {
  current?.close();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleEl = el('h2', { id: 'dialogTitle', tabindex: -1 }, opts.title);
  const body = el('div', { class: 'card-body' });
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': COPY.dialog.close }, '✕');
  const card = el('div', { class: 'card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialogTitle' },
    el('div', { class: 'card-head' }, titleEl, closeBtn), body);
  const overlay = el('div', { class: 'overlay' }, card);

  let closed = false;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); dialog.close(); }
  };
  const dialog: Dialog = {
    body,
    setTitle(title) { titleEl.textContent = title; },
    close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      removeEventListener('keydown', onKey);
      if (current === dialog) current = null;
      opts.onClose?.();
      returnFocus?.focus({ preventScroll: true });
    },
  };
  on(closeBtn, 'click', () => dialog.close());
  addEventListener('keydown', onKey);
  document.body.append(overlay);
  titleEl.focus({ preventScroll: true });
  current = dialog;
  return dialog;
}
