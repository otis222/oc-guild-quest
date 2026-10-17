// 專屬小人的收件處（tools/chibi-apps-script/Code.gs）：用假的雲端硬碟在本機跑一次，
// 確定組員部署到自己的 Google 帳號之前，收圖、領圖、領完刪檔的邏輯是對的。
import { describe, expect, it } from 'vitest';
import CODE from '../../tools/chibi-apps-script/Code.gs?raw';

interface Iter<T> { hasNext(): boolean; next(): T }
interface FakeFile { name: string; bytes: number[]; mime: string; text: string; trashed: boolean }
interface FileApi {
  getName(): string;
  setTrashed(t: boolean): void;
  getBlob(): { getBytes(): number[] };
}
interface FolderApi {
  getFoldersByName(n: string): Iter<FolderApi>;
  createFolder(n: string): FolderApi;
  getFiles(): Iter<FileApi>;
  /** Apps Script 的 createFile：給 Blob，或給檔名和文字內容 */
  createFile(blobOrName: { bytes: number[]; mime: string; name: string } | string, content?: string): FileApi;
}
interface FakeFolder { name: string; folders: FakeFolder[]; files: FakeFile[]; api: FolderApi }

const iter = <T>(items: T[]): Iter<T> => {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
};

const fileApi = (file: FakeFile): FileApi => ({
  getName: () => file.name,
  setTrashed: (t) => { file.trashed = t; },
  getBlob: () => ({ getBytes: () => file.bytes }),
});

function fakeFolder(name: string): FakeFolder {
  const f: FakeFolder = {
    name, folders: [], files: [],
    api: {
      getFoldersByName: (n) => iter(f.folders.filter((x) => x.name === n).map((x) => x.api)),
      createFolder: (n) => { const sub = fakeFolder(n); f.folders.push(sub); return sub.api; },
      getFiles: () => iter(f.files.filter((x) => !x.trashed).map(fileApi)),
      createFile: (blobOrName, content) => {
        const file: FakeFile = typeof blobOrName === 'string'
          ? { name: blobOrName, bytes: [], mime: 'text/plain', text: content ?? '', trashed: false }
          : { name: blobOrName.name, bytes: blobOrName.bytes, mime: blobOrName.mime, text: '', trashed: false };
        f.files.push(file);
        return fileApi(file);
      },
    },
  };
  return f;
}

const toB64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string): number[] => [...atob(s)].map((c) => c.charCodeAt(0));

/** 載入 Code.gs；overrides 可以換掉檔案開頭的設定（邀請碼、上限） */
function load(overrides: Record<string, string> = {}) {
  let src = CODE;
  for (const [name, value] of Object.entries(overrides)) {
    const re = new RegExp(`const ${name} = [^;]+;`);
    if (!re.test(src)) throw new Error(`Code.gs 裡沒有 ${name}`);
    src = src.replace(re, `const ${name} = ${value};`);
  }
  const drive = fakeFolder('My Drive');
  const props = new Map<string, string>();
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
      getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v); } }),
    },
  };
  const make = new Function(...Object.keys(env), `${src}\nreturn { doGet, doPost };`);
  const api = make(...Object.values(env)) as {
    doGet(e: unknown): { text: string };
    doPost(e: unknown): { text: string };
  };
  const folder = (name: string): FakeFolder | undefined =>
    drive.folders.find((x) => x.name === 'oc-guild-quest 專屬小人')?.folders.find((x) => x.name === name);
  return {
    post: (body: unknown) => JSON.parse(api.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text),
    get: (parameter: Record<string, string>) => JSON.parse(api.doGet({ parameter }).text),
    /** 沒丟進垃圾桶的檔案 */
    live: (name: string) => (folder(name)?.files ?? []).filter((f) => !f.trashed),
    hasFolder: (name: string) => folder(name) !== undefined,
    /** 組員把做好的小人放進 results */
    putResult: (fileName: string, bytes: number[]) => {
      const results = folder('results');
      if (!results) throw new Error('還沒有 results 資料夾');
      results.files.push({ name: fileName, bytes, mime: 'image/png', text: '', trashed: false });
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
    expect(s.get({})).toEqual({ ok: false, error: 'bad_request' });
  });

  it('玩家領走以後：requests 和 results 裡這個領取碼的檔案都丟進垃圾桶，別人的不動', () => {
    const s = load();
    s.post(request());
    s.post(request({ code: 'ABCD-EFG' }));
    s.putResult('K7Q2-M9X.png', [1, 2]);
    expect(s.post({ action: 'done', code: 'K7Q2-M9X' })).toEqual({ ok: true });
    expect(s.live('requests').map((f) => f.name)).toEqual(['ABCD-EFG.png', 'ABCD-EFG.txt']);
    expect(s.live('results')).toEqual([]);
    expect(s.get({ action: 'result', code: 'K7Q2-M9X' })).toEqual({ ok: true, status: 'waiting' });
  });
});
