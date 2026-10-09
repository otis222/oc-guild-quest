// 玩家輸入文字的整理

/** 去掉前後空白、連續空白變一個；超過 max 個字就截掉（照字數算，不會切壞 emoji） */
export function cleanText(input: string, max: number): string {
  return Array.from(input.trim().replace(/\s+/g, ' ')).slice(0, max).join('').trim();
}
