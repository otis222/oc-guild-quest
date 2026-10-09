// 小人：PixiJS 畫的一張圖（不拆件），走路靠上下彈跳＋壓扁拉伸＋左右翻轉；
// 腳下的影子畫在 3D 地板上，前後順序用相機空間深度排序。
import * as THREE from 'three';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { clamp, damp, pick, rand } from '../core/math';
import type { CameraRig, ScreenPt } from './camera';
import { CHAR_H, FOUNTAIN_R, INK, WALK_R } from './constants';

export const LINES = ['委託完成！', '今天的作業拆成三段了', '先做 10 分鐘就好', '一起去看展品？', '畫圖時間！', '要組隊交作業嗎？',
  '好睏…', '♪', '解鎖新造型了！', '這週的委託好多', '休息一下', '展台上那個是什麼？'];
export const HELLO = ['嗨～', '你好！', '一起逛？', '午安～', '又見面了！'];
export const POKED = ['在！', '要去哪？', '被點到了', '♪', '嘿嘿', '收到！'];

const FONT = 'Noto Sans TC, Microsoft JhengHei, PingFang TC, sans-serif';

export interface ChibiDef {
  /** 頭上的名字標籤 */
  name: string;
}

/** 小人需要的場景資源 */
export interface ChibiWorld {
  scene: THREE.Scene;
  layer: Container;
  rig: CameraRig;
  shadowGeo: THREE.PlaneGeometry;
  shadowTex: THREE.Texture;
}

/** 每幀從外面傳進來的控制狀態 */
export interface ChibiControl {
  selected: Chibi;
  keyDir: THREE.Vector3;
}

type ChibiState = 'idle' | 'walk' | 'talk';

/** 頭上進度環：fraction 0～1；dim 是暫停中（灰色） */
export interface RingValue {
  fraction: number;
  dim: boolean;
}

