// 專屬小人自動生成程式（tools/chibi-worker/lib.mjs）的規則：設定檔、workflow、ComfyUI 和收件處的回答、
// 每個 OC 的資料夾接下來要做什麼。程式在組員的電腦跑，這裡先確定規則是對的。
import { describe, expect, it } from 'vitest';
import {
  candidateName, checkComfyUrl, checkInboxUrl, choiceIndex, cleanDroppedPath, findImageNode, findOutputNode,
  historyState, inQueue, infoText, KEY_MIN, label, launchSpec, newKey, nextStep, openSpec, outputFiles, parseConfig,
  parseInboxReply, parsePending, patchWorkflow, pickOutput, promptError, readWorkflow, starterConfig,
  type ImageRef, type Workflow,
} from '../../tools/chibi-worker/lib.mjs';

const KEY = 'abcdefghijkmnpqrstuvwxyz';
const INBOX = 'https://script.google.com/macros/s/AKfy-test/exec';

/** 常見的圖生圖 workflow（API 格式）：Load Image → VAE Encode → KSampler → VAE Decode → Save Image */
const WORKFLOW: Workflow = {
  3: { class_type: 'KSampler', inputs: { seed: 123, steps: 20, model: ['4', 0], latent_image: ['11', 0] }, _meta: { title: 'KSampler' } },
  4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'chibi.safetensors' }, _meta: { title: 'Load Checkpoint' } },
  8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] }, _meta: { title: 'VAE Decode' } },
  9: { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] }, _meta: { title: 'Save Image' } },
  10: { class_type: 'LoadImage', inputs: { image: 'example.png' }, _meta: { title: 'Load Image' } },
  11: { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['4', 2] }, _meta: { title: 'VAE Encode' } },
};

