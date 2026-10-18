// 專屬小人自動生成程式（企劃表 T19）的規則：設定檔、ComfyUI 的 workflow、收件處的回答、
// 每個 OC 的資料夾（jobs/領取碼/）接下來要做什麼。
// 讀寫檔案和連線在 worker.mjs；這裡的東西都有 Vitest 測試（tests/tools/chibiWorker.test.ts）。

/** 領取碼：XXXX-XXX（跟網站 src/core/chibi.ts、收件處 Code.gs 一樣） */
export const CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{3}$/;
export const isCode = (v) => typeof v === 'string' && CODE_RE.test(v);
export const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 鑰匙至少幾個字（跟 Code.gs 的 KEY_MIN 一樣） */
export const KEY_MIN = 16;
/** 收件處一張圖最大多少（跟 Code.gs 的 MAX_BYTES 一樣） */
export const MAX_UPLOAD = 8 * 1024 * 1024;
/** ComfyUI 的 input、output 裡放這個程式的檔案的子資料夾 */
export const COMFY_SUBFOLDER = 'oc-guild-quest';

export const MIME_OF = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const EXT_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** 副檔名（小寫、不含點）；沒有就是空字串 */
export const extOf = (name) => (/\.([^./\\]+)$/.exec(name)?.[1] ?? '').toLowerCase();

// ---------------------------------------------------------------- 設定檔（config.json）

export const DEFAULTS = {
  comfyUrl: 'http://127.0.0.1:8188',
  workflow: 'workflow_api.json',
  review: false,
  candidates: 3,
  pollSeconds: 30,
  timeoutMinutes: 20,
};
const KNOWN = ['inboxUrl', 'workerKey', 'comfyUrl', 'workflow', 'imageNode', 'outputNode', 'review', 'candidates', 'pollSeconds', 'timeoutMinutes'];

/** 鑰匙用的字：32 個（一個位元組取 5 位元剛好平均），拿掉 l、o 這些容易看錯的 */
const KEY_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** 新的鑰匙：bytes 是亂數（worker.mjs 用 crypto.randomBytes） */
export const newKey = (bytes) => Array.from(bytes, (b) => KEY_CHARS[b & 31]).join('');

/** 第一次執行時建立的 config.json */
export const starterConfig = (key) => ({
  inboxUrl: '',
  workerKey: key,
  comfyUrl: DEFAULTS.comfyUrl,
  workflow: DEFAULTS.workflow,
  review: DEFAULTS.review,
  candidates: DEFAULTS.candidates,
});

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const httpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
};
const isLocal = (u) => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
const REGEN_KEY = '刪掉 config.json 再執行一次，程式會產生一組新的（Apps Script 的 WORKER_KEY 也要換成新的）';

/** 檢查 config.json，補上預設值。inbox: false 是只試跑 ComfyUI（--try），收件處的網址和鑰匙還沒填也沒關係 */
export function parseConfig(raw, { inbox: needInbox = true } = {}) {
  const errors = [];
  const warnings = [];
  if (!isObj(raw)) return { ok: false, errors: ['config.json 的內容要是 { … }'], warnings };
  for (const k of Object.keys(raw)) if (!KNOWN.includes(k)) warnings.push(`不認得的設定「${k}」，會被忽略（拼字對嗎？）`);
  const config = { ...DEFAULTS, inboxUrl: '', workerKey: '' };

  if (needInbox) {
    const inbox = str(raw.inboxUrl);
    const inboxUrl = inbox ? httpUrl(inbox) : null;
    if (!inbox) errors.push('inboxUrl 還沒填：貼上收件處的網址（部署 Apps Script 拿到的，/exec 結尾）');
    else if (!inboxUrl) errors.push(`inboxUrl 不是網址：${inbox}`);
    else if (inboxUrl.protocol !== 'https:' && !isLocal(inboxUrl)) errors.push('inboxUrl 要是 https:// 開頭');
    else if (/\/dev\/?$/.test(inboxUrl.pathname)) errors.push('inboxUrl 要用 /exec 結尾的網址（「部署 → 管理部署作業」裡的那個）；/dev 的網址只有你自己登入時能用');
    else config.inboxUrl = inboxUrl.href;

    const key = str(raw.workerKey);
    if (!key) errors.push(`workerKey 還沒填：${REGEN_KEY}`);
    else if (key.length < KEY_MIN) errors.push(`workerKey 太短（至少 ${KEY_MIN} 個字）：${REGEN_KEY}`);
    else config.workerKey = key;
  }

  if (raw.comfyUrl !== undefined) {
    const u = httpUrl(str(raw.comfyUrl));
    if (!u) errors.push(`comfyUrl 不是網址：${String(raw.comfyUrl)}（例："${DEFAULTS.comfyUrl}"）`);
    else config.comfyUrl = u.href.replace(/\/+$/, '');
  }
  if (raw.workflow !== undefined) {
    if (!str(raw.workflow)) errors.push(`workflow 要填 workflow 檔案的位置（例："${DEFAULTS.workflow}"）`);
    else config.workflow = str(raw.workflow);
  }
  for (const k of ['imageNode', 'outputNode']) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    if ((typeof v !== 'string' && typeof v !== 'number') || !String(v).trim()) errors.push(`${k} 要填節點編號或標題（例："12"）`);
    else config[k] = String(v).trim();
  }
  if (raw.review !== undefined) {
    if (typeof raw.review !== 'boolean') errors.push('review 要填 true 或 false（不用加引號）');
    else config.review = raw.review;
  }
  const num = (k, min, max, unit) => {
    const v = raw[k];
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) errors.push(`${k} 要填 ${min}～${max} 的整數${unit}`);
    else config[k] = v;
  };
  num('candidates', 1, 8, '（挑選模式每個 OC 畫幾張）');
  num('pollSeconds', 10, 3600, '（幾秒看一次收件處）');
  num('timeoutMinutes', 1, 180, '（一張最多等幾分鐘）');
  return errors.length ? { ok: false, errors, warnings } : { ok: true, config, warnings };
}

