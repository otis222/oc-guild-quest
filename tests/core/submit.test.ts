import { describe, expect, it } from 'vitest';
import { addCommission, createGuildState, isSubmitted } from '../../src/core/state';
import {
  commissionOfPhoto, EXHIBIT_SLOTS, guildLevelOf, nextExhibitSlot, partSources, submitCommission,
} from '../../src/core/submit';
import { templateLevels } from '../../src/core/templates';
import type { CourseType, GuildState } from '../../src/core/types';

const OC = { name: '小鈴', sprite: 'maid_1.png' };
const add = (s: GuildState, course: CourseType, id: string): GuildState =>
  addCommission(s, { course, title: id, dueAt: 9e12, levels: templateLevels(course) }, 10, id);
const PALETTE = ['#f7f4ee', '#e5484d', '#2bb3a3'];

describe('交件', () => {
  it('委託標成已交件，交件關打勾，記下照片', () => {
    const s = submitCommission(add(createGuildState(OC, 1), 'drawing', 'd1'), 'd1', { photoId: 'p1' }, 500);
    const c = s.commissions[0];
    expect(isSubmitted(c)).toBe(true);
    expect(c).toMatchObject({ submittedAt: 500, photoId: 'p1' });
    expect(c.levels.at(-1)).toMatchObject({ kind: 'submit', status: 'done', doneAt: 500 });
    expect(c.levels.slice(0, -1).every((l) => l.status === 'todo')).toBe(true);
  });

  it('依部位變成 OC 的部件：配色、名牌、版面、草稿', () => {
    let s = createGuildState(OC, 1);
    for (const course of ['color', 'typography', 'composition', 'drawing'] as const) s = add(s, course, course);
    s = submitCommission(s, 'color', { photoId: 'pc', palette: PALETTE });
    s = submitCommission(s, 'typography', { photoId: 'pt', nameplatePhotoId: 'np' });
    s = submitCommission(s, 'composition', { photoId: 'pl' });
    s = submitCommission(s, 'drawing', { photoId: 'ps' });
    expect(s.oc).toEqual({ ...OC, palette: PALETTE, nameplatePhotoId: 'np', layoutPhotoId: 'pl', sketchPhotoId: 'ps' });
    expect(s.commissions[0].palette).toEqual(PALETTE);
    expect(s.commissions[1].nameplatePhotoId).toBe('np');
  });

  it('自訂課程照它選的部位：選了配色就換掉 OC 的配色', () => {
    const s0 = addCommission(createGuildState(OC, 1),
      { course: { label: '攝影', part: 'palette' }, title: '光影練習', dueAt: 9e12, levels: templateLevels('color') }, 10, 'p1');
    const s = submitCommission(s0, 'p1', { photoId: 'ph', palette: ['#123456'] });
    expect(s.oc.palette).toEqual(['#123456']);
  });

  it('配色沒有顏色、名牌沒有裁好的圖，會丟錯', () => {
    let s = createGuildState(OC, 1);
    s = add(add(s, 'color', 'c1'), 'typography', 't1');
    expect(() => submitCommission(s, 'c1', { photoId: 'p' })).toThrow();
    expect(() => submitCommission(s, 'c1', { photoId: 'p', palette: [] })).toThrow();
    expect(() => submitCommission(s, 't1', { photoId: 'p' })).toThrow();
  });

  it('已經交過的不會再交一次', () => {
    const once = submitCommission(add(createGuildState(OC, 1), 'drawing', 'd1'), 'd1', { photoId: 'p1' }, 500);
    expect(submitCommission(once, 'd1', { photoId: 'p2' }, 900)).toBe(once);
  });

  it('公會等級 = 1 ＋ 已交件委託數', () => {
    let s = createGuildState(OC, 1);
    for (const id of ['a', 'b', 'c']) s = add(s, 'drawing', id);
    expect(guildLevelOf(s)).toBe(1);
    s = submitCommission(s, 'a', { photoId: 'pa' });
    s = submitCommission(s, 'b', { photoId: 'pb' });
    expect(s.guildLevel).toBe(3);
  });

  it(`展品：照片依序放上 ${EXHIBIT_SLOTS} 座展台，第 6 張從第 1 座換掉最舊的`, () => {
    let s = createGuildState(OC, 1);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    for (const id of ids) s = add(s, 'drawing', id);
    for (const id of ids.slice(0, 5)) s = submitCommission(s, id, { photoId: `p${id}` });
    expect(s.exhibits).toEqual(['pa', 'pb', 'pc', 'pd', 'pe']);
    expect(nextExhibitSlot(s)).toBe(0);
    s = submitCommission(s, 'f', { photoId: 'pf' });
    s = submitCommission(s, 'g', { photoId: 'pg' });
    expect(s.exhibits).toEqual(['pf', 'pg', 'pc', 'pd', 'pe']);
    expect(commissionOfPhoto(s, 'pc')?.id).toBe('c');
    expect(commissionOfPhoto(s, 'nope')).toBeNull();
  });

  it('每個部件來自同部位最近交件的那張委託', () => {
    let s = createGuildState(OC, 1);
    for (const id of ['c1', 'c2']) s = add(s, 'color', id);
    s = add(s, 'drawing', 'd1');
    expect(partSources(s)).toEqual({});
    s = submitCommission(s, 'c1', { photoId: 'p1', palette: PALETTE }, 100);
    s = submitCommission(s, 'd1', { photoId: 'p2' }, 200);
    s = submitCommission(s, 'c2', { photoId: 'p3', palette: ['#000000'] }, 300);
    const src = partSources(s);
    expect(src.palette?.id).toBe('c2');
    expect(src.sketch?.id).toBe('d1');
    expect(src.nameplate).toBeUndefined();
    expect(s.oc.palette).toEqual(src.palette?.palette);
  });

  it('不會改到原本的狀態', () => {
    const s0 = add(createGuildState(OC, 1), 'color', 'c1');
    const before = JSON.stringify(s0);
    submitCommission(s0, 'c1', { photoId: 'p', palette: PALETTE });
    expect(JSON.stringify(s0)).toBe(before);
  });
});