describe('設定檔 config.json', () => {
  it('填好網址和鑰匙就能用，其他用預設值', () => {
    const r = parseConfig({ inboxUrl: INBOX, workerKey: KEY });
    expect(r).toEqual({
      ok: true, warnings: [],
      config: {
        inboxUrl: INBOX, workerKey: KEY, comfyUrl: 'http://127.0.0.1:8188', workflow: 'workflow_api.json',
        review: false, candidates: 3, pollSeconds: 30, timeoutMinutes: 20,
      },
    });
  });

  it('第一次執行建的設定檔：有鑰匙，只差收件處網址', () => {
    const key = newKey(new Uint8Array(24).map((_, i) => i * 37));
    expect(key).toMatch(/^[a-km-np-z2-9]{24}$/);
    expect(key.length).toBeGreaterThanOrEqual(KEY_MIN);
    const r = parseConfig(starterConfig(key));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual([expect.stringContaining('inboxUrl：還沒貼上')]);
    expect(parseConfig({ ...starterConfig(key), inboxUrl: INBOX }).ok).toBe(true);
    // 模式和 ComfyUI 啟動檔留給設定時問
    expect(starterConfig(key)).not.toHaveProperty('review');
    expect(starterConfig(key)).not.toHaveProperty('comfyStart');
  });

  it('網址不對：沒填、不是網址、不是 https、用了 /dev', () => {
    const err = (inboxUrl: string) => {
      const r = parseConfig({ inboxUrl, workerKey: KEY });
      return r.ok ? '' : r.errors.join();
    };
    expect(err('')).toContain('inboxUrl：還沒貼上');
    expect(err('script.google.com')).toContain('不是網址');
    expect(err('http://script.google.com/macros/s/x/exec')).toContain('https://');
    expect(err('https://script.google.com/macros/s/x/dev')).toContain('/exec');
    // 在自己的電腦測試可以用 http
    expect(parseConfig({ inboxUrl: 'http://127.0.0.1:9000/exec', workerKey: KEY }).ok).toBe(true);
  });

  it('鑰匙太短或沒填：請組員重新產生一組', () => {
    for (const workerKey of ['', 'short', undefined]) {
      const r = parseConfig({ inboxUrl: INBOX, workerKey });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toContain('刪掉 config.json 再執行一次');
    }
  });

  it('其他設定：檢查型別和範圍；ComfyUI 網址去掉結尾的斜線；節點編號可以填數字', () => {
    const r = parseConfig({
      inboxUrl: INBOX, workerKey: KEY, comfyUrl: 'http://127.0.0.1:8000/', review: true, candidates: 4,
      imageNode: 10, outputNode: ' Save Image ', pollSeconds: 60, timeoutMinutes: 5,
    });
    expect(r.ok && r.config).toMatchObject({
      comfyUrl: 'http://127.0.0.1:8000', review: true, candidates: 4, imageNode: '10', outputNode: 'Save Image', pollSeconds: 60, timeoutMinutes: 5,
    });
    const bad = parseConfig({
      inboxUrl: INBOX, workerKey: KEY, comfyUrl: 'ftp://x', review: 'true', candidates: 0, pollSeconds: 1, timeoutMinutes: 1.5, workflow: ' ', imageNode: {},
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(7);
    expect(parseConfig('nope')).toMatchObject({ ok: false });
    expect(parseConfig([])).toMatchObject({ ok: false });
  });

  it('收件處還沒設好也可以先讀（--try、設定到一半）：填對的照樣留著', () => {
    expect(parseConfig({ inboxUrl: '', workerKey: '' }, { inbox: false })).toMatchObject({ ok: true, config: { comfyUrl: 'http://127.0.0.1:8188', inboxUrl: '' } });
    expect(parseConfig({ inboxUrl: INBOX, workerKey: 'short' }, { inbox: false })).toMatchObject({ ok: true, config: { inboxUrl: INBOX, workerKey: '' } });
    expect(parseConfig({ comfyUrl: 'ftp://x' }, { inbox: false })).toMatchObject({ ok: false });
  });

  it('ComfyUI 啟動檔：有填就記下來，空字串是不用自動打開', () => {
    const start = 'C:/ComfyUI_windows_portable/run_nvidia_gpu.bat';
    expect(parseConfig({ inboxUrl: INBOX, workerKey: KEY, comfyStart: ` ${start} ` })).toMatchObject({ ok: true, config: { comfyStart: start } });
    expect(parseConfig({ inboxUrl: INBOX, workerKey: KEY, comfyStart: '' })).toMatchObject({ ok: true, config: { comfyStart: '' } });
    expect(parseConfig({ inboxUrl: INBOX, workerKey: KEY, comfyStart: 1 })).toMatchObject({ ok: false });
  });

  it('網址：收件處要 https 的 /exec；ComfyUI 沒寫 http:// 也可以', () => {
    expect(checkInboxUrl(` ${INBOX} `)).toEqual({ url: INBOX });
    expect(checkInboxUrl('')).toEqual({ error: expect.stringContaining('還沒貼上') });
    expect(checkInboxUrl('打不開')).toEqual({ error: '「打不開」不是網址' });
    expect(checkComfyUrl('127.0.0.1:8000/')).toBe('http://127.0.0.1:8000');
    expect(checkComfyUrl('http://192.168.0.5:8188/?x=1')).toBe('http://192.168.0.5:8188');
    expect(checkComfyUrl('ftp://x')).toBeNull();
    expect(checkComfyUrl('')).toBeNull();
  });

  it('不認得的設定：提醒拼字，不擋', () => {
    const r = parseConfig({ inboxUrl: INBOX, workerKey: KEY, reveiw: true });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([expect.stringContaining('reveiw')]);
  });
});

describe('一鍵啟動：設定時拖進視窗的檔案、打開 ComfyUI', () => {
  it('拖進視窗的路徑：去掉 Windows 的引號、Mac 的跳脫和多出來的空白', () => {
    expect(cleanDroppedPath('"C:\\Comfy UI\\run_nvidia_gpu.bat"', 'win32')).toBe('C:\\Comfy UI\\run_nvidia_gpu.bat');
    expect(cleanDroppedPath('C:\\ComfyUI\\run.bat', 'win32')).toBe('C:\\ComfyUI\\run.bat');
    expect(cleanDroppedPath('/Users/me/My\\ Comfy/start\\ comfy.command ', 'darwin')).toBe('/Users/me/My Comfy/start comfy.command');
    expect(cleanDroppedPath("'/home/me/comfy dir/run.sh' ", 'linux')).toBe('/home/me/comfy dir/run.sh');
    expect(cleanDroppedPath('  ', 'win32')).toBe('');
  });

  it('打開 ComfyUI：Windows 在自己的資料夾開新視窗；Mac 的 App 用 open；其他直接執行', () => {
    expect(launchSpec('C:\\Comfy UI\\run_nvidia_gpu.bat', 'win32')).toEqual({
      command: 'start "" /D "C:\\Comfy UI" "C:\\Comfy UI\\run_nvidia_gpu.bat"', args: [], options: { shell: true },
    });
    expect(launchSpec('D:\\run.bat', 'win32').command).toBe('start "" /D "D:\\." "D:\\run.bat"');
    expect(launchSpec('/Applications/ComfyUI.app/', 'darwin')).toEqual({ command: 'open', args: ['/Applications/ComfyUI.app'], options: {} });
    expect(launchSpec('/Users/me/start.command', 'darwin').command).toBe('open');
    expect(launchSpec('/home/me/comfy/run.sh', 'linux')).toEqual({ command: '/home/me/comfy/run.sh', args: [], options: { cwd: '/home/me/comfy', detached: true } });
    expect(openSpec('C:\\jobs\\_try\\1.png', 'win32').command).toBe('start "" "C:\\jobs\\_try\\1.png"');
    expect(openSpec('/tmp/1.png', 'darwin')).toEqual({ command: 'open', args: ['/tmp/1.png'], options: {} });
    expect(openSpec('/tmp/1.png', 'linux').command).toBe('xdg-open');
  });

  it('選號碼：1 開始、全形數字也可以；直接按 Enter 用預設；不對是 null', () => {
    expect(choiceIndex('2', 3)).toBe(1);
    expect(choiceIndex(' ３ ', 3)).toBe(2);
    expect(choiceIndex('', 3, 2)).toBe(2);
    expect(choiceIndex('', 3)).toBeNull();
    expect(choiceIndex('4', 3)).toBeNull();
    expect(choiceIndex('0', 3)).toBeNull();
    expect(choiceIndex('第一個', 3)).toBeNull();
  });
});

describe('ComfyUI 的 workflow', () => {
  it('要用「Export (API)」存的格式', () => {
    expect(readWorkflow({ nodes: [], links: [] })).toMatchObject({ ok: false, error: expect.stringContaining('Export (API)') });
    expect(readWorkflow({})).toMatchObject({ ok: false });
    expect(readWorkflow({ 1: { class_type: 'LoadImage' } })).toMatchObject({ ok: false });
    expect(readWorkflow(WORKFLOW)).toEqual({ ok: true, workflow: WORKFLOW });
  });

  it('放 OC 圖的節點：只有一個 Load Image 就用它', () => {
    expect(findImageNode(WORKFLOW)).toEqual({ ok: true, node: { id: '10', title: 'Load Image', classType: 'LoadImage' } });
    const none = { 3: WORKFLOW[3] };
    expect(findImageNode(none)).toMatchObject({ ok: false, error: expect.stringContaining('沒有 Load Image') });
  });

  it('有好幾個 Load Image：列出來，請組員在 config.json 指定；可以填編號或標題', () => {
    const two: Workflow = { ...WORKFLOW, 12: { class_type: 'LoadImage', inputs: { image: 'pose.png' }, _meta: { title: '姿勢' } } };
    const r = findImageNode(two);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('節點 10「Load Image」、節點 12「姿勢」');
      expect(r.error).toContain('"imageNode": "10"');
    }
    expect(findImageNode(two, '10')).toMatchObject({ ok: true, node: { id: '10' } });
    expect(findImageNode(two, '姿勢')).toMatchObject({ ok: true, node: { id: '12' } });
    expect(findImageNode(two, '99')).toMatchObject({ ok: false, error: expect.stringContaining('找不到') });
    expect(findImageNode(two, 'KSampler')).toMatchObject({ ok: false, error: expect.stringContaining('image 欄位') });
    const sameTitle: Workflow = { ...two, 12: { ...two[12], _meta: { title: 'Load Image' } } };
    expect(findImageNode(sameTitle, 'Load Image')).toMatchObject({ ok: false, error: expect.stringContaining('改填節點編號') });
  });

  it('存圖的節點：列出 Save Image；指定 outputNode 要找得到', () => {
    expect(findOutputNode(WORKFLOW)).toEqual({ ok: true, node: null, savers: [{ id: '9', title: 'Save Image', classType: 'SaveImage' }] });
    expect(findOutputNode(WORKFLOW, '9')).toMatchObject({ ok: true, node: { id: '9' } });
    expect(findOutputNode(WORKFLOW, 'Preview')).toMatchObject({ ok: false });
  });

  it('每次跑之前：放進 OC 圖、換新的種子、存到 oc-guild-quest/領取碼；原本的 workflow 不動', () => {
    const w: Workflow = { ...WORKFLOW, 20: { class_type: 'SamplerCustom', inputs: { noise_seed: 5 } }, 21: { class_type: 'KSampler', inputs: { seed: ['30', 0] } } };
    const out = patchWorkflow(w, { imageNode: '10', image: 'oc-guild-quest/K7Q2-M9X.png', prefix: 'oc-guild-quest/K7Q2-M9X', rand: () => 0.5 });
    expect(out[10].inputs.image).toBe('oc-guild-quest/K7Q2-M9X.png');
    expect(out[3].inputs.seed).toBe(2 ** 31);
    expect(out[20].inputs.noise_seed).toBe(2 ** 31);
    expect(out[21].inputs.seed).toEqual(['30', 0]);
    expect(out[9].inputs.filename_prefix).toBe('oc-guild-quest/K7Q2-M9X');
    expect(out[4]).toEqual(WORKFLOW[4]);
    expect(WORKFLOW[10].inputs.image).toBe('example.png');
    expect(WORKFLOW[3].inputs.seed).toBe(123);
    const seeds = new Set(Array.from({ length: 5 }, () => patchWorkflow(w, { imageNode: '10', image: 'x', prefix: 'p' })[3].inputs.seed));
    expect(seeds.size).toBe(5);
  });
});

describe('ComfyUI 的回答', () => {
  const done = (outputs: unknown) => ({ 'p-1': { outputs, status: { status_str: 'success', completed: true, messages: [] } } });

  it('history：還沒有就是還在畫；畫完了列出輸出圖', () => {
    expect(historyState({}, 'p-1')).toEqual({ state: 'running' });
    expect(historyState(null, 'p-1')).toEqual({ state: 'running' });
    expect(historyState(done({
      9: { images: [{ filename: 'K7Q2-M9X_00001_.png', subfolder: 'oc-guild-quest', type: 'output' }] },
      15: { images: [{ filename: 'tmp.png', subfolder: '', type: 'temp' }], text: ['hi'] },
      16: { gifs: [] },
    }), 'p-1')).toEqual({
      state: 'done',
      images: [
        { nodeId: '9', filename: 'K7Q2-M9X_00001_.png', subfolder: 'oc-guild-quest', type: 'output' },
        { nodeId: '15', filename: 'tmp.png', subfolder: '', type: 'temp' },
      ],
    });
  });

  it('history：出錯了說是哪個節點、什麼錯；被取消也說', () => {
    const failed = (messages: unknown[]) => ({ 'p-1': { outputs: {}, status: { status_str: 'error', completed: false, messages } } });
    expect(historyState(failed([
      ['execution_start', { prompt_id: 'p-1' }],
      ['execution_error', { node_id: '3', node_type: 'KSampler', exception_message: 'CUDA out of memory\n' }],
    ]), 'p-1')).toEqual({ state: 'error', message: '節點 3（KSampler）出錯：CUDA out of memory' });
    expect(historyState(failed([['execution_interrupted', {}]]), 'p-1')).toEqual({ state: 'error', message: expect.stringContaining('取消') });
  });

  it('queue：正在畫或排隊中', () => {
    const q = { queue_running: [[1, 'p-1', {}, {}, []]], queue_pending: [[2, 'p-2', {}, {}, []]] };
    expect(inQueue(q, 'p-1')).toBe(true);
    expect(inQueue(q, 'p-2')).toBe(true);
    expect(inQueue(q, 'p-3')).toBe(false);
    expect(inQueue(null, 'p-1')).toBe(false);
  });

  it('要送的那張：指定的節點；沒指定就挑存檔的、編號最大的節點', () => {
    const img = (nodeId: string, type = 'output'): ImageRef => ({ nodeId, filename: `${nodeId}.png`, subfolder: '', type });
    const images = [img('9'), img('12'), img('30', 'temp'), img('7:2')];
    expect(pickOutput(images, '9')).toEqual(img('9'));
    expect(pickOutput(images)).toEqual(img('12'));
    expect(pickOutput([img('30', 'temp'), img('31', 'temp')])).toEqual(img('31', 'temp'));
    expect(pickOutput([], undefined)).toBeNull();
    expect(pickOutput(images, '99')).toBeNull();
  });

  it('workflow 被拒絕：寫出原因和出錯的節點', () => {
    expect(promptError({
      error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '' },
      node_errors: { 4: { errors: [{ message: 'Value not in list', details: "ckpt_name: 'chibi.safetensors' not in []" }], class_type: 'CheckpointLoaderSimple' } },
    })).toBe("Prompt outputs failed validation\n節點 4（CheckpointLoaderSimple）：Value not in list：ckpt_name: 'chibi.safetensors' not in []");
    expect(promptError(null)).toBe('ComfyUI 不接受這個 workflow');
    expect(promptError({ error: 'no prompt' })).toBe('no prompt');
  });
});

