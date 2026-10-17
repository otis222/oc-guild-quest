// 專屬小人（T19）跟收件處（組員 Google 帳號裡的 Apps Script，tools/chibi-apps-script/Code.gs）連線：
// 送 OC 圖、問做好了沒、領完通知收件處刪檔。
// POST 用 text/plain 送 JSON：這樣瀏覽器不會先送 OPTIONS 問 CORS（Apps Script 不回 OPTIONS）。
import { parseChibiResult, parseSendReply, type ChibiError, type ChibiPayload, type ChibiResult } from '../core/chibi';

/** 收件處的網址（建置時的 VITE_CHIBI_ENDPOINT）；沒設定就是 null，設定卡上不顯示專屬小人 */
export const CHIBI_ENDPOINT: string | null = (import.meta.env.VITE_CHIBI_ENDPOINT ?? '').trim() || null;

/** Apps Script 冷啟動要幾秒，圖也要時間傳，等久一點 */
const TIMEOUT_MS = 60_000;

/** 連不上（沒網路、逾時、收件處掛了）也算一種錯誤 */
export type ChibiCallError = ChibiError | 'network';

async function call(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`收件處回 ${res.status}`);
  return res.json();
}

const post = (endpoint: string, body: unknown): Promise<unknown> =>
  call(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });

/** 送 OC 圖 */
export async function sendChibi(endpoint: string, payload: ChibiPayload): Promise<{ ok: true } | { ok: false; error: ChibiCallError }> {
  try {
    return parseSendReply(await post(endpoint, payload));
  } catch (err) {
    console.warn('專屬小人：送不出去', err);
    return { ok: false, error: 'network' };
  }
}

/** 問做好了沒 */
export async function checkChibi(endpoint: string, code: string): Promise<ChibiResult | { status: 'error'; error: 'network' }> {
  try {
    const url = new URL(endpoint);
    url.searchParams.set('action', 'result');
    url.searchParams.set('code', code);
    return parseChibiResult(await call(url.toString()));
  } catch (err) {
    console.warn('專屬小人：問不到', err);
    return { status: 'error', error: 'network' };
  }
}

/** 領到了：請收件處把這個領取碼的 OC 圖和小人圖丟進垃圾桶（失敗也沒關係，組員可以手動刪） */
export async function finishChibi(endpoint: string, code: string): Promise<void> {
  try {
    await post(endpoint, { action: 'done', code });
  } catch (err) {
    console.warn('專屬小人：沒通知到收件處刪檔', err);
  }
}

/** Blob → base64（不含 data: 開頭） */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('讀不到圖'));
    r.readAsDataURL(blob);
  });
}

/** base64 → Blob */
export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
