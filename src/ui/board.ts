// 委託板：進行中的委託、接新委託、完成的委託（摺疊）。
// 委託卡只寫學校作業：課程、作業名稱、截止倒數、進度、開始任務按鈕，不放其他說明文字。
// 委託單上可以新加一門課（取名字、選交件後解鎖什麼），接下委託時一起存。
import { allCourses, COURSE_NAME_MAX, courseInfo, type CourseInfo } from '../core/courses';
import {
  addLevel, canAddLevel, canMoveLevel, canRemoveLevel, COMMISSION_TITLE_MAX, draftProblem, LEVEL_TITLE_MAX, moveLevel,
  removeLevel, renameLevel, toCommissionDraft, type DraftForm, type NewCourseForm,
} from '../core/draft';
import { defaultDueAt, dueCountdown, fromDateTimeLocal, isOverdue, toDateTimeLocal } from '../core/due';
import {
  activeCommissions, completedCommissions, isSubmitted, nextLevel, timedProgress, type CommissionDraft, type LevelDraft,
} from '../core/state';
import type { GuildStore } from '../core/store';
import { CUSTOM_COURSE_LEVELS, LEVEL_MINUTES, levelsFrom, PART_LABELS, PARTS } from '../core/templates';
import type { Commission, Level } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';

export interface BoardDeps {
  store: GuildStore;
  /** 建立委託（存檔、記事件）；丟錯代表沒有存成功 */
  createCommission(draft: CommissionDraft): Promise<unknown>;
  /** 開始任務或回到正在做的任務（打開計時畫面，委託板會被換掉） */
  openTask(commissionId: string, levelId: string): void;
  /** 任務都做完了：打開交件畫面（委託板會被換掉） */
  openSubmit(commissionId: string): void;
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
    const card = (c: Commission): HTMLLIElement => commissionCard(c, courseInfo(s, c.course).label, now, deps);
    dialog.body.replaceChildren(
      on(el('button', { type: 'button', class: 'primary' }, T.newCommission), 'click', showForm),
      el('h3', { class: 'section-title' }, T.active(active.length)),
      active.length ? el('ul', { class: 'commissions' }, ...active.map(card)) : el('p', { class: 'empty' }, T.empty),
      el('details', { class: 'done' },
        el('summary', {}, T.done(done.length)),
        done.length ? el('ul', { class: 'commissions' }, ...done.map(card)) : null),
    );
  }

  function showForm(): void {
    view = 'form';
    dialog.setTitle(F.title);
    dialog.body.replaceChildren(commissionForm(deps.store, {
      async onSubmit(draft) {
        await deps.createCommission(draft);
        showList();
      },
      onCancel: showList,
    }));
  }
}

/** 委託卡右下角的按鈕：開始任務、回到任務；任務都做完了就是交件 */
function taskButton(c: Commission, next: Level, deps: BoardDeps): HTMLButtonElement {
  if (next.kind !== 'timed') return on(el('button', { type: 'button', class: 'c-start is-submit' }, T.submit), 'click', () => deps.openSubmit(c.id));
  const label = next.status === 'doing' ? T.resume : T.start(next.minutes);
  return on(el('button', { type: 'button', class: 'c-start' }, label), 'click', () => deps.openTask(c.id, next.id));
}

function commissionCard(c: Commission, course: string, now: number, deps: BoardDeps): HTMLLIElement {
  const { done, total } = timedProgress(c);
  const submitted = isSubmitted(c);
  const overdue = !submitted && isOverdue(c.dueAt, now);
  const next = nextLevel(c);
  const segs = el('span', { class: 'segs', 'aria-hidden': 'true' },
    ...Array.from({ length: total }, (_, i) => el('span', { class: i < done ? 'seg on' : 'seg' })));
  return el('li', { class: overdue ? 'commission is-overdue' : 'commission' },
    el('div', { class: 'c-row' },
      el('span', { class: 'c-course' }, course),
      el('span', { class: 'c-due' }, submitted ? T.submitted : dueCountdown(c.dueAt, now))),
    el('div', { class: 'c-title' }, c.title),
    el('div', { class: 'c-row' },
      el('span', { class: 'c-progress', 'aria-label': T.progress(done, total) }, segs, `${done}/${total}`),
      !submitted && next ? taskButton(c, next, deps) : null),
  );
}

