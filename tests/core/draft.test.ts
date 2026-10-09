import { describe, expect, it } from 'vitest';
import { addCustomCourse } from '../../src/core/courses';
import {
  addLevel, canAddLevel, canMoveLevel, canRemoveLevel, draftProblem, MAX_TIMED_LEVELS, moveLevel, removeLevel, renameLevel,
  toCommissionDraft, type DraftForm,
} from '../../src/core/draft';
import { createGuildState } from '../../src/core/state';
import { templateLevels } from '../../src/core/templates';

const titles = (levels: { title: string }[]): string[] => levels.map((l) => l.title);
const base = templateLevels('drawing'); // 熱身線條／抓大形／修比例／明暗／細節／交件

describe('改關卡清單', () => {
  it('改名只改那一關，交件關不能改名', () => {
    expect(titles(renameLevel(base, 1, '抓輪廓'))).toEqual(['熱身線條', '抓輪廓', '修比例', '明暗', '細節', '交件']);
    expect(titles(renameLevel(base, 5, '別的'))).toEqual(titles(base));
  });

  it('刪除計時關卡；交件關不能刪；至少留一個計時關卡', () => {
    expect(titles(removeLevel(base, 0))).toEqual(['抓大形', '修比例', '明暗', '細節', '交件']);
    expect(canRemoveLevel(base, 5)).toBe(false);
    expect(removeLevel(base, 5)).toEqual(base);
    let one = base;
    for (let i = 0; i < 4; i++) one = removeLevel(one, 0);
    expect(titles(one)).toEqual(['細節', '交件']);
    expect(canRemoveLevel(one, 0)).toBe(false);
    expect(removeLevel(one, 0)).toEqual(one);
  });

  it('上移下移只在計時關卡之間，不能越過交件關', () => {
    expect(titles(moveLevel(base, 1, -1))).toEqual(['抓大形', '熱身線條', '修比例', '明暗', '細節', '交件']);
    expect(titles(moveLevel(base, 3, 1))).toEqual(['熱身線條', '抓大形', '修比例', '細節', '明暗', '交件']);
    expect(canMoveLevel(base, 0, -1)).toBe(false);
    expect(canMoveLevel(base, 4, 1)).toBe(false);
    expect(canMoveLevel(base, 5, -1)).toBe(false);
    expect(moveLevel(base, 4, 1)).toEqual(base);
  });

  it(`新增的關卡插在交件關前面，最多 ${MAX_TIMED_LEVELS} 個計時關卡`, () => {
    const added = addLevel(base, '上墨');
    expect(titles(added)).toEqual(['熱身線條', '抓大形', '修比例', '明暗', '細節', '上墨', '交件']);
    expect(added[5]).toEqual({ title: '上墨', minutes: 10, kind: 'timed' });
    let many = base;
    while (canAddLevel(many)) many = addLevel(many);
    expect(many.filter((l) => l.kind === 'timed')).toHaveLength(MAX_TIMED_LEVELS);
    expect(addLevel(many)).toEqual(many);
    expect(many[many.length - 1].kind).toBe('submit');
  });

  it('不會改到原本的陣列', () => {
    const before = JSON.stringify(base);
    renameLevel(base, 0, 'x'); removeLevel(base, 0); moveLevel(base, 0, 1); addLevel(base, 'y');
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('送出前檢查', () => {
  const ok: DraftForm = { course: 'drawing', title: '人體速寫', dueAt: 1000, levels: base };
  const s = addCustomCourse(createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1), { label: '攝影', part: 'layout' }, 5, 'p1').state;

  it('依序指出缺的東西：課程 → 作業名稱 → 期限 → 任務名稱', () => {
    expect(draftProblem({ ...ok, course: null, title: '' }, s)).toBe('course');
    expect(draftProblem({ ...ok, title: '   ' }, s)).toBe('title');
    expect(draftProblem({ ...ok, dueAt: NaN }, s)).toBe('due');
    expect(draftProblem({ ...ok, levels: renameLevel(base, 2, '  ') }, s)).toBe('taskTitle');
    expect(draftProblem(ok, s)).toBeNull();
    expect(draftProblem({ ...ok, course: 'custom:p1' }, s)).toBeNull();
  });

  it('新課程：名稱 → 跟已經有的課程同名 → 部位，都填好才能送出', () => {
    const fresh = (label: string, part: 'sketch' | null = 'sketch'): DraftForm => ({ ...ok, course: { label, part }, title: '' });
    expect(draftProblem(fresh('  '), s)).toBe('courseName');
    expect(draftProblem(fresh(' 攝影 '), s)).toBe('courseTaken');
    expect(draftProblem(fresh('色彩學'), s)).toBe('courseTaken');
    expect(draftProblem(fresh('動畫', null), s)).toBe('coursePart');
    expect(draftProblem(fresh('動畫'), s)).toBe('title');
    expect(draftProblem({ ...fresh('動畫'), title: '角色走路' }, s)).toBeNull();
  });

  it('整理成草稿：去掉多餘空白', () => {
    const d = toCommissionDraft({ ...ok, title: '  人體   速寫 ', levels: renameLevel(base, 0, ' 熱身  線條 ') }, s);
    expect(d.title).toBe('人體 速寫');
    expect(d.levels[0].title).toBe('熱身 線條');
    expect(d.levels).toHaveLength(6);
    expect(d.course).toBe('drawing');
  });

  it('新課程的草稿帶著整理好的課程名稱和部位', () => {
    const d = toCommissionDraft({ ...ok, course: { label: '  角色   動畫 ', part: 'sketch' } }, s);
    expect(d.course).toEqual({ label: '角色 動畫', part: 'sketch' });
  });

  it('有問題就丟錯', () => {
    expect(() => toCommissionDraft({ ...ok, title: '' }, s)).toThrow('title');
    expect(() => toCommissionDraft({ ...ok, course: { label: '動畫', part: null } }, s)).toThrow('coursePart');
  });
});
