import { describe, expect, it } from 'vitest';
import {
  activeCommissions, addCommission, completedCommissions, completeLevel, createGuildState, isSubmitted, loadState, migrate,
  nextLevel, saveState, STATE_VERSION, timedProgress, updateState, type CommissionDraft,
} from '../../src/core/state';
import { STATE_KEY } from '../../src/core/storage';
import type { CourseType, GuildState } from '../../src/core/types';
import { memoryKV } from '../helpers/memoryKV';

const OC = { name: '小鈴', sprite: 'maid_1.png' };

const draft = (course: CourseType = 'color', title = '色相環'): CommissionDraft => ({
  course, title, dueAt: Date.UTC(2026, 9, 16, 15, 59),
  levels: [
    ...['讀要求選主題', '3 組配色草稿', '上色（一）', '上色（二）', '檢查明度對比']
      .map((t) => ({ title: t, minutes: 10, kind: 'timed' as const })),
    { title: '交件', minutes: 0, kind: 'submit' },
  ],
});

describe('建立狀態', () => {
  it('新存檔：目前版本、公會等級 1、沒有委託、展品和自訂課程', () => {
    expect(createGuildState(OC, 123)).toStrictEqual({
      version: STATE_VERSION, createdAt: 123, oc: OC, commissions: [], guildLevel: 1, exhibits: [], customCourses: [],
    });
  });
});

describe('接委託', () => {
  it('產生 5 個計時關卡＋1 個交件關，全部是 todo', () => {
    const s = addCommission(createGuildState(OC, 1), draft(), 1000, 'c1');
    const c = s.commissions[0];
    expect(c).toMatchObject({ id: 'c1', course: 'color', title: '色相環', createdAt: 1000, cellIndex: 0 });
    expect(c.levels.map((l) => [l.title, l.kind, l.minutes, l.status, l.pausedMs, l.focusMs])).toEqual([
      ['讀要求選主題', 'timed', 10, 'todo', 0, 0],
      ['3 組配色草稿', 'timed', 10, 'todo', 0, 0],
      ['上色（一）', 'timed', 10, 'todo', 0, 0],
      ['上色（二）', 'timed', 10, 'todo', 0, 0],
      ['檢查明度對比', 'timed', 10, 'todo', 0, 0],
      ['交件', 'submit', 0, 'todo', 0, 0],
    ]);
    expect(new Set(c.levels.map((l) => l.id)).size).toBe(6);
  });

  it('不會改到原本的狀態', () => {
    const s0 = createGuildState(OC, 1);
    const s1 = addCommission(s0, draft());
    expect(s0.commissions).toHaveLength(0);
    expect(s1.commissions).toHaveLength(1);
  });

  it('同課程依序佔第 0、1、2 格，第 4 張回到第 0 格；不同課程各自算', () => {
    let s = createGuildState(OC, 1);
    for (const course of ['color', 'color', 'typography', 'color', 'color'] as const) s = addCommission(s, draft(course));
    expect(s.commissions.map((c) => [c.course, c.cellIndex])).toEqual([
      ['color', 0], ['color', 1], ['typography', 0], ['color', 2], ['color', 0],
    ]);
  });

  it('委託單上新加的課程跟委託一起建立；之後用課程 id 接，格子接著算', () => {
    const s1 = addCommission(createGuildState(OC, 1), { ...draft(), course: { label: '攝影', part: 'layout' } }, 1000, 'c1');
    expect(s1.customCourses).toHaveLength(1);
    const { id } = s1.customCourses[0];
    expect(id).toMatch(/^custom:/);
    expect(s1.commissions[0]).toMatchObject({ course: id, cellIndex: 0 });
    const s2 = addCommission(s1, { ...draft(), course: id }, 2000, 'c2');
    expect(s2.customCourses).toHaveLength(1);
    expect(s2.commissions[1]).toMatchObject({ course: id, cellIndex: 1 });
  });
});

