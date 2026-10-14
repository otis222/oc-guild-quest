// 名牌急救（企劃表 T16，字體設計的加分關）：名牌上 OC 名字的字距和高低亂掉了，把每個字拖整齊。
// 依對齊基線、置中、字距平均、字距適中給分（規則在 core/plateGame.ts），下面的清單跟著字即時打勾。
// 拖的時候一步一步吸過去（一步是四分之一個字）；也可以用 Tab 選字、方向鍵一次移一步。
// 名牌上有淡淡的方格和正中間的虛線，幫忙看字距和有沒有置中。
import type { BonusResult } from '../core/actions';
import { courseInfo } from '../core/courses';
import {
  GLYPH, messyPlate, moveGlyph, nudgeGlyph, plateChars, PLATE_RULES, plateSize, scorePlate, type PlateLayout, type PlateRule,
} from '../core/plateGame';
import { findCommission } from '../core/state';
import type { GuildStore } from '../core/store';
import { openBonusShell } from './bonusShell';
import { COPY } from './copy';
import { el, on } from './dom';
import { courseColor } from './pie';

export interface PlateGameDeps {
  store: GuildStore;
  commissionId: string;
  /** 開始一局（打開、或按「再排一次」）：記事件 */
  onStart(): void;
  /** 按「完成名牌」：存最高分、記事件，回傳這張委託的最高分 */
  finish(result: BonusResult): Promise<number>;
  /** 關掉之後（回委託板） */
  onClosed(): void;
}

const P = COPY.plateGame;
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const pct = (v: number, of: number): string => `${(v / of) * 100}%`;

interface Drag {
  i: number;
  pointerId: number;
  /** 按下去時手指的位置（px）、字的位置（步） */
  startX: number;
  startY: number;
  fromX: number;
  fromY: number;
}

export function openPlateGame(d: PlateGameDeps): void {
  const s0 = d.store.state;
  const commission = findCommission(s0, d.commissionId);
  const course = courseInfo(s0, commission.course);
  const chars = plateChars(s0.oc.name);
  if (!chars.length) chars.push('？');
  const n = chars.length;
  const size = plateSize(n);
  let layout: PlateLayout = messyPlate(n);
  let moves = 0;
  let startedAt = Date.now();
  let locked = false;
  let drag: Drag | null = null;

  const glyphs = chars.map((ch, i) => glyph(ch, i));
  const plate = el('div', {
    class: 'pl-plate', role: 'group', 'aria-label': P.plateAria, 'aria-describedby': 'plateKeys',
    style: `aspect-ratio: ${size.w} / ${size.h}; --cols: ${size.w}; background-size: ${pct(1, size.w)} ${pct(1, size.h)}`,
  }, el('span', { class: 'pl-guide is-h' }), el('span', { class: 'pl-guide is-v' }), ...glyphs);
  const board = el('div', { class: 'pl-board' }, el('p', { id: 'plateKeys', class: 'sr-only' }, P.keysHint), plate);

  /** 一個字：可以拖、方向鍵移一步 */
  function glyph(ch: string, i: number): HTMLElement {
    const e = el('div', {
      class: 'pl-glyph', role: 'button', tabindex: 0,
      style: `width: ${pct(GLYPH, size.w)}; height: ${pct(GLYPH, size.h)}`,
    }, el('span', { 'aria-hidden': 'true' }, ch));

    on(e, 'pointerdown', (ev) => {
      if (locked || drag || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      ev.preventDefault();
      e.setPointerCapture(ev.pointerId);
      drag = { i, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, fromX: layout[i].x, fromY: layout[i].y };
      e.classList.add('is-dragging');
      e.focus({ preventScroll: true });
    });
    on(e, 'pointermove', (ev) => {
      if (!drag || drag.i !== i || drag.pointerId !== ev.pointerId) return;
      const step = plate.clientWidth / size.w;
      set(moveGlyph(layout, i, drag.fromX + (ev.clientX - drag.startX) / step, drag.fromY + (ev.clientY - drag.startY) / step, size), false);
    });
    const end = (ev: PointerEvent): void => {
      if (!drag || drag.i !== i || drag.pointerId !== ev.pointerId) return;
      const moved = layout[i].x !== drag.fromX || layout[i].y !== drag.fromY;
      drag = null;
      e.classList.remove('is-dragging');
      if (moved) moves++;
    };
    on(e, 'pointerup', end);
    on(e, 'pointercancel', end);
    on(e, 'lostpointercapture', end);

    on(e, 'keydown', (ev) => {
      const step = ARROWS[ev.key];
      if (locked || !step) return;
      ev.preventDefault();
      set(nudgeGlyph(layout, i, step[0], step[1], size), true);
    });
    return e;
  }

  /** 換成新的排法；count 是這次要不要算一次移動（拖曳在放開時才算） */
  function set(next: PlateLayout, count: boolean): void {
    if (next === layout) return;
    layout = next;
    if (count) moves++;
    render();
    shell.refresh();
  }

  function render(): void {
    layout.forEach((g, i) => {
      const e = glyphs[i];
      e.style.left = pct(g.x, size.w);
      e.style.top = pct(g.y, size.h);
      e.setAttribute('aria-label', P.glyph(chars[i], i + 1, n));
    });
  }

  const group = (kind: PlateRule['kind']): { label: string; rules: { id: string; label: string }[] } => ({
    label: P.groups[kind],
    rules: PLATE_RULES.filter((r) => r.kind === kind).map((r) => ({ id: r.id, label: P.rules[r.id] })),
  });

  render();
  const shell = openBonusShell({
    title: P.title,
    work: `${course.label}・${commission.title}`,
    color: courseColor(course),
    hint: P.hint,
    board,
    groups: [group('line'), group('space')],
    note: P.note,
    finish: P.finish,
    again: P.again,
    results: P.result,
    score: () => scorePlate(layout, size),
    save: () => {
      const { score, passed } = scorePlate(layout, size);
      return d.finish({ score, passed, ms: Date.now() - startedAt, moves });
    },
    lock: (value) => {
      locked = value;
      plate.classList.toggle('is-locked', value);
      for (const e of glyphs) {
        e.tabIndex = value ? -1 : 0;
        e.setAttribute('aria-disabled', String(value));
      }
    },
    restart: () => {
      layout = messyPlate(n);
      moves = 0;
      startedAt = Date.now();
      d.onStart();
      render();
    },
    onClosed: d.onClosed,
  });
  d.onStart();
}
