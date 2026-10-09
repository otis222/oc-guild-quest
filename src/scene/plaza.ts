// 3D 大廳：天空、浮島、廣場地板、噴水池、後方拱門展台、招牌、路燈、樹、花、雲，
// 以及地板上的影子貼圖、選取光圈、點地板的標記。
import * as THREE from 'three';
import { pick, rand, lerp } from '../core/math';
import { canvasTex, gradTex, toon, withOutline } from './toon';

interface Env {
  top: THREE.Color; mid: THREE.Color; bottom: THREE.Color; fog: THREE.Color;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number;
  sun: THREE.Color; sunI: number; sunPos: THREE.Vector3; lamp: number;
}

const DAY: Env = {
  top: new THREE.Color('#7fbaf5'), mid: new THREE.Color('#ffeef4'), bottom: new THREE.Color('#d6e9ff'),
  fog: new THREE.Color('#e8f1ff'), hemiSky: new THREE.Color('#fff4e6'), hemiGround: new THREE.Color('#86b88f'),
  hemi: 1.15, sun: new THREE.Color('#fff1dc'), sunI: 2.3, sunPos: new THREE.Vector3(-9, 15, 7), lamp: 0.25,
};
const DUSK: Env = {
  top: new THREE.Color('#5b5fc7'), mid: new THREE.Color('#ffb48f'), bottom: new THREE.Color('#ffd7c2'),
  fog: new THREE.Color('#f3c3b6'), hemiSky: new THREE.Color('#ffc9a6'), hemiGround: new THREE.Color('#6a5a8c'),
  hemi: 0.75, sun: new THREE.Color('#ff9a6a'), sunI: 1.6, sunPos: new THREE.Vector3(-14, 6, 4), lamp: 2.4,
};
const COLOR_KEYS = ['top', 'mid', 'bottom', 'fog', 'hemiSky', 'hemiGround', 'sun'] as const;

export interface Plaza {
  scene: THREE.Scene;
  /** 小人腳下影子用的貼圖和形狀 */
  shadowTex: THREE.Texture;
  shadowGeo: THREE.PlaneGeometry;
  /** 切換白天／黃昏，回傳切換後是不是白天 */
  toggleTime(): boolean;
  /** 在地板上點的位置閃一下白圈 */
  showMarker(x: number, z: number): void;
  /** 每幀更新：天色漸變、水滴、寶石、雲、石頭、選取光圈（selectedPos 是 null 時不顯示光圈） */
  update(dt: number, t: number, selectedPos: THREE.Vector3 | null): void;
}