describe('完成關卡', () => {
  const base = addCommission(createGuildState(OC, 1), draft(), 1000, 'c1');
  const [l0, l1] = base.commissions[0].levels;

  it('那一關變成 done 並記下時間，其他關不變', () => {
    const s = completeLevel(base, 'c1', l0.id, 5000);
    expect(s.commissions[0].levels[0]).toMatchObject({ status: 'done', doneAt: 5000 });
    expect(s.commissions[0].levels.slice(1)).toStrictEqual(base.commissions[0].levels.slice(1));
    expect(base.commissions[0].levels[0].status).toBe('todo');
  });

  it('同一關完成兩次只算一次', () => {
    const once = completeLevel(base, 'c1', l1.id, 5000);
    const twice = completeLevel(once, 'c1', l1.id, 9000);
    expect(twice).toBe(once);
    expect(twice.commissions[0].levels[1].doneAt).toBe(5000);
  });

  it('找不到委託或關卡、或拿交件關來完成，會丟錯', () => {
    const submit = base.commissions[0].levels[5];
    expect(() => completeLevel(base, 'nope', l0.id)).toThrow();
    expect(() => completeLevel(base, 'c1', 'nope')).toThrow();
    expect(() => completeLevel(base, 'c1', submit.id)).toThrow();
  });
});

describe('查詢', () => {
  it('進度：計時關卡完成幾個／總共幾個（交件關不算）', () => {
    let s = addCommission(createGuildState(OC, 1), draft(), 2, 'c1');
    expect(timedProgress(s.commissions[0])).toEqual({ done: 0, total: 5 });
    s = completeLevel(s, 'c1', s.commissions[0].levels[0].id, 3);
    s = completeLevel(s, 'c1', s.commissions[0].levels[2].id, 4);
    expect(timedProgress(s.commissions[0])).toEqual({ done: 2, total: 5 });
    expect(nextLevel(s.commissions[0])?.title).toBe('3 組配色草稿');
  });

  it('進行中照截止時間排（逾期的也在），已完成照交件時間新到舊', () => {
    let s = createGuildState(OC, 1);
    s = addCommission(s, { ...draft(), dueAt: 300 }, 1, 'late');
    s = addCommission(s, { ...draft(), dueAt: 100 }, 1, 'overdue');
    s = addCommission(s, { ...draft(), dueAt: 200 }, 1, 'soon');
    s = addCommission(s, { ...draft(), dueAt: 50 }, 1, 'done-a');
    s = addCommission(s, { ...draft(), dueAt: 60 }, 1, 'done-b');
    s = { ...s, commissions: s.commissions.map((c) => (c.id === 'done-a' ? { ...c, submittedAt: 10 } : c.id === 'done-b' ? { ...c, submittedAt: 20 } : c)) };
    expect(activeCommissions(s).map((c) => c.id)).toEqual(['overdue', 'soon', 'late']);
    expect(completedCommissions(s).map((c) => c.id)).toEqual(['done-b', 'done-a']);
    expect(isSubmitted(s.commissions[3])).toBe(true);
  });
});

