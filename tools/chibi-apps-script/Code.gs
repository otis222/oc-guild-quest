/**
 * 公會委託單：專屬小人的收件處（企劃表 T19）
 *
 * 網站把玩家的 OC 圖送到這裡，存進你 Google 雲端硬碟的「oc-guild-quest 專屬小人 / requests」，
 * 旁邊放一個同名的 .txt，寫著 OC 名字、玩家給你的話、送出時間。
 * 你在自己的電腦用 ComfyUI 做好小人，存成 PNG、用領取碼當檔名（例：K7Q2-M9X.png），放進「results」，
 * 玩家在網站按「看看好了沒」就領得到。玩家領走以後，requests 和 results 裡那個領取碼的檔案會自動丟進垃圾桶。
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

/** 領取碼：XXXX-XXX（跟網站 src/core/chibi.ts 一樣） */
const CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{3}$/;
/** results 裡認得的圖片 */
const RESULT_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** ROOT_NAME 底下的資料夾，沒有就建 */
function folder_(name) {
  const roots = DriveApp.getFoldersByName(ROOT_NAME);
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder(ROOT_NAME);
  const subs = root.getFoldersByName(name);
  return subs.hasNext() ? subs.next() : root.createFolder(name);
}

/** 資料夾裡檔名是「領取碼.副檔名」的檔案 */
function filesOf_(folder, code) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf(code + '.') === 0) out.push(f);
  }
  return out;
}

/** 玩家寫的字：去掉換行和多餘空白、限制長度 */
function clip_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
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
 * - { action: 'done', code }：玩家領到小人了，把這個領取碼的檔案丟進垃圾桶
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!body || typeof body.code !== 'string' || !CODE_RE.test(body.code)) return json_({ ok: false, error: 'bad_request' });

  if (body.action === 'done') {
    filesOf_(folder_('requests'), body.code).concat(filesOf_(folder_('results'), body.code))
      .forEach(function (f) { f.setTrashed(true); });
    return json_({ ok: true });
  }
  if (body.action !== 'request') return json_({ ok: false, error: 'bad_request' });
  if (INVITE_CODE && body.invite !== INVITE_CODE) return json_({ ok: false, error: 'invite' });
  if (body.mime !== 'image/png' && body.mime !== 'image/jpeg') return json_({ ok: false, error: 'bad_request' });

  let bytes;
  try {
    bytes = Utilities.base64Decode(String(body.image || ''));
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!bytes.length) return json_({ ok: false, error: 'bad_request' });
  if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'too_big' });
  if (countToday_() > MAX_PER_DAY) return json_({ ok: false, error: 'busy' });

  // results 也先建好，組員一開始就找得到放小人的地方
  folder_('results');
  // 同一個領取碼重送：換掉舊的
  const requests = folder_('requests');
  filesOf_(requests, body.code).forEach(function (f) { f.setTrashed(true); });
  const ext = body.mime === 'image/png' ? 'png' : 'jpg';
  requests.createFile(Utilities.newBlob(bytes, body.mime, body.code + '.' + ext));
  requests.createFile(body.code + '.txt',
    'OC：' + clip_(body.name, 20) + '\n給組員的話：' + clip_(body.note, 60) + '\n送出：' + new Date().toISOString() + '\n');
  return json_({ ok: true });
}

/** 網站問「做好了嗎」：?action=result&code=K7Q2-M9X */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'result' || typeof p.code !== 'string' || !CODE_RE.test(p.code)) return json_({ ok: false, error: 'bad_request' });
  const files = filesOf_(folder_('results'), p.code);
  for (let i = 0; i < files.length; i++) {
    const ext = files[i].getName().split('.').pop().toLowerCase();
    const mime = RESULT_TYPES[ext];
    if (!mime) continue;
    return json_({ ok: true, status: 'ready', mime: mime, image: Utilities.base64Encode(files[i].getBlob().getBytes()) });
  }
  return json_({ ok: true, status: 'waiting' });
}
