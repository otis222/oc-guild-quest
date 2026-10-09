// 遊戲狀態：整個 GuildState 存在 'state' 這個 key。
// 下面的操作都是純函式（回傳新的狀態，不改舊的）；要存檔時用 updateState 包起來，
// 它會先讀最新的存檔再套用，所以開兩個分頁也不會拿舊資料蓋掉新進度。
import { newId } from './id';
import { STATE_KEY, type KV } from './storage';
import type { Commission, CourseType, GuildState, Level, OCProfile } from './types';

export const STATE_VERSION = 1;
/** 設定卡每區幾格（企劃表 7.4） */
export const CELLS_PER_COURSE = 3;

type RawState = Record<string, unknown> & { version: number };
/**
 * 把第 n 版的存檔升成第 n+1 版。
 * 改 GuildState 的結構時：STATE_VERSION 加一，在 MIGRATIONS 補上舊版號的函式，舊存檔讀進來會自動升級。
 */
export type Migration = (old: RawState) => RawState;
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function createGuildState(oc: OCProfile, now = Date.now()): GuildState {
  return { version: STATE_VERSION, createdAt: now, oc, commissions: [], guildLevel: 1, exhibits: [] };
}

export interface LevelDraft {
  title: string;
  minutes: number;
  kind: Level['kind'];
}

export interface CommissionDraft {
  course: CourseType;
  title: string;
  dueAt: number;
  levels: LevelDraft[];
}

/** 接一張新委託，放在 commissions 最後面。cellIndex：同課程的第幾張，3 格滿了從 0 再一輪（企劃表 7.4）。 */
export function addCommission(s: GuildState, draft: CommissionDraft, now = Date.now(), id = newId(now)): GuildState {
  const sameCourse = s.commissions.filter((c) => c.course === draft.course).length;
  const commission: Commission = {
    id,
    course: draft.course,
    title: draft.title,
    createdAt: now,
    dueAt: draft.dueAt,
    levels: draft.levels.map((l) => ({
      id: newId(now), title: l.title, minutes: l.minutes, kind: l.kind, status: 'todo', pausedMs: 0, focusMs: 0,
    })),
    cellIndex: sameCourse % CELLS_PER_COURSE,
  };
  return { ...s, commissions: [...s.commissions, commission] };
}

/** 完成一個計時關卡。已經完成的不會再算一次（回傳原本的狀態）。交件關不能用這個。 */
export function completeLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now()): GuildState {
  const c = s.commissions.find((x) => x.id === commissionId);
  if (!c) throw new Error(`找不到委託 ${commissionId}`);
  const level = c.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`找不到關卡 ${levelId}`);
  if (level.kind !== 'timed') throw new Error('交件關要走交件流程');
  if (level.status === 'done') return s;
  const levels = c.levels.map((l): Level => (l === level ? { ...l, status: 'done', doneAt: now } : l));
  return { ...s, commissions: s.commissions.map((x) => (x === c ? { ...c, levels } : x)) };
}

// ---------------------------------------------------------------- 讀寫存檔

/** 讀存檔：沒有存檔回傳 null。存檔壞了或比程式新會丟錯，這時不要拿新的狀態蓋掉它。 */
export async function loadState(kv: KV): Promise<GuildState | null> {
  const raw = await kv.get<unknown>(STATE_KEY);
  return raw === undefined ? null : migrate(raw);
}

/** 整個狀態寫進去（建立新存檔時用；之後的修改請用 updateState） */
export async function saveState(kv: KV, s: GuildState): Promise<void> {
  await kv.set(STATE_KEY, s);
}

/** 讀最新的存檔 → 套用 fn → 寫回去，在同一個交易裡完成，回傳新狀態。 */
export function updateState(kv: KV, fn: (s: GuildState) => GuildState): Promise<GuildState> {
  return kv.update<GuildState>(STATE_KEY, (raw) => {
    if (raw === undefined) throw new Error('還沒有存檔');
    return fn(migrate(raw));
  });
}

/** 把讀出來的資料升到目前版本，並檢查基本格式 */
export function migrate(raw: unknown, steps: Readonly<Record<number, Migration>> = MIGRATIONS): GuildState {
  if (!isRawState(raw)) throw new Error('存檔格式不對：沒有版本號');
  let s = raw;
  if (s.version > STATE_VERSION) throw new Error(`存檔是第 ${s.version} 版，比程式（第 ${STATE_VERSION} 版）新`);
  while (s.version < STATE_VERSION) {
    const step = steps[s.version];
    if (!step) throw new Error(`沒有第 ${s.version} 版的升級方式`);
    const next = step(s);
    if (next.version <= s.version) throw new Error(`第 ${s.version} 版的升級方式沒有把版本號往上加`);
    s = next;
  }
  if (!isGuildState(s)) throw new Error('存檔格式不對');
  return s;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isRawState(v: unknown): v is RawState {
  return isObj(v) && Number.isInteger(v.version);
}

/** 只檢查最外層，不逐關檢查：寧可讀進來，也不要因為小地方不對就整個打不開 */
function isGuildState(s: RawState): s is RawState & GuildState {
  return s.version === STATE_VERSION && typeof s.createdAt === 'number'
    && isObj(s.oc) && typeof s.oc.name === 'string' && typeof s.oc.sprite === 'string'
    && Array.isArray(s.commissions) && typeof s.guildLevel === 'number' && Array.isArray(s.exhibits);
}
