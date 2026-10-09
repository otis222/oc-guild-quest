import { describe, expect, it } from 'vitest';
import { buildOcCard, cellProgress, monthDay, RESULT_SHARE } from '../../src/core/ocCard';
import { addCommission, completeLevel, createGuildState } from '../../src/core/state';
import { templateLevels } from '../../src/core/templates';
import type { CourseType, GuildState } from '../../src/core/types';

const OC = { name: '小鈴', sprite: 'maid_1.png' };
const add = (s: GuildState, course: CourseType, id: string, at: number): GuildState =>
  addCommission(s, { course, title: id, dueAt: 9e12, levels: templateLevels(course) }, at, id);
const finish = (s: GuildState, id: string, n: number): GuildState => {
  let next = s;
  const levels = s.commissions.find((c) => c.id === id)!.levels.filter((l) => l.kind === 'timed');
  for (const l of levels.slice(0, n)) next = completeLevel(next, id, l.id, 5000);
  return next;
};
const section = (s: GuildState, course: CourseType) => buildOcCard(s).sections.find((x) => x.course === course)!;

describe('OC 設定卡', () => {
  it('還沒有委託：4 區 × 3 格都是空的，完成度 0', () => {
    const card = buildOcCard(createGuildState(OC, 1));
    expect(card.sections.map((x) => x.course)).toEqual(['typography', 'color', 'composition', 'drawing']);
    expect(card.sections.every((x) => x.cells.length === 3 && x.cells.every((c) => c.commission === null))).toBe(true);
    expect(card.completion).toBe(0);
  });

  it('進行中的委託：那一格依完成的任務數亮起對應片數', () => {
    let s = add(createGuildState(OC, 1), 'color', 'c1', 10);
    s = finish(s, 'c1', 2);
    const cell = section(s, 'color').cells[0];
    expect(cell.commission?.id).toBe('c1');
    expect(cell.slices).toHaveLength(5);
    expect(cell.slices.map((x) => x.lit)).toEqual([true, true, false, false, false]);
    expect(cell.lit).toBe(2);
    expect(cell.submitted).toBe(false);
  });

  it('每張委託佔自己的格子：同課程第 1、2、3 張分別在第 1、2、3 格', () => {
    let s = createGuildState(OC, 1);
    s = add(s, 'drawing', 'd1', 10);
    s = add(s, 'drawing', 'd2', 20);
    s = add(s, 'drawing', 'd3', 30);
    expect(section(s, 'drawing').cells.map((c) => c.commission?.id)).toEqual(['d1', 'd2', 'd3']);
    expect(section(s, 'color').cells.every((c) => c.commission === null)).toBe(true);
  });

  it('第 4 張同課程委託回到第 1 格，原本的收進歷史', () => {
    let s = createGuildState(OC, 1);
    for (const [id, at] of [['d1', 10], ['d2', 20], ['d3', 30], ['d4', 40]] as const) s = add(s, 'drawing', id, at);
    const sec = section(s, 'drawing');
    expect(sec.cells.map((c) => c.commission?.id)).toEqual(['d4', 'd2', 'd3']);
    expect(sec.history.map((c) => c.id)).toEqual(['d1']);
  });

  it('交件後那一格整格點亮', () => {
    let s = add(createGuildState(OC, 1), 'typography', 't1', 10);
    s = { ...s, commissions: s.commissions.map((c) => ({ ...c, submittedAt: 99 })) };
    const cell = section(s, 'typography').cells[0];
    expect(cell.submitted).toBe(true);
    expect(cellProgress(cell)).toBe(1);
  });

  it('完成度：12 格平均；一格的任務占 5/6、交件占 1/6', () => {
    let s = add(createGuildState(OC, 1), 'color', 'c1', 10);
    s = finish(s, 'c1', 5);
    const card = buildOcCard(s);
    expect(cellProgress(card.sections[1].cells[0])).toBeCloseTo(1 - RESULT_SHARE);
    expect(card.completion).toBeCloseTo((1 - RESULT_SHARE) / 12);
  });

  it('任務數被改過（例如 3 個）：就切成 3 片', () => {
    const s = addCommission(createGuildState(OC, 1), {
      course: 'color', title: '短作業', dueAt: 9e12,
      levels: [...templateLevels('color').slice(0, 3), templateLevels('color')[5]],
    }, 10, 'c1');
    expect(section(s, 'color').cells[0].slices).toHaveLength(3);
  });

  it('日期顯示成 月/日', () => {
    expect(monthDay(new Date(2026, 9, 12, 21, 30).getTime())).toBe('10/12');
    expect(monthDay(new Date(2026, 0, 5).getTime())).toBe('1/5');
  });
});
