// 專屬小人（企劃表 T19，10/17 組員決定）：完成 5 個任務後，玩家可以把自己畫的 OC 圖送給組員，
// 組員在自己的電腦用 ComfyUI 做成公會小人，玩家再用領取碼把小人領回來、換上。
// 圖送到組員 Google 雲端硬碟的收件處（Apps Script，見 tools/chibi-apps-script/ 和 docs/專屬小人設定.md）。
// 網站本身不接 AI；生成只在組員自己的電腦上做。
// 這裡只有規則（什麼時候解鎖、領取碼、存檔、檢查收件處回來的資料），連線在 src/ui/chibiClient.ts。
import { doneTaskCount } from './drawTime';
import { cleanText } from './text';
import type { GuildState } from './types';

/** 完成幾個計時任務才解鎖 */
export const CHIBI_UNLOCK_TASKS = 5;
/** 給組員的話最多幾個字 */
export const CHIBI_NOTE_MAX = 60;
/** 領取碼用的字：拿掉 0 O 1 I L 這些容易看錯的 */
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** 領取碼：XXXX-XXX（收件處的 Apps Script 也用一樣的規則檢查） */
export const CHIBI_CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{3}$/;

export interface ChibiProgress {
  /** 完成了幾個計時任務 */
  done: number;
  /** 還差幾個才解鎖（解鎖了是 0） */
  left: number;
  unlocked: boolean;
}

export function chibiProgress(s: GuildState): ChibiProgress {
  const done = doneTaskCount(s);
  const left = Math.max(0, CHIBI_UNLOCK_TASKS - done);
  return { done, left, unlocked: left === 0 };
}

/** 新的領取碼，例如 K7Q2-M9X */
export function newChibiCode(rand: () => number = Math.random): string {
  const pick = (): string => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length) % CODE_CHARS.length];
  const part = (n: number): string => Array.from({ length: n }, pick).join('');
  return `${part(4)}-${part(3)}`;
}

export const isChibiCode = (code: unknown): code is string => typeof code === 'string' && CHIBI_CODE_RE.test(code);

/** 整理給組員的話：去掉多餘空白、最多 60 個字 */
export const cleanChibiNote = (input: string): string => cleanText(input, CHIBI_NOTE_MAX);

/** 送出了：記下領取碼（重送一張就換新的領取碼） */
export function requestChibi(s: GuildState, code: string, now: number): GuildState {
  if (!isChibiCode(code)) throw new Error(`領取碼格式不對：${code}`);
  return { ...s, chibi: { ...s.chibi, request: { code, requestedAt: now } } };
}

/**
 * 領到了：記下小人圖，清掉正在等的領取碼。領取碼不是正在等的那個就不變（例如另一個分頁已經領過了）。
 * 回傳新的狀態，和換掉的舊小人圖（呼叫的人要從 IndexedDB 刪掉）。
 */
export function receiveChibi(s: GuildState, code: string, photoId: string, now: number): { state: GuildState; replaced?: string } {
  if (s.chibi?.request?.code !== code) return { state: s };
  const replaced = s.chibi.photoId;
  return {
    state: { ...s, chibi: { photoId, receivedAt: now } },
    ...(replaced && replaced !== photoId ? { replaced } : {}),
  };
}

// ---------------------------------------------------------------- 收件處（Apps Script）的資料

/** 送出時給收件處的資料（用 text/plain 送 JSON，瀏覽器才不會先問一次 CORS） */
export interface ChibiPayload {
  action: 'request';
  code: string;
  /** OC 的名字和給組員的話：組員對照用 */
  name: string;
  note: string;
  /** 收件處有設邀請碼才要 */
  invite?: string;
  mime: 'image/png' | 'image/jpeg';
  /** 圖片的 base64（不含 data: 開頭） */
  image: string;
}

/** 收件處回來的錯誤：要邀請碼、圖太大、今天收太多了、資料不對 */
export type ChibiError = 'invite' | 'too_big' | 'busy' | 'bad_request' | 'unknown';
const ERRORS: readonly ChibiError[] = ['invite', 'too_big', 'busy', 'bad_request'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const toError = (e: unknown): ChibiError => (ERRORS.includes(e as ChibiError) ? (e as ChibiError) : 'unknown');

/** 送出之後收件處的回答 */
export function parseSendReply(raw: unknown): { ok: true } | { ok: false; error: ChibiError } {
  if (isObj(raw) && raw.ok === true) return { ok: true };
  return { ok: false, error: toError(isObj(raw) ? raw.error : undefined) };
}

export type ChibiResult =
  | { status: 'waiting' }
  | { status: 'ready'; mime: string; image: string }
  | { status: 'error'; error: ChibiError };

const IMAGE_MIME = /^image\/(png|jpeg|webp)$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** 問「做好了嗎」收件處的回答：還在做、做好了（附圖）、或錯誤 */
export function parseChibiResult(raw: unknown): ChibiResult {
  if (!isObj(raw) || raw.ok !== true) return { status: 'error', error: toError(isObj(raw) ? raw.error : undefined) };
  if (raw.status === 'waiting') return { status: 'waiting' };
  if (raw.status === 'ready' && typeof raw.mime === 'string' && IMAGE_MIME.test(raw.mime)
    && typeof raw.image === 'string' && raw.image.length > 0 && BASE64.test(raw.image)) {
    return { status: 'ready', mime: raw.mime, image: raw.image };
  }
  return { status: 'error', error: 'unknown' };
}
