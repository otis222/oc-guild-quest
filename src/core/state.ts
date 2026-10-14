// 遊戲狀態：整個 GuildState 存在 'state' 這個 key。
// 下面的操作都是純函式（回傳新的狀態，不改舊的）；要存檔時用 updateState 包起來，
// 它會先讀最新的存檔再套用，所以開兩個分頁也不會拿舊資料蓋掉新進度。
import { addCustomCourse, type NewCourse } from './courses';
import { newId } from './id';
import { STATE_KEY, type KV } from './storage';
import { EXTEND_MINUTES, extendTimer, finishTimer, pauseTimer, resumeTimer, startTimer } from './timer';
import type { Commission, CourseId, GuildState, Level, OCProfile } from './types';

export const STATE_VERSION = 2;
/** 設定卡每區幾格（企劃表 7.4） */
export const CELLS_PER_COURSE = 3;

type RawState = Record<string, unknown> & { version: number };
/**
 * 把第 n 版的存檔升成第 n+1 版。
 * 改 GuildState 的結構時：STATE_VERSION 加一，在 MIGRATIONS 補上舊版號的函式，舊存檔讀進來會自動升級。
 */
export type Migration = (old: RawState) => RawState;
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 第 2 版：加上自訂課程
  1: (old) => ({ ...old, version: 2, customCourses: [] }),
};

export function createGuildState(oc: OCProfile, now = Date.now()): GuildState {
  return { version: STATE_VERSION, createdAt: now, oc, commissions: [], guildLevel: 1, exhibits: [], customCourses: [] };
}

export interface LevelDraft {
  title: string;
  minutes: number;
  kind: Level['kind'];
}

export interface CommissionDraft {
  /** 已經有的課程，或要跟這張委託一起建立的新課程 */
  course: CourseId | NewCourse;
  title: string;
  dueAt: number;
  levels: LevelDraft[];
}

/**
 * 接一張新委託，放在 commissions 最後面。cellIndex：同課程的第幾張，3 格滿了從 0 再一輪（企劃表 7.4）。
 * 委託單上新加的課程在這裡一起建立，所以不會有「課程建好了、委託沒存到」的情況。
 */
export function addCommission(s0: GuildState, draft: CommissionDraft, now = Date.now(), id = newId(now)): GuildState {
  const { state: s, courseId } = typeof draft.course === 'string'
    ? { state: s0, courseId: draft.course }
    : addCustomCourse(s0, draft.course, now);
  const sameCourse = s.commissions.filter((c) => c.course === courseId).length;
  const commission: Commission = {
    id,
    course: courseId,
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

/** 找委託；找不到就丟錯 */
export function findCommission(s: GuildState, commissionId: string): Commission {
  const commission = s.commissions.find((x) => x.id === commissionId);
  if (!commission) throw new Error(`找不到委託 ${commissionId}`);
  return commission;
}

/** 找委託和裡面的某一關；找不到就丟錯 */
export function findLevel(s: GuildState, commissionId: string, levelId: string): { commission: Commission; level: Level } {
  const commission = findCommission(s, commissionId);
  const level = commission.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`找不到關卡 ${levelId}`);
  return { commission, level };
}

/** 把 fn 套用到某一關；fn 回傳原本那個物件代表沒變，整個狀態也原樣回傳 */
function mapLevel(s: GuildState, commissionId: string, levelId: string, fn: (l: Level) => Level): GuildState {
  const { commission, level } = findLevel(s, commissionId, levelId);
  const next = fn(level);
  if (next === level) return s;
  const levels = commission.levels.map((l) => (l === level ? next : l));
  return { ...s, commissions: s.commissions.map((x) => (x === commission ? { ...commission, levels } : x)) };
}

/** 同時只跑一個任務：把其他正在跑的任務先暫停 */
function pauseOthers(s: GuildState, exceptLevelId: string, now: number): GuildState {
  let changed = false;
  const commissions = s.commissions.map((c) => {
    if (!c.levels.some((l) => l.id !== exceptLevelId && l.status === 'doing' && l.pausedAt === undefined)) return c;
    changed = true;
    return { ...c, levels: c.levels.map((l) => (l.id !== exceptLevelId ? pauseTimer(l, now) : l)) };
  });
  return changed ? { ...s, commissions } : s;
}

/** 正在跑的任務全部先暫停（開始畫圖時，見 drawTime.ts）；都沒在跑就回傳原本的狀態 */
export const pauseRunningLevels = (s: GuildState, now = Date.now()): GuildState => pauseOthers(s, '', now);

const timedOnly = (level: Level): void => {
  if (level.kind !== 'timed') throw new Error('交件關要走交件流程');
};

/** 開始一個計時任務（其他正在跑的會先暫停）。已經開始或完成的不會重來。 */
export function startLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now()): GuildState {
  const { level } = findLevel(s, commissionId, levelId);
  timedOnly(level);
  if (level.status !== 'todo') return s;
  return mapLevel(pauseOthers(s, levelId, now), commissionId, levelId, (l) => startTimer(l, now));
}

