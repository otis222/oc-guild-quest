import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../src/core/manifest';
import raw from '../../public/sprites/manifest.json';

describe('parseManifest', () => {
  it('讀得懂專案附的 public/sprites/manifest.json', () => {
    const m = parseManifest(raw);
    expect(m.playerDefault).toBe('silhouette.png');
    expect(m.members).toHaveLength(10);
    expect(m.members[0]).toEqual({ file: 'maid_1.png', name: '白髮女僕 #1' });
  });

  it('格式不對就丟錯', () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest({ members: [] })).toThrow();
    expect(() => parseManifest({ player_default: 'a.png' })).toThrow();
    expect(() => parseManifest({ player_default: 'a.png', members: [{ file: 'x.png' }] })).toThrow();
  });

  it('不接受跳出資料夾或外部網址的檔名', () => {
    expect(() => parseManifest({ player_default: '../a.png', members: [] })).toThrow();
    expect(() => parseManifest({ player_default: 'a.png', members: [{ file: 'https://x/y.png', name: 'n' }] })).toThrow();
  });
});
