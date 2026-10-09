// 任務計時：蓋滿整個畫面，但中間是透明的，看得到主角在委託板前工作。
// 上面是委託和任務名稱、大數字倒數；下面是「休息一下／繼續任務」「提早完成」「再 5 分鐘」。
// 時間到：手機支援就震動一下，問「這個任務完成了嗎？」→「完成了」或「再 5 分鐘」。
import type { Actions } from '../core/actions';
import { courseInfo } from '../core/courses';
import { findLevel } from '../core/state';
import type { GuildStore } from '../core/store';
import { EXTEND_MINUTES, formatClock, remainingMs, timerPhase, type TimerPhase } from '../core/timer';
import type { Commission, Level } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openLayer } from './overlay';
import type { WakeLock } from './wakeLock';

export interface TimerDeps {
  store: GuildStore;
  actions: Actions;
  wakeLock: WakeLock;
  commissionId: string;
  levelId: string;
  /** 任務完成、計時畫面關掉之後呼叫（主角跳一下說話；T5 的設定卡點亮動畫也接在這裡） */
  onCompleted(commission: Commission, level: Level): void;
}

/** 多久更新一次倒數 */
const TICK_MS = 250;
const T = COPY.timer;

export function openTimer(d: TimerDeps): void {
  const { commissionId: cId, levelId: lId } = d;
  const course = el('span', { class: 't-course' });
  const title = el('h2', { class: 't-title', id: 'timerTitle', tabindex: -1 });
  const step = el('div', { class: 't-step' });
  const clock = el('div', { class: 't-clock', role: 'timer' });
  const status = el('div', { class: 't-status', 'aria-live': 'polite' });
  const ask = el('p', { class: 't-ask' }, T.askDone);
  const msg = el('p', { class: 'card-msg', role: 'status' });
  const button = (label: string, cls?: string): HTMLButtonElement => el('button', { type: 'button', class: cls }, label);
  const bPause = button(T.pause);
  const bResume = button(T.resume, 'primary');
  const bDone = button(T.done, 'primary');
  const bFinish = button(T.finishEarly);
  const bExtend = button(T.extend(EXTEND_MINUTES));
  const bLobby = button(T.backToLobby, 'ghost');
  const actionButtons = [bPause, bResume, bDone, bFinish, bExtend];

  const root = el('div', { class: 'timer-layer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'timerTitle' },
    el('section', { class: 'timer-top panel' }, el('div', { class: 't-head' }, course, bLobby), title, step, clock, status),
    el('section', { class: 'timer-bottom panel' }, ask, el('div', { class: 't-actions' }, ...actionButtons), msg),
  );

  let phase: TimerPhase | null = null;
  let busy = false;
  let tick = 0;
  const close = openLayer(root, {
    focus: title,
    onClose: () => { clearInterval(tick); d.wakeLock.set(false); },
  });

  /** 按鈕共用：處理中先停用、失敗就顯示一句話 */
  const run = (fn: () => Promise<unknown>) => async (): Promise<void> => {
    if (busy) return;
    busy = true; msg.textContent = ''; render();
    try {
      await fn();
    } catch (err) {
      console.error('任務操作失敗', err);
      msg.textContent = T.failed;
    } finally {
      busy = false; render();
    }
  };
  const finish = run(async () => {
    const changed = await d.actions.completeLevel(cId, lId);
    const { commission, level } = findLevel(d.store.state, cId, lId);
    close();
    if (changed) d.onCompleted(commission, level);
  });
  on(bPause, 'click', run(() => d.actions.pauseLevel(cId, lId)));
  on(bResume, 'click', run(() => d.actions.resumeLevel(cId, lId)));
  on(bExtend, 'click', run(() => d.actions.extendLevel(cId, lId)));
  on(bFinish, 'click', finish);
  on(bDone, 'click', finish);
  on(bLobby, 'click', close);

  function render(): void {
    let found: { commission: Commission; level: Level };
    try {
      found = findLevel(d.store.state, cId, lId);
    } catch {
      close();
      return;
    }
    const { commission, level } = found;
    const now = Date.now();
    const next = timerPhase(level, now);
    // 別的分頁已經完成了、或根本還沒開始：不用再顯示計時
    if (next === 'done' || next === 'idle') { close(); return; }
    // 看著畫面時剛好時間到：震一下（iPhone 不支援震動，就只有畫面變化）
    if (phase === 'running' && next === 'expired' && document.visibilityState === 'visible') navigator.vibrate?.([200, 100, 200]);
    phase = next;

    const timed = commission.levels.filter((l) => l.kind === 'timed');
    course.textContent = `${courseInfo(d.store.state, commission.course).label}・${commission.title}`;
    title.textContent = level.title;
    step.textContent = T.step(timed.indexOf(level) + 1, timed.length);
    clock.textContent = formatClock(remainingMs(level, now));
    status.textContent = next === 'paused' ? T.paused : next === 'expired' ? T.timeUp : '';
    root.dataset.phase = next;
    ask.hidden = next !== 'expired';
    bPause.hidden = next !== 'running';
    bResume.hidden = next !== 'paused';
    bDone.hidden = next !== 'expired';
    bFinish.hidden = next === 'expired';
    for (const b of actionButtons) b.disabled = busy;
    d.wakeLock.set(next === 'running');
  }

  tick = window.setInterval(render, TICK_MS);
  render();
}
