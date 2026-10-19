// 專屬小人（企劃表 T19）：完成 5 個任務後，從 OC 設定卡打開。
// - 還沒訂：選一張自己畫的 OC 圖、寫一句給組員的話 → 送到組員 Google 雲端硬碟的收件處，拿到領取碼。
// - 等組員做：顯示領取碼，按「看看好了沒」問收件處；做好了就把小人圖領回來（做成跟其他小人一樣大），可以換上或先收著。
// - 領過了：可以換上專屬小人、或再訂一隻。
// 送出前說清楚圖會傳到哪裡；網站本身不接 AI，小人是組員在自己的電腦用 ComfyUI 做的。
import { chibiProgress, cleanChibiNote, CHIBI_NOTE_MAX, newChibiCode, type ChibiPayload } from '../core/chibi';
import { fitLongSide } from '../core/image';
import type { GuildStore } from '../core/store';
import { base64ToBlob, blobToBase64, checkChibi, finishChibi, sendChibi, type ChibiCallError } from './chibiClient';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { canvas, ctx2d, decodeImage, toBlob } from './photo';
import type { PhotoUrls } from './photos';
import { makeSpriteFromUpload } from './uploadSprite';

export interface ChibiDeps {
  store: GuildStore;
  /** 收件處的網址 */
  endpoint: string;
  photos: PhotoUrls;
  /** 送出了：存領取碼、記事件 */
  requested(code: string, bytes: number): Promise<void>;
  /** 領到了：把小人圖存起來、記事件；領取碼對不上（別的分頁已經領過）回傳 false */
  received(code: string, sprite: Blob): Promise<boolean>;
  /** 換上這隻小人 */
  apply(sprite: Blob): Promise<void>;
  /** 關掉之後（回設定卡） */
  onClosed(): void;
}

const C = COPY.chibi;
/** 送給組員的 OC 圖：長邊縮到這麼大（PNG 存 PNG，其他存成 JPEG） */
const SEND_MAX_PNG = 1280;
const SEND_MAX_JPEG = 1600;
const SEND_JPEG_QUALITY = 0.92;

/**
 * 把玩家選的圖縮小到適合傳送，透明的地方鋪白底：組員電腦的 ComfyUI 和看圖 AI 讀 PNG 時，
 * 透明的地方會變成黑色，描述和小人都會畫錯（10/19 測過）。PNG 存 PNG（不失真），其他存成 JPEG。
 */
export async function prepareOcImage(file: Blob): Promise<{ blob: Blob; mime: 'image/png' | 'image/jpeg' }> {
  const img = await decodeImage(file);
  const png = file.type === 'image/png';
  const size = fitLongSide(img.naturalWidth, img.naturalHeight, png ? SEND_MAX_PNG : SEND_MAX_JPEG);
  const c = canvas(size.width, size.height);
  const g = ctx2d(c);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size.width, size.height);
  g.drawImage(img, 0, 0, size.width, size.height);
  return png ? { blob: await toBlob(c, 'image/png'), mime: 'image/png' } : { blob: await toBlob(c, 'image/jpeg', SEND_JPEG_QUALITY), mime: 'image/jpeg' };
}

const errorText = (e: ChibiCallError): string => C.errors[e];

