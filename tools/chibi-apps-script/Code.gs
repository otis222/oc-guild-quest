/**
 * 公會委託單：專屬小人的收件處（企劃表 T19）
 *
 * 網站把玩家的 OC 圖送到這裡，存進你 Google 雲端硬碟的「oc-guild-quest 專屬小人 / requests」，
 * 旁邊放一個同名的 .txt，寫著 OC 名字、玩家給你的話、送出時間。
 * 做好的小人用領取碼當檔名（例：K7Q2-M9X.png），放進「results」，玩家在網站按「看看好了沒」就領得到。
 * 玩家領走（或換一張重送）以後，requests 和 results 裡那個領取碼的檔案會自動丟進垃圾桶。
 *
 * 小人可以自己放進 results，也可以讓你電腦上的自動生成程式（tools/chibi-worker/）來拿 OC 圖、傳回小人。
 * 自動生成程式要帶鑰匙：在「專案設定 → 指令碼屬性」新增 WORKER_KEY，值跟 tools/chibi-worker/config.json 的 workerKey 一樣。
 * 鑰匙不要寫進這個檔案（repo 是公開的）。
 *
 * 怎麼部署：見 docs/專屬小人設定.md
 * （script.google.com 新增專案 → 貼上這個檔案 → 部署成「網頁應用程式」，執行身分「我」、存取權「所有人」）。
 */

/** 放檔案的資料夾：在你的雲端硬碟最上層，沒有就自動建 */
const ROOT_NAME = 'oc-guild-quest 專屬小人';
/** 想擋陌生人的話，設一組邀請碼再告訴玩家；空字串就是不用邀請碼 */
const INVITE_CODE = '';
/** 一張圖最大多少（位元組） */
const MAX_BYTES = 8 * 1024 * 1024;
/** 一天最多收幾張（擋惡作劇） */
const MAX_PER_DAY = 30;
/** 自動生成程式的鑰匙至少幾個字（太短會被猜到） */
const KEY_MIN = 16;

