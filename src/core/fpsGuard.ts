// FPS 偏低時自動降畫質（企劃表 T8）：每秒算一次 FPS，連續 3 秒都低於 40 就通知一次，之後不再通知。
// 不做畫質設定頁。剛載入的前 2 秒不算（貼圖上傳、著色器編譯會卡一下）；
// 分頁切到背景再回來時，一幀會超過 0.5 秒，這時重新開始算，不會被當成卡頓。

/** 低於這個 FPS 算卡 */
export const LOW_FPS = 40;
/** 連續卡幾秒才降畫質 */
export const LOW_SECONDS = 3;
/** 剛開始的幾秒不算 */
export const WARMUP_SECONDS = 2;
/** 一幀超過這麼久，當成分頁暫停過，重新算 */
const GAP_SECONDS = 0.5;

export interface FpsGuard {
  /** 每幀呼叫一次，dt 是這一幀真實經過的秒數；該降畫質的那一幀回傳 true（只會有一次） */
  tick(dt: number): boolean;
  /** 已經降過畫質了 */
  readonly lowered: boolean;
}

export function createFpsGuard(threshold = LOW_FPS, seconds = LOW_SECONDS): FpsGuard {
  let warm = 0, frames = 0, elapsed = 0, slowSeconds = 0, lowered = false;
  return {
    get lowered() { return lowered; },
    tick(dt) {
      if (lowered) return false;
      if (dt > GAP_SECONDS) {
        frames = 0; elapsed = 0; slowSeconds = 0;
        return false;
      }
      if (warm < WARMUP_SECONDS) { warm += dt; return false; }
      frames++; elapsed += dt;
      if (elapsed < 1) return false;
      const fps = frames / elapsed;
      frames = 0; elapsed = 0;
      slowSeconds = fps < threshold ? slowSeconds + 1 : 0;
      if (slowSeconds < seconds) return false;
      lowered = true;
      return true;
    },
  };
}
