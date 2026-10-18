#!/usr/bin/env node
// 專屬小人自動生成程式（企劃表 T19）：在組員自己的電腦跑，不是網站的一部分。
// 每隔一段時間問收件處（tools/chibi-apps-script/Code.gs）有沒有新的 OC → 下載 → 交給這台電腦的 ComfyUI
// → 把做好的小人傳回收件處，玩家按「看看好了沒」就領得到。玩家領走以後，這台電腦上的 jobs/領取碼/ 也會刪掉。
//
//   node tools/chibi-worker/worker.mjs             一直跑（Ctrl+C 停止）
//   node tools/chibi-worker/worker.mjs --check     檢查設定、workflow、ComfyUI、收件處，不做小人
//   node tools/chibi-worker/worker.mjs --once      跑一輪就結束
//   node tools/chibi-worker/worker.mjs --try 圖檔   用一張圖試跑 ComfyUI（不連收件處），結果在 jobs/_try/
//
// 設定在同一個資料夾的 config.json（第一次執行會自動建立）。說明：docs/專屬小人設定.md
// 只用 Node.js 18 以上內建的功能，不用裝套件。
import { randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const USAGE = `用法：
  node worker.mjs            一直跑，有新的 OC 就做（Ctrl+C 停止）
  node worker.mjs --check    只檢查設定、workflow、ComfyUI、收件處
  node worker.mjs --once     跑一輪就結束
  node worker.mjs --try 圖檔  用一張圖試跑 ComfyUI，不連收件處
  加 --config 路徑 可以用別的設定檔`;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const script = fileURLToPath(import.meta.url);
const configPath = resolve(option('--config') ?? join(dirname(script), 'config.json'));
const baseDir = dirname(configPath);
const jobsDir = join(baseDir, 'jobs');
/** 給組員照著打的指令 */
const command = (flag = '') => `node ${relative(process.cwd(), script) || 'worker.mjs'}${flag ? ` ${flag}` : ''}`;

/** ComfyUI 多久問一次畫好了沒 */
const COMFY_POLL_MS = 2000;

// ---------------------------------------------------------------- 印訊息

const now = () => new Date().toLocaleTimeString('zh-TW', { hour12: false });
const log = (msg) => console.log(`[${now()}] ${msg}`);
const good = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => console.log(`✗ ${msg}`);
const warn = (msg) => console.log(`! ${msg}`);

/** 還沒解決的問題（例如 ComfyUI 沒開）：同樣的話只印一次，好了再說一聲 */
const troubles = new Map();
function trouble(key, msg) {
  if (troubles.get(key) === msg) return;
  troubles.set(key, msg);
  log(msg);
}
function fine(key, msg) {
  if (!troubles.has(key)) return;
  troubles.delete(key);
  log(msg);
}
/** 同一件事的話只說一次（例如挑選模式等組員挑） */
const said = new Map();
function sayOnce(key, msg) {
  if (said.get(key) === msg) return;
  said.set(key, msg);
  log(msg);
}

/** 等一下再試就好的（ComfyUI 沒開、網路斷了、畫太久）：這一輪先停，不算這個 OC 做不出來 */
class Later extends Error {
  constructor(key, message) {
    super(message);
    this.key = key;
  }
}
/** 收件處回的錯誤 */
class InboxError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const stripBom = (text) => text.replace(/^\uFEFF/, '');

// ---------------------------------------------------------------- 設定檔、workflow

async function loadConfig() {
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const config = lib.starterConfig(lib.newKey(randomBytes(24)));
    await mkdir(baseDir, { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`第一次執行：建好設定檔了
  ${configPath}

接下來：
1. 到 script.google.com 打開收件處的專案 → 左邊齒輪「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」
     屬性：WORKER_KEY
     值：  ${config.workerKey}
   按「儲存指令碼屬性」。
2. 用記事本（Mac 用「文字編輯」）打開上面的 config.json，把收件處的網址（/exec 結尾）貼進 "inboxUrl": "" 的引號中間。
3. 在 ComfyUI 打開做小人的 workflow →「Workflow → Export (API)」，存成
     ${resolve(baseDir, config.workflow)}
4. 檢查一次：${command('--check')}`);
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(stripBom(text));
  } catch (err) {
    bad(`config.json 的格式壞了（${err.message}）
  字串要用 "" 包起來、最後一項後面不能有逗號；路徑用 / 不要用 \\（例："C:/Users/you/workflow_api.json"）`);
    return null;
  }
  const r = lib.parseConfig(raw, { inbox: !args.includes('--try') });
  r.warnings.forEach(warn);
  if (!r.ok) {
    r.errors.forEach(bad);
    return null;
  }
  return r.config;
}

async function loadWorkflow(config) {
  const path = resolve(baseDir, config.workflow);
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { error: `找不到 workflow：${path}
  在 ComfyUI 打開做小人的 workflow →「Workflow → Export (API)」存到這裡（舊版 ComfyUI：設定裡打開 Dev mode，再按「Save (API Format)」）` };
  }
  let raw;
  try {
    raw = JSON.parse(stripBom(text));
  } catch {
    return { error: `workflow 檔案不是 JSON：${path}` };
  }
  const w = lib.readWorkflow(raw);
  if (!w.ok) return { error: w.error };
  const image = lib.findImageNode(w.workflow, config.imageNode);
  if (!image.ok) return { error: image.error };
  const output = lib.findOutputNode(w.workflow, config.outputNode);
  if (!output.ok) return { error: output.error };
  return { workflow: w.workflow, imageNode: image.node, outputNode: output.node, savers: output.savers };
}

