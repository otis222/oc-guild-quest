// 選 OC 圖的格子：manifest 裡的 AI 小人＋一格「上傳我的 OC」。冒險者登記和換造型共用。
import type { SpriteEntry } from '../core/manifest';
import { COPY } from './copy';
import { el, on } from './dom';
import { makeSpriteFromUpload } from './uploadSprite';

export type SpriteChoice = { kind: 'preset'; file: string } | { kind: 'upload'; blob: Blob };

export interface SpritePickerOptions {
  presets: readonly SpriteEntry[];
  spriteUrl: (file: string) => string;
  /** 一開始就選好的 AI 小人（換造型時是目前那隻） */
  initialPreset?: string;
  /** 上傳失敗等訊息要顯示在哪 */
  msg: HTMLElement;
  /** 這組選項標題的元素 id（給讀螢幕軟體用） */
  labelledBy: string;
  /** 選的東西或處理狀態變了就呼叫 */
  onChange(): void;
}

export interface SpritePicker {
  readonly element: HTMLElement;
  readonly choice: SpriteChoice | null;
  /** 正在處理上傳的圖 */
  readonly busy: boolean;
  /** 用完了：收回預覽圖的網址 */
  dispose(): void;
}

const ACCEPT = 'image/png,image/jpeg';
const T = COPY.join;
let pickers = 0;

export function createSpritePicker(o: SpritePickerOptions): SpritePicker {
  let choice: SpriteChoice | null = null;
  let busy = false;
  let previewUrl = '';
  const group = `sprite${++pickers}`;
  const tiles: HTMLLabelElement[] = [];
  const radios: HTMLInputElement[] = [];
  const select = (tile: HTMLLabelElement | null): void => tiles.forEach((t) => t.classList.toggle('is-on', t === tile));

  const presetTiles = o.presets.map((p) => {
    const radio = el('input', { type: 'radio', name: group, value: p.file, class: 'sr-only' });
    const tile = el('label', { class: 'pick' }, radio, el('img', { src: o.spriteUrl(p.file), alt: p.name, draggable: 'false' }));
    on(radio, 'change', () => {
      if (!radio.checked) return;
      choice = { kind: 'preset', file: p.file };
      select(tile); o.msg.textContent = ''; o.onChange();
    });
    if (p.file === o.initialPreset) {
      radio.checked = true;
      choice = { kind: 'preset', file: p.file };
      tile.classList.add('is-on');
    }
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

  on(fileInput, 'change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || busy) return;
    if (file.type && !ACCEPT.split(',').includes(file.type)) { o.msg.textContent = T.badType; return; }
    busy = true; o.onChange();
    uploadFace.replaceChildren(T.processing);
    try {
      const blob = await makeSpriteFromUpload(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      choice = { kind: 'upload', blob };
      radios.forEach((r) => { r.checked = false; });
      select(uploadTile); o.msg.textContent = '';
    } catch (err) {
      console.warn('上傳的圖處理失敗', err);
      o.msg.textContent = T.badImage;
    } finally {
      renderUploadFace();
      busy = false; o.onChange();
    }
  });

  return {
    element: el('div', { class: 'pick-grid', role: 'radiogroup', 'aria-labelledby': o.labelledBy }, ...presetTiles, uploadTile),
    get choice() { return choice; },
    get busy() { return busy; },
    dispose() { if (previewUrl) URL.revokeObjectURL(previewUrl); },
  };
}
