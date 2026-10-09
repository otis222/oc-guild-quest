import { describe, expect, it } from 'vitest';
import {
  cleanOcName, MAX_GUILD_MEMBERS, OC_NAME_MAX, pickGuildMembers, reassignMembers, uploadedPhotoId, uploadSpriteRef,
} from '../../src/core/oc';
import { parseManifest } from '../../src/core/manifest';
import raw from '../../public/sprites/manifest.json';

const { members } = parseManifest(raw);

describe('OC 名字', () => {
  it('去掉前後空白，中間連續空白變一個', () => {
    expect(cleanOcName('  小 鈴  ')).toBe('小 鈴');
    expect(cleanOcName('Rin\t\t  Chan')).toBe('Rin Chan');
  });

  it('只有空白就是空字串', () => {
    expect(cleanOcName('   ')).toBe('');
  });

  it(`超過 ${OC_NAME_MAX} 個字會截掉，不會切壞 emoji`, () => {
    expect(cleanOcName('一二三四五六七八九十甲乙丙丁')).toBe('一二三四五六七八九十甲乙');
    const emoji = cleanOcName('🐰'.repeat(20));
    expect(Array.from(emoji)).toHaveLength(OC_NAME_MAX);
    expect(emoji).toBe('🐰'.repeat(OC_NAME_MAX));
  });
});

describe('上傳圖的 sprite 寫法', () => {
  it('upload:<id> 來回轉換', () => {
    expect(uploadSpriteRef('abc-123')).toBe('upload:abc-123');
    expect(uploadedPhotoId(uploadSpriteRef('abc-123'))).toBe('abc-123');
  });

  it('AI 小人檔名不是上傳的圖', () => {
    expect(uploadedPhotoId('maid_1.png')).toBeNull();
  });
});

describe('公會成員', () => {
  it(`最多 ${MAX_GUILD_MEMBERS} 隻，照 manifest 順序`, () => {
    const picked = pickGuildMembers(members, 'upload:x');
    expect(picked).toHaveLength(MAX_GUILD_MEMBERS);
    expect(picked).toEqual(members.slice(0, MAX_GUILD_MEMBERS));
  });

  it('排除玩家選的那隻，由下一隻補上', () => {
    const picked = pickGuildMembers(members, 'bunny_1.png');
    expect(picked.map((m) => m.file)).not.toContain('bunny_1.png');
    expect(picked).toHaveLength(MAX_GUILD_MEMBERS);
    expect(picked.map((m) => m.file)).toEqual(['maid_1.png', 'nurse_1.png', 'chick_1.png', 'maid_2.png', 'bunny_2.png', 'nurse_2.png']);
  });

  it('小人不夠多時就全部都來', () => {
    expect(pickGuildMembers(members.slice(0, 3), 'maid_1.png').map((m) => m.file)).toEqual(['bunny_1.png', 'nurse_1.png']);
  });
});

describe('換造型後重新分配公會成員', () => {
  const files = (sprite: string): string[] => pickGuildMembers(members, sprite).map((m) => m.file);

  it('換成某位成員的樣子：只換掉那一位，其他人留在原位', () => {
    const before = files('maid_1.png');
    const after = reassignMembers(before, files('nurse_1.png'));
    expect(after).toEqual(['bunny_1.png', 'maid_1.png', 'chick_1.png', 'maid_2.png', 'bunny_2.png', 'nurse_2.png']);
    expect(after).not.toContain('nurse_1.png');
    expect(new Set(after)).toEqual(new Set(files('nurse_1.png')));
  });

  it('換成上傳的圖：原本的造型回到成員裡，換掉一位名單外的', () => {
    const after = reassignMembers(files('maid_1.png'), files('upload:x'));
    expect(after).toEqual(['bunny_1.png', 'nurse_1.png', 'chick_1.png', 'maid_2.png', 'bunny_2.png', 'maid_1.png']);
    expect(new Set(after)).toEqual(new Set(files('upload:x')));
  });

  it('名單沒變就不動', () => {
    const before = files('maid_1.png');
    expect(reassignMembers(before, before)).toEqual(before);
  });
});