describe('收件處的回答', () => {
  it('不是 JSON（例如 Google 登入頁）：提醒網址和存取權', () => {
    expect(parseInboxReply('<!DOCTYPE html><html>')).toMatchObject({ ok: false, error: 'not_json', message: expect.stringContaining('所有人') });
    expect(parseInboxReply('[1]')).toMatchObject({ ok: false, error: 'not_json' });
  });

  it('錯誤碼換成組員看得懂的說明', () => {
    expect(parseInboxReply('{"ok":true,"items":[]}')).toEqual({ ok: true, data: { ok: true, items: [] } });
    expect(parseInboxReply('{"ok":false,"error":"forbidden"}')).toMatchObject({ error: 'forbidden', message: expect.stringContaining('WORKER_KEY') });
    expect(parseInboxReply('{"ok":false,"error":"bad_request"}')).toMatchObject({ message: expect.stringContaining('新版本') });
    expect(parseInboxReply('{"ok":false,"error":"weird"}')).toMatchObject({ error: 'weird', message: '收件處回了錯誤：weird' });
    expect(parseInboxReply('{"ok":false}')).toMatchObject({ error: 'unknown' });
  });

  it('pending：只留格式對的', () => {
    expect(parsePending({
      ok: true,
      items: [{ code: 'K7Q2-M9X', name: '小鈴', note: '紅披風', requestedAt: 5 }, { code: '../x' }, 'nope', { code: 'ABCD-EFG' }],
      ready: ['CCCC-CCC', 'bad'],
    })).toEqual({
      items: [{ code: 'K7Q2-M9X', name: '小鈴', note: '紅披風', requestedAt: 5 }, { code: 'ABCD-EFG', name: '', note: '', requestedAt: 0 }],
      ready: ['CCCC-CCC'],
    });
    expect(parsePending({ ok: true })).toBeNull();
  });
});

