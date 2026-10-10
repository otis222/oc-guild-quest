import { describe, expect, it } from 'vitest';
import { logEvent } from '../../src/core/events';
import { isResearchMode, loadResearchData } from '../../src/core/research';
import { createGuildState, saveState } from '../../src/core/state';
import { STATE_KEY } from '../../src/core/storage';
import { memoryKV } from '../helpers/memoryKV';

describe('研究模式', () => {
  it('只有網址加 ?research=1 才算', () => {
    expect(isResearchMode('?research=1')).toBe(true);
    expect(isResearchMode('?x=2&research=1')).toBe(true);
    expect(isResearchMode('')).toBe(false);
    expect(isResearchMode('?research=0')).toBe(false);
    expect(isResearchMode('?research')).toBe(false);
  });

  it('讀最新的存檔和事件', async () => {
    const kv = memoryKV();
    const s = createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1);
    await saveState(kv, s);
    await logEvent(kv, 'app_opened', {}, 5);
    expect(await loadResearchData(kv)).toEqual({ raw: s, state: s, stateError: null, events: [{ t: 5, type: 'app_opened' }] });
  });

  it('還沒有存檔：state 是 null，沒有錯誤', async () => {
    expect(await loadResearchData(memoryKV())).toEqual({ raw: undefined, state: null, stateError: null, events: [] });
  });

  it('存檔壞掉：還是讀得到原始資料和事件，附上原因', async () => {
    const kv = memoryKV();
    await kv.set(STATE_KEY, { version: 99 });
    await logEvent(kv, 'app_opened', {}, 5);
    const data = await loadResearchData(kv);
    expect(data.state).toBeNull();
    expect(data.raw).toEqual({ version: 99 });
    expect(data.stateError).toMatch(/比程式/);
    expect(data.events).toHaveLength(1);
  });

  it('全部清除後就什麼都沒有了', async () => {
    const kv = memoryKV();
    await saveState(kv, createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1));
    await logEvent(kv, 'app_opened', {}, 5);
    await kv.set('photo:p1', new Blob(['x']));
    await kv.clear();
    expect(kv.raw.size).toBe(0);
    expect(await loadResearchData(kv)).toEqual({ raw: undefined, state: null, stateError: null, events: [] });
  });
});