export function openChibi(d: ChibiDeps): void {
  const urls: string[] = [];
  const objectUrl = (b: Blob): string => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  let closed = false;
  const dialog = openDialog({
    title: C.title,
    onClose: () => { closed = true; urls.forEach((u) => URL.revokeObjectURL(u)); d.onClosed(); },
  });
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });
  const button = (label: string, cls: string): HTMLButtonElement => el('button', { type: 'button', class: cls }, label);

  /** 照存檔決定顯示哪一頁 */
  function show(): void {
    msg.textContent = '';
    const c = d.store.state.chibi;
    if (c?.request) showWaiting(c.request.code);
    else if (c?.photoId) showReceived(c.photoId);
    else showForm();
  }

  // ---------------------------------------------------------------- 訂一隻
  function showForm(): void {
    if (!chibiProgress(d.store.state).unlocked) { dialog.close(); return; }
    let picked: { blob: Blob; mime: 'image/png' | 'image/jpeg' } | null = null;
    let needInvite = false;
    const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'chibiFile' });
    const pickLabel = el('label', { for: 'chibiFile', class: 'chibi-pick' }, C.pick);
    const preview = el('div', { class: 'chibi-preview is-empty' }, C.noImage);
    const note = el('input', { id: 'chibiNote', type: 'text', maxlength: CHIBI_NOTE_MAX, placeholder: C.notePlaceholder, autocomplete: 'off', enterkeyhint: 'done' });
    const invite = el('input', { id: 'chibiInvite', type: 'text', placeholder: C.invitePlaceholder, autocomplete: 'off', enterkeyhint: 'done' });
    const inviteRow = el('div', { class: 'field', hidden: true }, el('label', { for: 'chibiInvite' }, C.invite), invite);
    const send = button(C.send, 'primary');
    send.disabled = true;
    const cancel = on(button(C.cancel, 'secondary'), 'click', () => dialog.close());
    for (const input of [note, invite]) on(input, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    on(file, 'change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      msg.textContent = '';
      prepareOcImage(f).then((p) => {
        picked = p;
        preview.classList.remove('is-empty');
        preview.replaceChildren(el('img', { src: objectUrl(p.blob), alt: C.previewAlt, draggable: 'false' }));
        pickLabel.textContent = C.pickAgain;
        send.disabled = false;
      }).catch((err: unknown) => {
        console.warn('專屬小人：OC 圖讀不出來', err);
        msg.textContent = C.errors.image;
      });
    });

    on(send, 'click', () => {
      if (!picked) return;
      const image = picked;
      send.disabled = true;
      send.textContent = C.sending;
      msg.textContent = '';
      void (async () => {
        const code = newChibiCode();
        const payload: ChibiPayload = {
          action: 'request', code, name: d.store.state.oc.name, note: cleanChibiNote(note.value),
          ...(needInvite ? { invite: invite.value.trim() } : {}),
          mime: image.mime, image: await blobToBase64(image.blob),
        };
        const reply = await sendChibi(d.endpoint, payload);
        if (reply.ok) {
          // 送到了就記下領取碼，送的時候關掉視窗也一樣（不然組員會做到沒人領的小人）
          const old = d.store.state.chibi?.request?.code;
          await d.requested(code, image.blob.size);
          // 換一張重送：請收件處丟掉舊的那張（不等它）
          if (old && old !== code) void finishChibi(d.endpoint, old);
          if (!closed) show();
          return;
        }
        if (closed) return;
        if (reply.error === 'invite') { needInvite = true; inviteRow.hidden = false; invite.focus(); }
        msg.textContent = errorText(reply.error);
        send.disabled = false;
        send.textContent = C.send;
      })().catch((err: unknown) => {
        console.error('專屬小人：送出失敗', err);
        msg.textContent = C.errors.unknown;
        send.disabled = false;
        send.textContent = C.send;
      });
    });

    dialog.body.replaceChildren(el('div', { class: 'chibi' },
      el('p', { class: 'chibi-intro' }, C.intro),
      el('p', { class: 'card-note chibi-privacy' }, C.privacy),
      el('div', { class: 'chibi-pickrow' }, preview, el('div', {}, file, pickLabel)),
      el('div', { class: 'field' }, el('label', { for: 'chibiNote' }, C.note), note),
      inviteRow,
      msg,
      el('div', { class: 'form-actions' }, send, cancel)));
  }

  // ---------------------------------------------------------------- 等組員做
  function showWaiting(code: string): void {
    const check = button(C.check, 'primary');
    const resend = on(button(C.resend, 'secondary'), 'click', () => {
      // 換一張重送：回到選圖（送出後會拿到新的領取碼）
      msg.textContent = '';
      showForm();
    });
    on(check, 'click', () => {
      check.disabled = true;
      check.textContent = C.checking;
      msg.textContent = '';
      void (async () => {
        const r = await checkChibi(d.endpoint, code);
        if (closed) return;
        if (r.status === 'waiting') { msg.textContent = C.notYet; return; }
        if (r.status === 'error') { msg.textContent = errorText(r.error); return; }
        let sprite: Blob;
        try {
          sprite = await makeSpriteFromUpload(base64ToBlob(r.image, r.mime));
        } catch (err) {
          console.warn('專屬小人：小人圖讀不出來', err);
          msg.textContent = C.errors.result;
          return;
        }
        const ok = await d.received(code, sprite);
        // 領到了：請收件處刪掉雲端上的檔案（不等它）
        void finishChibi(d.endpoint, code);
        if (closed) return;
        if (!ok) { show(); return; }
        showReady(sprite);
      })().catch((err: unknown) => {
        console.error('專屬小人：領取失敗', err);
        msg.textContent = C.errors.unknown;
      }).finally(() => {
        check.disabled = false;
        check.textContent = C.check;
      });
    });
    dialog.body.replaceChildren(el('div', { class: 'chibi' },
      el('p', { class: 'chibi-intro' }, C.waiting),
      el('div', { class: 'chibi-code' }, el('span', {}, C.codeLabel), el('strong', {}, code)),
      el('p', { class: 'card-note' }, C.codeNote),
      msg,
      el('div', { class: 'form-actions' }, check, resend)));
  }

  // ---------------------------------------------------------------- 領到了
  /** 換上：主角換造型，回到設定卡 */
  function applyButton(label: string, sprite: () => Promise<Blob | null>): HTMLButtonElement {
    const b = button(label, 'primary');
    on(b, 'click', () => {
      b.disabled = true;
      msg.textContent = '';
      sprite()
        .then(async (blob) => {
          if (!blob) throw new Error('小人圖不見了');
          await d.apply(blob);
          if (!closed) dialog.close();
        })
        .catch((err: unknown) => {
          console.error('專屬小人：換不上', err);
          msg.textContent = C.errors.apply;
          b.disabled = false;
        });
    });
    return b;
  }

  /** 剛領到：換上這隻、或先收著 */
  function showReady(sprite: Blob): void {
    const keep = on(button(C.keep, 'secondary'), 'click', () => dialog.close());
    dialog.body.replaceChildren(el('div', { class: 'chibi' },
      el('p', { class: 'chibi-intro' }, C.ready),
      el('div', { class: 'chibi-result' }, el('img', { src: objectUrl(sprite), alt: C.alt(d.store.state.oc.name), draggable: 'false' })),
      msg,
      el('div', { class: 'form-actions' }, applyButton(C.apply, () => Promise.resolve(sprite)), keep)));
  }

  /** 之前領過：換上專屬小人、或再訂一隻 */
  function showReceived(photoId: string): void {
    const img = el('img', { alt: C.alt(d.store.state.oc.name), draggable: 'false' });
    void d.photos.get(photoId).then((u) => { if (u) img.src = u; });
    const again = on(button(C.again, 'secondary'), 'click', () => { msg.textContent = ''; showForm(); });
    const blob = (): Promise<Blob | null> => d.photos.get(photoId).then((u) => (u ? fetch(u).then((r) => r.blob()) : null));
    dialog.body.replaceChildren(el('div', { class: 'chibi' },
      el('p', { class: 'chibi-intro' }, C.received),
      el('div', { class: 'chibi-result' }, img),
      msg,
      el('div', { class: 'form-actions' }, applyButton(C.applyAgain, blob), again)));
  }

  show();
}
