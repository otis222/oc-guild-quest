import { describe, expect, it } from 'vitest';
import { fitLongSide, NAMEPLATE_ASPECT, NAMEPLATE_MIN_SCALE, nameplateCrop, PHOTO_MAX_SIDE } from '../../src/core/image';

describe('交件照片縮圖', () => {
  it(`長邊縮到 ${PHOTO_MAX_SIDE}px，等比例`, () => {
    expect(fitLongSide(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitLongSide(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('小圖不放大；寬高至少 1px', () => {
    expect(fitLongSide(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitLongSide(5000, 2)).toEqual({ width: 1024, height: 1 });
  });
});

describe('名牌裁切框', () => {
  it('固定 3:1；最大是照片放得下的最大框，最小是 3 成', () => {
    const big = nameplateCrop(1024, 768, 1, 512, 384);
    expect(big).toEqual({ x: 0, y: 213 + 1 / 3, w: 1024, h: 1024 / 3 });
    const small = nameplateCrop(1024, 768, 0, 512, 384);
    expect(small.w).toBeCloseTo(1024 * NAMEPLATE_MIN_SCALE);
    expect(small.w / small.h).toBeCloseTo(NAMEPLATE_ASPECT);
  });

  it('直式照片：框的寬度不會超過照片寬', () => {
    const c = nameplateCrop(600, 1000, 1, 300, 500);
    expect(c.w).toBe(600);
    expect(c.h).toBe(200);
  });

  it('很扁的照片：框的高度不會超過照片高', () => {
    const c = nameplateCrop(1000, 100, 1, 500, 50);
    expect(c.h).toBe(100);
    expect(c.w).toBe(300);
  });

  it('拖到邊邊：框會被推回照片裡', () => {
    expect(nameplateCrop(1024, 768, 0.5, -100, -100)).toMatchObject({ x: 0, y: 0 });
    const c = nameplateCrop(1024, 768, 0.5, 5000, 5000);
    expect(c.x + c.w).toBeCloseTo(1024);
    expect(c.y + c.h).toBeCloseTo(768);
  });
});
