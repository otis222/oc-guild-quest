#!/usr/bin/env node
// 專屬小人自動生成程式（企劃表 T19）：在組員自己的電腦跑，不是網站的一部分。
// 每隔一段時間問收件處（tools/chibi-apps-script/Code.gs）有沒有新的 OC → 下載 → 交給這台電腦的 ComfyUI
// → 把做好的小人傳回收件處，玩家按「看看好了沒」就領得到。玩家領走以後，這台電腦上的 jobs/領取碼/ 也會刪掉。
//
// 一鍵啟動：雙擊 start-windows.bat（Mac：start-mac.command）。第一次會一步一步問設定；之後 ComfyUI 還沒開
// 就幫你打開（有設定啟動檔的話），接著開始做小人。想改設定，雙擊 setup-windows.bat（Mac：setup-mac.command）。
//
//   node tools/chibi-worker/worker.mjs             一直跑（Ctrl+C 停止）；設定不完整時一步一步問
//   node tools/chibi-worker/worker.mjs --setup     重新設定（每一步都可以按 Enter 不改），設好就開始
//   node tools/chibi-worker/worker.mjs --check     檢查設定、workflow、ComfyUI、收件處，不做小人
//   node tools/chibi-worker/worker.mjs --once      跑一輪就結束
//   node tools/chibi-worker/worker.mjs --try 圖檔   用一張圖試跑 ComfyUI（不連收件處），結果在 jobs/_try/
//
// 設定在同一個資料夾的 config.json（第一次執行會自動建立）。說明：docs/專屬小人設定.md
// 只用 Node.js 18 以上內建的功能，不用裝套件。
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const USAGE = `用法：
  node worker.mjs            一直跑，有新的 OC 就做（Ctrl+C 停止）；設定不完整時一步一步問
  node worker.mjs --setup    重新設定，設好就開始
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

/** 雙擊打開的視窗（不是被別的程式呼叫）：設定不完整時可以一步一步問 */
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !['--check', '--once', '--try'].some((f) => args.includes(f));

/** ComfyUI 多久問一次畫好了沒 */
const COMFY_POLL_MS = 2000;
/** 幫忙打開 ComfyUI 以後最多等多久 */
const COMFY_START_MS = 5 * 60_000;

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

/** config.json：沒有是 null；JSON 壞了是 { broken, text } */
async function readRaw() {
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const raw = JSON.parse(stripBom(text));
    return lib.isObj(raw) ? { raw } : { broken: '內容要是 { … }', text };
  } catch (err) {
    return { broken: err.message, text };
  }
}

async function saveRaw(raw) {
  await mkdir(baseDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(raw, null, 2)}\n`);
}

/** 改設定、存進 config.json（undefined 是拿掉那一項） */
async function remember(ctx, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete ctx.raw[k];
    else ctx.raw[k] = v;
  }
  await saveRaw(ctx.raw);
  const r = lib.parseConfig(ctx.raw, { inbox: false });
  if (r.ok) ctx.config = r.config;
}

/** 不是雙擊打開的（沒辦法一步一步問）：第一次執行時印出接下來要做的事 */
const firstRunText = (raw) => `第一次執行：建好設定檔了
  ${configPath}

雙擊 start-windows.bat（Mac：start-mac.command）會一步一步問。要自己設的話：
1. 到 script.google.com 打開收件處的專案 → 左邊齒輪「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」
     屬性：WORKER_KEY
     值：  ${raw.workerKey}
   按「儲存指令碼屬性」。
2. 用記事本（Mac 用「文字編輯」）打開上面的 config.json，把收件處的網址（/exec 結尾）貼進 "inboxUrl": "" 的引號中間。
3. 在 ComfyUI 打開做小人的 workflow →「Workflow → Export (API)」，存成
     ${resolve(baseDir, raw.workflow)}
4. 檢查一次：${command('--check')}`;