const RING_ON = 0xff6f97;
const RING_DIM = 0xb9b0c6;
const RING_TRACK = 0xece6f2;

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class Chibi {
  readonly def: ChibiDef;
  readonly idx: number;
  pos: THREE.Vector3;
  vel = new THREE.Vector3();
  target: THREE.Vector3 | null = null;
  state: ChibiState = 'idle';
  timer = rand(0.5, 3);
  cool = rand(2, 6);
  phase = rand(0, 6);
  seed = rand(0, 100);
  face = Math.random() < 0.5 ? -1 : 1;
  flip = this.face;
  speed = rand(1.25, 1.55);
  hopT = -1;
  /** true：玩家操控中，不會自己閒逛或打招呼 */
  manual = false;
  readonly view = new Container();
  readonly sprite: Sprite;
  readonly label: Text;
  bubble: Container | null = null;
  bubbleT = 0;
  /** 頭上的進度環（計時中才有） */
  private ring: Graphics | null = null;
  private ringValue: RingValue | null = null;
  readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 上一幀在螢幕上的位置與大小，給點擊判定用 */
  scr = { x: 0, y: 0, h: 0, w: 0 };
  private readonly world: ChibiWorld;

  constructor(world: ChibiWorld, def: ChibiDef, tex: Texture, idx: number, total: number) {
    this.world = world; this.def = def; this.idx = idx;
    const a = (idx / total) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(3.4, 6.6);
    this.pos = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 0.985);
    this.view.addChild(this.sprite);
    this.label = new Text({ text: def.name, style: { fontFamily: FONT, fontSize: 13, fontWeight: '700', fill: '#ffffff', stroke: { color: '#3b2e52', width: 4, join: 'round' } } });
    this.label.anchor.set(0.5, 1);
    this.view.addChild(this.label);
    world.layer.addChild(this.view);
    this.shadow = new THREE.Mesh(world.shadowGeo, new THREE.MeshBasicMaterial({ map: world.shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.025;
    world.scene.add(this.shadow);
  }

  say(text: string, dur = 2.6): void {
    if (this.bubble) this.view.removeChild(this.bubble);
    const b = new Container();
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: '#3b2e52' } });
    const pw = t.width + 22, ph = t.height + 12;
    const g = new Graphics();
    g.roundRect(-pw / 2, -ph - 9, pw, ph, 12).fill(0xffffff).stroke({ width: 2, color: INK });
    g.poly([-7, -10.5, 7, -10.5, 0, 0]).fill(0xffffff);
    g.moveTo(-7, -9).lineTo(0, 0).lineTo(7, -9).stroke({ width: 2, color: INK });
    t.anchor.set(0.5, 0.5); t.position.set(0, -ph / 2 - 9);
    b.addChild(g, t);
    b.scale.set(0.2);
    this.bubble = b; this.bubbleT = dur;
    this.view.addChild(b);
  }

  hop(): void { this.hopT = 0; }

  /** 換圖（換造型）；大小會照新圖的高度自動算 */
  setTexture(tex: Texture): void {
    this.sprite.texture = tex;
  }

  /** 顯示或拿掉頭上的進度環 */
  setRing(v: RingValue | null): void {
    this.ringValue = v;
    if (!v && this.ring) {
      this.view.removeChild(this.ring);
      this.ring.destroy();
      this.ring = null;
    }
  }

  goTo(x: number, z: number): void { this.target = new THREE.Vector3(x, 0, z); this.state = 'walk'; }

  update(dt: number, t: number, all: readonly Chibi[], ctl: ChibiControl): void {
    const rig = this.world.rig;
    const isSelected = this === ctl.selected;
    // --- decide
    if (!this.manual) {
      if (this.state === 'idle') {
        this.timer -= dt;
        if (this.timer <= 0) { const p = randomSpot(this.pos); this.goTo(p.x, p.z); }
      }
      this.cool -= dt;
    }
    // --- steer
    let moving = false;
    if (ctl.keyDir.lengthSq() > 0 && isSelected) {
      this.target = null; this.state = 'walk';
      this.vel.lerp(tmpV2.copy(ctl.keyDir).multiplyScalar(this.speed * 1.1), 1 - Math.exp(-10 * dt));
      moving = true;
    } else if (this.state === 'walk' && this.target) {
      const d = tmpV2.copy(this.target).sub(this.pos); d.y = 0;
      const dist = d.length();
      if (dist < 0.12) { this.state = 'idle'; this.target = null; this.timer = rand(1.4, 4.6); this.vel.set(0, 0, 0); if (!this.manual && Math.random() < 0.28) this.say(pick(LINES)); }
      else {
        d.multiplyScalar(1 / dist);
        // avoid the fountain
        const fc = Math.hypot(this.pos.x, this.pos.z);
        if (fc < FOUNTAIN_R + 1.1) { const k = (FOUNTAIN_R + 1.1 - fc) * 1.6; d.x += (this.pos.x / (fc || 1)) * k; d.z += (this.pos.z / (fc || 1)) * k; }
        d.normalize().multiplyScalar(this.speed * Math.min(1, dist / 0.5 + 0.35));
        this.vel.lerp(d, 1 - Math.exp(-8 * dt));
        moving = true;
      }
    } else {
      this.vel.multiplyScalar(Math.exp(-10 * dt));
    }
    // separation from others
    for (const o of all) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = Math.hypot(dx, dz);
      if (dd > 0.001 && dd < 0.85) { const k = (0.85 - dd) * 3.2 * dt; this.pos.x += (dx / dd) * k; this.pos.z += (dz / dd) * k; }
      // friendly hello
      if (!this.manual && !o.manual && dd < 1.4 && this.cool <= 0 && o.cool <= 0 && this.state !== 'talk' && o.state !== 'talk') {
        const pairs: [Chibi, Chibi][] = [[this, o], [o, this]];
        for (const [c, other] of pairs) {
          c.state = 'talk'; c.target = null; c.timer = 2.4; c.cool = rand(9, 16); c.vel.set(0, 0, 0);
          c.face = Math.sign(rig.toScreen(other.pos, { x: 0, y: 0 }).x - rig.toScreen(c.pos, { x: 0, y: 0 }).x) || c.face;
        }
        this.say(pick(HELLO)); setTimeout(() => o.say(pick(HELLO)), 450);
      }
    }
    if (this.state === 'talk') { this.timer -= dt; if (this.timer <= 0) { this.state = 'idle'; this.timer = rand(0.5, 2); } }
    this.pos.addScaledVector(this.vel, dt);
    // keep on the plaza, outside the fountain
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WALK_R) { this.pos.x *= WALK_R / r; this.pos.z *= WALK_R / r; if (this.target) { this.state = 'idle'; this.target = null; this.timer = rand(0.5, 2); } }
    if (r < FOUNTAIN_R && r > 0.001) { this.pos.x *= FOUNTAIN_R / r; this.pos.z *= FOUNTAIN_R / r; }
    const spd = Math.hypot(this.vel.x, this.vel.z);
    moving = moving && spd > 0.15;

    // --- project to screen
    const foot: ScreenPt = rig.toScreen(this.pos, { x: 0, y: 0 });
    const head: ScreenPt = rig.toScreen(tmpV2.set(this.pos.x, CHAR_H, this.pos.z), { x: 0, y: 0 });
    const pxH = Math.max(8, foot.y - head.y);
    const base = pxH / this.sprite.texture.height;
    const pxPerUnit = pxH / CHAR_H;
    if (spd > 0.2) {
      const ahead = rig.toScreen(tmpV2.set(this.pos.x + this.vel.x * 0.2, 0, this.pos.z + this.vel.z * 0.2), { x: 0, y: 0 });
      const dx = ahead.x - foot.x;
      if (Math.abs(dx) > 0.6) this.face = dx > 0 ? 1 : -1;
    }
    this.flip = damp(this.flip, this.face, 14, dt);

    // --- animate (no rig: bounce, squash & stretch, waddle)
    let lift = 0, sx = 1, sy = 1, rot = 0;
    if (moving) {
      this.phase += dt * 10.5 * (spd / 1.35);
      const b = Math.abs(Math.sin(this.phase));
      lift = b * 0.11 * pxPerUnit;
      const c = 1 - b;
      sx = 1 + 0.05 * c; sy = 1 - 0.06 * c;
      rot = Math.sin(this.phase) * 0.055;
    } else {
      const br = Math.sin(t * 2.3 + this.seed);
      sy = 1 + 0.014 * br; sx = 1 - 0.006 * br;
      rot = Math.sin(t * 0.9 + this.seed) * 0.012;
    }
    if (this.hopT >= 0) {
      this.hopT += dt;
      const T = 0.5, u = this.hopT / T;
      if (u >= 1) this.hopT = -1;
      else {
        lift += Math.sin(u * Math.PI) * 0.55 * pxPerUnit;
        const sq = u < 0.12 ? (1 - u / 0.12) : u > 0.88 ? (u - 0.88) / 0.12 : 0;
        sx *= 1 + 0.12 * sq - (u > 0.12 && u < 0.88 ? 0.04 : 0);
        sy *= 1 - 0.14 * sq + (u > 0.12 && u < 0.88 ? 0.06 : 0);
      }
    }
    this.view.position.set(foot.x, foot.y);
    this.sprite.position.set(0, -lift);
    this.sprite.scale.set(base * sx * this.flip, base * sy);
    this.sprite.rotation = rot;
    this.label.position.set(0, -pxH - lift - 4);
    this.label.alpha = isSelected ? 1 : 0.82;
    this.label.scale.set(clamp(pxH / 150, 0.75, 1.15));
    // 進度環畫在名字上面；有進度環時，對話泡泡往上移到進度環上面
    let headTop = -pxH - lift;
    if (this.ringValue) {
      if (!this.ring) { this.ring = new Graphics(); this.view.addChild(this.ring); }
      const k = clamp(pxH / 150, 0.8, 1.2), r = 11 * k;
      const y = -pxH - lift - 4 - this.label.height - r - 3;
      const f = clamp(this.ringValue.fraction, 0, 1);
      this.ring.clear();
      this.ring.circle(0, 0, r).fill(0xffffff).stroke({ width: 2, color: INK });
      this.ring.circle(0, 0, r - 4.5).stroke({ width: 4, color: RING_TRACK });
      if (f > 0.001) {
        this.ring.arc(0, 0, r - 4.5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2)
          .stroke({ width: 4, color: this.ringValue.dim ? RING_DIM : RING_ON, cap: 'round' });
      }
      this.ring.position.set(0, y);
      // 泡泡的尖角放在 headTop - 22k，讓它剛好落在進度環上方 2px
      headTop = y - r - 2 + 22 * k;
    }
    if (this.bubble) {
      this.bubbleT -= dt;
      const k = clamp(pxH / 150, 0.8, 1.2);
      const pop = Math.min(1, (2.6 - this.bubbleT) * 7);
      const s = (this.bubbleT < 0.25 ? Math.max(0, this.bubbleT / 0.25) : 1) * (0.6 + 0.4 * pop) * k;
      this.bubble.scale.set(s); this.bubble.alpha = Math.min(1, this.bubbleT * 4);
      this.bubble.position.set(0, headTop - 22 * k);
      if (this.bubbleT <= 0) { this.view.removeChild(this.bubble); this.bubble = null; }
    }
    // depth sort: nearer to camera on top
    tmpV.copy(this.pos).applyMatrix4(rig.camera.matrixWorldInverse);
    this.view.zIndex = Math.round(tmpV.z * 100);
    // floor shadow
    const lh = lift / pxPerUnit;
    this.shadow.position.set(this.pos.x, 0.025, this.pos.z);
    const ss = 1 - Math.min(0.45, lh * 0.5);
    this.shadow.scale.set(ss, ss, 1);
    this.shadow.material.opacity = 1 - Math.min(0.5, lh * 0.6);
    this.scr = { x: foot.x, y: foot.y - lift, h: pxH, w: this.sprite.texture.width * base };
  }

  /** 螢幕座標有沒有點到這隻小人 */
  hit(x: number, y: number): boolean {
    const s = this.scr;
    return x > s.x - s.w * 0.42 && x < s.x + s.w * 0.42 && y < s.y && y > s.y - s.h * 0.98;
  }
}

/** 在廣場上隨機挑一個離目前位置夠遠的點（避開噴水池） */
export function randomSpot(from: THREE.Vector3): THREE.Vector3 {
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rand((FOUNTAIN_R + 0.6) ** 2, (WALK_R - 0.3) ** 2));
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (p.distanceTo(from) > 2.2) return p;
  }
  return new THREE.Vector3(rand(-5, 5), 0, rand(3, 6));
}
