// OC 設定卡：上面是主角圖、名字、公會等級、完成度、換造型，下面一排是 OC 目前的部件（名牌、配色、版面、草稿）；
// 再下面一門課一區（內建 4 門＋自訂課程）× 每區 3 格。一格是一張委託（見 pie.ts）。
// 點任何一片，看得到是哪一天、哪張委託的哪個任務；交件的格子中間是作業成果，點了放大看照片。
// 從大廳小提示打開時，剛完成的那一片（交件的話是整格）播點亮動畫（0.8 秒內）。
import { buildOcCard, type CardSection } from '../core/ocCard';
import type { GuildStore } from '../core/store';
import { partSources } from '../core/submit';
import { PART_LABELS, PARTS } from '../core/templates';
import type { Commission, GuildState, PartType } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import type { PhotoUrls } from './photos';
import { courseColor, pieResult, pieSvg } from './pie';

export interface OcCardDeps {
  store: GuildStore;
  photos: PhotoUrls;
  /** 主角圖的網址 */
  ocImage(): string;
  /** 按「換造型」 */
  onChangeLook(): void;
  /** 點交件的作業（格子中間、部件格）：放大看照片 */
  onViewWork(commission: Commission): void;
}

export interface OcCardOptions {
  /** 剛完成的任務（levelId）或剛交件的委託（沒有 levelId）：播點亮動畫，下面先顯示它的資訊 */
  highlight?: { commissionId: string; levelId?: string };
  onClose?(): void;
}

const C = COPY.card;
/** 打開設定卡前，最多等交件照片讀多久（毫秒）；通常幾十毫秒就好 */
const PHOTO_WAIT_MS = 400;

const missingPhotos = (deps: OcCardDeps): (string | undefined)[] => deps.store.state.commissions
  .flatMap((c) => [c.photoId, c.nameplatePhotoId]).filter((id) => id && !deps.photos.now(id));

/**
 * 打開設定卡。交件的照片還沒讀過的話，先從 IndexedDB 讀好再打開（讀過的整場都記得）：
 * 打開後才讀完再重畫，會打斷剛完成那一片的點亮動畫。
 */
export function openOcCard(deps: OcCardDeps, opts: OcCardOptions = {}): void {
  const missing = missingPhotos(deps);
  if (!missing.length) { show(deps, opts); return; }
  const timeout = new Promise((resolve) => setTimeout(resolve, PHOTO_WAIT_MS));
  void Promise.race([deps.photos.load(missing), timeout]).then(() => show(deps, opts));
}

function show(deps: OcCardDeps, opts: OcCardOptions): void {
  let closed = false;
  const dialog = openDialog({ title: C.title, onClose: () => { closed = true; unsubscribe(); opts.onClose?.(); } });
  const unsubscribe = deps.store.subscribe(() => render(false));
  render(true);
  // 等太久還沒讀完的照片：讀好以後再畫一次
  const missing = missingPhotos(deps);
  if (missing.length) void deps.photos.load(missing).then(() => { if (!closed) render(false); });

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
    const sections = card.sections.map((sec) => sectionView(sec, deps, first ? opts.highlight : undefined));
    dialog.body.replaceChildren(head, partsRow(s, deps), ...sections.map((x) => x.element));
    // 捲到剛點亮的那一區，連下面那行說明一起看得到（自訂課程的區在最下面）
    if (first) sections.find((x) => x.highlighted)?.element.scrollIntoView({ block: 'nearest' });
  }
}

/** OC 目前的部件：每個部位最近交件的成果；還沒交過的部位是虛線空格 */
function partsRow(s: GuildState, deps: OcCardDeps): HTMLElement {
  const src = partSources(s);
  return el('div', { class: 'oc-parts', role: 'group', 'aria-label': C.partsAria }, ...PARTS.map((part) => {
    const c = src[part];
    const name = el('span', { class: 'part-name' }, PART_LABELS[part]);
    if (!c) return el('div', { class: 'part-tile is-empty' }, el('span', { class: 'part-thumb' }), name, el('span', { class: 'sr-only' }, C.partEmpty));
    const tile = el('button', { type: 'button', class: 'part-tile', 'aria-label': `${PART_LABELS[part]}：${C.openResult(c.title)}` },
      partThumb(part, c, deps), name);
    return on(tile, 'click', () => deps.onViewWork(c));
  }));
}

function partThumb(part: PartType, c: Commission, deps: OcCardDeps): HTMLElement {
  if (part === 'palette') {
    return el('span', { class: 'part-thumb swatches' }, ...(c.palette ?? []).map((color) => el('span', { class: 'swatch', style: `background: ${color}` })));
  }
  const id = part === 'nameplate' ? c.nameplatePhotoId : c.photoId;
  const url = id ? deps.photos.now(id) : undefined;
  return el('span', { class: `part-thumb${part === 'nameplate' ? ' is-plate' : ''}` }, url ? el('img', { src: url, alt: '', draggable: 'false' }) : null);
}

function sectionView(sec: CardSection, deps: OcCardDeps, highlight: OcCardOptions['highlight']): { element: HTMLElement; highlighted: boolean } {
  const { label } = sec.course, part = PART_LABELS[sec.course.part];
  const detail = el('p', { class: 'oc-detail', 'aria-live': 'polite' });
  let highlighted = false;
  const cells = sec.cells.map((cell) => {
    const c = cell.commission;
    const here = highlight && c?.id === highlight.commissionId ? highlight : undefined;
    const pie = pieSvg({
      cell, course: label, part,
      highlightLevelId: here?.levelId,
      onPick: (text) => { detail.textContent = text; },
      result: c ? pieResult(c, sec.course.part, deps.photos.now) : undefined,
      onOpenResult: c && cell.submitted ? () => deps.onViewWork(c) : undefined,
    });
    const caption = c
      ? el('div', { class: 'cell-title' }, c.title)
      : el('div', { class: 'cell-empty' }, C.emptyCell(label));
    const element = el('div', { class: `oc-cell${c ? '' : ' is-empty'}${cell.submitted ? ' is-done' : ''}` }, pie, caption);
    if (here) {
      highlighted = true;
      const paths = [...pie.querySelectorAll('.slice')];
      if (here.levelId === undefined) {
        // 剛交件：整格一起點亮
        paths.forEach((p) => p.classList.add('just-lit'));
      } else {
        const path = paths[cell.slices.findIndex((x) => x.level.id === here.levelId)];
        if (path) { path.classList.add('is-picked'); detail.textContent = path.getAttribute('aria-label') ?? ''; }
      }
    }
    return element;
  });
  const history = sec.history.length
    ? el('details', { class: 'oc-history' },
      el('summary', {}, C.history(sec.history.length)),
      el('ul', {}, ...sec.history.map((h) => {
        const timed = h.levels.filter((l) => l.kind === 'timed');
        return el('li', {}, C.historyItem(h.title, timed.filter((l) => l.status === 'done').length, timed.length, h.submittedAt !== undefined));
      })))
    : null;
  const element = el('section', { class: 'oc-sec', style: `--c: ${courseColor(sec.course)}` },
    el('div', { class: 'oc-sec-head' }, el('span', { class: 'oc-sec-name' }, label), el('span', { class: 'oc-sec-part' }, C.unlocks(part))),
    el('div', { class: 'oc-cells' }, ...cells),
    detail,
    history);
  return { element, highlighted };
}