async function loadWorkflow(config) {
  const path = resolve(baseDir, config.workflow);
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { missing: true, error: `找不到 workflow：${path}
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

/** 照 lib 的指令開程式；用 shell 的時候不帶參數（新版 Node.js 對 shell 加參數會警告） */
const run = (spec, extra) => {
  const options = { ...spec.options, stdio: 'ignore', ...extra };
  return spec.args.length ? spawn(spec.command, spec.args, options) : spawn(spec.command, options);
};

/** 這個網址有沒有 ComfyUI */
const comfyAlive = (url) => fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false);

/** 打開 ComfyUI（設定裡的啟動檔）；一下子就失敗（找不到程式）是 false */
function launch(file) {
  return new Promise((done) => {
    const spec = lib.launchSpec(file, process.platform);
    let child;
    try {
      child = run(spec);
    } catch (err) {
      bad(`打不開 ComfyUI（${err.message}）：${file}`);
      done(false);
      return;
    }
    child.on('error', (err) => {
      bad(`打不開 ComfyUI（${err.code ?? err.message}）：${file}`);
      done(false);
    });
    child.unref();
    setTimeout(() => done(true), 500);
  });
}

/**
 * 確定 ComfyUI 開著。設定的網址沒有，就看另一個常見的網址（8188／8000），找到就改設定；
 * 都沒有而且設了啟動檔，就打開它，最多等 5 分鐘。一次執行只打開一次。
 */
async function ensureComfy(ctx) {
  const find = async () => {
    for (const url of [ctx.config.comfyUrl, lib.OTHER_COMFY[ctx.config.comfyUrl]]) if (url && (await comfyAlive(url))) return url;
    return null;
  };
  let url = await find();
  if (!url && ctx.config.comfyStart && !ctx.launched) {
    ctx.launched = true;
    if (await launch(ctx.config.comfyStart)) {
      log('打開 ComfyUI 中（第一次可能要一兩分鐘）');
      const deadline = Date.now() + COMFY_START_MS;
      while (!url && Date.now() < deadline) {
        await sleep(3000);
        url = await find();
      }
      log(url ? 'ComfyUI 開好了' : 'ComfyUI 等了 5 分鐘還沒開好，開好以後會自己接上');
    }
  }
  if (url && url !== ctx.config.comfyUrl) {
    await remember(ctx, { comfyUrl: url });
    log(`ComfyUI 在 ${url}，設定改好了`);
  }
  return Boolean(url);
}

/** 用系統預設的程式打開（試畫好的圖）；打不開就算了，位置已經印出來了 */
function openPath(file) {
  const spec = lib.openSpec(file, process.platform);
  try {
    run(spec, { detached: !spec.options.shell }).on('error', () => {}).unref();
  } catch {
    // 打不開就算了
  }
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
    const other = lib.OTHER_COMFY[ctx.config.comfyUrl];
    if (other && (await comfyAlive(other))) {
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

// ---------------------------------------------------------------- 一鍵啟動：一步一步設定

const STEPS = 5;
const step = (n, title) => console.log(`\n【${n}/${STEPS}】${title}`);

/** 問收件處一次：網址對不對（urlOk）、鑰匙對不對（keyOk） */
async function probe(ctx) {
  if (!ctx.config.inboxUrl) return { urlOk: false, keyOk: false, message: lib.checkInboxUrl('').error };
  try {
    await pendingList(ctx);
    return { urlOk: true, keyOk: true };
  } catch (err) {
    const keyProblem = err instanceof InboxError && ['no_key', 'weak_key', 'forbidden'].includes(err.code);
    return { urlOk: keyProblem, keyOk: false, message: err.message };
  }
}

/** 列出選項請組員輸入號碼；def 是直接按 Enter 時選的（0 開始） */
async function choose(ask, question, labels, def) {
  if (question) console.log(`  ${question}`);
  labels.forEach((l, i) => console.log(`    ${i + 1}  ${l}`));
  for (;;) {
    const i = lib.choiceIndex(await ask(def === undefined ? '  輸入號碼按 Enter：' : `  輸入號碼按 Enter（直接按 Enter 是 ${def + 1}）：`), labels.length, def);
    if (i !== null) return i;
    bad(`輸入 1～${labels.length} 的號碼`);
  }
}

/** 1、2：收件處網址和鑰匙。回傳有沒有問組員 */
async function setupInbox(ctx, ask, all) {
  let reply = await probe(ctx);
  if (!all && reply.keyOk) return false;
  if (all || !reply.urlOk) {
    step(1, '收件處網址');
    console.log('  在 script.google.com 部署好收件處以後（docs/專屬小人設定.md 第一節），複製 /exec 結尾的網址。');
    if (ctx.config.inboxUrl && !reply.urlOk) bad(reply.message);
    for (;;) {
      const has = Boolean(ctx.config.inboxUrl);
      if (reply.urlOk) console.log(`  現在是 ${ctx.config.inboxUrl}`);
      const a = await ask(reply.urlOk ? '  直接按 Enter 不改，或貼上新的網址：'
        : has ? '  修好以後按 Enter 再試一次，或貼上新的網址：' : '  貼上網址按 Enter（Windows 的視窗按右鍵就是貼上）：');
      if (!a && reply.urlOk) break;
      if (a) {
        const u = lib.checkInboxUrl(a);
        if (u.error) {
          bad(u.error);
          continue;
        }
        await remember(ctx, { inboxUrl: u.url });
      } else if (!has) continue;
      reply = await probe(ctx);
      if (reply.urlOk) {
        good('收件處連上了');
        break;
      }
      bad(reply.message);
    }
  }
  if (reply.keyOk) return true;
  step(2, '鑰匙');
  console.log(`  到 Apps Script 左邊齒輪「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」：
    屬性：WORKER_KEY
    值：  ${ctx.config.workerKey}`);
  for (;;) {
    await ask('  按「儲存指令碼屬性」，回來按 Enter：');
    reply = await probe(ctx);
    if (reply.keyOk) {
      good('鑰匙對了');
      return true;
    }
    bad(reply.message);
  }
}

/** 3：要不要幫忙打開 ComfyUI；連不連得上 */
async function setupComfy(ctx, ask, all) {
  if (!all && ctx.raw.comfyStart !== undefined) return false;
  step(3, 'ComfyUI');
  console.log('  要讓這個程式幫你打開 ComfyUI 的話，把啟動 ComfyUI 的檔案拖進這個視窗，按 Enter。');
  console.log('  （免安裝版是資料夾裡的 run_nvidia_gpu.bat；ComfyUI Desktop 可以拖桌面上的捷徑）');
  for (;;) {
    const now = ctx.config.comfyStart;
    if (now) console.log(`  現在是 ${now}`);
    const a = await ask(now ? '  直接按 Enter 不改；輸入 0 改成自己開：' : '  ComfyUI 都自己開的話，直接按 Enter：');
    if (!a && now) break;
    if (!a || a === '0') {
      await remember(ctx, { comfyStart: '' });
      break;
    }
    const file = resolve(lib.cleanDroppedPath(a, process.platform));
    const info = await stat(file).catch(() => null);
    if (!info) {
      bad(`找不到這個檔案：${file}`);
      continue;
    }
    if (info.isDirectory() && !/\.app$/i.test(file)) {
      bad('要拖的是啟動 ComfyUI 的檔案，不是資料夾');
      continue;
    }
    await remember(ctx, { comfyStart: file });
    break;
  }
  if (await ensureComfy(ctx)) {
    good(`ComfyUI 連上了（${ctx.config.comfyUrl}）`);
    return true;
  }
  // 常見的兩個網址都沒有：可能還沒開，或改過連接埠
  for (;;) {
    const a = await ask('  找不到 ComfyUI。開著的話，貼上它的網址（例如 http://127.0.0.1:8188）按 Enter；還沒開就直接按 Enter：');
    if (!a) {
      warn('ComfyUI 還沒開。之後開好會自己接上；下一步匯出 workflow 也要用到它。');
      return true;
    }
    const url = lib.checkComfyUrl(a);
    if (url && (await comfyAlive(url))) {
      await remember(ctx, { comfyUrl: url });
      good(`ComfyUI 連上了（${url}）`);
      return true;
    }
    bad(url ? `${url} 沒有 ComfyUI` : `「${a}」不是網址`);
  }
}

/** 讀拖進來的 workflow；有好幾個 Load Image、Save Image 就問用哪一個 */
async function pickNodes(src, ask) {
  let raw;
  try {
    raw = JSON.parse(stripBom(await readFile(src, 'utf8')));
  } catch (err) {
    return { error: err.code === 'ENOENT' ? `找不到這個檔案：${src}` : `這個檔案不是 workflow：${src}` };
  }
  const w = lib.readWorkflow(raw);
  if (!w.ok) return { error: w.error };
  const nodes = lib.listNodes(w.workflow);
  const loaders = nodes.filter((n) => n.classType === 'LoadImage');
  if (!loaders.length) return { error: 'workflow 裡沒有 Load Image 節點：加一個來放玩家的 OC 圖，再匯出一次' };
  const savers = nodes.filter((n) => n.classType === 'SaveImage');
  let imageNode;
  if (loaders.length > 1) {
    const i = await choose(ask, `workflow 裡有 ${loaders.length} 個 Load Image，哪一個放玩家的 OC 圖？`,
      loaders.map((n) => `${lib.describeNode(n)}（現在放的是 ${String(w.workflow[n.id].inputs.image)}）`));
    imageNode = loaders[i].id;
  }
  let outputNode;
  if (savers.length > 1) {
    const i = await choose(ask, `workflow 裡有 ${savers.length} 個 Save Image，哪一個是要送給玩家的？`, savers.map(lib.describeNode), savers.length - 1);
    outputNode = savers[i].id;
  }
  return { imageNode, outputNode };
}

/** 4：workflow（拖進匯出的檔案，複製到這個資料夾） */
async function setupWorkflow(ctx, ask, all) {
  let wf = await loadWorkflow(ctx.config);
  if (!all && !wf.error) {
    ctx.wf = wf;
    return false;
  }
  step(4, 'workflow');
  console.log('  在 ComfyUI 打開你做小人的 workflow，選「Workflow → Export (API)」匯出。');
  console.log('  （舊版 ComfyUI：設定裡打開 Dev mode，再按「Save (API Format)」）');
  if (wf.error && !wf.missing) bad(wf.error);
  for (;;) {
    if (!wf.error) console.log(`  現在：${describeWorkflow(wf).text}`);
    const a = await ask(wf.error ? '  把匯出的檔案拖進這個視窗，按 Enter：' : '  直接按 Enter 不改，或拖進新匯出的檔案：');
    if (!a) {
      if (!wf.error) break;
      continue;
    }
    const src = resolve(lib.cleanDroppedPath(a, process.platform));
    const picked = await pickNodes(src, ask);
    if (picked.error) {
      bad(picked.error);
      continue;
    }
    const dest = resolve(baseDir, lib.DEFAULTS.workflow);
    if (src !== dest) await copyFile(src, dest);
    await remember(ctx, { workflow: lib.DEFAULTS.workflow, imageNode: picked.imageNode, outputNode: picked.outputNode });
    wf = await loadWorkflow(ctx.config);
    if (!wf.error) break;
    bad(wf.error);
  }
  ctx.wf = wf;
  const d = describeWorkflow(wf);
  good(`workflow：${d.text}`);
  d.notes.forEach(warn);
  return true;
}

/** 5：畫好直接送，還是先給組員挑 */
async function setupMode(ctx, ask, all) {
  if (!all && ctx.raw.review !== undefined) return false;
  step(5, '畫好的小人怎麼處理？');
  const n = ctx.config.candidates;
  const i = await choose(ask, '', [
    '直接送給玩家（最快）',
    `先畫 ${n} 張給你挑（在 jobs 資料夾把喜歡的改名成 ok.png 才送出）`,
  ], ctx.raw.review === undefined ? undefined : Number(ctx.config.review));
  await remember(ctx, { review: i === 1 });
  good(i === 1 ? `挑選模式：每個 OC 畫 ${n} 張給你挑` : '自動模式：畫好就送');
  return true;
}

/** 試畫一張（可以跳過），畫好直接打開 */
async function setupTry(ctx, ask) {
  const a = await ask('\n要不要先試畫一張？把一張 OC 圖拖進這個視窗按 Enter；不用就直接按 Enter：');
  if (!a) return;
  if (!(await ensureComfy(ctx))) {
    warn('ComfyUI 還沒開，先跳過試畫。');
    return;
  }
  const out = await tryImage(ctx, lib.cleanDroppedPath(a, process.platform), 1);
  if (out) openPath(out);
}

/** 以後怎麼開 */
function launcherHint(ctx) {
  const what = ctx.config.comfyStart ? '打開 ComfyUI、開始做小人' : '開始做小人';
  if (process.platform === 'win32') return `以後雙擊 start-windows.bat 就會${what}；想改設定，雙擊 setup-windows.bat。`;
  if (process.platform === 'darwin') return `以後雙擊 start-mac.command 就會${what}；想改設定，雙擊 setup-mac.command。`;
  return `以後執行 ${command()} 就會${what}；想改設定：${command('--setup')}`;
}

/** 一步一步設定：all 是每一步都問（第一次、--setup），不然只問還沒設好的 */
async function setup(ctx, all) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let finished = false;
  const quit = () => {
    console.log('\n停了。設定到一半也沒關係，下次會接著問。');
    process.exit(0);
  };
  rl.on('SIGINT', quit);
  rl.on('close', () => {
    if (!finished) quit();
  });
  const ask = async (q) => (await rl.question(q)).trim();
  try {
    if (all) console.log(`專屬小人自動生成：設定\n  每一步做完就存進 ${configPath}；中途關掉視窗，下次會接著問。`);
    let asked = await setupInbox(ctx, ask, all);
    asked = (await setupComfy(ctx, ask, all)) || asked;
    asked = (await setupWorkflow(ctx, ask, all)) || asked;
    asked = (await setupMode(ctx, ask, all)) || asked;
    if (all) await setupTry(ctx, ask);
    if (asked) console.log(`\n設定好了。${launcherHint(ctx)}\n`);
  } finally {
    finished = true;
    rl.close();
  }
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
function running(pid) {
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
  if (pid && pid !== process.pid && running(pid)) {
    bad(`已經有一個自動生成程式在跑（程序 ${pid}）。改了設定的話，把它關掉重開才會用新的設定；確定沒有在跑，刪掉 ${path} 再執行`);
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

/** 用一張圖試跑 ComfyUI（不連收件處）：畫好的放在 jobs/_try/，回傳最後一張的位置 */
async function tryImage(ctx, file, count) {
  if (!ctx.wf) {
    const wf = await loadWorkflow(ctx.config);
    if (wf.error) {
      bad(wf.error);
      return null;
    }
    ctx.wf = wf;
    const d = describeWorkflow(wf);
    good(`workflow：${d.text}`);
    d.notes.forEach(warn);
  }
  const ext = lib.extOf(file);
  if (!lib.MIME_OF[ext]) {
    bad('只認得 PNG、JPG、WebP 的圖');
    return null;
  }
  let bytes;
  try {
    bytes = await readFile(resolve(file));
  } catch {
    bad(`找不到圖：${resolve(file)}`);
    return null;
  }
  const dir = join(jobsDir, '_try');
  await mkdir(dir, { recursive: true });
  try {
    const image = await comfyUpload(ctx, bytes, `try.${ext}`, lib.MIME_OF[ext]);
    let last = null;
    for (let i = 1; i <= count; i++) {
      log(`試畫中${count > 1 ? `（${i}/${count}）` : ''}`);
      const out = await render(ctx, image, `${lib.COMFY_SUBFOLDER}/try`, `try#${i}`);
      last = join(dir, lib.candidateName(await readdir(dir), out.ext));
      await writeFile(last, out.bytes);
      good(`畫好了：${last}`);
    }
    return last;
  } catch (err) {
    bad(err.message);
    return null;
  }
}

