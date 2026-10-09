import { describe, expect, it } from 'vitest';
import { COURSE_TEMPLATES, courseLabel, LEVEL_MINUTES, SUBMIT_LEVEL_TITLE, templateLevels } from '../../src/core/templates';
import type { CourseType } from '../../src/core/types';

const ALL: CourseType[] = ['typography', 'color', 'composition', 'drawing'];

describe('課程範本（企劃表 7.3）', () => {
  it('4 門課都有，順序是字體設計、色彩學、平面構成、手繪基礎', () => {
    expect(COURSE_TEMPLATES.map((t) => t.course)).toEqual(ALL);
    expect(ALL.map(courseLabel)).toEqual(['字體設計', '色彩學', '平面構成', '手繪基礎']);
  });

  it('交件後變成的 OC 部分：名牌、配色、版面、草稿（T5）', () => {
    expect(COURSE_TEMPLATES.map((t) => t.part)).toEqual(['名牌', '配色', '版面', '草稿']);
  });

  it('每門課預設 5 關', () => {
    for (const t of COURSE_TEMPLATES) expect(t.levels).toHaveLength(5);
  });

  it('套範本：5 個計時關卡（各 10 分鐘）＋最後一個交件關', () => {
    for (const course of ALL) {
      const levels = templateLevels(course);
      expect(levels).toHaveLength(6);
      expect(levels.slice(0, 5).every((l) => l.kind === 'timed' && l.minutes === LEVEL_MINUTES)).toBe(true);
      expect(levels[5]).toEqual({ title: SUBMIT_LEVEL_TITLE, minutes: 0, kind: 'submit' });
    }
    expect(LEVEL_MINUTES).toBe(10);
    expect(templateLevels('color').map((l) => l.title)).toEqual(['讀要求選主題', '3 組配色草稿', '上色（一）', '上色（二）', '檢查明度對比', '交件']);
  });

  it('每次都是新的陣列，改了不會影響範本', () => {
    const a = templateLevels('drawing');
    a[0].title = '改掉';
    a.pop();
    expect(templateLevels('drawing')[0].title).toBe('熱身線條');
    expect(templateLevels('drawing')).toHaveLength(6);
  });
});