// ---------------------------------------------------------------- ComfyUI 的 workflow（API 格式）

/** 「Workflow → Export (API)」存的檔案：{ "節點編號": { class_type, inputs, _meta: { title } } } */
export function readWorkflow(raw) {
  if (isObj(raw) && Array.isArray(raw.nodes)) {
    return { ok: false, error: '這是 ComfyUI 一般存檔的格式。請用「Workflow → Export (API)」另存一份（舊版 ComfyUI：設定裡打開 Dev mode，再按「Save (API Format)」）' };
  }
  const nodes = isObj(raw) ? Object.values(raw) : [];
  if (!nodes.length || !nodes.every((n) => isObj(n) && typeof n.class_type === 'string' && isObj(n.inputs))) {
    return { ok: false, error: 'workflow 檔案不是 ComfyUI 的 API 格式（每個節點要有 class_type 和 inputs）' };
  }
  return { ok: true, workflow: raw };
}

/** 節點編號照數字排（9 在 12 前面；子圖展開的 7:12 也一樣） */
const idOrder = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const byId = (a, b) => idOrder(a.id, b.id);

/** workflow 裡的節點：編號、標題、類型，照編號排 */
export const listNodes = (w) =>
  Object.entries(w).map(([id, n]) => ({ id, title: str(n._meta?.title) || n.class_type, classType: n.class_type })).sort(byId);

export const describeNode = (n) => `節點 ${n.id}「${n.title}」`;

/** 用編號或標題找節點 */
function matchNode(nodes, wanted, setting) {
  const hit = nodes.find((n) => n.id === wanted);
  if (hit) return { ok: true, node: hit };
  const titled = nodes.filter((n) => n.title === wanted);
  if (titled.length === 1) return { ok: true, node: titled[0] };
  if (titled.length > 1) return { ok: false, error: `config.json 的 ${setting}「${wanted}」有 ${titled.length} 個節點叫這個名字，改填節點編號` };
  return { ok: false, error: `config.json 的 ${setting}「${wanted}」在 workflow 裡找不到（填節點編號或標題）` };
}

/** 放 OC 圖的節點：Load Image。只有一個就用它，有好幾個要在 config.json 指定 imageNode */
export function findImageNode(w, wanted) {
  const nodes = listNodes(w);
  if (wanted) {
    const hit = matchNode(nodes, wanted, 'imageNode');
    if (hit.ok && typeof w[hit.node.id].inputs.image !== 'string') {
      return { ok: false, error: `${describeNode(hit.node)} 沒有放圖的 image 欄位：imageNode 要指到 Load Image 節點` };
    }
    return hit;
  }
  const loaders = nodes.filter((n) => n.classType === 'LoadImage');
  if (loaders.length === 1) return { ok: true, node: loaders[0] };
  if (!loaders.length) return { ok: false, error: 'workflow 裡沒有 Load Image 節點：加一個來放玩家的 OC 圖' };
  return {
    ok: false,
    error: `workflow 裡有 ${loaders.length} 個 Load Image（${loaders.map(describeNode).join('、')}）。`
      + `在 config.json 加一行 "imageNode": "${loaders[0].id}"，填放 OC 圖的那個節點編號或標題`,
  };
}

/** 存圖的節點：有指定 outputNode 就用那個（node），沒有就跑完再挑；savers 是 workflow 裡的 Save Image */
export function findOutputNode(w, wanted) {
  const nodes = listNodes(w);
  const savers = nodes.filter((n) => n.classType === 'SaveImage');
  if (!wanted) return { ok: true, node: null, savers };
  const hit = matchNode(nodes, wanted, 'outputNode');
  return hit.ok ? { ok: true, node: hit.node, savers } : hit;
}

