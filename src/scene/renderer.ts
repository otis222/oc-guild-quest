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
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export async function createRenderers(vp: Viewport): Promise<Renderers> {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const three = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  three.setPixelRatio(DPR);
  three.setSize(vp.w(), vp.h());
  three.shadowMap.enabled = true;
  three.shadowMap.type = THREE.PCFSoftShadowMap;
  three.toneMapping = THREE.ACESFilmicToneMapping;
  three.toneMappingExposure = 1.02;
  vp.el.appendChild(three.domElement);

  const pixi = new PixiRenderer();
  await pixi.init({
    // three r163 以後只會建 WebGL2（型別還寫著 WebGL1）
    context: three.getContext() as WebGL2RenderingContext, width: vp.w(), height: vp.h(), resolution: DPR,
    clearBeforeRender: false, antialias: true,
  });
  const stage2d = new Container();
  const charLayer = new Container();
  charLayer.sortableChildren = true;
  stage2d.addChild(charLayer);

  return {
    three, pixi, stage2d, charLayer,
    resize() {
      three.setSize(vp.w(), vp.h());
      pixi.resize(vp.w(), vp.h());
    },
    render(scene, camera) {
      three.resetState();
      three.render(scene, camera);
      pixi.resetState();
      pixi.render({ container: stage2d });
    },
  };
}
