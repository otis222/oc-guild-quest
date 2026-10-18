// 專屬小人的收件處（tools/chibi-apps-script/Code.gs）：用假的雲端硬碟在本機跑一次，
// 確定組員部署到自己的 Google 帳號之前，收圖、領圖、領完刪檔、自動生成程式的 API 都是對的。
import { describe, expect, it } from 'vitest';
import CODE from '../../tools/chibi-apps-script/Code.gs?raw';

interface Iter<T> { hasNext(): boolean; next(): T }
interface FakeFile { name: string; bytes: number[]; mime: string; text: string; trashed: boolean; created: number }
interface FileApi {
  getName(): string;
  setTrashed(t: boolean): void;
  isTrashed(): boolean;
  getDateCreated(): { getTime(): number };
  getBlob(): { getBytes(): number[]; getDataAsString(): string };
}
interface FolderApi {
  getFoldersByName(n: string): Iter<FolderApi>;
  createFolder(n: string): FolderApi;
  isTrashed(): boolean;
  /** 跟真的 DriveApp 一樣：垃圾桶裡的檔案也會列出來 */
  getFiles(): Iter<FileApi>;
  /** Apps Script 的 createFile：給 Blob，或給檔名和文字內容 */
  createFile(blobOrName: { bytes: number[]; mime: string; name: string } | string, content?: string): FileApi;
}
interface FakeFolder { name: string; folders: FakeFolder[]; files: FakeFile[]; trashed: boolean; api: FolderApi }

const iter = <T>(items: T[]): Iter<T> => {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
};

const fileApi = (file: FakeFile): FileApi => ({
  getName: () => file.name,
  setTrashed: (t) => { file.trashed = t; },
  isTrashed: () => file.trashed,
  getDateCreated: () => ({ getTime: () => file.created }),
  getBlob: () => ({ getBytes: () => file.bytes, getDataAsString: () => file.text }),
});

/** 檔案建立的時間：每建一個加一秒 */
let clock = 0;

function fakeFolder(name: string): FakeFolder {
  const f: FakeFolder = {
    name, folders: [], files: [], trashed: false,
    api: {
      getFoldersByName: (n) => iter(f.folders.filter((x) => x.name === n).map((x) => x.api)),
      createFolder: (n) => { const sub = fakeFolder(n); f.folders.push(sub); return sub.api; },
      isTrashed: () => f.trashed,
      getFiles: () => iter(f.files.map(fileApi)),
      createFile: (blobOrName, content) => {
        clock += 1000;
        const file: FakeFile = typeof blobOrName === 'string'
          ? { name: blobOrName, bytes: [], mime: 'text/plain', text: content ?? '', trashed: false, created: clock }
          : { name: blobOrName.name, bytes: blobOrName.bytes, mime: blobOrName.mime, text: '', trashed: false, created: clock };
        f.files.push(file);
        return fileApi(file);
      },
    },
  };
  return f;
}

const toB64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string): number[] => [...atob(s)].map((c) => c.charCodeAt(0));

const KEY = 'k3y-for-tests-0123456789';

