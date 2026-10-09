// 截止時間：委託卡上的倒數、<input type="datetime-local"> 的轉換、預設截止時間。都用裝置的當地時間。

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 接新委託時預設的截止：幾天後的 23:59 */
export const DEFAULT_DUE_DAYS = 7;

export const isOverdue = (dueAt: number, now: number): boolean => now >= dueAt;

/** 委託卡上的倒數：「剩 5 天」「剩 1 天 3 小時」「剩 4 小時」「剩 25 分鐘」「已逾期」 */
export function dueCountdown(dueAt: number, now: number): string {
  const ms = dueAt - now;
  if (ms <= 0) return '已逾期';
  if (ms < HOUR) return `剩 ${Math.max(1, Math.floor(ms / MIN))} 分鐘`;
  if (ms < DAY) return `剩 ${Math.floor(ms / HOUR)} 小時`;
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR);
  return d >= 3 || h === 0 ? `剩 ${d} 天` : `剩 ${d} 天 ${h} 小時`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 毫秒 → datetime-local 欄位的值（當地時間，到分鐘） */
export function toDateTimeLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 欄位的值 → 毫秒；空的或格式不對回傳 NaN */
export function fromDateTimeLocal(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return NaN;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
}

export function defaultDueAt(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + DEFAULT_DUE_DAYS);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}
