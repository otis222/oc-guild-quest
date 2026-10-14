import { describe, expect, it } from 'vitest';
import { addCommission, createGuildState } from '../../src/core/state';
import { submitCommission } from '../../src/core/submit';
import { templateLevels } from '../../src/core/templates';
import { duskChange, needsDusk, paperUrgency } from '../../src/core/urgency';
import type { GuildState } from '../../src/core/types';

const HOUR = 3_600_000;
const NOW = 1_000_000_000;
const OC = { name: '小鈴', sprite: 'maid_1.png' };
const withDue = (s: GuildState, id: string, dueAt: number): GuildState =>
  addCommission(s, { course: 'color', title: id, dueAt, levels: templateLevels('color') }, 1, id);

describe('截止前一天大廳變黃昏', () => {
  it('還沒交件、剩不到 24 小時（含逾期）才算', () => {
    const s0 = createGuildState(OC, 0);
    expect(needsDusk(s0, NOW)).toBe(false);
    expect(needsDusk(withDue(s0, 'a', NOW + 25 * HOUR), NOW)).toBe(false);
    expect(needsDusk(withDue(s0, 'a', NOW + 24 * HOUR), NOW)).toBe(false);
    expect(needsDusk(withDue(s0, 'a', NOW + 23 * HOUR), NOW)).toBe(true);
    expect(needsDusk(withDue(s0, 'a', NOW - 5 * HOUR), NOW)).toBe(true);
    // 交件了就不算
    const done = submitCommission(withDue(s0, 'a', NOW + HOUR), 'a', { photoId: 'p', palette: ['#123456'] }, NOW);
    expect(needsDusk(done, NOW)).toBe(false);
    // 很多張裡只要有一張急就算
    expect(needsDusk(withDue(withDue(s0, 'a', NOW + 90 * HOUR), 'b', NOW + 2 * HOUR), NOW)).toBe(true);
  });

  it('只在急／不急改變的那一刻切換天色，手動切的不會被蓋掉', () => {
    expect(duskChange(null, false)).toBeNull();
    expect(duskChange(null, true)).toBe('dusk');
    expect(duskChange(false, true)).toBe('dusk');
    expect(duskChange(true, false)).toBe('day');
    expect(duskChange(true, true)).toBeNull();
    expect(duskChange(false, false)).toBeNull();
  });
});

describe('委託板上的紙', () => {
  it('平常、快截止（不到 48 小時）、已逾期', () => {
    const c = (dueAt: number) => withDue(createGuildState(OC, 0), 'a', dueAt).commissions[0];
    expect(paperUrgency(c(NOW + 72 * HOUR), NOW)).toBe('calm');
    expect(paperUrgency(c(NOW + 48 * HOUR), NOW)).toBe('calm');
    expect(paperUrgency(c(NOW + 47 * HOUR), NOW)).toBe('soon');
    expect(paperUrgency(c(NOW + 1), NOW)).toBe('soon');
    expect(paperUrgency(c(NOW), NOW)).toBe('overdue');
    expect(paperUrgency(c(NOW - 3 * HOUR), NOW)).toBe('overdue');
  });
});
