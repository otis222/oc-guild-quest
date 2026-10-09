import { describe, expect, it } from 'vitest';
import { defaultDueAt, dueCountdown, fromDateTimeLocal, isOverdue, toDateTimeLocal } from '../../src/core/due';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = new Date(2026, 9, 10, 15, 30).getTime(); // 當地時間 10/10 15:30

describe('截止倒數', () => {
  it('過了或剛好到截止時間：已逾期', () => {
    expect(dueCountdown(now, now)).toBe('已逾期');
    expect(dueCountdown(now - 5 * DAY, now)).toBe('已逾期');
    expect(isOverdue(now, now)).toBe(true);
    expect(isOverdue(now + 1, now)).toBe(false);
  });

  it('不到 1 小時用分鐘，最少顯示 1 分鐘', () => {
    expect(dueCountdown(now + 30 * 1000, now)).toBe('剩 1 分鐘');
    expect(dueCountdown(now + 25 * MIN, now)).toBe('剩 25 分鐘');
    expect(dueCountdown(now + HOUR - 1, now)).toBe('剩 59 分鐘');
  });

  it('不到 1 天用小時', () => {
    expect(dueCountdown(now + HOUR, now)).toBe('剩 1 小時');
    expect(dueCountdown(now + 23 * HOUR + 59 * MIN, now)).toBe('剩 23 小時');
  });

  it('1～3 天顯示天和小時，3 天以上只顯示天', () => {
    expect(dueCountdown(now + DAY, now)).toBe('剩 1 天');
    expect(dueCountdown(now + DAY + 3 * HOUR, now)).toBe('剩 1 天 3 小時');
    expect(dueCountdown(now + 2 * DAY + 23 * HOUR, now)).toBe('剩 2 天 23 小時');
    expect(dueCountdown(now + 3 * DAY + 5 * HOUR, now)).toBe('剩 3 天');
    expect(dueCountdown(now + 6 * DAY + 20 * HOUR, now)).toBe('剩 6 天');
  });
});

describe('datetime-local 欄位', () => {
  it('來回轉換（當地時間，到分鐘）', () => {
    expect(toDateTimeLocal(new Date(2026, 9, 16, 23, 59).getTime())).toBe('2026-10-16T23:59');
    expect(toDateTimeLocal(new Date(2026, 0, 5, 8, 7).getTime())).toBe('2026-01-05T08:07');
    expect(fromDateTimeLocal('2026-10-16T23:59')).toBe(new Date(2026, 9, 16, 23, 59).getTime());
    expect(fromDateTimeLocal(toDateTimeLocal(now))).toBe(now);
  });

  it('空的或格式不對是 NaN', () => {
    expect(fromDateTimeLocal('')).toBeNaN();
    expect(fromDateTimeLocal('明天')).toBeNaN();
  });

  it('預設截止：7 天後的 23:59', () => {
    expect(defaultDueAt(now)).toBe(new Date(2026, 9, 17, 23, 59).getTime());
    expect(defaultDueAt(new Date(2026, 11, 28, 1, 0).getTime())).toBe(new Date(2027, 0, 4, 23, 59).getTime());
  });
});
