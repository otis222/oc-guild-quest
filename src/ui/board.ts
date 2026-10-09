// 委託板：進行中的委託、接新委託、完成的委託（摺疊）。
// 委託卡只寫學校作業：課程、作業名稱、截止倒數、進度、開始任務按鈕，不放其他說明文字。
import {
  addLevel, canAddLevel, canMoveLevel, canRemoveLevel, COMMISSION_TITLE_MAX, draftProblem, LEVEL_TITLE_MAX, moveLevel,
  removeLevel, renameLevel, toCommissionDraft,
} from '../core/draft';
import { defaultDueAt, dueCountdown, fromDateTimeLocal, isOverdue, toDateTimeLocal } from '../core/due';
import {
  activeCommissions, completedCommissions, isSubmitted, nextLevel, timedProgress, type CommissionDraft, type LevelDraft,
} from '../core/state';
import type { GuildStore } from '../core/store';
import { COURSE_TEMPLATES, courseLabel, LEVEL_MINUTES, templateLevels } from '../core/templates';
import type { Commission, CourseType, Level } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';

export interface BoardDeps {
  store: GuildStore;
  /** 建立委託（存檔、記事件）；丟錯代表沒有存成功 */
  createCommission(draft: CommissionDraft): Promise<unknown>;
  /** 開始任務或回到正在做的任務（打開計時畫面，委託板會被換掉） */
  openTask(commissionId: string, levelId: string): void;
}

/** 開著的時候多久更新一次倒數 */
const REFRESH_MS = 30_000;
const T = COPY.board;
const F = COPY.form;

export function openBoard(deps: BoardDeps): void {
  let view: 'list' | 'form' = 'list';
  const timer = setInterval(() => { if (view === 'list') showList(); }, REFRESH_MS);
  const unsubscribe = deps.store.subscribe(() => { if (view === 'list') showList(); });
  const dialog = openDialog({ title: T.title, onClose: () => { clearInterval(timer); unsubscribe(); } });
  showList();

  function showList(): void {
    view = 'list';
    dialog.setTitle(T.title);
    const s = deps.store.state, now = Date.now();
    const active = activeCommissions(s), done = completedCommissions(s);
    dialog.body.replaceChildren(
      on(el('button', { type: 'button', class: 'primary' }, T.newCommission), 'click', showForm),
      el('h3', { class: 'section-title' }, T.active(active.length)),
      active.length
        ? el('ul', { class: 'commissions' }, ...active.map((c) => commissionCard(c, now, deps.openTask)))
        : el('p', { class: 'empty' }, T.empty),
      el('details', { class: 'done' },
        el('summary', {}, T.done(done.length)),
        done.length ? el('ul', { class: 'commissions' }, ...done.map((c) => commissionCard(c, now, deps.openTask))) : null),
    );
  }

  function showForm(): void {
    view = 'form';
    dialog.setTitle(F.title);
    dialog.body.replaceChildren(commissionForm({
      async onSubmit(draft) {
        await deps.createCommission(draft);
        showList();
      },
      onCancel: showList,
    }));
  }
}

/** 委託卡右下角的按鈕：開始任務、回到任務；交件在 T6 才有作用，先停用 */
function taskButton(c: Commission, next: Level, openTask: BoardDeps['openTask']): HTMLButtonElement {
  if (next.kind !== 'timed') return el('button', { type: 'button', class: 'c-start', disabled: true }, T.submit);
  const label = next.status === 'doing' ? T.resume : T.start(next.minutes);
  return on(el('button', { type: 'button', class: 'c-start' }, label), 'click', () => openTask(c.id, next.id));
}

function commissionCard(c: Commission, now: number, openTask: BoardDeps['openTask']): HTMLLIElement {
  const { done, total } = timedProgress(c);
  const submitted = isSubmitted(c);
  const overdue = !submitted && isOverdue(c.dueAt, now);
  const next = nextLevel(c);
  const segs = el('span', { class: 'segs', 'aria-hidden': 'true' },
    ...Array.from({ length: total }, (_, i) => el('span', { class: i < done ? 'seg on' : 'seg' })));
  return el('li', { class: overdue ? 'commission is-overdue' : 'commission' },
    el('div', { class: 'c-row' },
      el('span', { class: 'c-course' }, courseLabel(c.course)),
      el('span', { class: 'c-due' }, submitted ? T.submitted : dueCountdown(c.dueAt, now))),
    el('div', { class: 'c-title' }, c.title),
    el('div', { class: 'c-row' },
      el('span', { class: 'c-progress', 'aria-label': T.progress(done, total) }, segs, `${done}/${total}`),
      !submitted && next ? taskButton(c, next, openTask) : null),
  );
}

interface FormHandlers {
  onSubmit(draft: CommissionDraft): Promise<void>;
  onCancel(): void;
}

type FocusPart = 'input' | 'up' | 'down' | 'remove';

