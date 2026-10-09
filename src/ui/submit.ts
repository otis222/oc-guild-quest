// 交件：拍照或選照片 → 預覽 → 交件。預覽依部位不同：
// 配色看抽出來的顏色、名牌拖曳框框裁出名牌、版面和草稿看照片就好。
// 照片在瀏覽器裡縮成長邊 1024px 的 JPEG 才存，不會上傳。
import type { SubmitInput } from '../core/actions';
import { courseInfo } from '../core/courses';
import type { Box } from '../core/cutout';
import { NAMEPLATE_ASPECT, nameplateCrop } from '../core/image';
import { extractPalette } from '../core/palette';
import { findCommission } from '../core/state';
import type { GuildStore } from '../core/store';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { canvas, cropToJpeg, decodeImage, drawCrop, samplePixels, shrinkPhoto } from './photo';

export interface SubmitDeps {
  store: GuildStore;
  commissionId: string;
  /** 存照片、改存檔、記事件；回傳有沒有交成功（已經交過是 false），丟錯代表沒存成功 */
  submit(input: SubmitInput): Promise<boolean>;
  /** 交件成功、對話框關掉之後 */
  onSubmitted(): void;
}

/** 名牌圖的大小（頭上的名牌、設定卡都用這張），比例跟 NAMEPLATE_ASPECT 一樣 */
const PLATE_W = 360;
const PLATE_H = PLATE_W / NAMEPLATE_ASPECT;
/** 名牌框一開始的大小（0～1） */
const PLATE_START_SIZE = 0.7;
/** 方向鍵一次移動照片寬度的幾成 */
const KEY_STEP = 0.03;
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const S = COPY.submit;

interface Picked {
  /** 原圖：裁名牌用，畫質比較好 */
  img: HTMLImageElement;
  /** 縮好的交件照片 */
  photo: Blob;
  /** 預覽用的網址 */
  url: string;
  palette: string[];
}

