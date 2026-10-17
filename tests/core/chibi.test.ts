import { describe, expect, it } from 'vitest';
import {
  CHIBI_NOTE_MAX, CHIBI_UNLOCK_TASKS, chibiProgress, cleanChibiNote, isChibiCode, newChibiCode, parseChibiResult, parseSendReply,
  receiveChibi, requestChibi,
} from '../../src/core/chibi';
import { addCommission, completeLevel, createGuildState, findCommission, migrate, startLevel } from '../../src/core/state';
import { templateLevels } from '../../src/core/templates';
import type { GuildState } from '../../src/core/types';
import { seeded } from '../helpers/seeded';

const OC = { name: '小鈴', sprite: 'maid_1.png' };

/** 接一張委託，做完前 n 個計時任務 */
function withDone(n: number): GuildState {
  let s = addCommission(createGuildState(OC, 0), { course: 'drawing', title: 'k', dueAt: 9e12, levels: templateLevels('drawing') }, 1, 'k');
  for (const l of findCommission(s, 'k').levels.filter((x) => x.kind === 'timed').slice(0, n)) {
    s = completeLevel(startLevel(s, 'k', l.id, 10), 'k', l.id, 20);
  }
  return s;
}

describe('專屬小人：什麼時候解鎖', () => {
  it('完成 5 個計時任務才解鎖，看得到還差幾個', () => {
    expect(CHIBI_UNLOCK_TASKS).toBe(5);
    expect(chibiProgress(withDone(0))).toEqual({ done: 0, left: 5, unlocked: false });
    expect(chibiProgress(withDone(3))).toEqual({ done: 3, left: 2, unlocked: false });
    expect(chibiProgress(withDone(5))).toEqual({ done: 5, left: 0, unlocked: true });
  });
});

describe('專屬小人：領取碼', () => {
  it('格式是 XXXX-XXX，不會有 0 O 1 I L 這些容易看錯的字', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const code = newChibiCode(seeded(seed));
      expect(isChibiCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(newChibiCode(seeded(4))).toBe(newChibiCode(seeded(4)));
    expect(newChibiCode(() => 0.999999)).toBe('ZZZZ-ZZZ');
  });

  it('檢查領取碼', () => {
    expect(isChibiCode('K7Q2-M9X')).toBe(true);
    for (const bad of ['k7q2-m9x', 'K7Q2M9X', 'K7O2-M9X', 'K7Q2-M9X ', '', null, 123]) expect(isChibiCode(bad)).toBe(false);
  });

  it('給組員的話：整理空白、最多 60 字', () => {
    expect(cleanChibiNote('  想要  紅色的披風 ')).toBe('想要 紅色的披風');
    expect(Array.from(cleanChibiNote('字'.repeat(80))).length).toBe(CHIBI_NOTE_MAX);
  });
});

describe('專屬小人：存檔', () => {
  const s0 = withDone(5);

  it('送出記下領取碼；重送換新的', () => {
    const s1 = requestChibi(s0, 'K7Q2-M9X', 100);
    expect(s1.chibi).toEqual({ request: { code: 'K7Q2-M9X', requestedAt: 100 } });
    const s2 = requestChibi(s1, 'ABCD-EFG', 200);
    expect(s2.chibi?.request).toEqual({ code: 'ABCD-EFG', requestedAt: 200 });
    expect(() => requestChibi(s0, 'bad', 1)).toThrow();
  });

  it('領到：記下小人圖、清掉領取碼；領取碼對不上就不變', () => {
    const s1 = requestChibi(s0, 'K7Q2-M9X', 100);
    expect(receiveChibi(s1, 'ABCD-EFG', 'p1', 300).state).toBe(s1);
    const r = receiveChibi(s1, 'K7Q2-M9X', 'p1', 300);
    expect(r.state.chibi).toEqual({ photoId: 'p1', receivedAt: 300 });
    expect(r.replaced).toBeUndefined();
    // 領過一次已經不能用同一個碼再領
    expect(receiveChibi(r.state, 'K7Q2-M9X', 'p2', 400).state).toBe(r.state);
  });

  it('再訂一隻、再領到：回傳舊的小人圖讓呼叫的人刪掉', () => {
    let s = receiveChibi(requestChibi(s0, 'K7Q2-M9X', 100), 'K7Q2-M9X', 'p1', 300).state;
    s = requestChibi(s, 'ABCD-EFG', 400);
    expect(s.chibi).toEqual({ photoId: 'p1', receivedAt: 300, request: { code: 'ABCD-EFG', requestedAt: 400 } });
    const r = receiveChibi(s, 'ABCD-EFG', 'p2', 500);
    expect(r.state.chibi).toEqual({ photoId: 'p2', receivedAt: 500 });
    expect(r.replaced).toBe('p1');
  });

  it('舊存檔沒有這欄，照樣讀得進來', () => {
    expect(migrate(structuredClone(s0))).toEqual(s0);
    const s1 = requestChibi(s0, 'K7Q2-M9X', 100);
    expect(migrate(structuredClone(s1))).toEqual(s1);
  });
});

describe('專屬小人：收件處的回答', () => {
  it('送出：成功、或知道是哪種錯誤', () => {
    expect(parseSendReply({ ok: true })).toEqual({ ok: true });
    expect(parseSendReply({ ok: false, error: 'invite' })).toEqual({ ok: false, error: 'invite' });
    expect(parseSendReply({ ok: false, error: 'busy' })).toEqual({ ok: false, error: 'busy' });
    expect(parseSendReply({ ok: false, error: 'hacked' })).toEqual({ ok: false, error: 'unknown' });
    expect(parseSendReply('<html>')).toEqual({ ok: false, error: 'unknown' });
  });

  it('做好了嗎：還在做、做好了（附圖）', () => {
    expect(parseChibiResult({ ok: true, status: 'waiting' })).toEqual({ status: 'waiting' });
    expect(parseChibiResult({ ok: true, status: 'ready', mime: 'image/png', image: 'iVBORw0KGgo=' }))
      .toEqual({ status: 'ready', mime: 'image/png', image: 'iVBORw0KGgo=' });
  });

  it('奇怪的回答都當成錯誤，不會拿來當圖片用', () => {
    expect(parseChibiResult({ ok: false, error: 'bad_request' })).toEqual({ status: 'error', error: 'bad_request' });
    expect(parseChibiResult({ ok: true, status: 'ready', mime: 'text/html', image: 'iVBORw0KGgo=' })).toEqual({ status: 'error', error: 'unknown' });
    expect(parseChibiResult({ ok: true, status: 'ready', mime: 'image/png', image: '<script>' })).toEqual({ status: 'error', error: 'unknown' });
    expect(parseChibiResult({ ok: true, status: 'ready', mime: 'image/png', image: '' })).toEqual({ status: 'error', error: 'unknown' });
    expect(parseChibiResult(null)).toEqual({ status: 'error', error: 'unknown' });
  });
});
