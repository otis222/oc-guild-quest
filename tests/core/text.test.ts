import { describe, expect, it } from 'vitest';
import { cleanText } from '../../src/core/text';

describe('cleanText', () => {
  it('去掉前後空白，中間連續空白（含全形空白、換行）變一個', () => {
    expect(cleanText('  色相環\n\n作業  ', 30)).toBe('色相環 作業');
    expect(cleanText('字體　　海報', 30)).toBe('字體 海報');
  });

  it('照字數截斷，截完再去掉尾巴的空白', () => {
    expect(cleanText('一二三 四五', 4)).toBe('一二三');
    expect(cleanText('🎨'.repeat(5), 3)).toBe('🎨🎨🎨');
  });
});
