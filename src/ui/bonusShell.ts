// 配色急救、名牌急救共用的加分關外框（T16）：上面是課程・作業名稱和一句提示，中間放遊戲，
// 下面是目前分數、跟著即時打勾的規則清單、「完成」；計分後換成分數、評語、這張委託的最高分、「再玩一次」「回委託板」。
// 設定圖急救（T9）有自己的畫面（sheetGame.ts），清單和結果長得一樣。
import { bonusGrade, type BonusGrade } from '../core/bonus';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';

export interface BonusRuleGroup {
  label: string;
  rules: readonly { id: string; label: string }[];
}

export interface BonusShellOptions {
  title: string;
  /** 課程・作業名稱 */
  work: string;
  /** 課程顏色：清單的勾勾、遊戲區的重點色 */
  color: string;
  hint: string;
  /** 遊戲區 */
  board: HTMLElement;
  groups: readonly BonusRuleGroup[];
  /** 清單下面的一行小字（門檻怎麼算） */
  note?: string;
  /** 「完成」「再玩一次」按鈕上的字 */
  finish: string;
  again: string;
  /** 結果的評語 */
  results: Readonly<Record<BonusGrade, string>>;
  /** 現在的分數和做到的規則 */
  score(): { score: number; passed: readonly string[] };
  /** 按「完成」：存最高分、記事件，回傳這張委託的最高分；丟錯代表沒存到 */
  save(): Promise<number>;
  /** 計分後鎖住遊戲區、再玩一次時打開 */
  lock(locked: boolean): void;
  /** 再玩一次：重新弄亂（記事件也在這裡） */
  restart(): void;
  onClosed(): void;
}

export interface BonusShell {
  /** 遊戲區有變：更新分數和清單，清掉訊息 */
  refresh(): void;
}

const B = COPY.bonus;

export function openBonusShell(o: BonusShellOptions): BonusShell {
  const total = el('div', { class: 'bonus-total', 'aria-live': 'polite' });
  const items = new Map<string, { item: HTMLLIElement; state: HTMLSpanElement }>();
  const rules = el('div', { class: 'bonus-rules' }, ...o.groups.map((g) => el('div', {},
    el('h3', {}, g.label),
    el('ul', {}, ...g.rules.map((r) => {
      const state = el('span', { class: 'sr-only' });
      const item = el('li', { class: 'bonus-rule' }, r.label, state);
      items.set(r.id, { item, state });
      return item;
    })))));
  const note = (): HTMLElement | null => (o.note ? el('p', { class: 'bonus-note' }, o.note) : null);
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const panel = el('div', { class: 'bonus-panel' });
  let busy = false;

  function refresh(): void {
    const { score, passed } = o.score();
    total.textContent = B.now(score);
    for (const [id, x] of items) {
      const ok = passed.includes(id);
      x.item.classList.toggle('is-ok', ok);
      x.state.textContent = `（${ok ? B.ruleDone : B.ruleTodo}）`;
    }
    msg.textContent = '';
  }

  /** 玩的時候：目前分數、清單、完成 */
  function showPlay(): void {
    const done = el('button', { type: 'button', class: 'primary' }, o.finish);
    on(done, 'click', () => { void finish(done); });
    const cancel = on(el('button', { type: 'button', class: 'secondary' }, B.cancel), 'click', () => dialog.close());
    panel.replaceChildren(...[total, rules, note(), msg, el('div', { class: 'form-actions' }, done, cancel)].filter((x) => x !== null));
  }

  /** 計完分：分數、評語、最高分，下面照樣看得到哪幾項做到了。滿分時主要按鈕是回委託板，不然是再玩一次 */
  function showResult(score: number, best: number): void {
    const grade = bonusGrade(score);
    const result = el('div', { class: 'bonus-result', role: 'status', tabindex: -1 },
      el('strong', { class: 'bonus-result-score' }, B.score(score)),
      el('p', {}, o.results[grade]),
      el('p', { class: 'card-note' }, B.best(best)));
    const perfect = grade === 'perfect';
    const again = on(el('button', { type: 'button', class: perfect ? 'secondary' : 'primary' }, o.again), 'click', restart);
    const back = on(el('button', { type: 'button', class: perfect ? 'primary' : 'secondary' }, B.back), 'click', () => dialog.close());
    const actions = el('div', { class: 'form-actions' }, ...(perfect ? [back, again] : [again, back]));
    panel.replaceChildren(...[result, actions, rules, note()].filter((x) => x !== null));
    result.focus();
  }

  async function finish(button: HTMLButtonElement): Promise<void> {
    if (busy) return;
    busy = true; button.disabled = true; button.textContent = B.finishing;
    const { score } = o.score();
    try {
      const best = await o.save();
      o.lock(true);
      showResult(score, best);
    } catch (err) {
      console.error('加分關分數沒存到', err);
      msg.textContent = B.saveFailed;
      button.disabled = false; button.textContent = o.finish;
    } finally {
      busy = false;
    }
  }

  function restart(): void {
    o.lock(false);
    o.restart();
    refresh();
    showPlay();
  }

  refresh();
  showPlay();
  const dialog = openDialog({ title: o.title, onClose: o.onClosed });
  dialog.body.replaceChildren(el('div', { class: 'bonus-game', style: `--c: ${o.color}` },
    el('p', { class: 'bonus-work' }, o.work),
    el('p', { class: 'hint' }, o.hint),
    o.board,
    panel));
  return { refresh };
}
