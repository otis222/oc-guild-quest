import { describe, expect, it } from 'vitest';
import { bonusUnlocked, cleanQuote, QUOTE_MAX, recordBonus, setOcQuote } from '../../src/core/bonus';
import { courseInfo } from '../../src/core/courses';
import { addCommission, completeLevel, createGuildState, findCommission, migrate, startLevel } from '../../src/core/state';
import { submitCommission } from '../../src/core/submit';
import { levelsFrom, templateLevels } from '../../src/core/templates';
import type { CourseType, GuildState } from '../../src/core/types';

const OC = { name: '小鈴', sprite: 'maid_1.png' };
const add = (s: GuildState, course: CourseType, id: string): GuildState =>
  addCommission(s, { course, title: id, dueAt: 9e12, levels: templateLevels(course) }, 10, id);

/** 把一張委託的前 n 個計時任務做完 */
function finishTasks(s0: GuildState, id: string, n: number): GuildState {
  let s = s0;
  for (const l of findCommission(s, id).levels.filter((x) => x.kind === 'timed').slice(0, n)) {
    s = completeLevel(startLevel(s, id, l.id, 100), id, l.id, 200);
  }
  return s;
}
const unlocked = (s: GuildState, id: string): boolean => {
  const c = findCommission(s, id);
  return bonusUnlocked(c, courseInfo(s, c.course).part);
};

describe('加分關：什麼時候開放', () => {
  it('平面構成：計時任務都完成才開放，交件後也還在', () => {
    let s = add(createGuildState(OC, 1), 'composition', 'k1');
    expect(unlocked(s, 'k1')).toBe(false);
    s = finishTasks(s, 'k1', 4);
    expect(unlocked(s, 'k1')).toBe(false);
    s = finishTasks(s, 'k1', 5);
    expect(unlocked(s, 'k1')).toBe(true);
    s = submitCommission(s, 'k1', { photoId: 'p1' });
    expect(unlocked(s, 'k1')).toBe(true);
  });

  it('其他部位的課程沒有加分關', () => {
    let s = createGuildState(OC, 1);
    for (const course of ['typography', 'color', 'drawing'] as const) {
      s = finishTasks(add(s, course, course), course, 5);
      expect(unlocked(s, course)).toBe(false);
    }
  });

  it('自訂課程選了版面也有；任務被改成 1 個的話，做完 1 個就開放', () => {
    const s0 = addCommission(createGuildState(OC, 1),
      { course: { label: '攝影', part: 'layout' }, title: '光影練習', dueAt: 9e12, levels: levelsFrom(['拍照']) }, 10, 'p1');
    expect(unlocked(s0, 'p1')).toBe(false);
    expect(unlocked(finishTasks(s0, 'p1', 1), 'p1')).toBe(true);
  });
});

describe('加分關：記分數', () => {
  const s0 = add(createGuildState(OC, 1), 'composition', 'k1');

  it('只留最高分；比較低的分數不改存檔', () => {
    const s1 = recordBonus(s0, 'k1', 65);
    expect(findCommission(s1, 'k1').bonusBest).toBe(65);
    const s2 = recordBonus(s1, 'k1', 85);
    expect(findCommission(s2, 'k1').bonusBest).toBe(85);
    expect(recordBonus(s2, 'k1', 70)).toBe(s2);
    expect(recordBonus(s2, 'k1', 85)).toBe(s2);
  });

  it('0 分也記；分數整理成 0～100 的整數', () => {
    expect(findCommission(recordBonus(s0, 'k1', 0), 'k1').bonusBest).toBe(0);
    expect(findCommission(recordBonus(s0, 'k1', 84.6), 'k1').bonusBest).toBe(85);
    expect(findCommission(recordBonus(s0, 'k1', 120), 'k1').bonusBest).toBe(100);
    expect(findCommission(recordBonus(s0, 'k1', -5), 'k1').bonusBest).toBe(0);
  });

  it('不會動到別張委託、設定卡和公會等級', () => {
    const s = add(s0, 'composition', 'k2');
    const next = recordBonus(s, 'k1', 90);
    expect(findCommission(next, 'k2')).toBe(findCommission(s, 'k2'));
    expect(next.guildLevel).toBe(s.guildLevel);
    expect(findCommission(next, 'k1').levels).toBe(findCommission(s, 'k1').levels);
  });

  it('找不到委託會丟錯', () => {
    expect(() => recordBonus(s0, 'nope', 50)).toThrow();
  });
});

describe('OC 的台詞', () => {
  const s0 = createGuildState(OC, 1);

  it('整理空白、最多 16 個字', () => {
    expect(cleanQuote('  交件了 ， 今天也  努力  ')).toBe('交件了 ， 今天也 努力');
    expect(Array.from(cleanQuote('一二三四五六七八九十一二三四五六七八')).length).toBe(QUOTE_MAX);
  });

  it('存進 OC；跟原本一樣回傳原本的狀態；清空就拿掉這欄', () => {
    const s1 = setOcQuote(s0, ' 交件了！ ');
    expect(s1.oc).toEqual({ ...OC, quote: '交件了！' });
    expect(setOcQuote(s1, '交件了！')).toBe(s1);
    const s2 = setOcQuote(s1, '   ');
    expect(s2.oc).toEqual(OC);
    expect('quote' in s2.oc).toBe(false);
    expect(setOcQuote(s0, '')).toBe(s0);
  });

  it('舊存檔沒有台詞和加分關分數，照樣讀得進來', () => {
    const old = add(s0, 'composition', 'k1');
    expect(migrate(structuredClone(old))).toEqual(old);
  });
});
