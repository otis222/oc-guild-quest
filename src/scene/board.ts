// 大廳的 3D 委託板。放在後方兩座拱門之間、可走範圍（WALK_R）外面：
// PixiJS 畫的小人永遠在 3D 物件前面，放進可走範圍的話，小人走到後面會穿幫。
// 板子上釘著進行中的委託（T13）：一張委託一張紙，快截止的變粉紅、會晃，逾期的變紅、晃得比較大。
import * as THREE from 'three';
import type { PaperUrgency } from '../core/urgency';
import { canvasTex, gradTex, toon, withOutline } from './toon';

/** 委託板的方向：第 2、3 座拱門中間（拱門在 π×1.34、π×1.50） */
const BOARD_ANGLE = Math.PI * 1.42;
const BOARD_R = 8.7;
/** 主角工作時站的位置：委託板正前方、可走範圍內 */
export const BOARD_WORK_SPOT = { x: Math.cos(BOARD_ANGLE) * 6.9, z: Math.sin(BOARD_ANGLE) * 6.9 };

/** 委託板上的一張紙（T13）：要畫成什麼樣子 */
export interface PaperView {
  /** 委託 id */
  key: string;
  title: string;
  /** 課程顏色（紙上方的色帶） */
  color: string;
  /** 截止倒數：「剩 2 天」「已逾期」 */
  due: string;
  urgency: PaperUrgency;
}

export interface Board {
  /** 點擊判定用的 3D 物件（含板子上的紙） */
  readonly targets: THREE.Object3D[];
  /** 釘上進行中的委託（最多 6 張）；跟上次一樣就不重畫 */
  setPapers(papers: readonly PaperView[]): void;
  /** 每幀：快截止、逾期的紙會晃 */
  update(t: number): void;
}

const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
const INK_CSS = '#3b2e52';
/** 紙的底色：平常、快截止、逾期 */
const PAPER_BG: Readonly<Record<PaperUrgency, string>> = { calm: '#fffaf0', soon: '#ffd3df', overdue: '#ff9c9c' };
/** 晃的幅度（弧度）和速度：平常不晃 */
const SWAY: Readonly<Record<PaperUrgency, { amp: number; speed: number }>> = {
  calm: { amp: 0, speed: 0 }, soon: { amp: 0.06, speed: 2.2 }, overdue: { amp: 0.13, speed: 3.6 },
};
/** 板面上放紙的範圍（相對委託板群組）：標題木牌下面 */
const PAPER_TOP = 2.13;
const PAPER_BOTTOM = 1.16;

/** 一張紙的位置（圖釘在紙的上緣中間）和大小 */
interface Slot { x: number; y: number; w: number; h: number }

/** 3 張以內排一列、大張一點；4～6 張排兩列，每列最多 3 張，各列置中 */
function paperSlots(n: number): Slot[] {
  if (n <= 3) {
    return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * 0.74, y: PAPER_TOP, w: 0.6, h: 0.78 }));
  }
  const rowH = (PAPER_TOP - PAPER_BOTTOM) / 2;
  const rows = [3, n - 3];
  return rows.flatMap((k, r) => Array.from({ length: k }, (_, i) => ({
    x: (i - (k - 1) / 2) * 0.72, y: PAPER_TOP - r * rowH, w: 0.52, h: rowH - 0.05,
  })));
}

/** 文字超過寬度就換行，最多 maxLines 行，放不下的最後加「…」 */
function wrapText(c: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (c.measureText(line + ch).width <= maxW) { line += ch; continue; }
    lines.push(line);
    line = ch;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines) { lines.push(line); return lines; }
  let last = lines[maxLines - 1];
  while (last && c.measureText(`${last}…`).width > maxW) last = Array.from(last).slice(0, -1).join('');
  lines[maxLines - 1] = `${last}…`;
  return lines;
}

