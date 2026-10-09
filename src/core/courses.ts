// 課程：內建 4 門（templates.ts，企劃表 7.3）＋玩家在委託單上自己加的課程（10/10 組員要求）。
// 委託板、任務計時、設定卡都從這裡拿課程名稱、交件後的部位和預設任務。
// 自訂課程目前不能改名、不能刪，所以委託的課程一定找得到。
import { newId } from './id';
import { COURSE_TEMPLATES, CUSTOM_COURSE_LEVELS } from './templates';
import { cleanText } from './text';
import type { CourseId, CourseType, CustomCourseId, GuildState, PartType } from './types';

/** 自訂課程的名稱最多幾個字 */
export const COURSE_NAME_MAX = 10;

interface CourseCommon {
  label: string;
  /** 交件後作業成果變成 OC 的哪個部分 */
  part: PartType;
  /** 預設的計時任務名稱 */
  levels: readonly string[];
}

export type CourseInfo =
  | (CourseCommon & { kind: 'builtin'; id: CourseType })
  | (CourseCommon & {
    kind: 'custom';
    id: CustomCourseId;
    /** 第幾門自訂課程（0 起算，照建立順序） */
    customIndex: number;
  });

/** 新加一門課要的資料 */
export interface NewCourse {
  label: string;
  part: PartType;
}

/** 所有課程：內建 4 門在前，自訂課程照建立順序接在後面 */
export function allCourses(s: GuildState): CourseInfo[] {
  return [
    ...COURSE_TEMPLATES.map((t): CourseInfo => ({ kind: 'builtin', id: t.course, label: t.label, part: t.part, levels: t.levels })),
    ...s.customCourses.map((c, customIndex): CourseInfo => ({
      kind: 'custom', id: c.id, label: c.label, part: c.part, levels: CUSTOM_COURSE_LEVELS, customIndex,
    })),
  ];
}

/** 找課程；找不到就丟錯 */
export function courseInfo(s: GuildState, id: CourseId): CourseInfo {
  const c = allCourses(s).find((x) => x.id === id);
  if (!c) throw new Error(`沒有這個課程：${id}`);
  return c;
}

/** 比對課程名稱用：去掉多餘空白，英文不分大小寫 */
const nameKey = (label: string): string => cleanText(label, COURSE_NAME_MAX).toLowerCase();

/** 同名的課程（內建的也算）；沒有就回傳 undefined */
export function findCourseByName(s: GuildState, label: string): CourseInfo | undefined {
  const key = nameKey(label);
  return key ? allCourses(s).find((c) => nameKey(c.label) === key) : undefined;
}

/**
 * 加一門自訂課程，回傳新的狀態和課程 id。
 * 已經有同名的課程就直接用那門，不重複建立（委託單會先擋下來，這裡是防兩個分頁同時加）。
 */
export function addCustomCourse(
  s: GuildState, course: NewCourse, now = Date.now(), id = newId(now),
): { state: GuildState; courseId: CourseId } {
  const label = cleanText(course.label, COURSE_NAME_MAX);
  if (!label) throw new Error('課程名稱是空的');
  const same = findCourseByName(s, label);
  if (same) return { state: s, courseId: same.id };
  const courseId: CustomCourseId = `custom:${id}`;
  return { state: { ...s, customCourses: [...s.customCourses, { id: courseId, label, part: course.part, createdAt: now }] }, courseId };
}
