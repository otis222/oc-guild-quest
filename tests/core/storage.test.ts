import { describe, expect, it } from 'vitest';
import { addCommission, createGuildState, saveState, updateState } from '../../src/core/state';
import { deletePhoto, getPhoto, photoKey, putPhoto, STATE_KEY } from '../../src/core/storage';
import { memoryKV } from '../helpers/memoryKV';

describe('照片', () => {
  it('另存在 photo:<id>，讀回來內容一樣', async () => {
    const kv = memoryKV();
    const id = await putPhoto(kv, new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
    expect(kv.raw.has(photoKey(id))).toBe(true);
    const back = await getPhoto(kv, id);
    expect(back?.type).toBe('image/jpeg');
    expect(await back?.text()).toBe('fake-jpeg');
  });

  it('沒有這張照片就回傳 undefined', async () => {
    expect(await getPhoto(memoryKV(), 'nope')).toBeUndefined();
  });

  it('刪掉照片後就讀不到了，其他照片不受影響', async () => {
    const kv = memoryKV();
    const a = await putPhoto(kv, new Blob(['a'], { type: 'image/png' }));
    const b = await putPhoto(kv, new Blob(['b'], { type: 'image/png' }));
    await deletePhoto(kv, a);
    expect(await getPhoto(kv, a)).toBeUndefined();
    expect(await (await getPhoto(kv, b))?.text()).toBe('b');
  });

  it('狀態裡只放照片 id，不放照片本身', async () => {
    const kv = memoryKV();
    await saveState(kv, addCommission(createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 1), {
      course: 'color', title: '色相環', dueAt: 9, levels: [{ title: '交件', minutes: 0, kind: 'submit' }],
    }, 2, 'c1'));
    const photoId = await putPhoto(kv, new Blob(['x'], { type: 'image/jpeg' }));
    await updateState(kv, (s) => ({ ...s, commissions: s.commissions.map((c) => ({ ...c, photoId })) }));

    const blobs: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v instanceof Blob) blobs.push(path);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(kv.raw.get(STATE_KEY), 'state');
    expect(blobs).toEqual([]);
    expect((kv.raw.get(STATE_KEY) as { commissions: { photoId: string }[] }).commissions[0].photoId).toBe(photoId);
  });
});
