// 大廳的小提示：完成一個任務後從下面浮出來，迷你設定格播點亮動畫，可以按「看 OC 設定卡」。
// 不擋住大廳，幾秒後自己收起來；同時只有一個。
import type { CardCell } from '../core/ocCard';
import type { CourseType } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { COURSE_COLORS, pieSvg } from './pie';

export interface LitToastOptions {
  cell: CardCell;
  course: CourseType;
  courseLabel: string;
  part: string;
  /** 剛完成的任務 */
  levelId: string;
  onOpen(): void;
}

/** 多久後自己收起來 */
const SHOW_MS = 6000;
const T = COPY.toast;
let current: { close(): void } | null = null;

export function showLitToast(o: LitToastOptions): void {
  current?.close();
  const pie = pieSvg({ cell: o.cell, course: o.courseLabel, part: o.part, highlightLevelId: o.levelId });
  const open = el('button', { type: 'button', class: 'toast-open' }, T.open);
  const box = el('div', { class: 'toast panel', role: 'status', style: `--c: ${COURSE_COLORS[o.course]}` },
    el('div', { class: 'toast-pie' }, pie),
    el('div', { class: 'toast-text' },
      el('div', { class: 'toast-title' }, T.lit),
      el('div', { class: 'toast-sub' }, T.detail(o.courseLabel, o.cell.commission?.title ?? '', o.cell.lit, o.cell.slices.length))),
    open);

  let closed = false;
  const timer = window.setTimeout(() => close(), SHOW_MS);
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
  document.body.append(box);
  current = handle;
}
