// OC 設定圖成品（企劃表 T18）：把 OC 圖、名牌、配色、版面、草稿、台詞和設定圖急救排得最好的那次，
// 畫成一張直式的設定圖（1080×1920，canvas 畫好轉成 PNG）。
// 上面是設定圖急救的格線（只畫有小卡的那幾列）：名字（有名牌就用名牌）、台詞、正面／側面／背面；
// 下面是配色、版面、草稿，版面和草稿的照片用掉剩下的高度。
// 還沒交過的部件畫預設的樣子（虛線框和「交＿＿作業後出現」），還沒玩過設定圖急救就用預設排法。
// 「存成圖片」：手機用分享（存進相簿或傳給別人，由玩家自己選），電腦直接下載。圖片只在這台裝置上做，不會上傳。
import { charSheetData, charSheetFileName, type CharSheetData } from '../core/charSheet';
import { mostVivid } from '../core/palette';
import { CARD_SIZE, SHEET_COLS, SHEET_ROWS } from '../core/sheet';
import type { GuildStore } from '../core/store';
import { COURSE_TEMPLATES, PART_LABELS } from '../core/templates';
import type { PartType, SheetCardId } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import type { PhotoUrls } from './photos';

export interface CharSheetDeps {
  store: GuildStore;
  photos: PhotoUrls;
  /** 主角圖的網址 */
  ocImage: string;
  /** 存成圖片了：分享（手機）或下載（電腦） */
  onSaved(method: 'share' | 'download'): void;
  /** 關掉之後（回設定卡） */
  onClosed?(): void;
}

const C = COPY.charSheet;
const W = 1080;
const H = 1920;
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", system-ui, sans-serif';
const INK = '#2f2542';
const SOFT = '#6b5f80';
const ACCENT = '#ff6f97';
const PAPER = '#fffdf8';
/** 設定圖急救的格線放在哪：左上角、一格多大 */
const GRID_X = 90;
const GRID_Y = 150;
const CELL = 900 / SHEET_COLS;

interface Images {
  oc: HTMLImageElement | null;
  plate: HTMLImageElement | null;
  layout: HTMLImageElement | null;
  sketch: HTMLImageElement | null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** 交這個部位要交哪門課（還沒有的部件寫「交＿＿作業後出現」） */
const courseOf = (part: PartType): string => COURSE_TEMPLATES.find((t) => t.part === part)?.label ?? PART_LABELS[part];

/** 圖片放進框裡（不裁切）的大小 */
function contain(img: HTMLImageElement, w: number, h: number): { w: number; h: number } {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  return { w: img.naturalWidth * k, h: img.naturalHeight * k };
}

/** 字太長就縮小到放得下 */
function setFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  g.font = `${weight} ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.max(12, Math.floor((size * maxW) / w))}px ${FONT}`;
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: { weight: number; size: number; color: string; maxW: number; align?: CanvasTextAlign }): void {
  setFont(g, s, o.weight, o.size, o.maxW);
  g.fillStyle = o.color;
  g.textAlign = o.align ?? 'left';
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

/** 虛線框（還沒有的部件） */
function dashed(g: CanvasRenderingContext2D, b: Box, r: number): void {
  g.save();
  g.setLineDash([12, 10]);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(47, 37, 66, 0.3)';
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, r);
  g.stroke();
  g.restore();
}

