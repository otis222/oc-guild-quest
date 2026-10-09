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
  /** 整張卡的完成度 0～1（收進歷史的委託也算） */
  completion: number;
}

/** 一張委託的完成度：任務占 5/6、交件占 1/6（交件那塊會換成作業成果） */
export const RESULT_SHARE = 1 / 6;

export function commissionProgress(c: Commission): number {
  if (isSubmitted(c)) return 1;
  const timed = c.levels.filter((l) => l.kind === 'timed');
  return timed.length ? (timed.filter((l) => l.status === 'done').length / timed.length) * (1 - RESULT_SHARE) : 0;
}

/** 一格的完成度；空格是 0 */
export const cellProgress = (c: CardCell): number => (c.commission ? commissionProgress(c.commission) : 0);

/** 一張委託畫成一格的樣子（也用在大廳的小提示，委託已經收進歷史也可以） */
export function cellOf(commission: Commission): CardCell {
  const slices = commission.levels.filter((l) => l.kind === 'timed').map((level) => ({ level, lit: level.status === 'done' }));
  return { index: commission.cellIndex, commission, slices, lit: slices.filter((x) => x.lit).length, submitted: isSubmitted(commission) };
}

const emptyCell = (index: number): CardCell => ({ index, commission: null, slices: [], lit: 0, submitted: false });

export function buildOcCard(s: GuildState): OcCardModel {
  const sections = COURSE_TEMPLATES.map(({ course }): CardSection => {
    const mine = s.commissions.filter((c) => c.course === course).sort((a, b) => a.createdAt - b.createdAt);
    const cells = Array.from({ length: CELLS_PER_COURSE }, (_, index): CardCell => {
      const commission = mine.filter((c) => c.cellIndex === index).at(-1);
      return commission ? cellOf(commission) : emptyCell(index);
    });
    const current = new Set(cells.map((c) => c.commission?.id));
    const history = mine.filter((c) => !current.has(c.id)).reverse();
    return { course, cells, history };
  });
  // 完成度：卡上和歷史裡的每張委託都算，加起來除以格子數，最多 100%。
  // 這樣同一門課接第 4 張、舊的收進歷史時，完成度不會往下掉（10/10 組員決定）。
  const cellCount = sections.reduce((n, x) => n + x.cells.length, 0);
  const total = sections.reduce((sum, x) => sum
    + x.cells.reduce((a, c) => a + cellProgress(c), 0)
    + x.history.reduce((a, c) => a + commissionProgress(c), 0), 0);
  return { sections, completion: Math.min(1, total / cellCount) };
}

/** 設定卡上的日期：10/12 */
export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
