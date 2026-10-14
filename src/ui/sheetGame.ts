// 設定圖急救（企劃表 T9，平面構成的加分關）：設定圖亂掉了，把 OC 的名字、台詞、三視圖小卡拖進格線排好。
// 依對齊和留白給分（規則在 core/sheet.ts），下面的清單跟著小卡即時打勾；按「完成排版」記下分數。
// 三視圖只有一張 OC 圖：正面是原圖、側面壓窄、背面是剪影，不生新的圖。名字有名牌（字體設計交件後）就用名牌。
// 拖曳時跟著手指走，放開就吸到最近的格子；點一下是原地放進格線；也可以用方向鍵一次移一格。
import type { BonusResult } from '../core/actions';
import { bonusGrade, cleanQuote, QUOTE_MAX } from '../core/bonus';
import { sheetPositions } from '../core/charSheet';
import { courseInfo } from '../core/courses';
import {
  CARD_SIZE, clampToSheet, looseCards, messyLayout, nudgeCard, scoreSheet, SHEET_CARDS, SHEET_COLS, SHEET_ROWS, SHEET_RULES,
  snapCard, type CardPos, type SheetCardId, type SheetLayout, type SheetRule, type SheetRuleId, type SheetScore,
} from '../core/sheet';
import { findCommission } from '../core/state';
import type { GuildStore } from '../core/store';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { courseColor } from './pie';

export interface SheetGameDeps {
  store: GuildStore;
  commissionId: string;
  /** 主角圖的網址 */
  ocImage: string;
  /** 名牌圖的網址（字體設計交件後才有）；沒有是 null */
  nameplate: Promise<string | null>;
  /** 開始一局（打開、或按「再排一次」）：記事件 */
  onStart(): void;
  /** 按「完成排版」：存最高分、記事件，回傳這張委託的最高分；丟錯代表沒存成功 */
  finish(result: BonusResult): Promise<number>;
  /** 台詞改了：存進 OC */
  saveQuote(quote: string): void;
  /** 關掉之後（回委託板） */
  onClosed(): void;
}

const B = COPY.bonus;
/** 手指移動超過幾 px 才算拖曳；沒超過就是點一下（原地放進格線） */
const TAP_SLOP = 6;
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const pct = (v: number, of: number): string => `${(v / of) * 100}%`;

interface Drag {
  id: SheetCardId;
  pointerId: number;
  /** 按下去時手指的位置（px）、小卡的位置（格） */
  startX: number;
  startY: number;
  fromX: number;
  fromY: number;
  /** 現在小卡的位置（格，還沒吸附） */
  x: number;
  y: number;
  moved: boolean;
}