/** 剪影：同一張 OC 圖塗成黑色（設定圖急救的背面也是這樣） */
function silhouette(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  if (!g) return c;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** 設定圖急救的一張小卡 */
function drawCard(g: CanvasRenderingContext2D, id: SheetCardId, b: Box, data: CharSheetData, img: Images): void {
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(47, 37, 66, 0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, 14);
  g.fill();
  g.stroke();
  const cx = b.x + b.w / 2;
  if (id === 'name') {
    if (img.plate) {
      const s = contain(img.plate, b.w - 16, b.h - 16);
      g.drawImage(img.plate, cx - s.w / 2, b.y + (b.h - s.h) / 2, s.w, s.h);
    } else {
      text(g, data.name, cx, b.y + b.h / 2, { weight: 800, size: Math.round(b.h * 0.6), color: INK, maxW: b.w - 32, align: 'center' });
    }
    return;
  }
  if (id === 'quote') {
    const q = data.quote ? `「${data.quote}」` : C.quoteEmpty;
    text(g, q, cx, b.y + b.h / 2, { weight: data.quote ? 700 : 600, size: Math.round(b.h * 0.42), color: data.quote ? INK : SOFT, maxW: b.w - 32, align: 'center' });
    return;
  }
  // 三視圖：只有一張 OC 圖，正面是原圖、側面壓窄、背面是剪影
  const label = 36;
  text(g, COPY.bonus.cards[id], cx, b.y + b.h - label / 2 - 4, { weight: 700, size: 26, color: SOFT, maxW: b.w - 16, align: 'center' });
  if (!img.oc) return;
  const s = contain(img.oc, b.w - 20, b.h - label - 20);
  const top = b.y + b.h - label - 8 - s.h;
  if (id === 'front') {
    g.drawImage(img.oc, cx - s.w / 2, top, s.w, s.h);
  } else if (id === 'side') {
    const w = s.w * 0.62;
    g.drawImage(img.oc, cx - w / 2, top, w, s.h);
  } else {
    g.save();
    g.globalAlpha = 0.5;
    g.drawImage(silhouette(img.oc, s.w, s.h), cx - s.w / 2, top, s.w, s.h);
    g.restore();
  }
}

/** 下面的作業成果照片（版面、草稿）；還沒有就畫虛線框 */
function drawPhoto(g: CanvasRenderingContext2D, part: PartType, photo: HTMLImageElement | null, b: Box): void {
  text(g, PART_LABELS[part], b.x, b.y - 26, { weight: 800, size: 32, color: INK, maxW: b.w });
  if (!photo) {
    dashed(g, b, 18);
    text(g, C.missing(courseOf(part)), b.x + b.w / 2, b.y + b.h / 2, { weight: 600, size: 26, color: SOFT, maxW: b.w - 40, align: 'center' });
    return;
  }
  g.fillStyle = '#f5f2f8';
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, 18);
  g.fill();
  const s = contain(photo, b.w - 20, b.h - 20);
  g.drawImage(photo, b.x + (b.w - s.w) / 2, b.y + (b.h - s.h) / 2, s.w, s.h);
}

/** 畫整張設定圖 */
export function drawCharSheet(data: CharSheetData, img: Images, today: Date): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('瀏覽器不能畫圖');
  const theme = mostVivid(data.palette) ?? ACCENT;

  // 紙和外框（框的顏色是配色裡最鮮豔的那一色，還沒有配色是公會的粉紅）
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = theme;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(28, 28, W - 56, H - 56, 36);
  g.stroke();

  // 標題列、配色帶
  text(g, C.heading, GRID_X, 82, { weight: 700, size: 30, color: SOFT, maxW: 400 });
  text(g, C.level(data.guildLevel), W - GRID_X, 82, { weight: 800, size: 30, color: INK, maxW: 400, align: 'right' });
  const band = data.palette.length ? data.palette : ['#ece6f2'];
  const bw = 900 / band.length;
  band.forEach((color, i) => { g.fillStyle = color; g.fillRect(GRID_X + i * bw, 108, Math.ceil(bw), 16); });

  // 設定圖急救的格線和小卡：只畫有小卡的那幾列（上下空著的列不畫，省下來的高度給照片）
  const ids = ['front', 'side', 'back', 'quote', 'name'] as const;
  const first = Math.min(...ids.map((id) => data.positions[id].y));
  const rows = Math.min(SHEET_ROWS, Math.max(...ids.map((id) => data.positions[id].y + CARD_SIZE[id].h)) - first);
  g.strokeStyle = 'rgba(47, 37, 66, 0.07)';
  g.lineWidth = 2;
  for (let i = 0; i <= SHEET_COLS; i++) { g.beginPath(); g.moveTo(GRID_X + i * CELL, GRID_Y); g.lineTo(GRID_X + i * CELL, GRID_Y + rows * CELL); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(GRID_X, GRID_Y + j * CELL); g.lineTo(GRID_X + SHEET_COLS * CELL, GRID_Y + j * CELL); g.stroke(); }
  for (const id of ids) {
    const p = data.positions[id], size = CARD_SIZE[id];
    drawCard(g, id, { x: GRID_X + p.x * CELL + 6, y: GRID_Y + (p.y - first) * CELL + 6, w: size.w * CELL - 12, h: size.h * CELL - 12 }, data, img);
  }

  // 配色
  const paletteY = GRID_Y + rows * CELL + 50;
  text(g, PART_LABELS.palette, GRID_X, paletteY, { weight: 800, size: 32, color: INK, maxW: 300 });
  for (let i = 0; i < 5; i++) {
    const x = GRID_X + 48 + i * 130, y = paletteY + 80, color = data.palette[i];
    if (color) {
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y, 48, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(47, 37, 66, 0.2)'; g.lineWidth = 2; g.stroke();
      text(g, color.toUpperCase(), x, y + 76, { weight: 600, size: 24, color: SOFT, maxW: 126, align: 'center' });
    } else if (!data.palette.length) {
      g.save(); g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = 'rgba(47, 37, 66, 0.3)';
      g.beginPath(); g.arc(x, y, 46, 0, Math.PI * 2); g.stroke(); g.restore();
    }
  }
  if (!data.palette.length) text(g, C.missing(courseOf('palette')), GRID_X, paletteY + 156, { weight: 600, size: 26, color: SOFT, maxW: 900 });

  // 版面、草稿：用掉到日期上面的高度
  const photoY = paletteY + 250, footerY = H - 66;
  const photoH = Math.max(220, footerY - 44 - photoY);
  drawPhoto(g, 'layout', img.layout, { x: GRID_X, y: photoY, w: 435, h: photoH });
  drawPhoto(g, 'sketch', img.sketch, { x: GRID_X + 465, y: photoY, w: 435, h: photoH });

  // 日期
  const date = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
  text(g, C.footer(date), GRID_X, footerY, { weight: 600, size: 26, color: SOFT, maxW: 900 });
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('設定圖轉不成圖片'))), 'image/png');
});