/** 載入 Code.gs；overrides 可以換掉檔案開頭的設定（邀請碼、上限）；props 是指令碼屬性 */
function load(overrides: Record<string, string> = {}, props: Record<string, string> = { WORKER_KEY: KEY }) {
  let src = CODE;
  for (const [name, value] of Object.entries(overrides)) {
    const re = new RegExp(`const ${name} = [^;]+;`);
    if (!re.test(src)) throw new Error(`Code.gs 裡沒有 ${name}`);
    src = src.replace(re, `const ${name} = ${value};`);
  }
  const drive = fakeFolder('My Drive');
  const store = new Map<string, string>(Object.entries(props));
  const env = {
    DriveApp: { getFoldersByName: drive.api.getFoldersByName, createFolder: drive.api.createFolder },
    Utilities: {
      base64Decode: (s: string) => {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Could not decode string.');
        return fromB64(s);
      },
      base64Encode: toB64,
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
      formatDate: () => '2026-10-17',
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => store.get(k) ?? null, setProperty: (k: string, v: string) => { store.set(k, v); } }),
    },
  };
  const make = new Function(...Object.keys(env), `${src}\nreturn { doGet, doPost };`);
  const api = make(...Object.values(env)) as {
    doGet(e: unknown): { text: string };
    doPost(e: unknown): { text: string };
  };
  const roots = () => drive.folders.filter((x) => x.name === 'oc-guild-quest 專屬小人');
  const folder = (name: string): FakeFolder | undefined =>
    roots().find((x) => !x.trashed)?.folders.find((x) => x.name === name && !x.trashed);
  return {
    post: (body: unknown) => JSON.parse(api.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text),
    get: (parameter: Record<string, string>) => JSON.parse(api.doGet({ parameter }).text),
    /** 自動生成程式送來的（帶鑰匙） */
    worker: (body: Record<string, unknown>) =>
      JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ key: KEY, ...body }) } }).text),
    /** 沒丟進垃圾桶的檔案 */
    live: (name: string) => (folder(name)?.files ?? []).filter((f) => !f.trashed),
    hasFolder: (name: string) => folder(name) !== undefined,
    roots,
    /** 組員自己把做好的小人放進 results */
    putResult: (fileName: string, bytes: number[]) => {
      const results = folder('results');
      if (!results) throw new Error('還沒有 results 資料夾');
      clock += 1000;
      results.files.push({ name: fileName, bytes, mime: 'image/png', text: '', trashed: false, created: clock });
    },
  };
}

