// HTML 介面：右上的「全員打招呼」「切換黃昏」、底部角色列表、載入畫面。

export interface HudHandlers {
  onHello(): void;
  /** 切換天色，回傳切換後是不是白天 */
  onToggleTime(): boolean;
}

export interface RosterItem { name: string; src: string }

export interface Hud {
  setRoster(items: readonly RosterItem[], onPick: (index: number) => void): void;
  setSelected(index: number): void;
  hideLoading(): void;
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

  const roster = $('roster');
  let buttons: HTMLButtonElement[] = [];

  return {
    setRoster(items, onPick) {
      roster.replaceChildren();
      buttons = items.map((item, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'who'; b.setAttribute('aria-pressed', 'false');
        const img = document.createElement('img');
        img.alt = ''; img.src = item.src;
        const span = document.createElement('span');
        span.textContent = item.name;
        b.append(img, span);
        b.addEventListener('click', () => onPick(i));
        roster.appendChild(b);
        return b;
      });
    },
    setSelected(index) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    },
    hideLoading() {
      $('loading').classList.add('hide');
    },
  };
}
