// 交件（企劃表 T6、7.5）：委託標成已交件，作業成果依部位變成 OC 的部件，照片放上大廳展台，公會等級＋1。
// 部位看課程（courses.ts）：自訂課程選了哪個部位，就跟那個部位的內建課程一樣。
import { courseInfo } from './courses';
import { findCommission, isSubmitted } from './state';
import type { Commission, GuildState, OCProfile, PartType } from './types';

/** 大廳後方的展台數。照片超過 5 張時，從第 1 個位置開始輪流換掉最舊的那張（哪個位置是哪座展台，見 scene/exhibits.ts） */
export const EXHIBIT_SLOTS = 5;

export interface SubmitResult {
  /** 交件照片（已經存進 IndexedDB 的照片 id） */
  photoId: string;
  /** 部位是配色：從照片抽出的色 */
  palette?: readonly string[];
  /** 部位是名牌：從照片裁出來的名牌圖（照片 id） */
  nameplatePhotoId?: string;
}

const submittedCount = (s: GuildState): number => s.commissions.filter(isSubmitted).length;

/** 公會等級 = 1 ＋ 已交件委託數（企劃表 7.5） */
export const guildLevelOf = (s: GuildState): number => 1 + submittedCount(s);

/** 下一張交件照片放在第幾個位置：交過幾份就輪到第幾個，5 個都放過了從第 1 個再來 */
export const nextExhibitSlot = (s: GuildState): number => submittedCount(s) % EXHIBIT_SLOTS;

/** 依部位取出要記在委託上的成果；配色沒有顏色、名牌沒有裁好的圖會丟錯 */
function partResult(part: PartType, r: SubmitResult): Partial<Commission> {
  if (part === 'palette') {
    if (!r.palette?.length) throw new Error('配色要有顏色');
    return { palette: [...r.palette] };
  }
  if (part === 'nameplate') {
    if (!r.nameplatePhotoId) throw new Error('名牌要有裁好的圖');
    return { nameplatePhotoId: r.nameplatePhotoId };
  }
  return {};
}

/** OC 換上這次的成果 */
function withPart(oc: OCProfile, part: PartType, r: SubmitResult): OCProfile {
  switch (part) {
    case 'palette': return { ...oc, palette: [...(r.palette ?? [])] };
    case 'nameplate': return { ...oc, nameplatePhotoId: r.nameplatePhotoId };
    case 'layout': return { ...oc, layoutPhotoId: r.photoId };
    case 'sketch': return { ...oc, sketchPhotoId: r.photoId };
  }
}

/** 交件。已經交過的不會再交一次（回傳原本的狀態）。 */
export function submitCommission(s: GuildState, commissionId: string, r: SubmitResult, now = Date.now()): GuildState {
  const c = findCommission(s, commissionId);
  if (isSubmitted(c)) return s;
  const { part } = courseInfo(s, c.course);
  const done: Commission = {
    ...c,
    ...partResult(part, r),
    submittedAt: now,
    photoId: r.photoId,
    levels: c.levels.map((l) => (l.kind === 'submit' ? { ...l, status: 'done', doneAt: now } : l)),
  };
  const exhibits = [...s.exhibits];
  exhibits[nextExhibitSlot(s)] = r.photoId;
  const next: GuildState = {
    ...s,
    oc: withPart(s.oc, part, r),
    commissions: s.commissions.map((x) => (x === c ? done : x)),
    exhibits,
  };
  return { ...next, guildLevel: guildLevelOf(next) };
}

/** 這張照片是哪張委託交的（展品放大看時顯示）；找不到回傳 null */
export const commissionOfPhoto = (s: GuildState, photoId: string): Commission | null =>
  s.commissions.find((c) => c.photoId === photoId) ?? null;

/** OC 每個部件來自哪張委託：同部位最近交件的那張（設定卡上的部件格用）；還沒交過的部位沒有 */
export function partSources(s: GuildState): Partial<Record<PartType, Commission>> {
  const out: Partial<Record<PartType, Commission>> = {};
  for (const c of s.commissions) {
    if (!isSubmitted(c)) continue;
    const { part } = courseInfo(s, c.course);
    const prev = out[part];
    if (!prev || (prev.submittedAt ?? 0) <= (c.submittedAt ?? 0)) out[part] = c;
  }
  return out;
}
