// 輸入：WASD／方向鍵走路、拖曳轉鏡頭、雙指或滾輪縮放、點一下（tap）。
import * as THREE from 'three';
import { clamp } from '../core/math';
import type { CameraRig } from './camera';
import type { Viewport } from './viewport';

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

/** 正在輸入框裡打字（含中文選字）時，按鍵不能拿去走路 */
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target;
  return e.isComposing || (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)));
}

interface Drag { x: number; y: number; sx: number; sy: number; moved: boolean }

export class Input {
  /** 鍵盤方向（世界座標、已正規化）；沒按鍵時是 0 向量 */
  readonly keyDir = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private readonly rig: CameraRig;

  /** onTap 的座標是相對舞台左上角的像素 */
  constructor(vp: Viewport, rig: CameraRig, onTap: (x: number, y: number) => void) {
    this.rig = rig;
    const host = vp.el;

    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (MOVE_KEYS.includes(k)) { this.keys.add(k); e.preventDefault(); }
    });
    // 瀏覽器自動填入時送出的按鍵事件可能沒有 key
    addEventListener('keyup', (e) => { if (e.key) this.keys.delete(e.key.toLowerCase()); });

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: Drag | null = null, pinch0 = 0;
    host.addEventListener('pointerdown', (e) => {
      host.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); drag = null; }
    });
    host.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) rig.distT = clamp(rig.distT * pinch0 / d, rig.minD, rig.maxD);
        pinch0 = d; return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (drag.moved) {
        rig.yawT = clamp(rig.yawT - dx * 0.004, -0.5, 0.5);
        rig.pitchT = clamp(rig.pitchT + dy * 0.003, 0.42, 0.95);
      }
      drag.x = e.clientX; drag.y = e.clientY;
    });
    host.addEventListener('pointerup', (e) => {
      const wasTap = drag !== null && !drag.moved && pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = 0;
      if (wasTap) { const r = host.getBoundingClientRect(); onTap(e.clientX - r.left, e.clientY - r.top); }
      if (pointers.size === 0) drag = null;
    });
    host.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; pinch0 = 0; });
    host.addEventListener('wheel', (e) => {
      e.preventDefault();
      rig.distT = clamp(rig.distT * (1 + Math.sign(e.deltaY) * 0.08), rig.minD, rig.maxD);
    }, { passive: false });
  }

  /** 依目前按著的鍵和鏡頭方向算 keyDir；有按方向鍵就回傳 true */
  updateKeys(): boolean {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('d') || k.has('arrowright')) s += 1;
    if (k.has('a') || k.has('arrowleft')) s -= 1;
    this.keyDir.set(0, 0, 0);
    if (!f && !s) return false;
    const yaw = this.rig.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.keyDir.addScaledVector(fwd, f).addScaledVector(right, s).normalize();
    return true;
  }
}