/** workflow 的說明（和要注意的） */
function describeWorkflow(wf) {
  const notes = [];
  let out;
  if (wf.outputNode) out = lib.describeNode(wf.outputNode);
  else if (wf.savers.length === 1) out = lib.describeNode(wf.savers[0]);
  else if (!wf.savers.length) {
    out = '有輸出圖的節點（例如 Preview Image）';
    notes.push('workflow 裡沒有 Save Image 節點：建議在最後加一個，輸出才會留在 ComfyUI 的 output 資料夾');
  } else {
    const last = wf.savers[wf.savers.length - 1];
    out = `${lib.describeNode(last)}（編號最大的 Save Image）`;
    notes.push(`workflow 有 ${wf.savers.length} 個 Save Image（${wf.savers.map(lib.describeNode).join('、')}）。要用別的，在 config.json 加 "outputNode": "節點編號"`);
  }
  return { text: `OC 圖放進 ${lib.describeNode(wf.imageNode)}，送出 ${out} 的圖`, notes };
}

// ---------------------------------------------------------------- ComfyUI

async function comfy(ctx, path, init = {}, timeoutMs = 30_000) {
  let res;
  try {
    res = await fetch(`${ctx.config.comfyUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Later('comfy', `連不上 ComfyUI（${ctx.config.comfyUrl}）：ComfyUI 開了嗎？開了就會繼續`);
  }
  fine('comfy', 'ComfyUI 連上了');
  return res;
}

async function comfyJson(ctx, path, init) {
  const res = await comfy(ctx, path, init);
  const body = await res.json().catch(() => null);
  return { res, body };
}

/** ComfyUI 的版本和顯示卡 */
async function comfyInfo(ctx) {
  const { res, body } = await comfyJson(ctx, '/system_stats');
  if (!res.ok || !lib.isObj(body)) throw new Error(`${ctx.config.comfyUrl} 好像不是 ComfyUI（/system_stats 回 ${res.status}）`);
  const version = lib.isObj(body.system) && body.system.comfyui_version ? `ComfyUI ${body.system.comfyui_version}` : '';
  const device = Array.isArray(body.devices) && lib.isObj(body.devices[0]) ? String(body.devices[0].name ?? '') : '';
  return [version, device].filter(Boolean).join('，');
}

/** OC 圖放進 ComfyUI 的 input/oc-guild-quest/，回傳 Load Image 要填的名字 */
async function comfyUpload(ctx, bytes, name, mime) {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: mime }), name);
  form.append('type', 'input');
  form.append('subfolder', lib.COMFY_SUBFOLDER);
  form.append('overwrite', 'true');
  const { res, body } = await comfyJson(ctx, '/upload/image', { method: 'POST', body: form });
  if (!res.ok || !lib.isObj(body) || typeof body.name !== 'string') throw new Error(`ComfyUI 收不下 OC 圖（${res.status}）`);
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
}

/** 等 ComfyUI 畫完；畫太久、ComfyUI 重開過就下一輪再說 */
async function waitFor(ctx, id, key) {
  const deadline = Date.now() + ctx.config.timeoutMinutes * 60_000;
  const history = async () => lib.historyState((await comfyJson(ctx, `/history/${encodeURIComponent(id)}`)).body, id);
  for (let i = 1; ; i++) {
    await sleep(COMFY_POLL_MS);
    let s = await history();
    if (s.state === 'running' && i % 5 === 0 && !lib.inQueue((await comfyJson(ctx, '/queue')).body, id)) {
      // 佇列裡也沒有：可能剛好畫完，再看一次 history
      s = await history();
      if (s.state === 'running') {
        ctx.inflight.delete(key);
        throw new Later('comfy', 'ComfyUI 的佇列裡找不到這張（ComfyUI 重開過，或佇列被清掉了），下一輪重畫');
      }
    }
    if (s.state === 'done') {
      ctx.inflight.delete(key);
      return s.images;
    }
    if (s.state === 'error') {
      ctx.inflight.delete(key);
      throw new Error(`ComfyUI 畫到一半出錯：${s.message}`);
    }
    if (Date.now() > deadline) throw new Later('comfy', `等了 ${ctx.config.timeoutMinutes} 分鐘還沒畫完（ComfyUI 在忙別的？），下一輪接著等`);
  }
}

/** 從 ComfyUI 拿輸出圖；超過收件處的上限就改拿 WebP */
async function download(ctx, ref) {
  const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type });
  const view = async () => {
    const res = await comfy(ctx, `/view?${q}`, {}, 120_000);
    if (!res.ok) throw new Error(`從 ComfyUI 拿不到輸出圖 ${ref.filename}（${res.status}）`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const mime = lib.EXT_OF[type] ? type : lib.MIME_OF[lib.extOf(ref.filename)];
    return { bytes, mime };
  };
  let out = await view();
  if (out.bytes.length > lib.MAX_UPLOAD) {
    q.set('preview', 'webp;90');
    out = await view();
  }
  if (!out.mime) throw new Error(`輸出圖 ${ref.filename} 不是 PNG、JPG 或 WebP，收件處不收`);
  if (out.bytes.length > lib.MAX_UPLOAD) throw new Error(lib.INBOX_ERRORS.too_big);
  return { ...out, ext: lib.EXT_OF[out.mime] };
}

/** 跑一次 workflow，拿回要送的那張圖。key 用來記住排進 ComfyUI 的工作，等太久下一輪可以接著等 */
async function render(ctx, image, prefix, key) {
  let id = ctx.inflight.get(key);
  if (!id) {
    const prompt = lib.patchWorkflow(ctx.wf.workflow, { imageNode: ctx.wf.imageNode.id, image, prefix });
    const { res, body } = await comfyJson(ctx, '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: ctx.clientId }),
    });
    if (!res.ok || !lib.isObj(body) || typeof body.prompt_id !== 'string') throw new Error(`ComfyUI 不接受這個 workflow：\n${lib.promptError(body)}`);
    id = body.prompt_id;
    ctx.inflight.set(key, id);
  }
  const images = await waitFor(ctx, id, key);
  const ref = lib.pickOutput(images, ctx.wf.outputNode?.id);
  if (!ref) {
    throw new Error(ctx.wf.outputNode
      ? `workflow 跑完了，但 ${lib.describeNode(ctx.wf.outputNode)} 沒有輸出圖`
      : 'workflow 跑完了，但沒有輸出圖：最後要有 Save Image 節點');
  }
  return download(ctx, ref);
}

// ---------------------------------------------------------------- 收件處

async function inbox(ctx, action, extra = {}) {
  let text;
  try {
    const res = await fetch(ctx.config.inboxUrl, {
      method: 'POST',
      // 跟網站一樣用 text/plain 送 JSON
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key: ctx.config.workerKey, ...extra }),
      signal: AbortSignal.timeout(120_000),
    });
    text = await res.text();
  } catch (err) {
    throw new Later('inbox', `連不上收件處（${err.cause?.code ?? err.name}）：網路好了就會繼續`);
  }
  const r = lib.parseInboxReply(text);
  if (!r.ok) throw new InboxError(r.error, r.message);
  return r.data;
}

/** 還沒做的 OC 和等玩家領的領取碼 */
async function pendingList(ctx) {
  const list = lib.parsePending(await inbox(ctx, 'pending'));
  if (!list) throw new InboxError('unknown', lib.INBOX_ERRORS.unknown);
  return list;
}

// ---------------------------------------------------------------- 檢查

/** 部署後先跑這個：每一項打勾或打叉。fatal 是一定要先修好才能開始的 */
async function check(ctx) {
  let problems = 0;
  let fatal = false;
  good(`設定檔：${configPath}（${ctx.config.review ? `挑選模式：每個 OC 畫 ${ctx.config.candidates} 張，你挑一張才送出` : '自動模式：畫好就送出'}）`);

  const wf = await loadWorkflow(ctx.config);
  if (wf.error) {
    bad(wf.error);
    problems++;
    fatal = true;
  } else {
    ctx.wf = wf;
    const d = describeWorkflow(wf);
    good(`workflow：${d.text}`);
    d.notes.forEach(warn);
  }

  try {
    good(`ComfyUI：${ctx.config.comfyUrl}（${await comfyInfo(ctx) || '連上了'}）`);
  } catch (err) {
    problems++;
    bad(err.message);
    if (err instanceof Later) troubles.set(err.key, err.message);
    // ComfyUI Desktop 預設用 8000，自己裝的用 8188
    const other = { 'http://127.0.0.1:8188': 'http://127.0.0.1:8000', 'http://127.0.0.1:8000': 'http://127.0.0.1:8188' }[ctx.config.comfyUrl];
    if (other && (await fetch(`${other}/system_stats`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false))) {
      warn(`${other} 有 ComfyUI 在跑：把 config.json 的 "comfyUrl" 改成 "${other}"`);
    }
  }

  try {
    const list = await pendingList(ctx);
    good(`收件處：鑰匙對了，現在有 ${list.items.length} 張 OC 等著做${list.ready.length ? `、${list.ready.length} 隻小人等玩家領` : ''}`);
  } catch (err) {
    problems++;
    bad(`收件處：${err.message}`);
    if (err instanceof InboxError) fatal = true;
    else troubles.set('inbox', err.message);
  }
  return { problems, fatal };
}

// ---------------------------------------------------------------- 做小人

const localCodes = async () => {
  try {
    return (await readdir(jobsDir, { withFileTypes: true })).filter((d) => d.isDirectory() && lib.isCode(d.name)).map((d) => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

/** 照 jobs/領取碼/ 裡的檔案一步一步做：下載 → 畫 → 送出（挑選模式在送出前等組員挑） */
async function work(ctx, item) {
  const dir = join(jobsDir, item.code);
  const tag = lib.label(item);
  await mkdir(dir, { recursive: true });
  for (let guard = 0; guard < 6; guard++) {
    const files = await readdir(dir);
    const next = lib.nextStep(files, ctx.config);
    if (next.step === 'redo') {
      for (const f of lib.outputFiles(files)) await rm(join(dir, f), { force: true });
      log(`${tag}：雲端上的小人被刪掉了，重畫`);
    } else if (next.step === 'download') {
      const img = await inbox(ctx, 'image', { code: item.code });
      const ext = lib.EXT_OF[img.mime];
      if (!ext || typeof img.image !== 'string') throw new Error('收件處給的 OC 圖格式不對');
      await writeFile(join(dir, `oc.${ext}`), Buffer.from(img.image, 'base64'));
      await writeFile(join(dir, lib.INFO), lib.infoText(item, new Date(item.requestedAt || Date.now()).toLocaleString('zh-TW', { hour12: false })));
      log(`${tag}：收到新的 OC${item.note ? `，給你的話：「${item.note}」` : ''}`);
    } else if (next.step === 'generate') {
      said.delete(item.code);
      const oc = files.find(lib.isOcFile);
      const ext = lib.extOf(oc);
      const image = await comfyUpload(ctx, await readFile(join(dir, oc)), `${item.code}.${ext}`, lib.MIME_OF[ext]);
      for (let i = 1; i <= next.count; i++) {
        log(`${tag}：ComfyUI 畫小人中${next.count > 1 ? `（${i}/${next.count}）` : ''}`);
        const out = await render(ctx, image, `${lib.COMFY_SUBFOLDER}/${item.code}`, `${item.code}#${i}`);
        const name = ctx.config.review ? lib.candidateName(await readdir(dir), out.ext) : `chibi.${out.ext}`;
        await writeFile(join(dir, name), out.bytes);
      }
    } else if (next.step === 'send') {
      const bytes = await readFile(join(dir, next.file));
      const mime = lib.MIME_OF[lib.extOf(next.file)];
      if (bytes.length > lib.MAX_UPLOAD) throw new Error(`${next.file} 超過 8MB，收件處不收`);
      await inbox(ctx, 'result', { code: item.code, mime, image: bytes.toString('base64') });
      await writeFile(join(dir, lib.SENT), `送出：${new Date().toLocaleString('zh-TW', { hour12: false })}\n檔案：${next.file}\n`);
      log(`${tag}：小人送出了，玩家按「看看好了沒」就領得到`);
      return;
    } else {
      sayOnce(item.code, `${tag}：${next.count} 張候選在 ${dir}\n  挑一張改名成 ok.png 就會送出；不要的刪掉會補畫`);
      return;
    }
  }
}

