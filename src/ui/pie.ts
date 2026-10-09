// 設定卡上的一格：圓形切成任務數那麼多片，亮的片用該課程的顏色；中間寫 x/5。
// 交件後整格點亮，中間換成作業成果：配色是抽出來的顏色，名牌、版面、草稿是照片。
// OC 設定卡和大廳的小提示共用。
import type { CourseInfo } from '../core/courses';
import { monthDay, type CardCell } from '../core/ocCard';
import type { Commission, CourseType, PartType } from '../core/types';
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
/** 中間圓的半徑：平常寫 x/5；交件後放作業成果，比較大 */
const CENTER_R = 19;
const RESULT_R = 34;
/** 同一頁有很多格，裁切圖的 id 不能重複 */
let clipSeq = 0;

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

/** 交件後格子中間放的作業成果 */
export type PieResult =
  | { kind: 'palette'; colors: readonly string[] }
  /** fit：照片填滿圓（cover），或整張放進圓裡（contain，名牌用） */
  | { kind: 'image'; url: string; fit: 'cover' | 'contain' };

/**
 * 交件的委託在格子中間放什麼：配色放抽出的色，名牌放裁好的名牌圖，版面、草稿放交件照片。
 * url 查照片網址；還沒交件、或照片還沒讀到回傳 undefined。
 */
export function pieResult(c: Commission, part: PartType, url: (photoId: string) => string | undefined): PieResult | undefined {
  if (c.submittedAt === undefined) return undefined;
  if (part === 'palette') return c.palette?.length ? { kind: 'palette', colors: c.palette } : undefined;
  const id = part === 'nameplate' ? c.nameplatePhotoId : c.photoId;
  const u = id ? url(id) : undefined;
  return u ? { kind: 'image', url: u, fit: part === 'nameplate' ? 'contain' : 'cover' } : undefined;
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
  /** 交件後的成果；照片還沒讀到時不給，中間先寫部位名稱 */
  result?: PieResult;
  /** 給了的話，交件格子的中間可以點，放大看交的作業 */
  onOpenResult?(): void;
}

/** 一片的說明：「10/12 色彩學・3 組配色草稿（色相環）」或「上色（一）・還沒完成（色相環）」 */
export function sliceLabel(cell: CardCell, i: number, course: string): string {
  const slice = cell.slices[i], work = cell.commission?.title ?? '';
  return slice.lit && slice.level.doneAt !== undefined
    ? C.sliceDone(monthDay(slice.level.doneAt), course, slice.level.title, work)
    : C.sliceTodo(slice.level.title, work);
}

/** 中間的作業成果：配色切成扇形，照片裁成圓形 */
function resultDisc(result: PieResult): SVGGElement {
  const g = svg('g', { class: 'pie-result' });
  if (result.kind === 'palette') {
    const n = Math.max(1, result.colors.length);
    result.colors.forEach((color, i) => g.append(svg('path', { d: wedgePath(i, n, RESULT_R), fill: color, class: 'pie-swatch' })));
  } else {
    const id = `pie-clip-${++clipSeq}`;
    const defs = svg('defs', {}), clip = svg('clipPath', { id });
    clip.append(svg('circle', { r: RESULT_R }));
    defs.append(clip);
    g.append(defs, svg('circle', { r: RESULT_R, class: 'pie-photo-bg' }), svg('image', {
      href: result.url, x: -RESULT_R, y: -RESULT_R, width: RESULT_R * 2, height: RESULT_R * 2,
      preserveAspectRatio: result.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet', 'clip-path': `url(#${id})`,
    }));
  }
  g.append(svg('circle', { r: RESULT_R, class: 'pie-result-ring' }));
  return g;
}

export function pieSvg(o: PieOptions): SVGSVGElement {
  const { cell } = o;
  if (!cell.commission) {
    const empty = svg('svg', { viewBox: '-50 -50 100 100', class: 'pie', role: 'img', 'aria-label': C.emptyCell(o.course) });
    empty.append(svg('circle', { r: 45, class: 'pie-empty' }));
    return empty;
  }
  const work = cell.commission.title;
  const n = cell.slices.length;
  const interactive = !!o.onPick;
  const pie = svg('svg', {
    viewBox: '-50 -50 100 100', class: 'pie', role: interactive ? 'group' : 'img',
    'aria-label': C.pieLabel(o.course, work, cell.lit, n),
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
  pie.append(...slices);
  if (cell.submitted) pie.classList.add('is-done');

  if (cell.submitted && o.result) {
    const disc = resultDisc(o.result);
    if (o.onOpenResult) {
      const open = o.onOpenResult;
      disc.setAttribute('tabindex', '0');
      disc.setAttribute('role', 'button');
      disc.setAttribute('aria-label', C.openResult(work));
      disc.classList.add('is-button');
      disc.addEventListener('click', () => open());
      disc.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    pie.append(disc);
    return pie;
  }
  // 中間：進度；交件了但照片還沒讀到時，先寫部位名稱
  pie.append(svg('circle', { r: CENTER_R, class: 'pie-center' }));
  pie.append(svg('text', { class: 'pie-text', x: 0, y: 1 }, cell.submitted ? o.part : `${cell.lit}/${n}`));
  return pie;
}
