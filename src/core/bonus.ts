// 平面構成的加分關（企劃表 T9）：部位是「版面」的委託（平面構成，或選了版面的自訂課程），
// 計時任務都完成以後，委託卡上多一顆「加分關」，可以玩設定圖急救（規則在 sheet.ts）。交件以後也可以再玩。
// 分數只記在委託上（最高分），不會點亮設定卡、也不會改公會等級：核心機制還是「完成一個任務亮一片」。
import { clamp } from './math';
import { SHEET_FULL_SCORE } from './sheet';
import { findCommission, isSubmitted, timedProgress } from './state';
import { cleanText } from './text';
import type { Commission, GuildState, PartType } from './types';

/** 有加分關的部位：版面（平面構成） */
export const BONUS_PART: PartType = 'layout';
/** OC 的台詞最多幾個字（設定圖上的台詞卡放得下） */
export const QUOTE_MAX = 16;

/** 這張委託有沒有加分關：部位是版面，而且計時任務都完成了（交件後也有） */
export function bonusUnlocked(c: Commission, part: PartType): boolean {
  if (part !== BONUS_PART) return false;
  const { done, total } = timedProgress(c);
  return isSubmitted(c) || (total > 0 && done === total);
}

/** 記下加分關的分數，只留這張委託的最高分（0～100 的整數）；沒有比較高就回傳原本的狀態 */
export function recordBonus(s: GuildState, commissionId: string, score: number): GuildState {
  const c = findCommission(s, commissionId);
  const value = clamp(Math.round(score), 0, SHEET_FULL_SCORE);
  if (c.bonusBest !== undefined && c.bonusBest >= value) return s;
  return { ...s, commissions: s.commissions.map((x) => (x === c ? { ...c, bonusBest: value } : x)) };
}

/** 整理玩家寫的台詞：去掉多餘空白、最多 16 個字 */
export const cleanQuote = (input: string): string => cleanText(input, QUOTE_MAX);

/** 改 OC 的台詞；清空就拿掉這欄。跟原本一樣回傳原本的狀態 */
export function setOcQuote(s: GuildState, input: string): GuildState {
  const quote = cleanQuote(input);
  if ((s.oc.quote ?? '') === quote) return s;
  const oc = { ...s.oc };
  if (quote) oc.quote = quote;
  else delete oc.quote;
  return { ...s, oc };
}
