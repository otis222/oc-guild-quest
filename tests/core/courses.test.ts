import { describe, expect, it } from 'vitest';
import { addCustomCourse, allCourses, COURSE_NAME_MAX, courseInfo, findCourseByName } from '../../src/core/courses';
import { createGuildState } from '../../src/core/state';
import { CUSTOM_COURSE_LEVELS } from '../../src/core/templates';

const base = createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1);

describe('課程', () => {
  it('還沒有自訂課程：只有內建 4 門', () => {
    expect(allCourses(base).map((c) => [c.id, c.label, c.part])).toEqual([
      ['typography', '字體設計', 'nameplate'],
      ['color', '色彩學', 'palette'],
      ['composition', '平面構成', 'layout'],
      ['drawing', '手繪基礎', 'sketch'],
    ]);
  });

  it('加一門自訂課程：接在內建課程後面，用通用範本', () => {
    const { state, courseId } = addCustomCourse(base, { label: '  基礎   攝影 ', part: 'layout' }, 50, 'p1');
    expect(courseId).toBe('custom:p1');
    expect(state.customCourses).toEqual([{ id: 'custom:p1', label: '基礎 攝影', part: 'layout', createdAt: 50 }]);
    expect(base.customCourses).toEqual([]);
    const info = courseInfo(state, courseId);
    expect(info).toMatchObject({ kind: 'custom', label: '基礎 攝影', part: 'layout', customIndex: 0 });
    expect(info.levels).toEqual(CUSTOM_COURSE_LEVELS);
    expect(allCourses(state).map((c) => c.id)).toEqual(['typography', 'color', 'composition', 'drawing', 'custom:p1']);
  });

  it('自訂課程照建立順序編號', () => {
    let s = addCustomCourse(base, { label: '攝影', part: 'layout' }, 50, 'p1').state;
    s = addCustomCourse(s, { label: '動畫', part: 'sketch' }, 60, 'a1').state;
    const custom = allCourses(s).flatMap((c) => (c.kind === 'custom' ? [[c.label, c.customIndex]] : []));
    expect(custom).toEqual([['攝影', 0], ['動畫', 1]]);
  });

  it(`名稱最多 ${COURSE_NAME_MAX} 個字；空的名稱會丟錯`, () => {
    const { state } = addCustomCourse(base, { label: '一二三四五六七八九十十一', part: 'sketch' }, 50, 'x');
    expect(state.customCourses[0].label).toBe('一二三四五六七八九十');
    expect(() => addCustomCourse(base, { label: '   ', part: 'sketch' })).toThrow();
  });

  it('同名的課程不會重複建立（內建的也算，英文不分大小寫）', () => {
    const one = addCustomCourse(base, { label: 'CG 繪圖', part: 'sketch' }, 50, 'cg');
    const again = addCustomCourse(one.state, { label: ' cg  繪圖', part: 'palette' }, 60, 'cg2');
    expect(again.state).toBe(one.state);
    expect(again.courseId).toBe('custom:cg');
    expect(addCustomCourse(base, { label: '色彩學', part: 'sketch' }).courseId).toBe('color');
    expect(findCourseByName(one.state, 'cg 繪圖')?.id).toBe('custom:cg');
    expect(findCourseByName(one.state, '  ')).toBeUndefined();
    expect(findCourseByName(one.state, '攝影')).toBeUndefined();
  });

  it('找不到的課程會丟錯', () => {
    expect(() => courseInfo(base, 'custom:nope')).toThrow();
  });
});
