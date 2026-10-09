// HTML 介面：右上的「全員打招呼」「切換黃昏」、底部的「委託板」「OC 設定卡」、載入畫面。

export interface HudHandlers {
  onHello(): void;
  /** 切換天色，回傳切換後是不是白天 */
  onToggleTime(): boolean;
}

export interface Hud {
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
  $('btnHi').addEventListener('click', () => h.onHello());
  const btnTime = $<HTMLButtonElement>('btnTime');
  btnTime.addEventListener('click', () => {
    btnTime.textContent = h.onToggleTime() ? '切換黃昏' : '切換白天';
  });

  const loading = $('loading');
  return {
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
