// 鏡頭：繞著廣場的軌道鏡頭，輕輕跟著被選取的小人；也負責 3D → 螢幕座標與點地板的射線。
import * as THREE from 'three';
import { damp } from '../core/math';
import type { Viewport } from './viewport';

export interface ScreenPt { x: number; y: number }

const tmpV = new THREE.Vector3();
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = -0.42; pitch = 0.62; dist = 27; tx = 0; tz = 0.6;
  /** 目標值：拖曳、縮放改這些，實際值每幀平滑追過去 */
  yawT = 0; pitchT = 0.52; distT = 19;
  minD = 13; maxD = 28;
  private framed = false;
  private readonly vp: Viewport;

  constructor(vp: Viewport) {
    this.vp = vp;
    this.camera = new THREE.PerspectiveCamera(34, vp.w() / vp.h(), 0.1, 400);
    this.frame();
  }

  /** 依直式／橫式調整視角和縮放範圍（視窗大小改變時也要呼叫） */
  frame(): void {
    const portrait = this.vp.w() / this.vp.h() < 0.9;
    this.camera.fov = portrait ? 46 : 34;
    this.minD = portrait ? 17 : 13; this.maxD = portrait ? 34 : 28;
    if (!this.framed) { this.distT = portrait ? 25 : 19; this.framed = true; }
    this.camera.aspect = this.vp.w() / this.vp.h(); this.camera.updateProjectionMatrix();
  }

  update(dt: number, t: number, focus: THREE.Vector3): void {
    const follow = this.vp.w() / this.vp.h() < 0.9 ? 0.75 : 0.3;
    this.tx = damp(this.tx, focus.x * follow, 2.5, dt);
    this.tz = damp(this.tz, 0.6 + focus.z * follow * 0.6, 2.5, dt);
    this.yaw = damp(this.yaw, this.yawT + Math.sin(t * 0.17) * 0.035, 3, dt);
    this.pitch = damp(this.pitch, this.pitchT, 3, dt);
    this.dist = damp(this.dist, this.distT, 2.2, dt);
    this.camera.position.set(
      this.tx + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      Math.sin(this.pitch) * this.dist + 0.6,
      this.tz + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    this.camera.lookAt(this.tx, 1.1, this.tz);
    this.camera.updateMatrixWorld();
  }

  /** 世界座標 → 舞台上的像素座標 */
  toScreen(p: THREE.Vector3, out: ScreenPt): ScreenPt {
    tmpV.copy(p).project(this.camera);
    out.x = (tmpV.x * 0.5 + 0.5) * this.vp.w();
    out.y = (-tmpV.y * 0.5 + 0.5) * this.vp.h();
    return out;
  }

  /** 舞台上的像素座標 → 地板（y=0）上的點；沒打到地板回傳 null */
  floorPoint(x: number, y: number): THREE.Vector3 | null {
    ndc.set((x / this.vp.w()) * 2 - 1, -(y / this.vp.h()) * 2 + 1);
    ray.setFromCamera(ndc, this.camera);
    return ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
  }
}
