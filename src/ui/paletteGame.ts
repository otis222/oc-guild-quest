// 配色急救（企劃表 T16，色彩學的加分關）：設定圖的顏色亂掉了，幫背景、文字、主色、強調色各選一個顏色。
// 可以選的顏色是主角圖上抽出的顏色加白、灰、黑（規則在 core/paletteGame.ts）。
// 上面的小設定圖跟著即時換色：背景、主色是 OC 後面的圓、文字是名字和台詞、強調色是名字下面的線和星星。
import type { BonusResult } from '../core/actions';
import { courseInfo } from '../core/courses';
import { extractPalette } from '../core/palette';
import {
  messyPick, NEUTRALS, PALETTE_ROLES, PALETTE_RULES, paletteSwatches, scorePalette, type PalettePick, type PaletteRole, type PaletteRule,
  type Swatch,
} from '../core/paletteGame';
import { findCommission } from '../core/state';
import type { GuildStore } from '../core/store';
import { openBonusShell } from './bonusShell';
import { COPY } from './copy';
import { el, on } from './dom';
import { samplePixels } from './photo';
import { courseColor } from './pie';

export interface PaletteGameDeps {
  store: GuildStore;
  commissionId: string;
  /** 主角圖的網址：從這張圖抽顏色，也放在小設定圖上 */
  ocImage: string;
  /** 開始一局（打開、或按「再配一次」）：記事件 */
  onStart(): void;
  /** 按「完成配色」：存最高分、記事件，回傳這張委託的最高分 */
  finish(result: BonusResult): Promise<number>;
  /** 關掉之後（回委託板） */
  onClosed(): void;
}

const P = COPY.paletteGame;

/** 先讀主角圖、抽顏色，再打開配色急救。圖讀不到的話只有白、灰、黑可以選 */
export async function openPaletteGame(d: PaletteGameDeps): Promise<void> {
  let colors: string[] = [];
  try {
    const img = new Image();
    img.src = d.ocImage;
    await img.decode();
    colors = extractPalette(samplePixels(img));
  } catch (err) {
    console.warn('主角圖讀不到，配色急救只有白、灰、黑', err);
  }
  show(d, paletteSwatches(colors));
}

/** 顏色的名字（給螢幕閱讀器）：OC 的顏色照順序編號，後面是白、灰、黑 */
function swatchName(sw: Swatch, ocIndex: number): string {
  if (sw.fromOc) return P.ocColor(ocIndex + 1);
  return P.neutrals[NEUTRALS.indexOf(sw.color)] ?? sw.color;
}

function show(d: PaletteGameDeps, swatches: Swatch[]): void {
  const s0 = d.store.state;
  const commission = findCommission(s0, d.commissionId);
  const course = courseInfo(s0, commission.course);
  let pick: PalettePick = messyPick(swatches);
  let moves = 0;
  let startedAt = Date.now();

  // 小設定圖
  const preview = el('div', { class: 'pg-preview', role: 'img', 'aria-label': P.previewAria },
    el('span', { class: 'pg-figure' }, el('img', { src: d.ocImage, alt: '', draggable: 'false' })),
    el('span', { class: 'pg-info' },
      el('span', { class: 'pg-name' }, s0.oc.name),
      el('span', { class: 'pg-line' }),
      el('span', { class: 'pg-quote' }, s0.oc.quote ? `「${s0.oc.quote}」` : P.sample),
      el('span', { class: 'pg-stars', 'aria-hidden': 'true' }, '★★★')));

  // 每個地方一排色票（單選）
  let ocCount = 0;
  const names = swatches.map((sw) => swatchName(sw, sw.fromOc ? ocCount++ : 0));
  const inputs = new Map<PaletteRole, HTMLInputElement[]>();
  const rows = PALETTE_ROLES.map((role) => {
    const radios = swatches.map((sw, i) => {
      const input = el('input', { type: 'radio', name: `pg-${role}`, value: String(i), class: 'sr-only', 'aria-label': names[i] });
      on(input, 'change', () => choose(role, i));
      return { input, label: el('label', { class: `pg-swatch${sw.fromOc ? '' : ' is-neutral'}` }, input, el('span', { style: `background: ${sw.color}` })) };
    });
    inputs.set(role, radios.map((r) => r.input));
    return el('div', { class: 'pg-row', role: 'radiogroup', 'aria-label': P.roleAria(P.roles[role]) },
      el('span', { class: 'pg-role', 'aria-hidden': 'true' }, P.roles[role]),
      el('span', { class: 'pg-swatches' }, ...radios.map((r) => r.label)));
  });
  const board = el('div', { class: 'pg-board' }, preview, el('div', { class: 'pg-rows' }, ...rows), el('p', { class: 'bonus-note' }, P.ocNote));

  function choose(role: PaletteRole, i: number): void {
    if (pick[role] === i) return;
    pick = { ...pick, [role]: i };
    moves++;
    render();
    shell.refresh();
  }

  function render(): void {
    for (const role of PALETTE_ROLES) {
      preview.style.setProperty(`--${role}`, swatches[pick[role]].color);
      inputs.get(role)?.forEach((input, i) => { input.checked = pick[role] === i; });
    }
  }

  const group = (kind: PaletteRule['kind']): { label: string; rules: { id: string; label: string }[] } => ({
    label: P.groups[kind],
    rules: PALETTE_RULES.filter((r) => r.kind === kind).map((r) => ({ id: r.id, label: P.rules[r.id] })),
  });

  render();
  const shell = openBonusShell({
    title: P.title,
    work: `${course.label}・${commission.title}`,
    color: courseColor(course),
    hint: P.hint,
    board,
    groups: [group('value'), group('color')],
    note: P.note,
    finish: P.finish,
    again: P.again,
    results: P.result,
    score: () => scorePalette(swatches, pick),
    save: () => {
      const { score, passed } = scorePalette(swatches, pick);
      return d.finish({ score, passed, ms: Date.now() - startedAt, moves });
    },
    lock: (locked) => {
      board.classList.toggle('is-locked', locked);
      for (const list of inputs.values()) list.forEach((input) => { input.disabled = locked; });
    },
    restart: () => {
      pick = messyPick(swatches);
      moves = 0;
      startedAt = Date.now();
      d.onStart();
      render();
    },
    onClosed: d.onClosed,
  });
  d.onStart();
}
