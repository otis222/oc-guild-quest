import { describe, expect, it } from 'vitest';
import { computeMetrics, LAST_NIGHT_MS } from '../../src/core/metrics';
import { addCommission, completeLevel, createGuildState, startLevel } from '../../src/core/state';
import { submitCommission } from '../../src/core/submit';
import { templateLevels } from '../../src/core/templates';
import type { GuildState, LogEvent } from '../../src/core/types';

const H = 3_600_000, MIN = 60_000;
const DUE = 100 * H;

function setup(): { s: GuildState; ids: string[] } {
  let s = addCommission(createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 0),
    { course: 'color', title: '色相環', dueAt: DUE, levels: templateLevels('color') }, 1, 'c1');
  const ids = s.commissions[0].levels.map((l) => l.id);
  // 第 1 個任務：截止前 52 小時開始、做 8 分鐘；第 2 個：最後一晚（截止前 10 小時）做 10 分鐘
  s = completeLevel(startLevel(s, 'c1', ids[0], DUE - 52 * H), 'c1', ids[0], DUE - 52 * H + 8 * MIN);
  s = completeLevel(startLevel(s, 'c1', ids[1], DUE - 10 * H), 'c1', ids[1], DUE - 10 * H + 10 * MIN);
  return { s, ids };
}

const ev = (t: number, type: LogEvent['type'], extra: Partial<LogEvent> = {}): LogEvent => ({ t, type, commissionId: 'c1', ...extra });

describe('研究指標（企劃表 7.6）', () => {
  it('提早開工時數：截止 − 第一次開始任務', () => {
    const { s } = setup();
    const events = [ev(DUE - 10 * H, 'level_started'), ev(DUE - 52 * H, 'level_started')];
    expect(computeMetrics(s, events).commissions[0].leadHours).toBeCloseTo(52);
  });

  it('還沒開工：提早開工時數是 null', () => {
    const { s } = setup();
    expect(computeMetrics(s, []).commissions[0].leadHours).toBeNull();
  });

  it('最後一晚前完成比例：截止前 24 小時以前完成的任務數 / 計時任務數', () => {
    const m = computeMetrics(setup().s, []).commissions[0];
    expect([m.doneBeforeLastNight, m.timedTotal]).toEqual([1, 5]);
    expect(LAST_NIGHT_MS).toBe(24 * H);
  });

  it('每關專注時間（分鐘）：沒完成的是 null', () => {
    expect(computeMetrics(setup().s, []).commissions[0].focusMinutes).toEqual([8, 10, null, null, null]);
  });

  it('開工次數、暫停次數：開始另一個任務時自動暫停的不算', () => {
    const events = [
      ev(1, 'level_started'), ev(2, 'level_paused'), ev(3, 'level_resumed'), ev(4, 'level_paused', { data: { auto: true } }),
      ev(5, 'level_started'), ev(6, 'level_started', { commissionId: 'other' }),
    ];
    const m = computeMetrics(setup().s, events).commissions[0];
    expect([m.starts, m.pauses]).toEqual([2, 1]);
  });

  it('是否交件、交件距截止（負的是逾期）', () => {
    const { s } = setup();
    expect(computeMetrics(s, []).commissions[0]).toMatchObject({ submitted: false, submitLeadHours: null });
    const early = submitCommission(s, 'c1', { photoId: 'p', palette: ['#ff0000'] }, DUE - 12 * H);
    expect(computeMetrics(early, []).commissions[0]).toMatchObject({ submitted: true, submitLeadHours: 12 });
    const late = submitCommission(s, 'c1', { photoId: 'p', palette: ['#ff0000'] }, DUE + 3 * H);
    expect(computeMetrics(late, []).commissions[0].submitLeadHours).toBeCloseTo(-3);
  });

  it('打開設定卡次數，分成從哪裡打開', () => {
    const events: LogEvent[] = [
      { t: 1, type: 'oc_card_opened', data: { via: 'hud' } },
      { t: 2, type: 'oc_card_opened', data: { via: 'toast' } },
      { t: 3, type: 'oc_card_opened', data: { via: 'hud' } },
      { t: 4, type: 'app_opened' },
    ];
    const m = computeMetrics(setup().s, events);
    expect(m.ocCardOpened).toBe(3);
    expect(m.ocCardOpenedVia).toEqual({ hud: 2, toast: 1 });
  });

  it('委託名稱和課程名稱（自訂課程也算得出來）', () => {
    const s = addCommission(createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 0),
      { course: { label: '攝影', part: 'layout' }, title: '光影練習', dueAt: DUE, levels: templateLevels('color') }, 1, 'p1');
    expect(computeMetrics(s, []).commissions[0]).toMatchObject({ commissionId: 'p1', title: '光影練習', course: '攝影' });
  });
});