interface FormHandlers {
  onSubmit(draft: CommissionDraft): Promise<void>;
  onCancel(): void;
}

type FocusPart = 'input' | 'up' | 'down' | 'remove';

function commissionForm(store: GuildStore, h: FormHandlers): HTMLFormElement {
  /** 選的課程：已經有的課程、這張委託單上新加的課程（'new'），或還沒選 */
  let picked: CourseInfo | 'new' | null = null;
  const newCourse: NewCourseForm = { label: '', part: null };
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

  // 新課程：課程名稱＋交件後解鎖什麼，選「＋ 新課程」才出現
  const nameInput = el('input', {
    id: 'cCourseName', type: 'text', maxlength: COURSE_NAME_MAX, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: F.courseNamePlaceholder(COURSE_NAME_MAX),
  });
  on(nameInput, 'input', () => { newCourse.label = nameInput.value; });
  const partButtons = PARTS.map((part) => {
    const radio = el('input', { type: 'radio', name: 'part', value: part, class: 'sr-only' });
    on(radio, 'change', () => { newCourse.part = part; msg.textContent = ''; });
    return el('label', { class: 'seg-btn' }, radio, PART_LABELS[part]);
  });
  const newCourseBox = el('div', { class: 'new-course', hidden: true },
    el('div', { class: 'field' }, el('label', { for: 'cCourseName' }, F.courseName), nameInput),
    el('div', { class: 'field' },
      el('span', { class: 'field-label', id: 'cPartLabel' }, F.coursePart),
      el('div', { class: 'seg-group', role: 'radiogroup', 'aria-labelledby': 'cPartLabel' }, ...partButtons)));

  /** 換課程：任務清單換成那門課的預設任務 */
  function pickCourse(next: CourseInfo | 'new'): void {
    picked = next;
    levels = levelsFrom(next === 'new' ? CUSTOM_COURSE_LEVELS : next.levels);
    newCourseBox.hidden = next !== 'new';
    msg.textContent = '';
    renderLevels();
    const blank = next === 'new' ? nameInput : titleInput;
    if (!blank.value.trim()) blank.focus();
  }
  const courseButton = (value: string, label: string, next: CourseInfo | 'new', cls = 'seg-btn'): HTMLLabelElement => {
    const radio = el('input', { type: 'radio', name: 'course', value, class: 'sr-only' });
    on(radio, 'change', () => pickCourse(next));
    return el('label', { class: cls }, radio, label);
  };
  const courseButtons = [
    ...allCourses(store.state).map((c) => courseButton(c.id, c.label, c)),
    courseButton('new', F.newCourse, 'new', 'seg-btn is-add'),
  ];

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
      el('div', { class: 'seg-group', role: 'radiogroup', 'aria-labelledby': 'cCourseLabel' }, ...courseButtons),
      newCourseBox),
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
    const f: DraftForm = {
      course: picked === 'new' ? newCourse : picked?.id ?? null,
      title: titleInput.value, dueAt: fromDateTimeLocal(dueInput.value), levels,
    };
    const problem = draftProblem(f, store.state);
    if (problem) { msg.textContent = F.problems[problem]; return; }
    busy = true; submit.disabled = true; submit.textContent = F.accepting;
    try {
      await h.onSubmit(toCommissionDraft(f, store.state));
    } catch (err) {
      console.error('建立委託失敗', err);
      msg.textContent = F.saveFailed;
      busy = false; submit.disabled = false; submit.textContent = F.accept;
    }
  });
  return form;
}