const PNG = toB64([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const request = (extra: Record<string, unknown> = {}) => ({
  action: 'request', code: 'K7Q2-M9X', name: '小鈴', note: '想要\n紅色的披風', mime: 'image/png', image: PNG, ...extra,
});

describe('專屬小人的收件處（Apps Script）', () => {
  it('收到 OC 圖：存進 requests，檔名是領取碼，旁邊的 .txt 寫 OC 名字和給組員的話', () => {
    const s = load();
    expect(s.post(request())).toEqual({ ok: true });
    const files = s.live('requests');
    expect(files.map((f) => [f.name, f.mime])).toEqual([['K7Q2-M9X.png', 'image/png'], ['K7Q2-M9X.txt', 'text/plain']]);
    expect(files[0].bytes).toEqual(fromB64(PNG));
    expect(files[1].text).toContain('OC：小鈴');
    expect(files[1].text).toContain('給組員的話：想要 紅色的披風');
    // results 也先建好，組員一開始就找得到放小人的地方
    expect(s.hasFolder('results')).toBe(true);
  });

  it('同一個領取碼重送：換掉舊的；JPEG 存成 .jpg', () => {
    const s = load();
    s.post(request());
    s.post(request({ mime: 'image/jpeg' }));
    expect(s.live('requests').map((f) => f.name)).toEqual(['K7Q2-M9X.jpg', 'K7Q2-M9X.txt']);
  });

  it('資料不對就拒收：領取碼、格式、圖片、看不懂的 JSON', () => {
    const s = load();
    expect(s.post(request({ code: 'k7q2-m9x' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post(request({ mime: 'image/gif' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post(request({ image: '' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post(request({ image: '<script>' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post(request({ action: 'delete-everything' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post('not json')).toEqual({ ok: false, error: 'bad_request' });
    expect(s.post('null')).toEqual({ ok: false, error: 'bad_request' });
    expect(s.live('requests')).toEqual([]);
  });

  it('圖太大：too_big', () => {
    const s = load({ MAX_BYTES: '4' });
    expect(s.post(request())).toEqual({ ok: false, error: 'too_big' });
  });

  it('有設邀請碼：沒帶或帶錯是 invite，帶對才收', () => {
    const s = load({ INVITE_CODE: "'guild29'" });
    expect(s.post(request())).toEqual({ ok: false, error: 'invite' });
    expect(s.post(request({ invite: 'nope' }))).toEqual({ ok: false, error: 'invite' });
    expect(s.post(request({ invite: 'guild29' }))).toEqual({ ok: true });
  });

  it('一天收太多：busy', () => {
    const s = load({ MAX_PER_DAY: '2' });
    expect(s.post(request({ code: 'AAAA-AAA' }))).toEqual({ ok: true });
    expect(s.post(request({ code: 'BBBB-BBB' }))).toEqual({ ok: true });
    expect(s.post(request({ code: 'CCCC-CCC' }))).toEqual({ ok: false, error: 'busy' });
  });

  it('做好了嗎：還沒放就是 waiting；組員放進 results 就領得到；不認得的副檔名不算', () => {
    const s = load();
    s.post(request());
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({ ok: true, status: 'waiting' });
    s.putResult('K7Q2-M9X.txt', [1]);
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({ ok: true, status: 'waiting' });
    s.putResult('K7Q2-M9X.png', [9, 8, 7]);
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({
      ok: true, status: 'ready', mime: 'image/png', image: toB64([9, 8, 7]),
    });
    expect(s.get({ action: 'result', code: 'ABCD-EFG' })).toEqual({ ok: true, status: 'waiting' });
    expect(s.get({ action: 'result', code: '../../x' })).toEqual({ ok: false, error: 'bad_request' });
    expect(s.get({ action: 'nope' })).toEqual({ ok: false, error: 'bad_request' });
  });

  it('什麼都不帶打開網址：回收件處的名字（組員部署完用瀏覽器確認網址）', () => {
    expect(load().get({})).toEqual({ ok: true, name: 'oc-guild-quest 專屬小人' });
  });

  it('玩家領走以後：requests 和 results 裡這個領取碼的檔案都丟進垃圾桶，別人的不動', () => {
    const s = load();
    s.post(request());
    s.post(request({ code: 'ABCD-EFG' }));
    s.putResult('K7Q2-M9X.png', [1, 2]);
    expect(s.post({ action: 'done', code: 'K7Q2-M9X' })).toEqual({ ok: true });
    expect(s.live('requests').map((f) => f.name)).toEqual(['ABCD-EFG.png', 'ABCD-EFG.txt']);
    expect(s.live('results')).toEqual([]);
    // 垃圾桶裡的小人 DriveApp 還是會列出來，但不能再被領一次
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({ ok: true, status: 'waiting' });
  });

  it('組員把整個資料夾丟進垃圾桶：下一張圖會放進新建的資料夾', () => {
    const s = load();
    s.post(request());
    s.roots()[0].trashed = true;
    expect(s.post(request({ code: 'ABCD-EFG' }))).toEqual({ ok: true });
    expect(s.roots()).toHaveLength(2);
    expect(s.live('requests').map((f) => f.name)).toEqual(['ABCD-EFG.png', 'ABCD-EFG.txt']);
  });
});

describe('收件處給自動生成程式的 API（要帶鑰匙）', () => {
  it('鑰匙：沒設 WORKER_KEY 是 no_key、太短是 weak_key、不對或沒帶是 forbidden', () => {
    expect(load({}, {}).worker({ action: 'pending' })).toEqual({ ok: false, error: 'no_key' });
    expect(load({}, { WORKER_KEY: 'short' }).worker({ action: 'pending' })).toEqual({ ok: false, error: 'weak_key' });
    const s = load();
    expect(s.worker({ action: 'pending', key: 'wrong-key-wrong-key' })).toEqual({ ok: false, error: 'forbidden' });
    expect(s.post({ action: 'pending' })).toEqual({ ok: false, error: 'forbidden' });
    // 玩家（網站）不能自己放小人
    s.post(request());
    expect(s.post({ action: 'result', code: 'K7Q2-M9X', mime: 'image/png', image: PNG })).toEqual({ ok: false, error: 'forbidden' });
    expect(s.live('results')).toEqual([]);
    // 指令碼屬性前後多了空白也認得
    expect(load({}, { WORKER_KEY: ` ${KEY}\n` }).worker({ action: 'pending' })).toMatchObject({ ok: true });
  });

  it('pending：還沒做的 OC，先送的在前，附 OC 名字和給組員的話；已經有小人的列在 ready', () => {
    const s = load();
    expect(s.worker({ action: 'pending' })).toEqual({ ok: true, items: [], ready: [] });
    s.post(request({ code: 'BBBB-BBB', name: '阿貓', note: '' }));
    s.post(request());
    s.post(request({ code: 'CCCC-CCC' }));
    s.putResult('CCCC-CCC.png', [1]);
    const r = s.worker({ action: 'pending' });
    expect(r.items.map((i: { code: string; name: string; note: string }) => [i.code, i.name, i.note])).toEqual([
      ['BBBB-BBB', '阿貓', ''],
      ['K7Q2-M9X', '小鈴', '想要 紅色的披風'],
    ]);
    expect(r.items[0].requestedAt).toBeLessThan(r.items[1].requestedAt);
    expect(r.ready).toEqual(['CCCC-CCC']);
  });

  it('pending：垃圾桶裡的、不是領取碼的檔名都不算', () => {
    const s = load();
    s.post(request());
    s.post(request({ code: 'ABCD-EFG' }));
    s.post({ action: 'done', code: 'ABCD-EFG' });
    s.putResult('notes.png', [1]);
    expect(s.worker({ action: 'pending' })).toMatchObject({ items: [{ code: 'K7Q2-M9X' }], ready: [] });
  });

  it('image：下載 OC 圖；玩家已經領走或取消了是 not_found', () => {
    const s = load();
    s.post(request({ mime: 'image/jpeg' }));
    expect(s.worker({ action: 'image', code: 'K7Q2-M9X' })).toEqual({ ok: true, mime: 'image/jpeg', image: PNG });
    expect(s.worker({ action: 'image', code: 'ABCD-EFG' })).toEqual({ ok: false, error: 'not_found' });
    expect(s.worker({ action: 'image', code: '../x' })).toEqual({ ok: false, error: 'bad_request' });
    s.post({ action: 'done', code: 'K7Q2-M9X' });
    expect(s.worker({ action: 'image', code: 'K7Q2-M9X' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('result：小人存進 results（換掉舊的），網站就領得到；不再列在 pending', () => {
    const s = load();
    s.post(request());
    expect(s.worker({ action: 'result', code: 'K7Q2-M9X', mime: 'image/png', image: toB64([1, 1]) })).toEqual({ ok: true });
    expect(s.worker({ action: 'result', code: 'K7Q2-M9X', mime: 'image/webp', image: toB64([2, 2]) })).toEqual({ ok: true });
    expect(s.live('results').map((f) => [f.name, f.mime, f.bytes])).toEqual([['K7Q2-M9X.webp', 'image/webp', [2, 2]]]);
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({ ok: true, status: 'ready', mime: 'image/webp', image: toB64([2, 2]) });
    expect(s.worker({ action: 'pending' })).toEqual({ ok: true, items: [], ready: ['K7Q2-M9X'] });
  });

  it('result：格式不對、太大、玩家已經不要了都不收', () => {
    const s = load({ MAX_BYTES: '4' });
    s.post({ ...request(), image: toB64([1, 2]) });
    expect(s.worker({ action: 'result', code: 'K7Q2-M9X', mime: 'image/gif', image: PNG })).toEqual({ ok: false, error: 'bad_request' });
    expect(s.worker({ action: 'result', code: 'K7Q2-M9X', mime: 'image/png', image: '' })).toEqual({ ok: false, error: 'bad_request' });
    expect(s.worker({ action: 'result', code: 'K7Q2-M9X', mime: 'image/png', image: PNG })).toEqual({ ok: false, error: 'too_big' });
    expect(s.worker({ action: 'result', code: 'ABCD-EFG', mime: 'image/png', image: toB64([1]) })).toEqual({ ok: false, error: 'not_found' });
    expect(s.live('results')).toEqual([]);
  });
});
