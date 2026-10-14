// HTML 介面：右上的打招呼、天色按鈕（研究模式多一顆「研究模式」），底部的「委託板」「OC 設定卡」，載入畫面。
import { COPY } from './copy';

export interface HudHandlers {
  onHello(): void;
  /** 切換天色，回傳切換後是不是白天 */
  onToggleTime(): boolean;
}

export interface Hud {
  /** 接上「委託板」按鈕（接上之前按鈕是停用的） */
  onBoard(fn: () => void): void;
  /** 接上「OC 設定卡」按鈕 */
  onCard(fn: () => void): void;
  /** 研究模式的入口按鈕（只有網址加 ?research=1 時才呼叫；一般網址不會有這顆按鈕） */
  addResearch(fn: () => void): void;
  /** 天色不是按按鈕變的時候（截止前一天自動變黃昏，T12），按鈕上的字跟著換 */
  showTime(day: boolean): void;
  hideLoading(): void;
  /** 載入畫面改成顯示錯誤訊息，不關掉 */
  showError(text: string): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到 #${id}`);
  return el as T;
};

/** 載入畫面改成顯示訊息，不關掉（不支援 WebGL2、啟動失敗、讀不到存檔）。大廳還沒建好也能用 */
export function showLoadingMessage(text: string): void {
  const loading = $('loading');
  loading.textContent = text;
  loading.classList.remove('hide');
  loading.classList.add('error');
}

export function createHud(h: HudHandlers): Hud {
  const btnHi = $<HTMLButtonElement>('btnHi');
  btnHi.textContent = COPY.hud.hello;
  btnHi.addEventListener('click', () => h.onHello());
  const btnTime = $<HTMLButtonElement>('btnTime');
  const showTime = (day: boolean): void => { btnTime.textContent = day ? COPY.hud.toDusk : COPY.hud.toDay; };
  showTime(true);
  btnTime.addEventListener('click', () => showTime(h.onToggleTime()));

  const loading = $('loading');
  const btnBoard = $<HTMLButtonElement>('btnBoard');
  const btnCard = $<HTMLButtonElement>('btnCard');
  return {
    onBoard(fn) {
      btnBoard.addEventListener('click', fn);
      btnBoard.disabled = false;
    },
    onCard(fn) {
      btnCard.addEventListener('click', fn);
      btnCard.disabled = false;
    },
    addResearch(fn) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnResearch';
      btn.textContent = COPY.research.button;
      btn.addEventListener('click', fn);
      btnTime.after(btn);
      // 研究模式時上方按鈕列蓋在載入畫面上面：存檔讀不出來時也按得到，可以匯出資料
      document.body.classList.add('is-research');
    },
    showTime,
    hideLoading() {
      loading.classList.add('hide');
    },
    showError: showLoadingMessage,
  };
}
