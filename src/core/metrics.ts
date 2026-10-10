// 研究指標（企劃表 7.6）：每張委託算一次，給研究模式顯示和匯出。純計算，不碰畫面。
import { courseInfo } from './courses';
import { isSubmitted } from './state';
import type { GuildState, LogEvent } from './types';

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** 「最後一晚」：截止前 24 小時以內 */
export const LAST_NIGHT_MS = 24 * HOUR;

export interface CommissionMetrics {
  commissionId: string;
  title: string;
  /** 課程名稱 */
  course: string;
  dueAt: number;
  /** 提早開工時數：dueAt − 第一次 level_started（小時，負的是截止後才開工）；還沒開工是 null */
  leadHours: number | null;
  /** 截止前 24 小時以前完成的計時任務數 */
  doneBeforeLastNight: number;
  /** 計時任務總數（最後一晚前完成比例的分母） */
  timedTotal: number;
  /** 每個計時任務的專注時間（分鐘，扣掉暫停）；還沒完成是 null */
  focusMinutes: (number | null)[];
  /** 開工次數：level_started 事件數 */
  starts: number;
  /** 暫停次數：玩家自己按的 level_paused（開始另一個任務時自動暫停的不算） */
  pauses: number;
  submitted: boolean;
  /** 交件距截止：dueAt − submittedAt（小時，負的是逾期）；還沒交件是 null */
  submitLeadHours: number | null;
}

export interface Metrics {
  commissions: CommissionMetrics[];
  /** 打開設定卡次數，和從哪裡打開的（hud：底部按鈕、toast：小提示） */
  ocCardOpened: number;
  ocCardOpenedVia: Record<string, number>;
}

export function computeMetrics(s: GuildState, events: readonly LogEvent[]): Metrics {
  const commissions = s.commissions.map((c): CommissionMetrics => {
    const mine = events.filter((e) => e.commissionId === c.id);
    const started = mine.filter((e) => e.type === 'level_started');
    const firstStart = started.length ? Math.min(...started.map((e) => e.t)) : null;
    const timed = c.levels.filter((l) => l.kind === 'timed');
    const lastNight = c.dueAt - LAST_NIGHT_MS;
    return {
      commissionId: c.id,
      title: c.title,
      course: courseInfo(s, c.course).label,
      dueAt: c.dueAt,
      leadHours: firstStart === null ? null : (c.dueAt - firstStart) / HOUR,
      doneBeforeLastNight: timed.filter((l) => l.status === 'done' && l.doneAt !== undefined && l.doneAt <= lastNight).length,
      timedTotal: timed.length,
      focusMinutes: timed.map((l) => (l.status === 'done' ? l.focusMs / MINUTE : null)),
      starts: started.length,
      pauses: mine.filter((e) => e.type === 'level_paused' && e.data?.auto !== true).length,
      submitted: isSubmitted(c),
      submitLeadHours: c.submittedAt === undefined ? null : (c.dueAt - c.submittedAt) / HOUR,
    };
  });
  const opened = events.filter((e) => e.type === 'oc_card_opened');
  const ocCardOpenedVia: Record<string, number> = {};
  for (const e of opened) {
    const via = typeof e.data?.via === 'string' ? e.data.via : 'unknown';
    ocCardOpenedVia[via] = (ocCardOpenedVia[via] ?? 0) + 1;
  }
  return { commissions, ocCardOpened: opened.length, ocCardOpenedVia };
}
