// OC 設定卡（企劃表 7.4）：4 區（4 門課）× 每區 3 格。一格 = 一張委託，切成「計時任務數」那麼多片（預設 5 片）；
// 每完成一個任務亮一片，交件後整格點亮、換成作業成果。
// 一區 3 格都用過以後，第 4 張同課程委託從第 1 格再來一輪，原本在那格的委託收進「歷史」。
import { CELLS_PER_COURSE, isSubmitted } from './state';
import { COURSE_TEMPLATES } from './templates';
import type { Commission, CourseType, GuildState, Level } from './types';

export interface CardSlice {
  level: Level;
  lit: boolean;
}

export interface CardCell {
  index: number;
  /** 目前佔這格的委託（同一格最新的那張）；還沒有就是 null */
  commission: Commission | null;
  slices: CardSlice[];
  lit: number;
  submitted: boolean;
}

export interface CardSection {
  course: CourseType;
  cells: CardCell[];
  /** 被新委託擠下來的舊委託，新的在前 */
  history: Commission[];
}

export interface OcCardModel {
  sections: CardSection[];
  /** 整張卡的完成度 0～1 */
  completion: number;
}

/** 一格的完成度：任務占 5/6、交件占 1/6（交件那塊會換成作業成果）；空格是 0 */
export const RESULT_SHARE = 1 / 6;

export function cellProgress(c: CardCell): number {
  if (!c.commission) return 0;
  if (c.submitted) return 1;
  return c.slices.length ? (c.lit / c.slices.length) * (1 - RESULT_SHARE) : 0;
}

export function buildOcCard(s: GuildState): OcCardModel {
  const sections = COURSE_TEMPLATES.map(({ course }): CardSection => {
    const mine = s.commissions.filter((c) => c.course === course).sort((a, b) => a.createdAt - b.createdAt);
    const cells = Array.from({ length: CELLS_PER_COURSE }, (_, index): CardCell => {
      const commission = mine.filter((c) => c.cellIndex === index).at(-1) ?? null;
      const slices = commission
        ? commission.levels.filter((l) => l.kind === 'timed').map((level) => ({ level, lit: level.status === 'done' }))
        : [];
      return { index, commission, slices, lit: slices.filter((x) => x.lit).length, submitted: !!commission && isSubmitted(commission) };
    });
    const current = new Set(cells.map((c) => c.commission?.id));
    const history = mine.filter((c) => !current.has(c.id)).reverse();
    return { course, cells, history };
  });
  const all = sections.flatMap((x) => x.cells);
  return { sections, completion: all.reduce((sum, c) => sum + cellProgress(c), 0) / all.length };
}

/** 設定卡上的日期：10/12 */
export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
