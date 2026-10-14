import { describe, expect, it } from 'vitest';
import { addCustomCourse } from '../../src/core/courses';
import { galleryWorks } from '../../src/core/gallery';
import { addCommission, createGuildState } from '../../src/core/state';
import { EXHIBIT_SLOTS, submitCommission } from '../../src/core/submit';
import { CUSTOM_COURSE_LEVELS, levelsFrom, templateLevels } from '../../src/core/templates';
import type { GuildState } from '../../src/core/types';

const OC = { name: '小鈴', sprite: 'maid_1.png' };
const add = (s: GuildState, id: string): GuildState =>
  addCommission(s, { course: 'drawing', title: `作業${id}`, dueAt: 9e12, levels: templateLevels('drawing') }, 1, id);

describe('公會作品集', () => {
  it('還沒交件的不算；照交件時間排，新的在前', () => {
    let s = createGuildState(OC, 0);
    for (const id of ['a', 'b', 'c']) s = add(s, id);
    expect(galleryWorks(s)).toEqual([]);
    s = submitCommission(s, 'b', { photoId: 'pb' }, 100);
    s = submitCommission(s, 'a', { photoId: 'pa' }, 300);
    const works = galleryWorks(s);
    expect(works.map((w) => w.commissionId)).toEqual(['a', 'b']);
    expect(works[0]).toMatchObject({ commissionId: 'a', title: '作業a', submittedAt: 300, photoId: 'pa', onExhibit: true });
    expect(works[0].course).toMatchObject({ kind: 'builtin', id: 'drawing', label: '手繪基礎', part: 'sketch' });
  });

  it('被擠下展台的作業還在，標成不在展台上', () => {
    let s = createGuildState(OC, 0);
    const n = EXHIBIT_SLOTS + 2;
    for (let i = 0; i < n; i++) {
      s = add(s, `w${i}`);
      s = submitCommission(s, `w${i}`, { photoId: `p${i}` }, 1000 + i);
    }
    const works = galleryWorks(s);
    expect(works).toHaveLength(n);
    expect(works.filter((w) => w.onExhibit)).toHaveLength(EXHIBIT_SLOTS);
    // 最舊的兩張被輪替掉了
    expect(works.slice(-2).map((w) => [w.photoId, w.onExhibit])).toEqual([['p1', false], ['p0', false]]);
  });

  it('自訂課程的作業也在，帶著自訂課程的名稱', () => {
    const { state, courseId } = addCustomCourse(createGuildState(OC, 0), { label: '攝影', part: 'layout' }, 5, 'p1');
    let s = addCommission(state, { course: courseId, title: '街拍', dueAt: 9e12, levels: levelsFrom(CUSTOM_COURSE_LEVELS) }, 6, 'x');
    s = submitCommission(s, 'x', { photoId: 'px' }, 7);
    expect(galleryWorks(s)[0].course).toMatchObject({ kind: 'custom', label: '攝影', part: 'layout' });
  });
});
