// 大廳的展品（企劃表 T6）：交件照片放上後方 5 座展台，原本展台上的寶石換成相框。
// 相框是 Three.js 的平面＋照片材質，輕輕上下浮動；點相框可以放大看（main.ts 接）。
// 展台在可走範圍外面，PixiJS 的小人不會穿過相框。
import * as THREE from 'three';
import type { CameraRig } from './camera';
import type { Pedestal } from './plaza';
import { toon, withOutline } from './toon';

/** 相框裡照片最大的寬、高（世界座標） */
const MAX_W = 1.25;
const MAX_H = 1.0;
/** 相框邊寬 */
const BORDER = 0.08;
/** 相框中心離展台頂面多高 */
const LIFT = 0.75;
/**
 * 第幾張展品放在哪座展台（展台由左到右是 0～4）：從中間開始，再往兩邊。
 * 手機直式畫面只看得到中間 3 座，前 3 張交件照片一定看得到。
 */
const PEDESTAL_ORDER = [2, 1, 3, 0, 4];

export interface Exhibits {
  /** 第 slot 張展品（GuildState.exhibits 的順序）放上這張照片；tex 是 null 就放回寶石 */
  show(slot: number, tex: THREE.Texture | null): void;
  /** 點到第幾張展品的相框；沒點到回傳 null */
  slotAt(rig: CameraRig, x: number, y: number): number | null;
  update(t: number): void;
}

interface Slot {
  holder: THREE.Group;
  gem: THREE.Mesh;
  base: number;
}

/** 照片的寬高（世界座標）：等比例放進 MAX_W × MAX_H */
function photoSize(tex: THREE.Texture): { w: number; h: number } {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 4 / 3;
  return aspect >= MAX_W / MAX_H ? { w: MAX_W, h: MAX_W / aspect } : { w: MAX_H * aspect, h: MAX_H };
}

function disposeChildren(g: THREE.Group): void {
  for (const child of [...g.children]) {
    g.remove(child);
    child.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      // 描邊（背面）的材質是共用的，不能丟；照片貼圖也不丟，main.ts 會重複用
      const m = o.material as THREE.Material;
      if (m.side !== THREE.BackSide) m.dispose();
    });
  }
}

export function createExhibits(pedestals: readonly Pedestal[]): Exhibits {
  const slots: Slot[] = PEDESTAL_ORDER.filter((i) => i < pedestals.length).map((i) => {
    const p = pedestals[i];
    const holder = new THREE.Group();
    const base = p.top.y + LIFT;
    holder.position.set(p.top.x, base, p.top.z);
    holder.visible = false;
    p.group.add(holder);
    return { holder, gem: p.gem, base };
  });

  return {
    show(slot, tex) {
      const s = slots[slot];
      if (!s) return;
      disposeChildren(s.holder);
      s.holder.visible = !!tex;
      s.gem.visible = !tex;
      if (!tex) return;
      const { w, h } = photoSize(tex);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + BORDER * 2, h + BORDER * 2, 0.07), toon('#fffaf2'));
      frame.castShadow = true;
      withOutline(frame, 0.03);
      // 照片不受光影和色調映射影響，顏色跟作業照片一樣
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      photo.position.z = 0.04;
      s.holder.add(frame, photo);
    },

    slotAt(rig, x, y) {
      const i = slots.findIndex((s) => s.holder.visible && rig.hits(x, y, [s.holder]));
      return i < 0 ? null : i;
    },

    update(t) {
      slots.forEach((s, i) => { s.holder.position.y = s.base + Math.sin(t * 1.4 + i * 1.3) * 0.05; });
    },
  };
}
