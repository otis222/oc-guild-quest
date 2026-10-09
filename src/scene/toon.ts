// 卡通材質、描邊與 canvas 貼圖的共用工具
import * as THREE from 'three';
import { INK } from './constants';

export const gradTex = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
gradTex.needsUpdate = true;

export const toon = (color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial =>
  new THREE.MeshToonMaterial({ color, gradientMap: gradTex, ...extra });

const OUTLINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/** 用放大一點的背面網格做描邊 */
export function withOutline<T extends THREE.Mesh>(mesh: T, t = 0.05): T {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(1 + t);
  mesh.add(o);
  return mesh;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('瀏覽器不支援 canvas 2D');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