async function main() {
  if (typeof fetch !== 'function' || typeof FormData !== 'function') {
    console.log('需要 Node.js 18 以上：到 https://nodejs.org 下載 LTS 版');
    return 1;
  }
  const known = ['--check', '--once', '--try', '--config', '--setup'];
  const unknown = args.filter((a, i) => a.startsWith('-') && !known.includes(a) && !['--try', '--config'].includes(args[i - 1]));
  if (unknown.length || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return unknown.length ? 1 : 0;
  }

  let loaded = await readRaw();
  let firstRun = false;
  if (!loaded || loaded.broken) {
    if (loaded) {
      if (!interactive) {
        bad(`config.json 的格式壞了（${loaded.broken}）
  字串要用 "" 包起來、最後一項後面不能有逗號；路徑用 / 不要用 \\（例："C:/Users/you/workflow_api.json"）`);
        return 1;
      }
      await writeFile(join(baseDir, 'config.broken.json'), loaded.text);
      warn(`config.json 的格式壞了（${loaded.broken}），另存成 config.broken.json，重新設定一次`);
    }
    // 壞掉的設定檔裡找得到鑰匙就沿用，Apps Script 那邊不用改
    const oldKey = /"workerKey"\s*:\s*"([^"]+)"/.exec(loaded?.text ?? '')?.[1] ?? '';
    const raw = lib.starterConfig(oldKey.length >= lib.KEY_MIN ? oldKey : lib.newKey(randomBytes(24)));
    await saveRaw(raw);
    if (!interactive) {
      console.log(firstRunText(raw));
      return 1;
    }
    loaded = { raw };
    firstRun = true;
  }
  const lenient = lib.parseConfig(loaded.raw, { inbox: false });
  lenient.warnings.forEach(warn);
  if (!lenient.ok) {
    lenient.errors.forEach(bad);
    console.log('\n用記事本把 config.json 改好，再執行一次。');
    return 1;
  }
  const ctx = {
    raw: loaded.raw, config: lenient.config, clientId: randomUUID(),
    inflight: new Map(), failed: new Map(), wf: null, launched: false,
  };

  if (args.includes('--try')) {
    if (!option('--try')) {
      console.log(USAGE);
      return 1;
    }
    await ensureComfy(ctx);
    const out = await tryImage(ctx, option('--try'), ctx.config.review ? ctx.config.candidates : 1);
    if (out) openPath(out);
    return out ? 0 : 1;
  }

  if (interactive) await setup(ctx, firstRun || args.includes('--setup'));
  else {
    const strict = lib.parseConfig(ctx.raw);
    if (!strict.ok) {
      strict.errors.forEach(bad);
      return 1;
    }
  }
  if (!args.includes('--check')) await ensureComfy(ctx);

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
  log(`開始等新的 OC：每 ${ctx.config.pollSeconds} 秒看一次收件處，關掉視窗或按 Ctrl+C 就停`);
  for (;;) {
    await round(ctx);
    await sleep(ctx.config.pollSeconds * 1000);
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
