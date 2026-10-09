// HTML 介面：右上的打招呼、天色按鈕，底部的「委託板」「OC 設定卡」，載入畫面。
import { COPY } from './copy';

export interface HudHandlers {
  onHello(): void;
  /** 切換天色，回傳切換後是不是白天 */
  onToggleTime(): boolean;
}

export interface Hud {
  /** 接上「委託板」按鈕（接上之前按鈕是停用的） */
  onBoard(fn: () => void): void;
  hideLoading(): void;
  /** 載入畫面改成顯示錯誤訊息，不關掉 */
  showError(text: string): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到 #${id}`);
  return el as T;
};

export function createHud(h: HudHandlers): Hud {
  const btnHi = $<HTMLButtonElement>('btnHi');
  btnHi.textContent = COPY.hud.hello;
  btnHi.addEventListener('click', () => h.onHello());
  const btnTime = $<HTMLButtonElement>('btnTime');
  btnTime.textContent = COPY.hud.toDusk;
  btnTime.addEventListener('click', () => {
    btnTime.textContent = h.onToggleTime() ? COPY.hud.toDusk : COPY.hud.toDay;
  });

  const loading = $('loading');
  const btnBoard = $<HTMLButtonElement>('btnBoard');
  return {
    onBoard(fn) {
      btnBoard.addEventListener('click', fn);
      btnBoard.disabled = false;
    },
    hideLoading() {
      loading.classList.add('hide');
    },
    showError(text) {
      loading.textContent = text;
      loading.classList.remove('hide');
      loading.classList.add('error');
    },
  };
}