export function createPlaza(): Plaza {
  const scene = new THREE.Scene();

  const env: Env = {
    top: DAY.top.clone(), mid: DAY.mid.clone(), bottom: DAY.bottom.clone(), fog: DAY.fog.clone(),
    hemiSky: DAY.hemiSky.clone(), hemiGround: DAY.hemiGround.clone(), hemi: DAY.hemi,
    sun: DAY.sun.clone(), sunI: DAY.sunI, sunPos: DAY.sunPos.clone(), lamp: DAY.lamp,
  };
  let envTarget = DAY;

  const fog = new THREE.Fog(env.fog, 38, 95);
  scene.fog = fog;

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: env.top }, mid: { value: env.mid }, bottom: { value: env.bottom } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(mid, bottom, pow(clamp(-h,0.0,1.0), 0.45));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(env.sun, env.sunI);
  sun.position.copy(env.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  function prop(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, outline = 0.05): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    if (outline) withOutline(m, outline);
    scene.add(m);
    return m;
  }

  // floating island
  const island = new THREE.Group();
  scene.add(island);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 14.2, 1.1, 72), toon('#9fd48d'));
  grass.position.y = -0.56; grass.receiveShadow = true; island.add(grass);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(14.25, 12.8, 1.3, 72), toon('#d9a979'));
  rim.position.y = -1.75; island.add(rim);
  const under = new THREE.Mesh(new THREE.ConeGeometry(12.8, 9, 18, 1), toon('#b98a62'));
  under.rotation.x = Math.PI; under.position.y = -6.9; island.add(under);
  const rocks = new THREE.Group(); scene.add(rocks);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.7, 1.5), 0), toon('#a77c58'));
    r.position.set(Math.cos(a) * rand(7, 10), rand(-6.5, -3.5), Math.sin(a) * rand(7, 10));
    r.rotation.set(rand(0, 3), rand(0, 3), 0);
    rocks.add(r);
  }

  // plaza floor (radial tiles drawn on a canvas)
  const plazaTex = canvasTex(1024, 1024, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#f6ead8'; g.fillRect(0, 0, w, h);
    const rings = 9;
    for (let r = 0; r < rings; r++) {
      const r0 = (r / rings) * (w / 2), r1 = ((r + 1) / rings) * (w / 2);
      const segs = 10 + r * 6;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
        g.beginPath(); g.arc(cx, cy, r1 - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cy, r0 + 3, a1 - 0.01, a0 + 0.01, true); g.closePath();
        const tone = (r + s) % 3;
        g.fillStyle = r === rings - 1 ? '#f2c6cf' : tone === 0 ? '#fbf3e6' : tone === 1 ? '#f4e4cf' : '#efdcc4';
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(160,120,90,0.35)'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, w / 2 - 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,111,151,0.18)';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * h * 0.33, 14, 0, Math.PI * 2); g.fill();
    }
  });
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9.2, 96), new THREE.MeshToonMaterial({ map: plazaTex, gradientMap: gradTex }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.012; plaza.receiveShadow = true;
  scene.add(plaza);
  const border = new THREE.Mesh(new THREE.TorusGeometry(9.25, 0.12, 8, 96), toon('#f4b860'));
  border.rotation.x = Math.PI / 2; border.position.y = 0.05; scene.add(border);

  // fountain (kept low so the 2D characters never need to hide behind it)
  prop(new THREE.CylinderGeometry(1.75, 1.95, 0.42, 40), toon('#fff8f0'), 0, 0.21, 0, 0.03);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.52, 40), new THREE.MeshToonMaterial({ color: '#8fd3ff', gradientMap: gradTex, emissive: '#2a6fa8', emissiveIntensity: 0.15 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.425; scene.add(water);
  prop(new THREE.CylinderGeometry(0.32, 0.42, 0.55, 20), toon('#fff8f0'), 0, 0.62, 0, 0.06);
  const droplets: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#cdeeff' }));
    d.userData = { a: (i / 16) * Math.PI * 2, t: Math.random() };
    scene.add(d); droplets.push(d);
  }

  // back gallery: arches, banners, sign — all outside the walkable circle
  const ARCH_COLORS = ['#ffd3e0', '#d9ecff', '#fff1c7', '#dff5df', '#e9ddff'];
  const BANNERS = ['委託', '巡展', 'OC', '作業', '完成'];
  const GEM_COLORS = ['#ff8fae', '#7fb6ff', '#ffc85c', '#7fd48f', '#b49bff'];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1.18 + i * 0.16);
    const x = Math.cos(a) * 11.2, z = Math.sin(a) * 11.2;
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.lookAt(0, 0, 0);
    scene.add(g);
    const mat = toon(ARCH_COLORS[i]);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.42), mat);
      p.position.set(s * 1.15, 1.7, 0); p.castShadow = true; withOutline(p, 0.06); g.add(p);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.21, 10, 24, Math.PI), mat);
    arch.position.set(0, 3.4, 0); arch.castShadow = true; withOutline(arch, 0.07); g.add(arch);
    const tex = canvasTex(256, 384, (c, w, h) => {
      c.fillStyle = GEM_COLORS[i]; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 36);
      c.beginPath(); c.moveTo(0, h); c.lineTo(w / 2, h - 50); c.lineTo(w, h); c.fillStyle = '#ffffff'; c.fill();
      c.fillStyle = '#fff'; c.font = `bold ${BANNERS[i].length > 2 ? 64 : 92}px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(BANNERS[i], w / 2, h * 0.46);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.85), new THREE.MeshToonMaterial({ map: tex, gradientMap: gradTex, side: THREE.DoubleSide }));
    banner.position.set(0, 2.15, 0.05); g.add(banner);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.7, 20), toon('#fffaf2'));
    ped.position.set(0, 0.35, 1.6); ped.castShadow = true; withOutline(ped, 0.05); g.add(ped);
    const gem = new THREE.Mesh(i % 2 ? new THREE.OctahedronGeometry(0.32) : new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.MeshToonMaterial({ color: GEM_COLORS[i], gradientMap: gradTex, emissive: '#ffffff', emissiveIntensity: 0.15 }));
    gem.position.set(0, 1.25, 1.6); gem.castShadow = true; withOutline(gem, 0.08); g.add(gem);
    gem.userData.spin = rand(0.6, 1.1); gem.userData.base = 1.25;
    droplets.push(gem);
  }
  const signTex = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 60); c.fill();
    c.lineWidth = 10; c.strokeStyle = '#3b2e52'; c.stroke();
    c.fillStyle = '#ff6f97'; c.beginPath(); c.roundRect(34, 34, w - 68, h - 68, 44); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 112px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OC 巡展廣場', w / 2, h / 2 + 6);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  sign.position.set(0, 4.75, -12.2); scene.add(sign);
  for (const s of [-1, 1]) prop(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 10), toon('#3b2e52'), s * 2.9, 2.2, -12.25, 0);

  // lamps + bunting around the back half
  const lampMats: THREE.MeshToonMaterial[] = [];
  const lampPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1.02 + i * 0.12);
    const x = Math.cos(a) * 9.9, z = Math.sin(a) * 9.9;
    prop(new THREE.CylinderGeometry(0.08, 0.11, 2.6, 8), toon('#4a3d63'), x, 1.3, z, 0);
    const bm = new THREE.MeshToonMaterial({ color: '#fff3c4', gradientMap: gradTex, emissive: '#ffcf6b', emissiveIntensity: env.lamp });
    lampMats.push(bm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), bm);
    bulb.position.set(x, 2.72, z); withOutline(bulb, 0.08); scene.add(bulb);
    lampPts.push(new THREE.Vector3(x, 2.45, z));
  }
  for (let i = 0; i < lampPts.length - 1; i++) {
    const a = lampPts[i], b = lampPts[i + 1];
    const n = 7;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 0.45;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 3), new THREE.MeshToonMaterial({ color: GEM_COLORS[(i + k) % 5], gradientMap: gradTex }));
      f.position.copy(p); f.position.y -= 0.16; f.rotation.x = Math.PI;
      scene.add(f);
    }
  }

  // trees (low-poly) on the back / sides
  function tree(x: number, z: number, s = 1): THREE.Group {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.3, 8), toon('#9a6b4a'));
    trunk.position.y = 0.65; trunk.castShadow = true; withOutline(trunk, 0.08); g.add(trunk);
    const cols = ['#7cc77a', '#93d68a', '#6fb873'];
    ([[0, 1.9, 0, 1.0], [0.45, 1.55, 0.2, 0.7], [-0.4, 1.6, -0.1, 0.72], [0, 2.55, 0, 0.62]] as const).forEach(([dx, dy, dz, r], k) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), toon(cols[k % 3]));
      b.position.set(dx, dy, dz); b.castShadow = true; withOutline(b, 0.05); g.add(b);
    });
    return g;
  }
  ([[-13.2, -6.5, 1.25], [13.2, -6.5, 1.2], [-10.5, -11.5, 1.1], [10.5, -11.5, 1.15], [-14.2, -1.5, 1.0], [14.2, -1.8, 0.95], [-6.2, -13.4, 0.95], [6.4, -13.4, 1.0]] as const)
    .forEach(([x, z, s]) => tree(x, z, s));
  // flower patches: flat, near the plaza border
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r = rand(9.8, 14.6);
    const f = new THREE.Mesh(new THREE.SphereGeometry(rand(0.09, 0.15), 6, 5), new THREE.MeshToonMaterial({ color: pick(['#ffffff', '#ffd1e0', '#fff1a8', '#d7c6ff']), gradientMap: gradTex }));
    f.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r); scene.add(f);
  }
  // clouds below / around the island
  const clouds: THREE.Group[] = [];
  const cloudMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradTex, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(rand(1.2, 2.4), 12, 10), cloudMat);
      b.position.set(k * 1.6 - 3.2, rand(-0.4, 0.5), rand(-0.8, 0.8)); g.add(b);
    }
    const a = rand(0, Math.PI * 2), r = rand(24, 46);
    g.position.set(Math.cos(a) * r, rand(-14, 6), Math.sin(a) * r);
    g.userData.speed = rand(0.15, 0.4);
    scene.add(g); clouds.push(g);
  }

  // ---------------------------------------------------------------- floor helpers (shadows, selection ring, click marker)
  const shadowTex = canvasTex(128, 128, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(40,25,60,0.55)'); gr.addColorStop(0.6, 'rgba(40,25,60,0.25)'); gr.addColorStop(1, 'rgba(40,25,60,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const shadowGeo = new THREE.PlaneGeometry(1.3, 0.62);
  const ringGeo = new THREE.RingGeometry(0.62, 0.78, 48);
  const selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff6f97', transparent: true, opacity: 0.9, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.03; selRing.scale.set(1, 0.6 / 0.78 * 0.78 * 1.0, 1);
  scene.add(selRing);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.035; scene.add(marker);
  let markerT = 1;

  return {
    scene, shadowTex, shadowGeo,
    toggleTime() {
      envTarget = envTarget === DAY ? DUSK : DAY;
      return envTarget === DAY;
    },
    showMarker(x, z) {
      marker.position.set(x, 0.035, z); markerT = 0;
    },
    update(dt, t, selectedPos) {
      // environment blend (day <-> dusk)
      const k = 1 - Math.exp(-2.2 * dt);
      for (const key of COLOR_KEYS) env[key].lerp(envTarget[key], k);
      env.hemi = lerp(env.hemi, envTarget.hemi, k); env.sunI = lerp(env.sunI, envTarget.sunI, k); env.lamp = lerp(env.lamp, envTarget.lamp, k);
      env.sunPos.lerp(envTarget.sunPos, k);
      fog.color.copy(env.fog);
      hemi.color.copy(env.hemiSky); hemi.groundColor.copy(env.hemiGround); hemi.intensity = env.hemi;
      sun.color.copy(env.sun); sun.intensity = env.sunI; sun.position.copy(env.sunPos);
      lampMats.forEach((m) => { m.emissiveIntensity = env.lamp; });

      // ambient motion
      water.material.emissiveIntensity = 0.15 + Math.sin(t * 2) * 0.05;
      droplets.forEach((d) => {
        if (d.userData.spin) { d.rotation.y += dt * d.userData.spin; d.position.y = d.userData.base + Math.sin(t * 1.6 + d.userData.spin * 5) * 0.12; return; }
        const u = (d.userData.t + t * 0.55) % 1;
        const a = d.userData.a, r = 0.15 + u * 1.05;
        d.position.set(Math.cos(a) * r, 0.92 + Math.sin(u * Math.PI) * 0.85 - u * 0.4, Math.sin(a) * r);
      });
      clouds.forEach((c) => { c.position.x += c.userData.speed * dt; if (c.position.x > 52) c.position.x = -52; });
      rocks.position.y = Math.sin(t * 0.6) * 0.12;
      selRing.visible = selectedPos !== null;
      if (selectedPos) selRing.position.set(selectedPos.x, 0.03, selectedPos.z);
      selRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
      selRing.material.opacity = 0.75 + Math.sin(t * 5) * 0.15;
      if (markerT < 1) { markerT += dt * 1.6; marker.scale.setScalar(1 + markerT * 2.2); marker.material.opacity = (1 - markerT) * 0.9; }
    },
  };
}
