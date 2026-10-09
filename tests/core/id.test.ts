import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/id';

describe('newId', () => {
  it('格式是「時間-16 位十六進位亂數」', () => {
    expect(newId(1_700_000_000_000)).toMatch(/^[0-9a-z]+-[0-9a-f]{16}$/);
    expect(newId(1_700_000_000_000).startsWith((1_700_000_000_000).toString(36) + '-')).toBe(true);
  });

  it('同一毫秒產生很多個也不會重複', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId(42)));
    expect(ids.size).toBe(5000);
  });
});