/** 一張紙的貼圖：圖釘、課程色帶、作業名稱、截止倒數 */
function paperTexture(p: PaperView, slot: Slot): THREE.CanvasTexture {
  const W = 240, H = Math.round(W * (slot.h / slot.w));
  return canvasTex(W, H, (c, w, h) => {
    c.fillStyle = PAPER_BG[p.urgency]; c.fillRect(0, 0, w, h);
    c.fillStyle = p.color; c.fillRect(0, h * 0.1, w, h * 0.12);
    c.fillStyle = p.urgency === 'calm' ? '#ff6f97' : '#c2185b';
    c.beginPath(); c.arc(w / 2, h * 0.07, Math.min(w, h) * 0.055, 0, Math.PI * 2); c.fill();
    const big = h > w;
    c.fillStyle = INK_CSS; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(h * (big ? 0.12 : 0.17))}px ${FONT}`;
    const lines = wrapText(c, p.title, w - 26, big ? 2 : 1);
    const lineH = h * (big ? 0.15 : 0.2);
    lines.forEach((line, i) => c.fillText(line, w / 2, h * (big ? 0.38 : 0.44) + i * lineH));
    c.fillStyle = p.urgency === 'overdue' ? '#8f0f42' : '#6b5f80';
    c.font = `bold ${Math.round(h * (big ? 0.09 : 0.14))}px ${FONT}`;
    c.fillText(p.due, w / 2, h * 0.86);
  });
}

function boardTexture(): THREE.CanvasTexture {
  return canvasTex(512, 320, (c, w, h) => {
    // 軟木板
    c.fillStyle = '#e8c595'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(150, 100, 60, 0.18)';
    for (let i = 0; i < 260; i++) {
      const x = (i * 97) % w, y = (i * 61 + (i % 7) * 13) % h;
      c.fillRect(x, y, 3, 3);
    }
    // 委託單是另外釘上去的紙（setPapers），跟著進行中的委託變
    // 標題木牌
    c.fillStyle = '#8a5a3c'; c.beginPath(); c.roundRect(w / 2 - 128, 14, 256, 76, 18); c.fill();
    c.fillStyle = '#fff8ee'; c.font = 'bold 50px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('委託板', w / 2, 54);
  });
}

export function createBoard(scene: THREE.Scene): Board {
  const g = new THREE.Group();
  g.position.set(Math.cos(BOARD_ANGLE) * BOARD_R, 0, Math.sin(BOARD_ANGLE) * BOARD_R);
  g.lookAt(0, 0, 0);
  scene.add(g);

  const wood = toon('#9a6b4a');
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.7, 10), wood);
    post.position.set(s * 1.32, 1.35, -0.05); post.castShadow = true; withOutline(post, 0.08); g.add(post);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.62, 0.1), toon('#b98a62'));
  back.position.set(0, 1.85, 0); back.castShadow = true; withOutline(back, 0.03); g.add(back);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.48), new THREE.MeshToonMaterial({ map: boardTexture(), gradientMap: gradTex }));
  face.position.set(0, 1.85, 0.056); g.add(face);

  const papers = new THREE.Group();
  g.add(papers);
  let signature = '';
  let swaying: { mesh: THREE.Mesh; base: number; amp: number; speed: number; phase: number }[] = [];

  function clearPapers(): void {
    for (const m of [...papers.children]) {
      papers.remove(m);
      if (!(m instanceof THREE.Mesh)) continue;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshToonMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    swaying = [];
  }

  return {
    targets: [back, face, papers],
    setPapers(list) {
      const next = JSON.stringify(list);
      if (next === signature) return;
      signature = next;
      clearPapers();
      const slots = paperSlots(list.length);
      list.forEach((p, i) => {
        const slot = slots[i];
        // 原點放在圖釘（紙的上緣中間），晃的時候繞著圖釘轉
        const geo = new THREE.PlaneGeometry(slot.w, slot.h).translate(0, -slot.h / 2, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: paperTexture(p, slot), gradientMap: gradTex }));
        // 每張紙微微歪一點；z 錯開一點點，疊到時不會閃
        const base = ((i * 37) % 7 - 3) * 0.012;
        mesh.position.set(slot.x, slot.y, 0.07 + i * 0.002);
        mesh.rotation.z = base;
        papers.add(mesh);
        const { amp, speed } = SWAY[p.urgency];
        if (amp) swaying.push({ mesh, base, amp, speed, phase: i * 1.7 });
      });
    },
    update(t) {
      for (const s of swaying) s.mesh.rotation.z = s.base + Math.sin(t * s.speed + s.phase) * s.amp;
    },
  };
}
