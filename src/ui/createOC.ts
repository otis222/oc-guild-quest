// 第一次進入的「冒險者登記」卡片（不是設定頁）：名字 → 選一隻小人或上傳自己的圖 → 加入公會（進大廳）。
import type { SpriteEntry } from '../core/manifest';
import { cleanOcName, OC_NAME_MAX } from '../core/oc';
import { COPY } from './copy';
import { el } from './dom';
import { makeSpriteFromUpload } from './uploadSprite';

export type SpriteChoice = { kind: 'preset'; file: string } | { kind: 'upload'; blob: Blob };

export interface CreateOcInput {
  name: string;
  choice: SpriteChoice;
}

export interface CreateOcOptions<T> {
  presets: readonly SpriteEntry[];
  spriteUrl: (file: string) => string;
  /** 按「加入公會」後呼叫；成功才關卡片，丟錯就留在卡片上讓玩家再按一次 */
  onSubmit: (input: CreateOcInput) => Promise<T>;
}

const ACCEPT = 'image/png,image/jpeg';
const T = COPY.join;

/** 顯示卡片，等 onSubmit 成功後關掉卡片，回傳 onSubmit 的結果 */
export function showCreateOcCard<T>(opts: CreateOcOptions<T>): Promise<T> {
  return new Promise((resolve) => {
    let choice: SpriteChoice | null = null;
    let busy = false;
    let previewUrl = '';

    const nameInput = el('input', {
      id: 'ocName', type: 'text', maxlength: OC_NAME_MAX, autocomplete: 'off', enterkeyhint: 'done', placeholder: T.namePlaceholder(OC_NAME_MAX),
    });
    const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
    const submit = el('button', { type: 'submit', class: 'primary', disabled: true }, T.submit);

    const tiles: HTMLLabelElement[] = [];
    const radios: HTMLInputElement[] = [];
    const select = (tile: HTMLLabelElement | null): void => tiles.forEach((t) => t.classList.toggle('is-on', t === tile));

    const presetTiles = opts.presets.map((p) => {
      const radio = el('input', { type: 'radio', name: 'sprite', value: p.file, class: 'sr-only' });
      const tile = el('label', { class: 'pick' }, radio, el('img', { src: opts.spriteUrl(p.file), alt: p.name, draggable: 'false' }));
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        choice = { kind: 'preset', file: p.file };
        select(tile); msg.textContent = ''; refresh();
      });
      tiles.push(tile); radios.push(radio);
      return tile;
    });

    const fileInput = el('input', { type: 'file', accept: ACCEPT, class: 'sr-only', 'aria-label': T.uploadAria });
    const uploadFace = el('span', { class: 'pick-upload-text' });
    const uploadTile = el('label', { class: 'pick pick-upload' }, fileInput, uploadFace);
    tiles.push(uploadTile);
    /** 上傳格：有處理好的圖就顯示預覽，沒有就顯示文字 */
    const renderUploadFace = (): void => {
      if (previewUrl) uploadFace.replaceChildren(el('img', { src: previewUrl, alt: T.uploadAlt, draggable: 'false' }));
      else uploadFace.replaceChildren(T.upload[0], el('br'), T.upload[1]);
    };
    renderUploadFace();

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file || busy) return;
      if (file.type && !ACCEPT.split(',').includes(file.type)) { msg.textContent = T.badType; return; }
      busy = true; refresh();
      uploadFace.replaceChildren(T.processing);
      try {
        const blob = await makeSpriteFromUpload(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        choice = { kind: 'upload', blob };
        radios.forEach((r) => { r.checked = false; });
        select(uploadTile); msg.textContent = '';
      } catch (err) {
        console.warn('上傳的圖處理失敗', err);
        msg.textContent = T.badImage;
      } finally {
        renderUploadFace();
        busy = false; refresh();
      }
    });

    const refresh = (): void => {
      submit.disabled = busy || !choice || !cleanOcName(nameInput.value);
    };
    nameInput.addEventListener('input', refresh);

    const form = el('form', { class: 'card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ocTitle', novalidate: true },
      el('h2', { id: 'ocTitle' }, T.title),
      el('div', { class: 'field' }, el('label', { for: 'ocName' }, T.name), nameInput),
      el('div', { class: 'field' },
        el('span', { class: 'field-label', id: 'ocPickLabel' }, T.pick),
        el('div', { class: 'pick-grid', role: 'radiogroup', 'aria-labelledby': 'ocPickLabel' }, ...presetTiles, uploadTile),
      ),
      el('p', { class: 'card-note' }, T.note),
      msg,
      submit,
    );
    const overlay = el('div', { class: 'overlay' }, form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = cleanOcName(nameInput.value);
      if (busy || !choice || !name) return;
      busy = true; refresh();
      submit.textContent = T.submitting;
      try {
        const result = await opts.onSubmit({ name, choice });
        overlay.remove();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        resolve(result);
      } catch (err) {
        console.error('建立 OC 失敗', err);
        msg.textContent = T.saveFailed;
        submit.textContent = T.submit;
        busy = false; refresh();
      }
    });

    document.body.append(overlay);
    // 有實體鍵盤時直接可以打字；手機不自動跳出鍵盤，免得擋住小人
    if (matchMedia('(pointer: fine)').matches) nameInput.focus();
  });
}