describe('每個 OC 的資料夾（jobs/領取碼/）', () => {
  const auto = { review: false, candidates: 3 };
  const review = { review: true, candidates: 3 };

  it('自動模式：下載 → 畫一張 → 送出', () => {
    expect(nextStep([], auto)).toEqual({ step: 'download' });
    expect(nextStep(['info.txt'], auto)).toEqual({ step: 'download' });
    expect(nextStep(['oc.png', 'info.txt'], auto)).toEqual({ step: 'generate', count: 1 });
    expect(nextStep(['oc.jpg', 'info.txt', 'chibi.png'], auto)).toEqual({ step: 'send', file: 'chibi.png' });
  });

  it('送出過、雲端上的小人卻被刪了：組員想重畫', () => {
    const files = ['oc.png', 'info.txt', 'chibi.png', 'sent.txt'];
    expect(nextStep(files, auto)).toEqual({ step: 'redo' });
    expect(outputFiles(files)).toEqual(['chibi.png', 'sent.txt']);
    expect(outputFiles(['oc.png', 'info.txt', '1.png', '2.webp', 'ok.png', '筆記.txt', 'sent.txt'])).toEqual(['1.png', '2.webp', 'ok.png', 'sent.txt']);
  });

  it('挑選模式：畫三張候選 → 等組員挑 → 改名成 ok.png 就送出；不要的刪掉會補畫', () => {
    expect(nextStep(['oc.png', 'info.txt'], review)).toEqual({ step: 'generate', count: 3 });
    expect(nextStep(['oc.png', 'info.txt', '1.png', '2.png', '3.png'], review)).toEqual({ step: 'wait', count: 3 });
    expect(nextStep(['oc.png', 'info.txt', '1.png', '3.png'], review)).toEqual({ step: 'generate', count: 1 });
    expect(nextStep(['oc.png', '1.png', '3.png', 'ok.png'], review)).toEqual({ step: 'send', file: 'ok.png' });
    // Windows 藏了副檔名，改名時打了 ok.png 會變成 ok.png.png
    expect(nextStep(['oc.png', '1.png', 'OK.png.png'], review)).toEqual({ step: 'send', file: 'OK.png.png' });
    expect(nextStep(['oc.png', '1.png', '2.png', '3.png', 'okay.png'], review)).toEqual({ step: 'wait', count: 3 });
    // 自動模式畫好的 chibi.png 不算候選
    expect(nextStep(['oc.png', 'chibi.png'], review)).toEqual({ step: 'generate', count: 3 });
  });

  it('候選的檔名接著最大的編號', () => {
    expect(candidateName([], 'png')).toBe('1.png');
    expect(candidateName(['oc.png', '1.png', '3.png', 'ok.png'], 'webp')).toBe('4.webp');
  });

  it('info.txt 和記錄裡的稱呼', () => {
    const item = { code: 'K7Q2-M9X', name: '小鈴', note: '', requestedAt: 0 };
    expect(infoText(item, '2026/10/18 09:00')).toBe('領取碼：K7Q2-M9X\nOC：小鈴\n給組員的話：（沒寫）\n送出：2026/10/18 09:00\n');
    expect(label(item)).toBe('K7Q2-M9X（小鈴）');
    expect(label({ ...item, name: '' })).toBe('K7Q2-M9X');
  });
});
