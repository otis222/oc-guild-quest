// Three.js 和 PixiJS 共用同一個 WebGL context：
// 每幀先 three.resetState() + three.render()，再 pixi.resetState() + pixi.render()，小人疊在 3D 上面。
import * as THREE from 'three';
import { Container, WebGLRenderer as PixiRenderer } from 'pixi.js';
import type { Viewport } from './viewport';

export interface Renderers {
  three: THREE.WebGLRenderer;
  pixi: PixiRenderer;
  /** PixiJS 的根容器 */
  stage2d: Container;
  /** 小人圖層，依深度排序 */
  charLayer: Container;
  resize(): void;
  /** 降畫質（企劃表 T8）：像素比降到 1。陰影在 plaza.setShadows 關 */
  lowerQuality(): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

/** 瀏覽器支不支援 WebGL2（three.js r163 以後只支援 WebGL2）。試完就把測試用的 context 還回去 */
export function supportsWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export async function createRenderers(vp: Viewport): Promise<Renderers> {
  // 像素比上限 2（企劃表 7.8）
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const three = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  three.setPixelRatio(dpr);
  three.setSize(vp.w(), vp.h());
  three.shadowMap.enabled = true;
  three.shadowMap.type = THREE.PCFSoftShadowMap;
  three.toneMapping = THREE.ACESFilmicToneMapping;
  three.toneMappingExposure = 1.02;
  vp.el.appendChild(three.domElement);

  const pixi = new PixiRenderer();
  await pixi.init({
    // three r163 以後只會建 WebGL2（型別還寫著 WebGL1）
    context: three.getContext() as WebGL2RenderingContext, width: vp.w(), height: vp.h(), resolution: dpr,
    clearBeforeRender: false, antialias: true,
  });
  const stage2d = new Container();
  const charLayer = new Container();
  charLayer.sortableChildren = true;
  stage2d.addChild(charLayer);

  function resize(): void {
    three.setSize(vp.w(), vp.h());
    pixi.resize(vp.w(), vp.h(), dpr);
  }

  return {
    three, pixi, stage2d, charLayer, resize,
    lowerQuality() {
      if (dpr === 1) return;
      dpr = 1;
      three.setPixelRatio(dpr);
      resize();
    },
    render(scene, camera) {
      three.resetState();
      three.render(scene, camera);
      pixi.resetState();
      pixi.render({ container: stage2d });
    },
  };
}