/** 領取碼：XXXX-XXX（跟網站 src/core/chibi.ts 一樣） */
const CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{3}$/;
/** 認得的圖片 */
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
/** 存檔的副檔名 */
const EXT_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** 自動生成程式才能用的（要帶鑰匙） */
const WORKER_ACTIONS = ['pending', 'image', 'result'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(error) {
  return json_({ ok: false, error: error });
}

function isCode_(v) {
  return typeof v === 'string' && CODE_RE.test(v);
}

/** 第一個沒丟進垃圾桶的（DriveApp 找資料夾、列檔案時，垃圾桶裡的也會列出來） */
function live_(items) {
  while (items.hasNext()) {
    const x = items.next();
    if (!x.isTrashed()) return x;
  }
  return null;
}

/** ROOT_NAME 底下的資料夾，沒有就建 */
function folder_(name) {
  const root = live_(DriveApp.getFoldersByName(ROOT_NAME)) || DriveApp.createFolder(ROOT_NAME);
  return live_(root.getFoldersByName(name)) || root.createFolder(name);
}

/** 資料夾裡沒丟進垃圾桶的檔案 */
function files_(folder) {
  const out = [];
  const items = folder.getFiles();
  while (items.hasNext()) {
    const f = items.next();
    if (!f.isTrashed()) out.push(f);
  }
  return out;
}

/** 檔名開頭的領取碼（K7Q2-M9X.png → K7Q2-M9X） */
function codeOf_(f) {
  return f.getName().split('.')[0];
}

/** 副檔名（小寫） */
function ext_(f) {
  return f.getName().split('.').pop().toLowerCase();
}

/** 資料夾裡檔名是「領取碼.副檔名」的檔案 */
function filesOf_(folder, code) {
  return files_(folder).filter(function (f) { return f.getName().indexOf(code + '.') === 0; });
}

/** 這個領取碼的圖（.txt 不算）；沒有就是 null */
function imageOf_(folder, code) {
  return filesOf_(folder, code).filter(function (f) { return IMAGE_TYPES[ext_(f)]; })[0] || null;
}

/** 圖片回覆：{ mime, image（base64） } */
function imageReply_(f, extra) {
  const reply = { ok: true, mime: IMAGE_TYPES[ext_(f)], image: Utilities.base64Encode(f.getBlob().getBytes()) };
  Object.keys(extra || {}).forEach(function (k) { reply[k] = extra[k]; });
  return json_(reply);
}

/** base64 → 位元組；空的或解不開是 null */
function decode_(b64) {
  try {
    const bytes = Utilities.base64Decode(String(b64 || ''));
    return bytes.length ? bytes : null;
  } catch (err) {
    return null;
  }
}

/** 玩家寫的字：去掉換行和多餘空白、限制長度 */
function clip_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** .txt 裡「標題：內容」那一行的內容 */
function line_(text, label) {
  const m = text.match(new RegExp('^' + label + '：(.*)$', 'm'));
  return m ? m[1].trim() : '';
}

/** 今天收了第幾張（台灣時間算一天） */
function countToday_() {
  const props = PropertiesService.getScriptProperties();
  const key = 'count:' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return n;
}

/**
 * 網站送來的：
 * - { action: 'request', code, name, note, invite?, mime, image }：存 OC 圖
 * - { action: 'done', code }：玩家領到小人（或換一張重送）了，把這個領取碼的檔案丟進垃圾桶
 * 自動生成程式送來的（都要帶 key）：
 * - { action: 'pending' }：還沒做的 OC，和做好了還沒被領走的領取碼
 * - { action: 'image', code }：下載 OC 圖
 * - { action: 'result', code, mime, image }：傳回做好的小人
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return fail_('bad_request');
  }
  if (!body || typeof body !== 'object') return fail_('bad_request');
  if (WORKER_ACTIONS.indexOf(body.action) >= 0) return worker_(body);
  if (!isCode_(body.code)) return fail_('bad_request');

  if (body.action === 'done') {
    filesOf_(folder_('requests'), body.code).concat(filesOf_(folder_('results'), body.code))
      .forEach(function (f) { f.setTrashed(true); });
    return json_({ ok: true });
  }
  if (body.action !== 'request') return fail_('bad_request');
  if (INVITE_CODE && body.invite !== INVITE_CODE) return fail_('invite');
  if (body.mime !== 'image/png' && body.mime !== 'image/jpeg') return fail_('bad_request');
  const bytes = decode_(body.image);
  if (!bytes) return fail_('bad_request');
  if (bytes.length > MAX_BYTES) return fail_('too_big');
  if (countToday_() > MAX_PER_DAY) return fail_('busy');

  // results 也先建好，組員一開始就找得到放小人的地方
  folder_('results');
  // 同一個領取碼重送：換掉舊的
  const requests = folder_('requests');
  filesOf_(requests, body.code).forEach(function (f) { f.setTrashed(true); });
  requests.createFile(Utilities.newBlob(bytes, body.mime, body.code + '.' + EXT_OF[body.mime]));
  requests.createFile(body.code + '.txt',
    'OC：' + clip_(body.name, 20) + '\n給組員的話：' + clip_(body.note, 60) + '\n送出：' + new Date().toISOString() + '\n');
  return json_({ ok: true });
}

/** 自動生成程式（tools/chibi-worker/）用的：先對鑰匙 */
function worker_(body) {
  const key = String(PropertiesService.getScriptProperties().getProperty('WORKER_KEY') || '').trim();
  if (!key) return fail_('no_key');
  if (key.length < KEY_MIN) return fail_('weak_key');
  if (String(body.key || '').trim() !== key) return fail_('forbidden');
  if (body.action === 'pending') return pending_();
  if (!isCode_(body.code)) return fail_('bad_request');

  // 玩家已經領走或換一張重送了：不用做了
  const request = imageOf_(folder_('requests'), body.code);
  if (!request) return fail_('not_found');
  if (body.action === 'image') return imageReply_(request);

  const ext = EXT_OF[body.mime];
  if (!ext) return fail_('bad_request');
  const bytes = decode_(body.image);
  if (!bytes) return fail_('bad_request');
  if (bytes.length > MAX_BYTES) return fail_('too_big');
  const results = folder_('results');
  filesOf_(results, body.code).forEach(function (f) { f.setTrashed(true); });
  results.createFile(Utilities.newBlob(bytes, body.mime, body.code + '.' + ext));
  return json_({ ok: true });
}

/** 還沒做的 OC（requests 有圖、results 還沒有），先送的在前；和 results 裡已經有小人的領取碼 */
function pending_() {
  const ready = {};
  files_(folder_('results')).forEach(function (f) {
    if (IMAGE_TYPES[ext_(f)] && isCode_(codeOf_(f))) ready[codeOf_(f)] = true;
  });
  const requests = files_(folder_('requests'));
  const seen = {};
  const items = [];
  requests.forEach(function (f) {
    const code = codeOf_(f);
    if (!IMAGE_TYPES[ext_(f)] || !isCode_(code) || ready[code] || seen[code]) return;
    seen[code] = true;
    const txt = requests.filter(function (t) { return t.getName() === code + '.txt'; })[0];
    const info = txt ? txt.getBlob().getDataAsString() : '';
    items.push({ code: code, name: line_(info, 'OC'), note: line_(info, '給組員的話'), requestedAt: f.getDateCreated().getTime() });
  });
  items.sort(function (a, b) { return a.requestedAt - b.requestedAt; });
  return json_({ ok: true, items: items, ready: Object.keys(ready) });
}

/**
 * 網站問「做好了嗎」：?action=result&code=K7Q2-M9X
 * 什麼都不帶：回收件處的名字（部署完用瀏覽器打開，看到就表示網址對了）
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) return json_({ ok: true, name: ROOT_NAME });
  if (p.action !== 'result' || !isCode_(p.code)) return fail_('bad_request');
  const f = imageOf_(folder_('results'), p.code);
  if (!f) return json_({ ok: true, status: 'waiting' });
  return imageReply_(f, { status: 'ready' });
}