function commissionForm(h: FormHandlers): HTMLFormElement {
  let course: CourseType | null = null;
  let levels: LevelDraft[] = [];
  let busy = false;

  const titleInput = el('input', {
    id: 'cTitle', type: 'text', maxlength: COMMISSION_TITLE_MAX, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: F.workPlaceholder(COMMISSION_TITLE_MAX),
  });
  const dueInput = el('input', { id: 'cDue', type: 'datetime-local', value: toDateTimeLocal(defaultDueAt(Date.now())) });
  const levelBox = el('div', { class: 'levels' });
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { type: 'submit', class: 'primary' }, F.accept);

  const courseButtons = COURSE_TEMPLATES.map((t) => {
    const radio = el('input', { type: 'radio', name: 'course', value: t.course, class: 'sr-only' });
    on(radio, 'change', () => {
      course = t.course;
      levels = templateLevels(t.course);
      msg.textContent = '';
      renderLevels();
      if (!titleInput.value.trim()) titleInput.focus();
    });
    return el('label', { class: 'seg-btn' }, radio, t.label);
  });

  function renderLevels(focus?: { index: number; part: FocusPart }): void {
    if (!levels.length) {
      levelBox.replaceChildren(el('p', { class: 'hint' }, F.tasksHint));
      return;
    }
    const focusable = new Map<string, HTMLInputElement | HTMLButtonElement>();
    let n = 0;
    const rows = levels.map((l, i) => {
      if (l.kind === 'submit') {
        return el('li', { class: 'level is-submit' },
          el('span', { class: 'level-no' }, '★'), el('span', { class: 'level-fixed' }, l.title), el('span', { class: 'level-note' }, F.finalStep));
      }
      n++;
      const input = el('input', {
        type: 'text', value: l.title, maxlength: LEVEL_TITLE_MAX, 'aria-label': F.taskAria(n), enterkeyhint: 'done', placeholder: F.taskPlaceholder,
      });
      on(input, 'input', () => { levels = renameLevel(levels, i, input.value); });
      const button = (label: string, aria: string, enabled: boolean, onClick: () => void): HTMLButtonElement =>
        on(el('button', { type: 'button', class: 'icon-btn', 'aria-label': aria, disabled: !enabled }, label), 'click', onClick);
      const up = button('↑', F.moveUp(n), canMoveLevel(levels, i, -1), () => {
        levels = moveLevel(levels, i, -1);
        renderLevels({ index: i - 1, part: 'up' });
      });
      const down = button('↓', F.moveDown(n), canMoveLevel(levels, i, 1), () => {
        levels = moveLevel(levels, i, 1);
        renderLevels({ index: i + 1, part: 'down' });
      });
      const remove = button('✕', F.remove(n), canRemoveLevel(levels, i), () => {
        levels = removeLevel(levels, i);
        renderLevels({ index: i, part: 'remove' });
      });
      focusable.set(`${i}:input`, input).set(`${i}:up`, up).set(`${i}:down`, down).set(`${i}:remove`, remove);
      return el('li', { class: 'level' }, el('span', { class: 'level-no' }, String(n)), input, up, down, remove);
    });
    const add = on(el('button', { type: 'button', class: 'secondary', disabled: !canAddLevel(levels) }, F.addTask), 'click', () => {
      levels = addLevel(levels);
      renderLevels({ index: levels.length - 2, part: 'input' });
    });
    levelBox.replaceChildren(el('ol', { class: 'level-list' }, ...rows), add);

    if (focus) {
      // 移動、刪除後焦點留在差不多的位置；按鈕變停用時改到同一列的其他按鈕，再不行就到「加一個任務」
      const keys = [focus.part, 'up', 'down', 'input'].map((p) => `${focus.index}:${p}`);
      const target = keys.map((k) => focusable.get(k)).find((e) => e && !e.disabled) ?? add;
      target.focus();
    }
  }
  renderLevels();

  const form = el('form', { class: 'commission-form', novalidate: true },
    el('div', { class: 'field' },
      el('span', { class: 'field-label', id: 'cCourseLabel' }, F.course),
      el('div', { class: 'seg-group', role: 'radiogroup', 'aria-labelledby': 'cCourseLabel' }, ...courseButtons)),
    el('div', { class: 'field' }, el('label', { for: 'cTitle' }, F.workTitle), titleInput),
    el('div', { class: 'field' }, el('label', { for: 'cDue' }, F.due), dueInput),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, F.tasks(LEVEL_MINUTES)), levelBox),
    msg,
    el('div', { class: 'form-actions' }, submit, on(el('button', { type: 'button', class: 'secondary' }, F.cancel), 'click', () => h.onCancel())),
  );

  // 手機鍵盤的「完成」會送出 Enter：在輸入框按 Enter 只收鍵盤，不要直接接下委託
  on(form, 'keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); e.target.blur(); }
  });

  on(form, 'submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const f = { course, title: titleInput.value, dueAt: fromDateTimeLocal(dueInput.value), levels };
    const problem = draftProblem(f);
    if (problem) { msg.textContent = F.problems[problem]; return; }
    busy = true; submit.disabled = true; submit.textContent = F.accepting;
    try {
      await h.onSubmit(toCommissionDraft(f));
    } catch (err) {
      console.error('建立委託失敗', err);
      msg.textContent = F.saveFailed;
      busy = false; submit.disabled = false; submit.textContent = F.accept;
    }
  });
  return form;
}
