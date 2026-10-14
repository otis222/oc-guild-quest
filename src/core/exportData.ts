// 研究資料匯出（企劃表 T7、7.6）：
// - CSV 一列一個事件，UTF-8 加 BOM（Excel 開中文才正常），換行用 CRLF。
// - JSON 給完整狀態＋事件＋指標。
// 作業照片和上傳的 OC 圖不匯出（只有照片 id）：照片只存在玩家自己的瀏覽器。
import { courseInfo } from './courses';
import { computeMetrics } from './metrics';
import type { EventType, GuildState, LogEvent } from './types';

/** 事件類型的中文名稱（CSV 和研究模式的列表用） */
export const EVENT_LABELS: Readonly<Record<EventType, string>> = {
  app_opened: '打開網頁',
  oc_created: '建立 OC',
  commission_created: '接委託',
  level_started: '開始任務',
  level_paused: '暫停任務',
  level_resumed: '繼續任務',
  level_extended: '再 5 分鐘',
  level_completed: '完成任務',
  photo_added: '存交件照片',
  commission_submitted: '交件',
  oc_card_opened: '打開設定卡',
  exhibit_opened: '看展品',
  oc_changed: '換造型',
  course_created: '新增課程',
  bonus_started: '開始加分關',
  bonus_finished: '加分關計分',
  gallery_opened: '看作品集',
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** 裝置的當地時間：2026-10-10 14:03:05（Excel 和 Google 試算表都認得） */
export function localTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** CSV 的一格：有逗號、引號、換行就加引號；開頭是 = + - @ 的前面加 '，免得試算表當成公式執行 */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 事件裡的委託、任務名稱（存檔讀不到就留空） */
function names(s: GuildState | null, e: LogEvent): { work: string; course: string; task: string } {
  const c = s?.commissions.find((x) => x.id === e.commissionId);
  if (!s || !c) return { work: '', course: '', task: '' };
  let course = c.course as string;
  try { course = courseInfo(s, c.course).label; } catch { /* 課程不見了就用 id */ }
  return { work: c.title, course, task: c.levels.find((l) => l.id === e.levelId)?.title ?? '' };
}

export const CSV_HEADER = ['時間', '事件', '事件代碼', '委託', '課程', '任務', '資料', '委託 id', '任務 id', '時間戳（毫秒）'];

/** 事件 CSV：一列一個事件，照發生順序 */
export function eventsCsv(s: GuildState | null, events: readonly LogEvent[]): string {
  const rows = events.map((e) => {
    const n = names(s, e);
    return [
      localTime(e.t), EVENT_LABELS[e.type] ?? e.type, e.type, n.work, n.course, n.task,
      e.data ? JSON.stringify(e.data) : '', e.commissionId ?? '', e.levelId ?? '', e.t,
    ];
  });
  return `﻿${[CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * 完整資料 JSON。raw 是存檔原本的樣子：存檔壞掉、遊戲打不開時也能匯出來救資料。
 * state 是讀得懂的存檔（可以算指標）；讀不懂就傳 null。
 */
export function exportJson(raw: unknown, state: GuildState | null, events: readonly LogEvent[], now = Date.now()): string {
  return JSON.stringify({
    app: 'oc-guild-quest',
    exportedAt: new Date(now).toISOString(),
    note: '作業照片和上傳的 OC 圖不會匯出，這裡只有照片 id。',
    state: state ?? raw ?? null,
    events,
    metrics: state ? computeMetrics(state, events) : null,
  }, null, 2);
}

/** 匯出檔名：oc-guild-quest-events-20261010-1403.csv */
export function exportFileName(kind: 'events' | 'data', ext: 'csv' | 'json', now = Date.now()): string {
  const d = new Date(now);
  return `oc-guild-quest-${kind}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}