const SEED_INPUTS = ['seed', 'noise_seed'];

/**
 * 這次要跑的 workflow：OC 圖放進 imageNode；種子每次換新的（同一張 OC 重畫才會不一樣）；
 * Save Image 存到 ComfyUI output 裡的 oc-guild-quest/領取碼_00001_.png，之後好找、好刪。
 */
export function patchWorkflow(w, { imageNode, image, prefix, rand = Math.random }) {
  const out = JSON.parse(JSON.stringify(w));
  out[imageNode].inputs.image = image;
  for (const node of Object.values(out)) {
    for (const k of SEED_INPUTS) if (typeof node.inputs[k] === 'number') node.inputs[k] = Math.floor(rand() * 2 ** 32);
    if (node.class_type === 'SaveImage' && typeof node.inputs.filename_prefix === 'string') node.inputs.filename_prefix = prefix;
  }
  return out;
}

// ---------------------------------------------------------------- ComfyUI 的回答

/** 跑完的輸出圖：[{ nodeId, filename, subfolder, type }] */
function imagesOf(outputs) {
  const out = [];
  if (!isObj(outputs)) return out;
  for (const [nodeId, o] of Object.entries(outputs)) {
    for (const img of isObj(o) && Array.isArray(o.images) ? o.images : []) {
      if (!isObj(img) || typeof img.filename !== 'string') continue;
      out.push({ nodeId, filename: img.filename, subfolder: str(img.subfolder), type: str(img.type) || 'output' });
    }
  }
  return out;
}

function executionError(messages) {
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(m)) continue;
    const [type, d] = m;
    if (type === 'execution_error' && isObj(d)) return `節點 ${String(d.node_id)}（${String(d.node_type)}）出錯：${str(d.exception_message)}`;
    if (type === 'execution_interrupted') return '被中斷了（ComfyUI 裡有人按了取消）';
  }
  return 'ComfyUI 執行失敗';
}

/** GET /history/{id} 的回答：還在排隊或在畫（running）、畫完了（done，附輸出圖）、出錯了（error） */
export function historyState(history, id) {
  const h = isObj(history) ? history[id] : undefined;
  if (!isObj(h)) return { state: 'running' };
  const status = isObj(h.status) ? h.status : {};
  if (status.status_str === 'error') return { state: 'error', message: executionError(status.messages) };
  return { state: 'done', images: imagesOf(h.outputs) };
}

/** GET /queue 的回答裡有沒有這個工作（正在畫或排隊中） */
export function inQueue(queue, id) {
  if (!isObj(queue)) return false;
  return ['queue_running', 'queue_pending'].some((k) =>
    Array.isArray(queue[k]) && queue[k].some((item) => Array.isArray(item) && item[1] === id));
}

/** 要送給玩家的那張：有指定節點就用它的；沒有就挑存檔（type output）的，好幾個就用編號最大的節點 */
export function pickOutput(images, nodeId) {
  if (nodeId) return images.find((i) => i.nodeId === nodeId) ?? null;
  const saved = images.filter((i) => i.type === 'output');
  const pool = saved.length ? saved : images;
  return [...pool].sort((a, b) => idOrder(b.nodeId, a.nodeId))[0] ?? null;
}

/** POST /prompt 被拒絕時的說明（workflow 有錯、模型找不到…） */
export function promptError(body) {
  if (!isObj(body)) return 'ComfyUI 不接受這個 workflow';
  const lines = [];
  if (typeof body.error === 'string') lines.push(body.error);
  else if (isObj(body.error)) lines.push([str(body.error.message), str(body.error.details)].filter(Boolean).join('：'));
  for (const [id, ne] of Object.entries(isObj(body.node_errors) ? body.node_errors : {})) {
    const errs = isObj(ne) && Array.isArray(ne.errors) ? ne.errors : [];
    const what = errs.map((x) => (isObj(x) ? [str(x.message), str(x.details)].filter(Boolean).join('：') : '')).filter(Boolean).join('；');
    lines.push(`節點 ${id}（${isObj(ne) ? String(ne.class_type) : '?'}）：${what || '有錯'}`);
  }
  return lines.filter(Boolean).join('\n') || 'ComfyUI 不接受這個 workflow';
}

// ---------------------------------------------------------------- 收件處的回答

