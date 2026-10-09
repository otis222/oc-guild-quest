// OC 設定卡：上面是主角圖、名字、公會等級、完成度、換造型；下面一門課一區（內建 4 門＋自訂課程）× 每區 3 格。
// 一格是一張委託（見 pie.ts）。點任何一片，看得到是哪一天、哪張委託的哪個任務。
// 從大廳小提示打開時，剛完成的那一片播點亮動畫（0.8 秒內）。
import { buildOcCard, type CardSection } from '../core/ocCard';
import type { GuildStore } from '../core/store';
import { PART_LABELS } from '../core/templates';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { courseColor, pieSvg } from './pie';

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

const C = COPY.card;

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
    // 捲到剛點亮的那一區，連下面那行說明一起看得到（自訂課程的區在最下面）
    if (first) sections.find((x) => x.highlighted)?.element.scrollIntoView({ block: 'nearest' });
  }
}

function sectionView(sec: CardSection, highlight: OcCardOptions['highlight']): { element: HTMLElement; highlighted: boolean } {
  const { label } = sec.course, part = PART_LABELS[sec.course.part];
  const detail = el('p', { class: 'oc-detail', 'aria-live': 'polite' });
  let highlighted = false;
  const cells = sec.cells.map((cell) => {
    const here = highlight && cell.commission?.id === highlight.commissionId ? highlight : undefined;
    const pie = pieSvg({
      cell, course: label, part,
      highlightLevelId: here?.levelId,
      onPick: (label) => { detail.textContent = label; },
    });
    const caption = cell.commission
      ? el('div', { class: 'cell-title' }, cell.commission.title)
      : el('div', { class: 'cell-empty' }, C.emptyCell(label));
    const element = el('div', { class: `oc-cell${cell.commission ? '' : ' is-empty'}${cell.submitted ? ' is-done' : ''}` }, pie, caption);
    if (here) {
      highlighted = true;
      const i = cell.slices.findIndex((x) => x.level.id === here.levelId);
      const path = pie.querySelectorAll('.slice')[i];
      if (path) { path.classList.add('is-picked'); detail.textContent = path.getAttribute('aria-label') ?? ''; }
    }
    return element;
  });
  const history = sec.history.length
    ? el('details', { class: 'oc-history' },
      el('summary', {}, C.history(sec.history.length)),
      el('ul', {}, ...sec.history.map((c) => {
        const timed = c.levels.filter((l) => l.kind === 'timed');
        return el('li', {}, C.historyItem(c.title, timed.filter((l) => l.status === 'done').length, timed.length, c.submittedAt !== undefined));
      })))
    : null;
  const element = el('section', { class: 'oc-sec', style: `--c: ${courseColor(sec.course)}` },
    el('div', { class: 'oc-sec-head' }, el('span', { class: 'oc-sec-name' }, label), el('span', { class: 'oc-sec-part' }, C.unlocks(part))),
    el('div', { class: 'oc-cells' }, ...cells),
    detail,
    history);
  return { element, highlighted };
}