/** 手機（手指操作）用分享，其他直接下載；按了分享又取消回傳 null */
async function saveImage(blob: Blob): Promise<'share' | 'download' | null> {
  const name = charSheetFileName();
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: C.title });
      return 'share';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      console.warn('分享失敗，改成下載', err);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'download';
}

export function openCharSheet(d: CharSheetDeps): void {
  const data = charSheetData(d.store.state);
  let url: string | null = null;
  let closed = false;
  const dialog = openDialog({
    title: C.title,
    onClose: () => { closed = true; if (url) URL.revokeObjectURL(url); d.onClosed?.(); },
  });
  dialog.body.replaceChildren(el('p', { class: 'cs-wait', role: 'status' }, C.drawing));

  const photo = (id: string | undefined): Promise<HTMLImageElement | null> =>
    (id ? d.photos.get(id).then(loadImage) : Promise.resolve(null));
  Promise.all([loadImage(d.ocImage), photo(data.nameplatePhotoId), photo(data.layoutPhotoId), photo(data.sketchPhotoId)])
    .then(([oc, plate, layout, sketch]) => toBlob(drawCharSheet(data, { oc, plate, layout, sketch }, new Date())))
    .then((blob) => { if (!closed) show(blob); })
    .catch((err: unknown) => {
      console.error('設定圖畫不出來', err);
      if (!closed) dialog.body.replaceChildren(el('p', { class: 'cs-wait', role: 'status' }, C.failed));
    });

  function show(blob: Blob): void {
    url = URL.createObjectURL(blob);
    const msg = el('p', { class: 'card-msg cs-msg', role: 'status' });
    const save = el('button', { type: 'button', class: 'primary' }, C.save);
    on(save, 'click', () => {
      save.disabled = true;
      msg.textContent = '';
      saveImage(blob)
        .then((method) => {
          if (!method) return;
          msg.textContent = method === 'share' ? C.shared : C.downloaded;
          d.onSaved(method);
        })
        .catch((err: unknown) => { console.error('設定圖沒存成功', err); msg.textContent = C.saveFailed; })
        .finally(() => { save.disabled = false; });
    });
    dialog.body.replaceChildren(
      el('img', { class: 'cs-image', src: url, alt: C.alt(data.name) }),
      save,
      el('p', { class: 'card-note cs-note' }, C.note),
      msg);
  }
}