/** 一輪：問收件處 → 清掉玩家領走的 → 一個一個做 */
async function round(ctx) {
  let list;
  try {
    list = await pendingList(ctx);
  } catch (err) {
    trouble('inbox', err instanceof Later ? err.message : `收件處：${err.message}`);
    return;
  }
  fine('inbox', '收件處連上了');

  const keep = new Set([...list.items.map((i) => i.code), ...list.ready]);
  for (const code of await localCodes()) {
    if (keep.has(code)) continue;
    await rm(join(jobsDir, code), { recursive: true, force: true });
    ctx.failed.delete(code);
    said.delete(code);
    log(`${code}：玩家領走或取消了，刪掉 jobs/${code}`);
  }

  for (const item of list.items) {
    if (ctx.failed.has(item.code)) continue;
    try {
      await work(ctx, item);
    } catch (err) {
      if (err instanceof Later) {
        trouble(err.key, err.message);
        return;
      }
      if (err instanceof InboxError && err.code === 'not_found') {
        log(`${lib.label(item)}：${err.message}`);
        continue;
      }
      if (err instanceof InboxError && err.code !== 'too_big') {
        trouble('inbox', `收件處：${err.message}`);
        return;
      }
      ctx.failed.set(item.code, err.message);
      log(`${lib.label(item)}：做不出來。${err.message}\n  修好以後重新執行這個程式，會再試一次`);
    }
  }
}

