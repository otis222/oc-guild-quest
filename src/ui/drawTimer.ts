// 畫圖計時（企劃表 T17）：跟任務計時一樣蓋滿畫面、中間透明。上面是「畫圖時間」和大數字倒數，
// 下面是「休息一下／繼續畫圖」「提早結束」。時間到：手機支援就震一下，寫「畫圖時間用完了」，按「回大廳」。
// 「回大廳」只是收起來，時間照跑；從 OC 設定卡的「回到畫圖」回來。
import type { Actions } from '../core/actions';
import { drawPhase, drawRemainingMs, type DrawPhase } from '../core/drawTime';
import type { GuildStore } from '../core/store';
import { formatClock } from '../core/timer';
import { COPY } from './copy';
import { el, on } from './dom';
import { openLayer } from './overlay';
import type { WakeLock } from './wakeLock';

export interface DrawTimerDeps {
  store: GuildStore;
  actions: Actions;
  wakeLock: WakeLock;
  /** 計時畫面關掉之後（收起來、提早結束、時間到） */
  onClosed?(): void;
}

/** 多久更新一次倒數 */
const TICK_MS = 250;
const D = COPY.draw;

export function openDrawTimer(d: DrawTimerDeps): void {
  const title = el('h2', { class: 't-title', id: 'drawTitle', tabindex: -1 }, D.heading);
  const planned = el('div', { class: 't-step' });
  const clock = el('div', { class: 't-clock', role: 'timer' });
  const status = el('div', { class: 't-status', 'aria-live': 'polite' });
  const note = el('p', { class: 't-ask' }, D.timeUpNote);
  const msg = el('p', { class: 'card-msg', role: 'status' });
  const button = (label: string, cls?: string): HTMLButtonElement => el('button', { type: 'button', class: cls }, label);
  const bPause = button(D.pause);
  const bResume = button(D.resume, 'primary');
  const bEnd = button(D.finishEarly);
  const bDone = button(D.done, 'primary');
  const bLobby = button(COPY.timer.backToLobby, 'ghost');
  const actionButtons = [bPause, bResume, bEnd, bDone];

  const root = el('div', { class: 'timer-layer is-draw', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawTitle' },
    el('section', { class: 'timer-top panel' },
      el('div', { class: 't-head' }, el('span', { class: 't-course' }, D.title), bLobby), title, planned, clock, status),
    el('section', { class: 'timer-bottom panel' }, note, el('div', { class: 't-actions' }, ...actionButtons), msg),
  );

  let phase: DrawPhase | null = null;
  /** 看著畫面時時間到了：畫圖已經結束，畫面留著寫「用完了」，等玩家按回大廳 */
  let timeUp = false;
  let busy = false;
  let tick = 0;
  const close = openLayer(root, {
    focus: title,
    onClose: () => { clearInterval(tick); d.wakeLock.set(false); d.onClosed?.(); },
  });

  /** 按鈕共用：處理中先停用、失敗就顯示一句話 */
  const run = (fn: () => Promise<unknown>) => async (): Promise<void> => {
    if (busy) return;
    busy = true; msg.textContent = ''; render();
    try {
      await fn();
    } catch (err) {
      console.error('畫圖計時操作失敗', err);
      msg.textContent = D.failed;
    } finally {
      busy = false; render();
    }
  };
  on(bPause, 'click', run(() => d.actions.pauseDrawing()));
  on(bResume, 'click', run(() => d.actions.resumeDrawing()));
  on(bEnd, 'click', run(async () => { await d.actions.finishDrawing('early'); close(); }));
  on(bDone, 'click', close);
  on(bLobby, 'click', close);

  function render(): void {
    const session = d.store.state.drawing, now = Date.now();
    const next: DrawPhase | null = session ? drawPhase(session, now) : timeUp ? 'timeUp' : null;
    // 別的分頁結束了、或開始了任務（畫圖跟著結束）：不用再顯示
    if (!next) { close(); return; }
    if (next === 'timeUp' && !timeUp) {
      timeUp = true;
      // 看著畫面時剛好時間到：震一下（iPhone 不支援震動，就只有畫面變化）
      if (phase === 'running' && document.visibilityState === 'visible') navigator.vibrate?.([200, 100, 200]);
      d.actions.settleDrawing().catch((err: unknown) => console.warn('畫圖時間沒結束成功', err));
    }
    phase = next;
    if (session) planned.textContent = D.planned(session.plannedMs);
    clock.textContent = formatClock(session ? drawRemainingMs(session, now) : 0);
    status.textContent = next === 'paused' ? D.paused : next === 'timeUp' ? D.timeUp : '';
    root.dataset.phase = next === 'timeUp' ? 'expired' : next;
    note.hidden = next !== 'timeUp';
    bPause.hidden = next !== 'running';
    bResume.hidden = next !== 'paused';
    bEnd.hidden = next === 'timeUp';
    bDone.hidden = next !== 'timeUp';
    // 時間到時下面就有「回大廳」，上面那顆不用重複
    bLobby.hidden = next === 'timeUp';
    for (const b of actionButtons) b.disabled = busy;
    d.wakeLock.set(next === 'running');
  }

  tick = window.setInterval(render, TICK_MS);
  render();
}
