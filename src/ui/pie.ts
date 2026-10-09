// 設定卡上的一格：圓形切成任務數那麼多片，亮的片用該課程的顏色；中間寫 x/5，交件後換成作業成果（T6 前先寫部位名稱）。
// OC 設定卡和大廳的小提示共用。
import type { CourseInfo } from '../core/courses';
import { monthDay, type CardCell } from '../core/ocCard';
import type { CourseType } from '../core/types';
import { COPY } from './copy';

/** 內建課程的顏色（跟大廳拱門的旗子同一組） */
const COURSE_COLORS: Record<CourseType, string> = {
  typography: '#b49bff', color: '#ff8fae', composition: '#7fb6ff', drawing: '#7fd48f',
};
/** 自訂課程照建立順序輪流用的顏色 */
const CUSTOM_COLORS = ['#ffad66', '#56cfc3', '#dd8ee0', '#b5d65e', '#ff8a80', '#e8c04f'];

export const courseColor = (c: CourseInfo): string =>
  c.kind === 'builtin' ? COURSE_COLORS[c.id] : CUSTOM_COLORS[c.customIndex % CUSTOM_COLORS.length];

const C = COPY.card;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 第 i 片（共 n 片）的扇形，從 12 點鐘方向順時針排 */
function wedgePath(i: number, n: number, r: number): string {
  if (n === 1) return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2;
  const pt = (a: number): string => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M 0 0 L ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)} Z`;
}

export interface PieOptions {
  cell: CardCell;
  /** 課程名稱、交件後變成的部位名稱 */
  course: string;
  part: string;
  /** 剛完成的任務：那一片播點亮動畫 */
  highlightLevelId?: string;
  /** 給了才能點：點一片時拿到那一片的說明 */
  onPick?(label: string): void;
}

/** 一片的說明：「10/12 色彩學・3 組配色草稿（色相環）」或「上色（一）・還沒完成（色相環）」 */
export function sliceLabel(cell: CardCell, i: number, course: string): string {
  const slice = cell.slices[i], work = cell.commission?.title ?? '';
  return slice.lit && slice.level.doneAt !== undefined
    ? C.sliceDone(monthDay(slice.level.doneAt), course, slice.level.title, work)
    : C.sliceTodo(slice.level.title, work);
}

export function pieSvg(o: PieOptions): SVGSVGElement {
  const { cell } = o;
  if (!cell.commission) {
    const empty = svg('svg', { viewBox: '-50 -50 100 100', class: 'pie', role: 'img', 'aria-label': C.emptyCell(o.course) });
    empty.append(svg('circle', { r: 45, class: 'pie-empty' }));
    return empty;
  }
  const n = cell.slices.length;
  const interactive = !!o.onPick;
  const pie = svg('svg', {
    viewBox: '-50 -50 100 100', class: 'pie', role: interactive ? 'group' : 'img',
    'aria-label': C.pieLabel(o.course, cell.commission.title, cell.lit, n),
  });
  const slices = cell.slices.map((slice, i) => {
    const label = sliceLabel(cell, i, o.course);
    const isNew = slice.level.id === o.highlightLevelId;
    // 交件後整格點亮（企劃表 T5），不管每片任務有沒有按完成
    const path = svg('path', {
      d: wedgePath(i, n, 46), class: `slice${slice.lit || cell.submitted ? ' lit' : ''}${isNew ? ' just-lit' : ''}`,
    });
    if (interactive) {
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', label);
      const pick = (): void => {
        slices.forEach((p) => p.classList.remove('is-picked'));
        path.classList.add('is-picked');
        o.onPick?.(label);
      };
      path.addEventListener('click', pick);
      path.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
    return path;
  });
  pie.append(...slices, svg('circle', { r: 19, class: 'pie-center' }));
  // 中間：進度；交件後是作業成果（T6 換成真的色票／名牌／縮圖／草稿，現在先寫部位名稱）
  pie.append(svg('text', { class: 'pie-text', x: 0, y: 1 }, cell.submitted ? o.part : `${cell.lit}/${n}`));
  if (cell.submitted) pie.classList.add('is-done');
  return pie;
}
