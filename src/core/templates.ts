// 課程與委託範本（企劃表 7.3）。課程名稱、關卡名稱、每關幾分鐘都只寫在這裡，改這裡全部生效。
import type { LevelDraft } from './state';
import type { CourseType } from './types';

export interface CourseTemplate {
  course: CourseType;
  /** 畫面上顯示的課程名稱 */
  label: string;
  /** 預設的計時關卡（各 LEVEL_MINUTES 分鐘），最後再自動加一個交件關 */
  levels: readonly string[];
}

/** 每個計時關卡預設幾分鐘 */
export const LEVEL_MINUTES = 10;
/** 最後一關（交件）的名稱 */
export const SUBMIT_LEVEL_TITLE = '交件';

export const COURSE_TEMPLATES: readonly CourseTemplate[] = [
  { course: 'typography', label: '字體設計', levels: ['讀要求圈重點', '找 3 個參考字', '字形草稿', '描線上墨', '修細節'] },
  { course: 'color', label: '色彩學', levels: ['讀要求選主題', '3 組配色草稿', '上色（一）', '上色（二）', '檢查明度對比'] },
  { course: 'composition', label: '平面構成', levels: ['讀要求列元素', '3 張縮圖草稿', '定網格與對齊', '調行距字距', '整體檢查'] },
  { course: 'drawing', label: '手繪基礎', levels: ['熱身線條', '抓大形', '修比例', '明暗', '細節'] },
];

export function courseTemplate(course: CourseType): CourseTemplate {
  const t = COURSE_TEMPLATES.find((x) => x.course === course);
  if (!t) throw new Error(`沒有這個課程：${course}`);
  return t;
}

export const courseLabel = (course: CourseType): string => courseTemplate(course).label;

/** 套範本：計時關卡＋最後一個交件關（每次都回傳新的陣列，可以直接拿去改） */
export function templateLevels(course: CourseType): LevelDraft[] {
  return [
    ...courseTemplate(course).levels.map((title): LevelDraft => ({ title, minutes: LEVEL_MINUTES, kind: 'timed' })),
    { title: SUBMIT_LEVEL_TITLE, minutes: 0, kind: 'submit' },
  ];
}