/** 這個程序還在不在 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** 同一個資料夾只能有一個在跑（不小心開了兩個會重複畫）；結束時拿掉 */
async function lock() {
  const path = join(jobsDir, '.lock');
  await mkdir(jobsDir, { recursive: true });
  const pid = Number(await readFile(path, 'utf8').catch(() => ''));
  if (pid && pid !== process.pid && alive(pid)) {
    bad(`已經有一個自動生成程式在跑（程序 ${pid}）。確定沒有的話，刪掉 ${path} 再執行`);
    return false;
  }
  await writeFile(path, String(process.pid));
  process.on('exit', () => {
    try {
      rmSync(path);
    } catch {
      // 已經沒了
    }
  });
  return true;
}

/** --try：用一張圖試跑 ComfyUI，不連收件處 */
async function tryImage(ctx, file) {
  if (!file) {
    console.log(USAGE);
    return false;
  }
  const wf = await loadWorkflow(ctx.config);
  if (wf.error) {
    bad(wf.error);
    return false;
  }
  ctx.wf = wf;
  const d = describeWorkflow(wf);
  good(`workflow：${d.text}`);
  d.notes.forEach(warn);
  const ext = lib.extOf(file);
  if (!lib.MIME_OF[ext]) {
    bad('只認得 PNG、JPG、WebP 的圖');
    return false;
  }
  let bytes;
  try {
    bytes = await readFile(resolve(file));
  } catch {
    bad(`找不到圖：${resolve(file)}`);
    return false;
  }
  const dir = join(jobsDir, '_try');
  await mkdir(dir, { recursive: true });
  const count = ctx.config.review ? ctx.config.candidates : 1;
  try {
    const image = await comfyUpload(ctx, bytes, `try.${ext}`, lib.MIME_OF[ext]);
    for (let i = 1; i <= count; i++) {
      log(`試畫中${count > 1 ? `（${i}/${count}）` : ''}`);
      const out = await render(ctx, image, `${lib.COMFY_SUBFOLDER}/try`, `try#${i}`);
      const name = join(dir, lib.candidateName(await readdir(dir), out.ext));
      await writeFile(name, out.bytes);
      good(`畫好了：${name}`);
    }
    return true;
  } catch (err) {
    bad(err.message);
    return false;
  }
}

