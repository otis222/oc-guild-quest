// OC 設定圖成品（企劃表 T18）：把 OC 圖、名牌、配色、版面、草稿、台詞和設定圖急救排得最好的那次，組成一張直式的設定圖。
// 這裡只決定要放什麼（還沒有的部件用預設樣子、還沒玩過設定圖急救就用預設排法），畫在 src/ui/charSheet.ts。
import { PARTS } from './templates';
import type { GuildState, PartType, SheetCardId, SheetPositions } from './types';
import type { SheetLayout } from './sheet';

/**
 * 還沒玩過設定圖急救時的排法：名字、台詞靠左放上面，空一列，三視圖站在同一條線上等距排開。
 * 照設定圖急救的規則是 100 分。
 */
export const DEFAULT_SHEET_POSITIONS: SheetPositions = {
  name: { x: 0, y: 0 },
  quote: { x: 0, y: 1 },
  front: { x: 0, y: 3 },
  side: { x: 3, y: 3 },
  back: { x: 6, y: 3 },
};

const CARDS: readonly SheetCardId[] = ['name', 'quote', 'front', 'side', 'back'];

/** 設定圖急救的排法 → 每張小卡的位置；有小卡還沒放進格線就是 null（不記） */
export function sheetPositions(layout: SheetLayout): SheetPositions | null {
  if (CARDS.some((id) => !layout[id].placed)) return null;
  return Object.fromEntries(CARDS.map((id) => [id, { x: layout[id].x, y: layout[id].y }])) as Record<SheetCardId, { x: number; y: number }>;
}

/** 記下設定圖急救排得最好的那次：分數比原本高、或一樣高（留新的）才換；沒換就回傳原本的狀態 */
export function recordSheetBest(s: GuildState, positions: SheetPositions, score: number, now: number): GuildState {
  const old = s.oc.sheetBest;
  if (old && old.score > score) return s;
  return { ...s, oc: { ...s.oc, sheetBest: { positions, score, at: now } } };
}

export interface CharSheetData {
  name: string;
  quote?: string;
  guildLevel: number;
  /** OC 目前的部件（每個部位最近一次交件的成果）；沒有的部位畫預設的樣子 */
  nameplatePhotoId?: string;
  palette: string[];
  layoutPhotoId?: string;
  sketchPhotoId?: string;
  /** 已經有的部位，照 PARTS 的順序 */
  parts: PartType[];
  /** 名字、台詞、三視圖的位置 */
  positions: SheetPositions;
  /** 排法是玩家在設定圖急救排的（false 是預設排法） */
  fromGame: boolean;
}

export function charSheetData(s: GuildState): CharSheetData {
  const { oc } = s;
  const palette = [...(oc.palette ?? [])];
  const has: Record<PartType, boolean> = {
    nameplate: !!oc.nameplatePhotoId, palette: palette.length > 0, layout: !!oc.layoutPhotoId, sketch: !!oc.sketchPhotoId,
  };
  return {
    name: oc.name,
    ...(oc.quote ? { quote: oc.quote } : {}),
    guildLevel: s.guildLevel,
    ...(oc.nameplatePhotoId ? { nameplatePhotoId: oc.nameplatePhotoId } : {}),
    palette,
    ...(oc.layoutPhotoId ? { layoutPhotoId: oc.layoutPhotoId } : {}),
    ...(oc.sketchPhotoId ? { sketchPhotoId: oc.sketchPhotoId } : {}),
    parts: PARTS.filter((p) => has[p]),
    positions: oc.sheetBest?.positions ?? DEFAULT_SHEET_POSITIONS,
    fromGame: !!oc.sheetBest,
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 存成圖片的檔名：oc-sheet-20261014-1530.png */
export function charSheetFileName(now = Date.now()): string {
  const d = new Date(now);
  return `oc-sheet-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}
