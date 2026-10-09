// 課程與委託範本（企劃表 7.3）。課程名稱、關卡名稱、每關幾分鐘都只寫在這裡，改這裡全部生效。
// 玩家自己加的課程在 courses.ts。
import type { LevelDraft } from './state';
import type { CourseType, PartType } from './types';

export interface CourseTemplate {
  course: CourseType;
  /** 畫面上顯示的課程名稱 */
  label: string;
  /** 交件後作業成果會變成 OC 的哪個部分（T5 設定卡上標示） */
  part: PartType;
  /** 預設的計時關卡（各 LEVEL_MINUTES 分鐘），最後再自動加一個交件關 */
  levels: readonly string[];
}

/** 每個計時關卡預設幾分鐘 */
export const LEVEL_MINUTES = 10;
/** 最後一關（交件）的名稱 */
export const SUBMIT_LEVEL_TITLE = '交件';

/** 部位的名稱；PARTS 是新課程讓玩家選的順序 */
export const PART_LABELS: Readonly<Record<PartType, string>> = { nameplate: '名牌', palette: '配色', layout: '版面', sketch: '草稿' };
export const PARTS: readonly PartType[] = ['nameplate', 'palette', 'layout', 'sketch'];

export const COURSE_TEMPLATES: readonly CourseTemplate[] = [
  { course: 'typography', label: '字體設計', part: 'nameplate', levels: ['讀要求圈重點', '找 3 個參考字', '字形草稿', '描線上墨', '修細節'] },
  { course: 'color', label: '色彩學', part: 'palette', levels: ['讀要求選主題', '3 組配色草稿', '上色（一）', '上色（二）', '檢查明度對比'] },
  { course: 'composition', label: '平面構成', part: 'layout', levels: ['讀要求列元素', '3 張縮圖草稿', '定網格與對齊', '調行距字距', '整體檢查'] },
  { course: 'drawing', label: '手繪基礎', part: 'sketch', levels: ['熱身線條', '抓大形', '修比例', '明暗', '細節'] },
];

/** 自訂課程的預設任務（10/10 組員先同意用這組通用的，名稱待確認） */
export const CUSTOM_COURSE_LEVELS: readonly string[] = ['讀要求圈重點', '找參考', '打草稿', '製作', '檢查修改'];

export function courseTemplate(course: CourseType): CourseTemplate {
  const t = COURSE_TEMPLATES.find((x) => x.course === course);
  if (!t) throw new Error(`沒有這個課程：${course}`);
  return t;
}

/** 一串任務名稱 → 計時關卡＋最後一個交件關（每次都回傳新的陣列，可以直接拿去改） */
export function levelsFrom(titles: readonly string[]): LevelDraft[] {
  return [
    ...titles.map((title): LevelDraft => ({ title, minutes: LEVEL_MINUTES, kind: 'timed' })),
    { title: SUBMIT_LEVEL_TITLE, minutes: 0, kind: 'submit' },
  ];
}

/** 套內建課程的範本 */
export const templateLevels = (course: CourseType): LevelDraft[] => levelsFrom(courseTemplate(course).levels);
