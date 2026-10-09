import { describe, expect, it } from 'vitest';
import { addCommission, createGuildState, loadState, saveState } from '../../src/core/state';
import { createGuildStore } from '../../src/core/store';
import type { GuildState } from '../../src/core/types';
import { memoryKV } from '../helpers/memoryKV';

const draft = { course: 'color' as const, title: '色相環', dueAt: 9, levels: [{ title: '交件', minutes: 0, kind: 'submit' as const }] };

async function setup(): Promise<{ kv: ReturnType<typeof memoryKV>; s0: GuildState }> {
  const kv = memoryKV();
  const s0 = createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1);
  await saveState(kv, s0);
  return { kv, s0 };
}

describe('GuildStore', () => {
  it('修改會存檔、更新記憶體裡的狀態，並通知訂閱者', async () => {
    const { kv, s0 } = await setup();
    const store = createGuildStore(kv, s0);
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.commissions.length));
    const next = await store.update((s) => addCommission(s, draft, 2, 'c1'));
    expect(store.state).toBe(next);
    expect(seen).toEqual([1]);
    expect(await loadState(kv)).toStrictEqual(next);
  });

  it('取消訂閱後就不再通知', async () => {
    const { kv, s0 } = await setup();
    const store = createGuildStore(kv, s0);
    let calls = 0;
    const off = store.subscribe(() => calls++);
    await store.update((s) => addCommission(s, draft, 2, 'c1'));
    off();
    await store.update((s) => addCommission(s, draft, 3, 'c2'));
    expect(calls).toBe(1);
  });

  it('修改失敗：狀態不變、不通知、存檔不變', async () => {
    const { kv, s0 } = await setup();
    const store = createGuildStore(kv, s0);
    let calls = 0;
    store.subscribe(() => calls++);
    await expect(store.update(() => { throw new Error('壞掉'); })).rejects.toThrow('壞掉');
    expect(store.state).toBe(s0);
    expect(calls).toBe(0);
    expect(await loadState(kv)).toStrictEqual(s0);
  });

  it('別的分頁先存了新進度，這邊修改時會接在最新的存檔後面', async () => {
    const { kv, s0 } = await setup();
    const store = createGuildStore(kv, s0);
    await saveState(kv, addCommission(s0, draft, 2, 'other-tab'));
    const next = await store.update((s) => addCommission(s, draft, 3, 'this-tab'));
    expect(next.commissions.map((c) => c.id)).toEqual(['other-tab', 'this-tab']);
  });
});
