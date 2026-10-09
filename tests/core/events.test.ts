import { describe, expect, it } from 'vitest';
import { loadEvents, logEvent } from '../../src/core/events';
import { memoryKV } from '../helpers/memoryKV';

describe('事件紀錄', () => {
  it('還沒記過就是空陣列', async () => {
    expect(await loadEvents(memoryKV())).toEqual([]);
  });

  it('照順序存下時間、類型和附帶欄位', async () => {
    const kv = memoryKV();
    await logEvent(kv, 'app_opened', {}, 100);
    await logEvent(kv, 'level_started', { commissionId: 'c1', levelId: 'l1' }, 200);
    await logEvent(kv, 'level_extended', { commissionId: 'c1', levelId: 'l1', data: { minutes: 5 } }, 300);
    expect(await loadEvents(kv)).toStrictEqual([
      { t: 100, type: 'app_opened' },
      { t: 200, type: 'level_started', commissionId: 'c1', levelId: 'l1' },
      { t: 300, type: 'level_extended', commissionId: 'c1', levelId: 'l1', data: { minutes: 5 } },
    ]);
  });

  it('同時記很多筆也一筆都不會掉', async () => {
    const kv = memoryKV();
    await Promise.all(Array.from({ length: 30 }, (_, i) => logEvent(kv, 'oc_card_opened', {}, i)));
    const events = await loadEvents(kv);
    expect(events).toHaveLength(30);
    expect(events.map((e) => e.t)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('沒給時間就用現在', async () => {
    const before = Date.now();
    const e = await logEvent(memoryKV(), 'app_opened');
    expect(e.t).toBeGreaterThanOrEqual(before);
    expect(e.t).toBeLessThanOrEqual(Date.now());
  });
});
