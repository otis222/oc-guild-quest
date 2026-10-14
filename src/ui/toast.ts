// 大廳的小提示：完成一個任務、或交件後從下面浮出來，迷你設定格播點亮動畫，可以按「看 OC 設定卡」。
// 完成任務後還有下一關的話，多一顆「下一個任務」或「交件」，不用再打開委託板（T10）。
// 不擋住大廳，幾秒後自己收起來；同時只有一個。
import type { CourseInfo } from '../core/courses';
import type { CardCell } from '../core/ocCard';
import { PART_LABELS } from '../core/templates';
import { COPY } from './copy';
import { el, on } from './dom';
import { courseColor, pieSvg, type PieResult } from './pie';

export interface CardToastOptions {
  cell: CardCell;
  course: CourseInfo;
  title: string;
  detail: string;
  /** 剛完成的任務：那一片播點亮動畫；沒有的話（交件）整格一起播 */
  levelId?: string;
  /** 交件的成果（迷你格中間） */
  result?: PieResult;
  onOpen(): void;
  /** 接著做的事（下一個任務、交件）：多一顆按鈕 */
  next?: { label: string; onClick(): void };
  /** 多一行小字（完成任務存到的畫圖時間，T17） */
  extra?: string;
}

/** 多久後自己收起來；有「下一個任務」時留久一點，讓人來得及按 */
const SHOW_MS = 6000;
const SHOW_NEXT_MS = 9000;
let current: { close(): void } | null = null;

export function showCardToast(o: CardToastOptions): void {
  current?.close();
  const pie = pieSvg({ cell: o.cell, course: o.course.label, part: PART_LABELS[o.course.part], highlightLevelId: o.levelId, result: o.result });
  if (o.levelId === undefined) pie.querySelectorAll('.slice').forEach((p) => p.classList.add('just-lit'));
  const open = el('button', { type: 'button', class: 'toast-open' }, COPY.toast.open);
  const next = o.next ? el('button', { type: 'button', class: 'toast-next' }, o.next.label) : null;
  const box = el('div', { class: `toast panel${next ? ' has-next' : ''}`, role: 'status', style: `--c: ${courseColor(o.course)}` },
    el('div', { class: 'toast-pie' }, pie),
    el('div', { class: 'toast-text' },
      el('div', { class: 'toast-title' }, o.title),
      el('div', { class: 'toast-sub' }, o.detail),
      o.extra ? el('div', { class: 'toast-extra' }, o.extra) : null),
    next ? el('div', { class: 'toast-actions' }, open, next) : open);

  let closed = false;
  const timer = window.setTimeout(() => close(), next ? SHOW_NEXT_MS : SHOW_MS);
  function close(): void {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    box.classList.add('is-leaving');
    window.setTimeout(() => box.remove(), 250);
    if (current === handle) current = null;
  }
  const handle = { close };
  on(open, 'click', () => { close(); o.onOpen(); });
  if (next && o.next) {
    const go = o.next.onClick;
    on(next, 'click', () => { close(); go(); });
  }
  document.body.append(box);
  current = handle;
}
