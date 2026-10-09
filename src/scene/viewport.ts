// 舞台容器的大小（Three.js、PixiJS、鏡頭、輸入共用）

export interface Viewport {
  readonly el: HTMLElement;
  w(): number;
  h(): number;
}

export function createViewport(el: HTMLElement): Viewport {
  return { el, w: () => el.clientWidth, h: () => el.clientHeight };
}
