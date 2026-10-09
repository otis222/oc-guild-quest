// 第一次進入的「冒險者登記」卡片（不是設定頁）：名字 → 選一隻小人或上傳自己的圖 → 加入公會（進大廳）。
import type { SpriteEntry } from '../core/manifest';
import { cleanOcName, OC_NAME_MAX } from '../core/oc';
import { COPY } from './copy';
import { el } from './dom';
import { createSpritePicker, type SpriteChoice } from './spritePicker';

export type { SpriteChoice } from './spritePicker';

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

const T = COPY.join;

/** 顯示卡片，等 onSubmit 成功後關掉卡片，回傳 onSubmit 的結果 */
export function showCreateOcCard<T>(opts: CreateOcOptions<T>): Promise<T> {
  return new Promise((resolve) => {
    let busy = false;
    const nameInput = el('input', {
      id: 'ocName', type: 'text', maxlength: OC_NAME_MAX, autocomplete: 'off', enterkeyhint: 'done', placeholder: T.namePlaceholder(OC_NAME_MAX),
    });
    const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
    const submit = el('button', { type: 'submit', class: 'primary', disabled: true }, T.submit);
    const refresh = (): void => {
      submit.disabled = busy || picker.busy || !picker.choice || !cleanOcName(nameInput.value);
    };
    const picker = createSpritePicker({ presets: opts.presets, spriteUrl: opts.spriteUrl, msg, labelledBy: 'ocPickLabel', onChange: refresh });
    nameInput.addEventListener('input', refresh);

    const form = el('form', { class: 'card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ocTitle', novalidate: true },
      el('h2', { id: 'ocTitle' }, T.title),
      el('div', { class: 'field' }, el('label', { for: 'ocName' }, T.name), nameInput),
      el('div', { class: 'field' }, el('span', { class: 'field-label', id: 'ocPickLabel' }, T.pick), picker.element),
      el('p', { class: 'card-note' }, T.note),
      msg,
      submit,
    );
    const overlay = el('div', { class: 'overlay' }, form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = cleanOcName(nameInput.value);
      const choice = picker.choice;
      if (busy || picker.busy || !choice || !name) return;
      busy = true; refresh();
      submit.textContent = T.submitting;
      try {
        const result = await opts.onSubmit({ name, choice });
        overlay.remove();
        picker.dispose();
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