export function pauseLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now()): GuildState {
  return mapLevel(s, commissionId, levelId, (l) => pauseTimer(l, now));
}

/** 繼續暫停中的任務（其他正在跑的會先暫停） */
export function resumeLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now()): GuildState {
  const { level } = findLevel(s, commissionId, levelId);
  if (level.status !== 'doing' || level.pausedAt === undefined) return s;
  return mapLevel(pauseOthers(s, levelId, now), commissionId, levelId, (l) => resumeTimer(l, now));
}

export function extendLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now(), minutes = EXTEND_MINUTES): GuildState {
  return mapLevel(s, commissionId, levelId, (l) => extendTimer(l, now, minutes));
}

/** 完成一個計時任務（記下專注時間）。已經完成的不會再算一次（回傳原本的狀態）。交件關不能用這個。 */
export function completeLevel(s: GuildState, commissionId: string, levelId: string, now = Date.now()): GuildState {
  timedOnly(findLevel(s, commissionId, levelId).level);
  return mapLevel(s, commissionId, levelId, (l) => finishTimer(l, now));
}

// ---------------------------------------------------------------- 查詢

/** 計時關卡完成了幾個、總共幾個（委託卡上的 x/5） */
export function timedProgress(c: Commission): { done: number; total: number } {
  const timed = c.levels.filter((l) => l.kind === 'timed');
  return { done: timed.filter((l) => l.status === 'done').length, total: timed.length };
}

export const isSubmitted = (c: Commission): boolean => c.submittedAt !== undefined;

/** 進行中（還沒交件，逾期的也算）：截止早的排前面 */
export function activeCommissions(s: GuildState): Commission[] {
  return s.commissions.filter((c) => !isSubmitted(c)).sort((a, b) => a.dueAt - b.dueAt);
}

/** 已完成（交件了）：最近交的排前面 */
export function completedCommissions(s: GuildState): Commission[] {
  return s.commissions.filter(isSubmitted).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
}

/** 下一個要做的關卡（第一個還沒完成的）；全部完成回傳 null */
export const nextLevel = (c: Commission): Level | null => c.levels.find((l) => l.status !== 'done') ?? null;

/** 正在做的任務：正在跑（含時間到）的優先，其次是最近暫停的；都沒有回傳 null */
export function currentWork(s: GuildState): { commission: Commission; level: Level } | null {
  let best: { commission: Commission; level: Level } | null = null;
  let bestKey = -Infinity;
  for (const commission of s.commissions) {
    for (const level of commission.levels) {
      if (level.status !== 'doing') continue;
      const key = level.pausedAt ?? Infinity;
      if (key > bestKey) { best = { commission, level }; bestKey = key; }
    }
  }
  return best;
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
    && Array.isArray(s.commissions) && typeof s.guildLevel === 'number' && Array.isArray(s.exhibits)
    && Array.isArray(s.customCourses);
}