export function openSheetGame(d: SheetGameDeps): void {
  const s0 = d.store.state;
  const commission = findCommission(s0, d.commissionId);
  const course = courseInfo(s0, commission.course);
  let layout: SheetLayout = messyLayout();
  /** 動過的順序：剛動過的排最後（疊的時候在上面，見 render） */
  let order: SheetCardId[] = [...SHEET_CARDS];
  let score: SheetScore = scoreSheet(layout);
  let moves = 0;
  let startedAt = Date.now();
  let locked = false;
  let busy = false;
  let drag: Drag | null = null;
  let savedQuote = s0.oc.quote ?? '';

  // ---------------------------------------------------------------- 小卡
  const nameText = el('span', { class: 'sheet-text' });
  const quoteText = el('span', { class: 'sheet-text' });
  const view = (id: SheetCardId): HTMLElement[] => [
    el('span', { class: 'sheet-view' }, el('img', { src: d.ocImage, alt: '', draggable: 'false' })),
    el('span', { class: 'sheet-card-label', 'aria-hidden': 'true' }, B.cards[id]),
  ];
  const cards: Record<SheetCardId, HTMLElement> = {
    name: card('name', [nameText]),
    quote: card('quote', [quoteText]),
    front: card('front', view('front')),
    side: card('side', view('side')),
    back: card('back', view('back')),
  };
  fit(nameText, s0.oc.name);
  d.nameplate.then((url) => {
    if (url) cards.name.replaceChildren(el('img', { src: url, alt: '', draggable: 'false' }));
  }).catch((err: unknown) => console.warn('名牌圖讀不到，設定圖上用文字名字', err));

  const ghost = el('div', { class: 'sheet-ghost', hidden: true });
  const grid = el('div', {
    class: 'sheet-grid', role: 'group', 'aria-label': B.sheetAria,
    style: `aspect-ratio: ${SHEET_COLS} / ${SHEET_ROWS}; background-size: ${pct(1, SHEET_COLS)} ${pct(1, SHEET_ROWS)}`,
  }, ghost, ...SHEET_CARDS.map((id) => cards[id]));

  /** 一張小卡：可以拖、點一下放進格線、方向鍵移一格 */
  function card(id: SheetCardId, children: Node[]): HTMLElement {
    const { w, h } = CARD_SIZE[id];
    const e = el('div', {
      class: `sheet-card is-${id}`, role: 'button', tabindex: 0, 'aria-describedby': 'sheetKeys',
      style: `width: ${pct(w, SHEET_COLS)}; height: ${pct(h, SHEET_ROWS)}`,
    }, ...children);

    on(e, 'pointerdown', (ev) => {
      if (locked || drag || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      ev.preventDefault();
      e.setPointerCapture(ev.pointerId);
      const p = layout[id];
      drag = { id, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, fromX: p.x, fromY: p.y, x: p.x, y: p.y, moved: false };
      toFront(id);
      e.classList.add('is-dragging');
      e.focus({ preventScroll: true });
      render();
    });
    on(e, 'pointermove', (ev) => {
      if (!drag || drag.id !== id || drag.pointerId !== ev.pointerId) return;
      const dx = ev.clientX - drag.startX, dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      drag.moved = true;
      const cell = grid.clientWidth / SHEET_COLS;
      const p = clampToSheet(id, drag.fromX + dx / cell, drag.fromY + dy / cell);
      drag.x = p.x; drag.y = p.y;
      place(e, p.x, p.y);
      showGhost(id, snapCard(id, p.x, p.y));
    });
    const end = (ev: PointerEvent): void => {
      if (!drag || drag.id !== id || drag.pointerId !== ev.pointerId) return;
      const { x, y } = drag;
      drag = null;
      e.classList.remove('is-dragging');
      ghost.hidden = true;
      if (!locked) set(id, snapCard(id, x, y));
    };
    on(e, 'pointerup', end);
    on(e, 'pointercancel', end);
    on(e, 'lostpointercapture', end);

    on(e, 'keydown', (ev) => {
      if (locked) return;
      const step = ARROWS[ev.key];
      if (step) {
        ev.preventDefault();
        toFront(id);
        set(id, nudgeCard(id, layout[id], step[0], step[1]));
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        set(id, snapCard(id, layout[id].x, layout[id].y));
      }
    });
    return e;
  }

  const toFront = (id: SheetCardId): void => { order = [...order.filter((x) => x !== id), id]; };

  function place(e: HTMLElement, x: number, y: number): void {
    e.style.left = pct(x, SHEET_COLS);
    e.style.top = pct(y, SHEET_ROWS);
  }

  /** 拖曳時，虛線框標出放開後會吸到哪裡 */
  function showGhost(id: SheetCardId, p: CardPos): void {
    const { w, h } = CARD_SIZE[id];
    Object.assign(ghost.style, { left: pct(p.x, SHEET_COLS), top: pct(p.y, SHEET_ROWS), width: pct(w, SHEET_COLS), height: pct(h, SHEET_ROWS) });
    ghost.hidden = false;
  }

  function set(id: SheetCardId, p: CardPos): void {
    const old = layout[id];
    if (old.x !== p.x || old.y !== p.y || old.placed !== p.placed) moves++;
    layout = { ...layout, [id]: p };
    msg.textContent = '';
    render();
  }

  /** 名字、台詞：字數越多字越小，一行放得下 */
  function fit(span: HTMLElement, text: string): void {
    span.textContent = text;
    span.style.setProperty('--chars', String(Math.max(2, Array.from(text).length)));
  }

  // ---------------------------------------------------------------- 計分清單
  const total = el('div', { class: 'sheet-total', 'aria-live': 'polite' });
  const ruleEls = new Map<SheetRuleId, { item: HTMLLIElement; state: HTMLSpanElement }>();
  const ruleItem = (r: SheetRule): HTMLLIElement => {
    const state = el('span', { class: 'sr-only' });
    const item = el('li', { class: 'sheet-rule' }, B.rules[r.id], state);
    ruleEls.set(r.id, { item, state });
    return item;
  };
  const ruleGroup = (kind: SheetRule['kind']): HTMLElement => el('div', {},
    el('h3', {}, B.groups[kind]),
    el('ul', {}, ...SHEET_RULES.filter((r) => r.kind === kind).map(ruleItem)));
  const rules = el('div', { class: 'sheet-rules' }, ruleGroup('align'), ruleGroup('space'));
  const note = el('p', { class: 'sheet-note' }, B.alignNote);

  // ---------------------------------------------------------------- 台詞
  const quoteInput = el('input', {
    id: 'sheetQuote', type: 'text', maxlength: QUOTE_MAX, value: savedQuote, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: B.quotePlaceholder(QUOTE_MAX),
  });
  const quoteRow = el('div', { class: 'sheet-quote' }, el('label', { for: 'sheetQuote' }, B.quote), quoteInput);
  function renderQuote(): void {
    const q = cleanQuote(quoteInput.value);
    fit(quoteText, q ? `「${q}」` : B.quoteEmpty);
    cards.quote.classList.toggle('is-empty', !q);
  }
  /** 台詞有改才存（離開輸入框、完成排版、關掉時） */
  function commitQuote(): void {
    const q = cleanQuote(quoteInput.value);
    if (q === savedQuote) return;
    savedQuote = q;
    d.saveQuote(q);
  }
  on(quoteInput, 'input', renderQuote);
  on(quoteInput, 'change', commitQuote);
  // 手機鍵盤的「完成」：只收鍵盤
  on(quoteInput, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quoteInput.blur(); } });

  // ---------------------------------------------------------------- 畫面
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const panel = el('div', { class: 'sheet-panel' });

  function render(): void {
    score = scoreSheet(layout);
    // 疊的順序：排好的在下面，還沒放進格線的在上面（不會被排好的整張蓋住、找不到），正在拖的那張最上面
    const stack = [...order.filter((id) => layout[id].placed), ...order.filter((id) => !layout[id].placed)];
    if (drag) stack.push(...stack.splice(stack.indexOf(drag.id), 1));
    stack.forEach((id, i) => { cards[id].style.zIndex = String(i + 1); });
    for (const id of SHEET_CARDS) {
      const e = cards[id], p = layout[id];
      if (drag?.id !== id) place(e, p.x, p.y);
      e.classList.toggle('is-loose', !p.placed);
      e.classList.toggle('is-clash', score.clashes.includes(id));
      e.style.setProperty('--tilt', `${p.placed ? 0 : p.tilt}deg`);
      e.setAttribute('aria-label', p.placed ? B.cardAt(B.cards[id], p.x + 1, p.y + 1) : B.cardLoose(B.cards[id]));
    }
    total.textContent = B.now(score.score);
    for (const r of SHEET_RULES) {
      const x = ruleEls.get(r.id);
      if (!x) continue;
      const ok = score.passed.includes(r.id);
      x.item.classList.toggle('is-ok', ok);
      x.state.textContent = `（${ok ? B.ruleDone : B.ruleTodo}）`;
    }
  }

  /** 排版中：目前分數、清單、台詞、完成排版 */
  function showPlay(): void {
    const done = el('button', { type: 'button', class: 'primary' }, B.finish);
    on(done, 'click', () => { void finish(done); });
    const cancel = on(el('button', { type: 'button', class: 'secondary' }, B.cancel), 'click', () => dialog.close());
    panel.replaceChildren(total, rules, note, quoteRow, msg, el('div', { class: 'form-actions' }, done, cancel));
  }

  /** 計完分：分數、評語、最高分，下面照樣看得到哪幾項做到了。滿分時主要按鈕是回委託板，不然是再排一次 */
  function showResult(best: number): void {
    const grade = bonusGrade(score.score);
    const result = el('div', { class: 'sheet-result', role: 'status', tabindex: -1 },
      el('strong', { class: 'sheet-result-score' }, B.score(score.score)),
      el('p', {}, B.result[grade]),
      el('p', { class: 'card-note' }, B.best(best)));
    const perfect = grade === 'perfect';
    const again = on(el('button', { type: 'button', class: perfect ? 'secondary' : 'primary' }, B.again), 'click', restart);
    const back = on(el('button', { type: 'button', class: perfect ? 'primary' : 'secondary' }, B.back), 'click', () => dialog.close());
    panel.replaceChildren(result, el('div', { class: 'form-actions' }, ...(perfect ? [back, again] : [again, back])), rules, note, quoteRow);
    result.focus();
  }

  function setLocked(value: boolean): void {
    locked = value;
    grid.classList.toggle('is-locked', value);
    for (const id of SHEET_CARDS) {
      cards[id].tabIndex = value ? -1 : 0;
      cards[id].setAttribute('aria-disabled', String(value));
    }
  }

  async function finish(button: HTMLButtonElement): Promise<void> {
    if (busy || locked) return;
    const loose = looseCards(layout);
    if (loose.length) { msg.textContent = B.loose(loose.length); return; }
    busy = true; button.disabled = true; button.textContent = B.finishing;
    commitQuote();
    try {
      const positions = sheetPositions(layout) ?? undefined;
      const best = await d.finish({ score: score.score, passed: score.passed, ms: Date.now() - startedAt, moves, positions });
      setLocked(true);
      showResult(best);
    } catch (err) {
      console.error('加分關分數沒存到', err);
      msg.textContent = B.saveFailed;
      button.disabled = false; button.textContent = B.finish;
    } finally {
      busy = false;
    }
  }

  /** 再排一次：重新弄亂 */
  function restart(): void {
    layout = messyLayout();
    order = [...SHEET_CARDS];
    moves = 0;
    startedAt = Date.now();
    setLocked(false);
    msg.textContent = '';
    d.onStart();
    render();
    showPlay();
  }

  // 先擺好小卡的位置再放上畫面：放上去之後才改位置，小卡會從左上角滑過去
  renderQuote();
  render();
  const dialog = openDialog({ title: B.title, onClose: () => { commitQuote(); d.onClosed(); } });
  dialog.body.replaceChildren(el('div', { class: 'sheet-game', style: `--c: ${courseColor(course)}` },
    el('p', { class: 'sheet-work' }, `${course.label}・${commission.title}`),
    el('p', { class: 'hint' }, B.hint),
    el('p', { id: 'sheetKeys', class: 'sr-only' }, B.keysHint),
    el('div', { class: 'sheet-paper' }, grid),
    panel));
  showPlay();
  d.onStart();
}
