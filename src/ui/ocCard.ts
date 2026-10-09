// OC 設定卡：上面是主角圖、名字、公會等級、完成度、換造型；下面 4 區（4 門課）× 每區 3 格。
// 一格是一張委託：圓形切成任務數那麼多片，完成一個任務亮一片；交件後整格點亮，中間換成作業成果（T6 才有，先放佔位）。
// 點任何一片，看得到是哪一天、哪張委託的哪個任務。剛完成的那一片播點亮動畫（0.8 秒內）。
import { buildOcCard, monthDay, type CardCell, type CardSection } from '../core/ocCard';
import type { GuildStore } from '../core/store';
import { courseTemplate } from '../core/templates';
import type { CourseType } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';

export interface OcCardDeps {
  store: GuildStore;
  /** 主角圖的網址 */
  ocImage(): string;
  /** 按「換造型」 */
  onChangeLook(): void;
}

export interface OcCardOptions {
  /** 剛完成的任務：那一片播點亮動畫，下面先顯示它的資訊 */
  highlight?: { commissionId: string; levelId: string };
  onClose?(): void;
}

/** 每門課的顏色（跟大廳拱門的旗子同一組） */
const COURSE_COLORS: Record<CourseType, string> = {
  typography: '#b49bff', color: '#ff8fae', composition: '#7fb6ff', drawing: '#7fd48f',
};
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

export function openOcCard(deps: OcCardDeps, opts: OcCardOptions = {}): void {
  const dialog = openDialog({ title: C.title, onClose: () => { unsubscribe(); opts.onClose?.(); } });
  const unsubscribe = deps.store.subscribe(() => render(false));
  render(true);

  function render(first: boolean): void {
    const s = deps.store.state;
    const card = buildOcCard(s);
    const pct = Math.round(card.completion * 100);
    const head = el('div', { class: 'oc-head' },
      el('div', { class: 'oc-portrait' }, el('img', { src: deps.ocImage(), alt: s.oc.name, draggable: 'false' })),
      el('div', { class: 'oc-info' },
        el('div', { class: 'oc-name' }, s.oc.name),
        el('div', { class: 'oc-level' }, C.guildLevel(s.guildLevel)),
        el('div', { class: 'oc-meter' },
          el('span', { class: 'bar', role: 'img', 'aria-label': C.completion(pct) }, el('span', { style: `width: ${pct}%` })),
          C.completion(pct)),
        on(el('button', { type: 'button', class: 'oc-change' }, C.changeLook), 'click', () => deps.onChangeLook())));
    const sections = card.sections.map((sec) => sectionView(sec, first ? opts.highlight : undefined));
    dialog.body.replaceChildren(head, ...sections.map((x) => x.element));
    if (first) sections.find((x) => x.highlighted)?.highlighted?.scrollIntoView({ block: 'nearest' });
  }
}

function sectionView(sec: CardSection, highlight: OcCardOptions['highlight']): { element: HTMLElement; highlighted: HTMLElement | null } {
  const t = courseTemplate(sec.course);
  const detail = el('p', { class: 'oc-detail', 'aria-live': 'polite' });
  let highlighted: HTMLElement | null = null;
  const cells = sec.cells.map((cell) => {
    const view = cellView(cell, t.label, t.part, detail, highlight);
    if (view.highlighted) highlighted = view.element;
    return view.element;
  });
  const history = sec.history.length
    ? el('details', { class: 'oc-history' },
      el('summary', {}, C.history(sec.history.length)),
      el('ul', {}, ...sec.history.map((c) => {
        const timed = c.levels.filter((l) => l.kind === 'timed');
        return el('li', {}, C.historyItem(c.title, timed.filter((l) => l.status === 'done').length, timed.length, c.submittedAt !== undefined));
      })))
    : null;
  const element = el('section', { class: 'oc-sec', style: `--c: ${COURSE_COLORS[sec.course]}` },
    el('div', { class: 'oc-sec-head' }, el('span', { class: 'oc-sec-name' }, t.label), el('span', { class: 'oc-sec-part' }, C.unlocks(t.part))),
    el('div', { class: 'oc-cells' }, ...cells),
    detail,
    history);
  return { element, highlighted };
}

function cellView(
  cell: CardCell, course: string, part: string, detail: HTMLElement, highlight: OcCardOptions['highlight'],
): { element: HTMLElement; highlighted: boolean } {
  const c = cell.commission;
  if (!c) {
    const pie = svg('svg', { viewBox: '-50 -50 100 100', class: 'pie', role: 'img', 'aria-label': C.emptyCell(course) });
    pie.append(svg('circle', { r: 45, class: 'pie-empty' }));
    return { element: el('div', { class: 'oc-cell is-empty' }, pie, el('div', { class: 'cell-empty' }, C.emptyCell(course))), highlighted: false };
  }

  const n = cell.slices.length;
  const pie = svg('svg', { viewBox: '-50 -50 100 100', class: 'pie', role: 'group', 'aria-label': C.pieLabel(course, c.title, cell.lit, n) });
  let highlighted = false;
  const slices = cell.slices.map((slice, i) => {
    const label = slice.lit && slice.level.doneAt !== undefined
      ? C.sliceDone(monthDay(slice.level.doneAt), course, slice.level.title, c.title)
      : C.sliceTodo(slice.level.title, c.title);
    const isNew = highlight?.commissionId === c.id && highlight.levelId === slice.level.id;
    // 交件後整格點亮（企劃表 T5），不管每片任務有沒有按完成
    const path = svg('path', {
      d: wedgePath(i, n, 46), class: `slice${slice.lit || cell.submitted ? ' lit' : ''}${isNew ? ' just-lit' : ''}`,
      tabindex: 0, role: 'button', 'aria-label': label,
    });
    const show = (): void => {
      slices.forEach((p) => p.classList.remove('is-picked'));
      path.classList.add('is-picked');
      detail.textContent = label;
    };
    path.addEventListener('click', show);
    path.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    if (isNew) { highlighted = true; detail.textContent = label; }
    return path;
  });
  pie.append(...slices, svg('circle', { r: 19, class: 'pie-center' }));
  // 中間：進度；交件後是作業成果（T6 換成真的色票／名牌／縮圖／草稿，現在先寫部位名稱）
  pie.append(svg('text', { class: 'pie-text', x: 0, y: 1 }, cell.submitted ? part : `${cell.lit}/${n}`));
  const element = el('div', { class: `oc-cell${cell.submitted ? ' is-done' : ''}` }, pie, el('div', { class: 'cell-title' }, c.title));
  return { element, highlighted };
}
