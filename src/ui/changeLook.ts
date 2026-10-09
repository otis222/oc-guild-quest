// 換造型：在 OC 設定卡上換主角的圖（一樣是選一隻 AI 小人或上傳自己的圖）。10/10 組員確認要做。
import type { SpriteEntry } from '../core/manifest';
import { uploadedPhotoId } from '../core/oc';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { createSpritePicker, type SpriteChoice } from './spritePicker';

export interface ChangeLookDeps {
  presets: readonly SpriteEntry[];
  spriteUrl: (file: string) => string;
  /** 目前的造型（AI 小人檔名或 upload:<id>） */
  currentSprite: string;
  /** 存檔、換掉大廳裡主角的圖；丟錯代表沒換成功 */
  save(choice: SpriteChoice): Promise<void>;
  /** 關掉之後（換好或不換）回到哪裡 */
  onClosed(): void;
}

const L = COPY.look;

export function openChangeLook(d: ChangeLookDeps): void {
  const currentPreset = uploadedPhotoId(d.currentSprite) ? undefined : d.currentSprite;
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const save = el('button', { type: 'button', class: 'primary', disabled: true }, L.save);
  const cancel = el('button', { type: 'button', class: 'secondary' }, L.cancel);
  let busy = false;
  const refresh = (): void => {
    const c = picker.choice;
    save.disabled = busy || picker.busy || !c || (c.kind === 'preset' && c.file === currentPreset);
  };
  const picker = createSpritePicker({
    presets: d.presets, spriteUrl: d.spriteUrl, initialPreset: currentPreset, msg, labelledBy: 'lookPickLabel', onChange: refresh,
  });
  const dialog = openDialog({ title: L.title, onClose: () => { picker.dispose(); d.onClosed(); } });
  dialog.body.append(
    el('div', { class: 'field' }, el('span', { class: 'field-label', id: 'lookPickLabel' }, L.pick), picker.element),
    el('p', { class: 'card-note' }, COPY.join.note),
    msg,
    el('div', { class: 'form-actions' }, save, cancel),
  );
  refresh();

  on(cancel, 'click', () => dialog.close());
  on(save, 'click', async () => {
    const choice = picker.choice;
    if (busy || !choice) return;
    busy = true; refresh(); save.textContent = L.saving;
    try {
      await d.save(choice);
      dialog.close();
    } catch (err) {
      console.error('換造型失敗', err);
      msg.textContent = L.saveFailed;
      busy = false; save.textContent = L.save; refresh();
    }
  });
}