export const INBOX_ERRORS = {
  not_json: '收件處回的不是 JSON：確認 inboxUrl 是 /exec 結尾、部署時「誰可以存取」選「所有人」。都對的話，到 Apps Script 的「執行項目」看錯誤',
  no_key: 'Apps Script 還沒設鑰匙：專案設定 → 指令碼屬性 → 新增 WORKER_KEY，值貼上 config.json 的 workerKey',
  weak_key: `Apps Script 的 WORKER_KEY 太短（至少 ${KEY_MIN} 個字）：改成 config.json 的 workerKey 那一串`,
  forbidden: '鑰匙對不上：Apps Script 指令碼屬性的 WORKER_KEY 要跟 config.json 的 workerKey 一模一樣',
  bad_request: '收件處還是舊版的程式：把新的 Code.gs 貼上存檔，再「部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選新版本 → 部署」',
  not_found: '玩家已經領走或取消了',
  too_big: '小人圖超過 8MB，收件處不收：在 workflow 最後加一個把圖縮小的節點',
  busy: '收件處今天收太多張了',
  unknown: '收件處出問題了：到 Apps Script 的「執行項目」看錯誤',
};

/** 收件處回來的文字 → { ok, data } 或 { ok: false, error, message } */
export function parseInboxReply(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (!isObj(data)) return { ok: false, error: 'not_json', message: INBOX_ERRORS.not_json };
  if (data.ok === true) return { ok: true, data };
  const error = typeof data.error === 'string' && data.error ? data.error : 'unknown';
  return { ok: false, error, message: INBOX_ERRORS[error] ?? `收件處回了錯誤：${error}` };
}

/** pending 的回答：還沒做的 OC（items）、已經有小人等玩家領的領取碼（ready）；格式不對是 null */
export function parsePending(data) {
  if (!isObj(data) || !Array.isArray(data.items)) return null;
  return {
    items: data.items.filter((i) => isObj(i) && isCode(i.code)).map((i) => ({
      code: i.code, name: str(i.name), note: str(i.note), requestedAt: Number(i.requestedAt) || 0,
    })),
    ready: Array.isArray(data.ready) ? data.ready.filter(isCode) : [],
  };
}

// ---------------------------------------------------------------- 每個 OC 的資料夾：jobs/領取碼/

/** 玩家的 OC 圖（oc.png）、OC 名字和給組員的話（info.txt）、送出的紀錄（sent.txt） */
export const INFO = 'info.txt';
export const SENT = 'sent.txt';
const IMAGE = '\\.(png|jpe?g|webp)$';
export const isOcFile = (f) => new RegExp(`^oc${IMAGE}`, 'i').test(f);
/** 自動模式畫好的小人 */
const isChibi = (f) => new RegExp(`^chibi${IMAGE}`, 'i').test(f);
/** 挑選模式組員挑好的：ok.png（Windows 藏了副檔名時會變成 ok.png.png，也算） */
const isOk = (f) => new RegExp(`^ok(\\.[^.]+)*${IMAGE}`, 'i').test(f);
/** 挑選模式的候選：1.png、2.png… */
const isCandidate = (f) => new RegExp(`^\\d+${IMAGE}`, 'i').test(f);

/**
 * 收件處說這個 OC 還沒有小人，照資料夾裡的檔案決定下一步：
 * - redo：送出過了，但雲端 results 裡的小人被刪掉了（組員想重畫）→ 清掉畫好的再畫
 * - download：還沒有 OC 圖
 * - send：有要送的小人（自動模式的 chibi.png；挑選模式組員改名的 ok.png）
 * - generate：要再畫 count 張（挑選模式不要的刪掉，就會補畫）
 * - wait：挑選模式，候選都畫好了，等組員挑
 */
export function nextStep(files, { review, candidates }) {
  if (files.includes(SENT)) return { step: 'redo' };
  if (!files.some(isOcFile)) return { step: 'download' };
  const pick = files.find(review ? isOk : isChibi);
  if (pick) return { step: 'send', file: pick };
  if (!review) return { step: 'generate', count: 1 };
  const have = files.filter(isCandidate).length;
  return have < candidates ? { step: 'generate', count: candidates - have } : { step: 'wait', count: have };
}

/** 重畫前要清掉的：畫好的、挑好的、送出的紀錄（OC 圖和 info.txt 留著） */
export const outputFiles = (files) => files.filter((f) => f === SENT || isChibi(f) || isOk(f) || isCandidate(f));

/** 下一張候選的檔名：編號接著最大的往下 */
export function candidateName(files, ext) {
  const max = files.filter(isCandidate).reduce((m, f) => Math.max(m, parseInt(f, 10)), 0);
  return `${max + 1}.${ext}`;
}

/** info.txt：組員對照用 */
export const infoText = (item, when) =>
  `領取碼：${item.code}\nOC：${item.name || '（沒寫）'}\n給組員的話：${item.note || '（沒寫）'}\n送出：${when}\n`;

/** 記錄裡怎麼稱呼這個 OC */
export const label = (item) => (item.name ? `${item.code}（${item.name}）` : item.code);