export function openSubmit(d: SubmitDeps): void {
  const s0 = d.store.state;
  const commission = findCommission(s0, d.commissionId);
  const course = courseInfo(s0, commission.course);
  let picked: Picked | null = null;
  let busy = false;
  /** 名牌框：大小 0～1、中心點（原圖座標） */
  let plate = { size: PLATE_START_SIZE, cx: 0, cy: 0 };

  const dialog = openDialog({ title: S.title, onClose: () => { if (picked) URL.revokeObjectURL(picked.url); } });
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const work = el('p', { class: 'submit-work' }, `${course.label}・${commission.title}`);
  const note = el('p', { class: 'card-note' }, S.note);

  function fileButton(label: string, capture: boolean): HTMLLabelElement {
    const input = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', capture: capture ? 'environment' : null });
    on(input, 'change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void choose(file);
    });
    return el('label', { class: 'pick-photo' }, input, label);
  }

  async function choose(file: Blob): Promise<void> {
    if (busy) return;
    msg.textContent = S.processing;
    try {
      const img = await decodeImage(file);
      const photo = await shrinkPhoto(img);
      const palette = course.part === 'palette' ? extractPalette(samplePixels(img)) : [];
      if (picked) URL.revokeObjectURL(picked.url);
      picked = { img, photo, url: URL.createObjectURL(photo), palette };
      plate = { size: PLATE_START_SIZE, cx: img.naturalWidth / 2, cy: img.naturalHeight / 2 };
      msg.textContent = '';
      render();
    } catch (err) {
      console.warn('照片讀不出來', err);
      msg.textContent = S.badImage;
    }
  }

  const plateBox = (p: Picked): Box => nameplateCrop(p.img.naturalWidth, p.img.naturalHeight, plate.size, plate.cx, plate.cy);

  /** 名牌：照片上的框框（可以拖、方向鍵可以移）、大小滑桿、預覽 */
  function nameplateEditor(p: Picked, frame: HTMLElement): HTMLElement {
    const W = p.img.naturalWidth, H = p.img.naturalHeight;
    const box = el('div', { class: 'crop-box', 'aria-hidden': 'true' });
    frame.append(box);
    frame.classList.add('is-cropping');
    frame.setAttribute('tabindex', '0');
    frame.setAttribute('aria-label', S.nameplateLabel);
    const preview = canvas(PLATE_W, PLATE_H);
    preview.classList.add('plate-preview');

    function update(): void {
      const b = plateBox(p);
      // 框被推回照片裡時，中心點也跟著改，之後拖的時候才不會卡住
      plate.cx = b.x + b.w / 2; plate.cy = b.y + b.h / 2;
      Object.assign(box.style, { left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` });
      drawCrop(p.img, b, preview);
    }

    let drag: { id: number; x: number; y: number; cx: number; cy: number } | null = null;
    on(frame, 'pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: plate.cx, cy: plate.cy };
      frame.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    on(frame, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const k = W / frame.clientWidth;
      plate.cx = drag.cx + (e.clientX - drag.x) * k;
      plate.cy = drag.cy + (e.clientY - drag.y) * k;
      update();
    });
    const end = (e: PointerEvent): void => { if (drag && e.pointerId === drag.id) drag = null; };
    on(frame, 'pointerup', end);
    on(frame, 'pointercancel', end);
    on(frame, 'keydown', (e) => {
      const move = ARROWS[e.key];
      if (!move) return;
      e.preventDefault();
      plate.cx += move[0] * W * KEY_STEP; plate.cy += move[1] * W * KEY_STEP;
      update();
    });

    const size = el('input', { id: 'plateSize', type: 'range', min: 0, max: 100, value: Math.round(plate.size * 100) });
    on(size, 'input', () => { plate.size = Number(size.value) / 100; update(); });
    update();
    return el('div', { class: 'submit-part' },
      el('p', { class: 'field-label' }, S.nameplateLabel),
      el('div', { class: 'plate-size' }, el('label', { for: 'plateSize' }, S.nameplateSize), size),
      el('div', { class: 'field-label' }, S.nameplatePreview),
      preview);
  }

  function partView(p: Picked, frame: HTMLElement): HTMLElement {
    switch (course.part) {
      case 'palette':
        return el('div', { class: 'submit-part' },
          el('p', { class: 'field-label' }, S.paletteLabel),
          el('div', { class: 'swatches' }, ...p.palette.map((color) => el('span', { class: 'swatch', style: `background: ${color}`, title: color }))));
      case 'nameplate':
        return nameplateEditor(p, frame);
      case 'layout':
        return el('p', { class: 'hint' }, S.layoutNote);
      case 'sketch':
        return el('p', { class: 'hint' }, S.sketchNote);
    }
  }

  async function confirm(button: HTMLButtonElement): Promise<void> {
    const p = picked;
    if (!p || busy) return;
    busy = true; button.disabled = true; button.textContent = S.confirming;
    try {
      const input: SubmitInput = {
        photo: p.photo,
        palette: course.part === 'palette' ? p.palette : undefined,
        nameplate: course.part === 'nameplate' ? await cropToJpeg(p.img, plateBox(p), PLATE_W, PLATE_H) : undefined,
      };
      const ok = await d.submit(input);
      dialog.close();
      if (ok) d.onSubmitted();
    } catch (err) {
      console.error('交件失敗', err);
      msg.textContent = S.saveFailed;
      busy = false; button.disabled = false; button.textContent = S.confirm;
    }
  }

  function render(): void {
    if (!picked) {
      dialog.body.replaceChildren(work,
        el('div', { class: 'submit-pick' },
          el('p', { class: 'hint' }, S.hint),
          el('div', { class: 'pick-photos' }, fileButton(S.camera, true), fileButton(S.album, false))),
        msg, note);
      return;
    }
    const p = picked;
    const frame = el('div', { class: 'photo-frame' }, el('img', { src: p.url, alt: S.photoAlt(commission.title), draggable: 'false' }));
    const part = partView(p, frame);
    const ok = el('button', { type: 'button', class: 'primary' }, S.confirm);
    on(ok, 'click', () => { void confirm(ok); });
    const retake = on(el('button', { type: 'button', class: 'secondary' }, S.retake), 'click', () => {
      if (busy) return;
      URL.revokeObjectURL(p.url);
      picked = null;
      msg.textContent = '';
      render();
    });
    dialog.body.replaceChildren(work, el('div', { class: 'submit-photo' }, frame), part, msg,
      el('div', { class: 'form-actions' }, ok, retake), note);
  }
  render();
}
