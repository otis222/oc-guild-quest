// 加分關：委託的計時任務都完成以後，委託卡上多一顆「加分關」，交件以後也可以再玩。依部位分成三種：
// - 版面（平面構成）：設定圖急救（企劃表 T9，規則在 sheet.ts）
// - 配色（色彩學）：配色急救（T16，paletteGame.ts）
// - 名牌（字體設計）：名牌急救（T16，plateGame.ts）
// 草稿（手繪基礎）還沒有。選了這些部位的自訂課程也有。
// 分數只記在委託上（最高分），不會點亮設定卡、也不會改公會等級：核心機制還是「完成一個任務亮一片」。
import { clamp } from './math';
import { findCommission, isSubmitted, timedProgress } from './state';
import { cleanText } from './text';
import type { Commission, GuildState, PartType } from './types';

export type BonusGame = 'sheet' | 'palette' | 'nameplate';
/** 每個部位的加分關；沒有寫的部位（草稿）沒有加分關 */
export const BONUS_GAMES: Readonly<Partial<Record<PartType, BonusGame>>> = {
  layout: 'sheet',
  palette: 'palette',
  nameplate: 'nameplate',
};
/** 加分關滿分（三種都是 100） */
export const BONUS_FULL_SCORE = 100;
/** OC 的台詞最多幾個字（設定圖上的台詞卡放得下） */
export const QUOTE_MAX = 16;

/** 這個部位的加分關；沒有就是 null */
export const bonusGame = (part: PartType): BonusGame | null => BONUS_GAMES[part] ?? null;

/** 這張委託有沒有加分關：部位有加分關，而且計時任務都完成了（交件後也有） */
export function bonusUnlocked(c: Commission, part: PartType): boolean {
  if (!bonusGame(part)) return false;
  const { done, total } = timedProgress(c);
  return isSubmitted(c) || (total > 0 && done === total);
}

/** 結果的評語：滿分、70 分以上、其他 */
export type BonusGrade = 'perfect' | 'good' | 'retry';
export const bonusGrade = (score: number): BonusGrade =>
  (score >= BONUS_FULL_SCORE ? 'perfect' : score >= 70 ? 'good' : 'retry');

/** 記下加分關的分數，只留這張委託的最高分（0～100 的整數）；沒有比較高就回傳原本的狀態 */
export function recordBonus(s: GuildState, commissionId: string, score: number): GuildState {
  const c = findCommission(s, commissionId);
  const value = clamp(Math.round(score), 0, BONUS_FULL_SCORE);
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