describe('存檔與讀檔', () => {
  it('還沒存過就是 null', async () => {
    expect(await loadState(memoryKV())).toBeNull();
  });

  it('建立委託、完成關卡、存檔後重新讀取，資料一致', async () => {
    const kv = memoryKV();
    let s = createGuildState(OC, 1000);
    s = addCommission(s, draft(), 2000, 'c1');
    s = addCommission(s, draft('typography', '字體海報'), 3000, 'c2');
    s = completeLevel(s, 'c1', s.commissions[0].levels[0].id, 4000);
    s = completeLevel(s, 'c1', s.commissions[0].levels[1].id, 5000);
    await saveState(kv, s);

    const loaded = await loadState(kv);
    expect(loaded).toStrictEqual(s);
    expect(loaded).not.toBe(s);
  });

  it('用 updateState 一步一步存，結果跟直接算的一樣', async () => {
    const kv = memoryKV();
    await saveState(kv, createGuildState(OC, 1000));
    const s1 = await updateState(kv, (s) => addCommission(s, draft(), 2000, 'c1'));
    const levelId = s1.commissions[0].levels[0].id;
    const s2 = await updateState(kv, (s) => completeLevel(s, 'c1', levelId, 3000));

    expect(await loadState(kv)).toStrictEqual(s2);
    expect(s2.commissions[0].levels[0]).toMatchObject({ status: 'done', doneAt: 3000 });
  });

  it('兩個分頁拿著舊資料各自操作，兩邊的修改都會留下來', async () => {
    const kv = memoryKV();
    await saveState(kv, createGuildState(OC, 1000));
    // 分頁 A、B 同時打開，各自接一張委託
    await Promise.all([
      updateState(kv, (s) => addCommission(s, draft('color', 'A 的作業'), 2000, 'a')),
      updateState(kv, (s) => addCommission(s, draft('drawing', 'B 的作業'), 2000, 'b')),
    ]);
    expect((await loadState(kv))?.commissions.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('還沒有存檔就 updateState 會丟錯，也不會寫入任何東西', async () => {
    const kv = memoryKV();
    await expect(updateState(kv, (s) => s)).rejects.toThrow();
    expect(kv.raw.has(STATE_KEY)).toBe(false);
  });

  it('操作丟錯時，存檔維持原樣', async () => {
    const kv = memoryKV();
    const s0 = addCommission(createGuildState(OC, 1), draft(), 2, 'c1');
    await saveState(kv, s0);
    await expect(updateState(kv, (s) => completeLevel(s, 'c1', 'nope'))).rejects.toThrow();
    expect(await loadState(kv)).toStrictEqual(s0);
  });
});

describe('版本與 migration', () => {
  const current = (): GuildState => createGuildState(OC, 1);

  it('目前版本直接通過', () => {
    expect(migrate(current())).toStrictEqual(current());
  });

  it('不是存檔、沒有版本號、缺欄位，都會丟錯', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('state')).toThrow();
    expect(() => migrate({ ...current(), version: undefined })).toThrow();
    expect(() => migrate({ ...current(), oc: { name: '小鈴' } })).toThrow();
    expect(() => migrate({ ...current(), commissions: undefined })).toThrow();
    expect(() => migrate({ ...current(), customCourses: undefined })).toThrow();
  });

  it('比程式新的存檔不會被讀進來（避免被舊程式蓋掉）', () => {
    expect(() => migrate({ ...current(), version: STATE_VERSION + 1 })).toThrow(/比程式/);
  });

  it('第 1 版的存檔（還沒有自訂課程）升到第 2 版，委託原樣保留', () => {
    const withWork = addCommission(current(), draft(), 1000, 'c1');
    const v1: Record<string, unknown> = { ...withWork, version: 1 };
    delete v1.customCourses;
    const upgraded = migrate(v1);
    expect(upgraded).toStrictEqual(withWork);
    expect(upgraded.version).toBe(2);
  });

  it('舊版存檔會一版一版升上來', () => {
    const v0: Record<string, unknown> = { ...current(), version: 0 };
    delete v0.exhibits;
    delete v0.customCourses;
    const upgraded = migrate(v0, {
      0: (old) => ({ ...old, version: 1, exhibits: [] }),
      1: (old) => ({ ...old, version: 2, customCourses: [] }),
    });
    expect(upgraded).toStrictEqual(current());
  });

  it('缺升級方式、或升級後版本號沒有往上加，會丟錯而不是卡住', () => {
    expect(() => migrate({ ...current(), version: 0 })).toThrow(/升級方式/);
    expect(() => migrate({ ...current(), version: 0 }, { 0: (old) => old })).toThrow(/往上加/);
  });
});
