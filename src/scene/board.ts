// 大廳的 3D 委託板。放在後方兩座拱門之間、可走範圍（WALK_R）外面：
// PixiJS 畫的小人永遠在 3D 物件前面，放進可走範圍的話，小人走到後面會穿幫。
import * as THREE from 'three';
import { canvasTex, gradTex, toon, withOutline } from './toon';

/** 委託板的方向：第 2、3 座拱門中間（拱門在 π×1.34、π×1.50） */
const BOARD_ANGLE = Math.PI * 1.42;
const BOARD_R = 8.7;
/** 主角工作時站的位置：委託板正前方、可走範圍內 */
export const BOARD_WORK_SPOT = { x: Math.cos(BOARD_ANGLE) * 6.9, z: Math.sin(BOARD_ANGLE) * 6.9 };

export interface Board {
  /** 點擊判定用的 3D 物件 */
  readonly targets: THREE.Object3D[];
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
    // 釘在板子上的委託單（裝飾）
    const notes = [
      { x: 52, y: 112, r: -0.07, color: '#fffaf0' },
      { x: 196, y: 120, r: 0.04, color: '#ffe1ea' },
      { x: 340, y: 110, r: -0.03, color: '#e3f1ff' },
    ];
    for (const n of notes) {
      c.save();
      c.translate(n.x + 60, n.y + 75); c.rotate(n.r);
      c.fillStyle = 'rgba(60, 40, 30, 0.18)'; c.fillRect(-56, -68, 120, 150);
      c.fillStyle = n.color; c.fillRect(-60, -72, 120, 150);
      c.fillStyle = 'rgba(59, 46, 82, 0.35)';
      for (let k = 0; k < 4; k++) c.fillRect(-44, -36 + k * 24, k === 3 ? 50 : 88, 7);
      c.fillStyle = '#ff6f97'; c.beginPath(); c.arc(0, -62, 9, 0, Math.PI * 2); c.fill();
      c.restore();
    }
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

  return { targets: [back, face] };
}