async function main() {
  if (typeof fetch !== 'function' || typeof FormData !== 'function') {
    console.log('需要 Node.js 18 以上：到 https://nodejs.org 下載 LTS 版');
    return 1;
  }
  const known = ['--check', '--once', '--try', '--config'];
  const unknown = args.filter((a, i) => a.startsWith('-') && !known.includes(a) && !['--try', '--config'].includes(args[i - 1]));
  if (unknown.length || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return unknown.length ? 1 : 0;
  }
  const config = await loadConfig();
  if (!config) return 1;
  const ctx = { config, clientId: randomUUID(), inflight: new Map(), failed: new Map(), wf: null };

  if (args.includes('--try')) return (await tryImage(ctx, option('--try'))) ? 0 : 1;

  console.log('專屬小人自動生成：檢查');
  const r = await check(ctx);
  if (args.includes('--check')) {
    console.log(r.problems ? `\n還有 ${r.problems} 個問題要處理。` : `\n都好了。開始自動生成：${command()}`);
    return r.problems ? 1 : 0;
  }
  if (r.fatal) {
    console.log('\n先把打叉的修好再執行。');
    return 1;
  }
  if (!(await lock())) return 1;
  if (args.includes('--once')) {
    await round(ctx);
    return 0;
  }
  log(`開始等新的 OC：每 ${config.pollSeconds} 秒看一次收件處，按 Ctrl+C 停止`);
  for (;;) {
    await round(ctx);
    await sleep(config.pollSeconds * 1000);
  }
}

process.on('SIGINT', () => {
  console.log('\n停了。');
  process.exit(0);
});

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
