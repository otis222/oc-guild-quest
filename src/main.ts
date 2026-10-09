// 進入點：組裝大廳場景、小人、鏡頭、輸入和 HUD，跑每幀的迴圈。
import './style.css';
import * as THREE from 'three';
import { logEvent } from './core/events';
import { pick } from './core/math';
import { idbKV } from './core/storage';
import { CameraRig } from './scene/camera';
import { Chibi, HELLO, POKED, type ChibiDef, type ChibiWorld } from './scene/chibi';
import { FOUNTAIN_R, WALK_R } from './scene/constants';
import { Input } from './scene/input';
import { createPlaza } from './scene/plaza';
import { createRenderers } from './scene/renderer';
import { loadManifest, loadTexture, spriteUrl } from './scene/sprites';
import { createViewport } from './scene/viewport';
import { createHud } from './ui/hud';

async function main(): Promise<void> {
  const kv = idbKV();
  // 先記開啟，3D 場景載入失敗也記得到；寫不進去不影響大廳
  logEvent(kv, 'app_opened').catch((err: unknown) => console.warn('事件紀錄寫入失敗', err));

  const stage = document.getElementById('stage');
  if (!stage) throw new Error('找不到 #stage');
  const vp = createViewport(stage);

  const gfx = await createRenderers(vp);
  const plaza = createPlaza();
  const rig = new CameraRig(vp);

  const manifest = await loadManifest();
  const defs: ChibiDef[] = manifest.members.map((m) => ({ name: m.name, src: spriteUrl(m.file) }));
  const textures = await Promise.all(defs.map((d) => loadTexture(d.src)));
  const world: ChibiWorld = { scene: plaza.scene, layer: gfx.charLayer, rig, shadowGeo: plaza.shadowGeo, shadowTex: plaza.shadowTex };
  const chibis = defs.map((d, i) => new Chibi(world, d, textures[i], i, defs.length));
  if (!chibis.length) throw new Error('manifest 裡沒有角色');
  let selected = chibis[0];

  const hud = createHud({
    onHello: () => chibis.forEach((c, i) => setTimeout(() => { c.hop(); c.say(pick(HELLO)); }, i * 110)),
    onToggleTime: () => plaza.toggleTime(),
  });
  hud.setRoster(defs, (i) => select(chibis[i], true));

  function select(c: Chibi, poke = false): void {
    selected = c;
    chibis.forEach((o) => { o.manual = o === c && o.manual; });
    hud.setSelected(chibis.indexOf(c));
    if (poke) { c.hop(); c.say(pick(POKED)); }
  }
  select(selected);

  function tap(x: number, y: number): void {
    const hits = chibis.filter((c) => c.hit(x, y)).sort((a, b) => b.view.zIndex - a.view.zIndex);
    if (hits.length) { select(hits[0], true); return; }
    const p = rig.floorPoint(x, y);
    if (!p) return;
    const r = Math.hypot(p.x, p.z);
    if (r > 9.4) return;
    if (r > WALK_R) { p.x *= WALK_R / r; p.z *= WALK_R / r; }
    if (r < FOUNTAIN_R + 0.2) { const k = (FOUNTAIN_R + 0.3) / (r || 1); p.x *= k; p.z *= k; }
    selected.manual = true; selected.goTo(p.x, p.z);
    plaza.showMarker(p.x, p.z);
  }
  const input = new Input(vp, rig, tap);

  addEventListener('resize', () => {
    gfx.resize();
    rig.frame();
  });

  const clock = new THREE.Clock();
  let t = 0;
  hud.hideLoading();
  function loop(): void {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    if (input.updateKeys()) selected.manual = true;

    plaza.update(dt, t, selected.pos);
    rig.update(dt, t, selected.pos);
    const ctl = { selected, keyDir: input.keyDir };
    chibis.forEach((c) => c.update(dt, t, chibis, ctl));

    gfx.render(plaza.scene, rig.camera);
    requestAnimationFrame(loop);
  }
  loop();
}

void main();
