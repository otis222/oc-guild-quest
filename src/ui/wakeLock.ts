// 計時中讓螢幕不要自己暗掉（瀏覽器支援 Screen Wake Lock 才有用；不支援就什麼都不做）。
// 切到別的 App 時瀏覽器會自動放掉，切回來再要一次。

export interface WakeLock {
  set(on: boolean): void;
}

export function createWakeLock(): WakeLock {
  let want = false;
  let sentinel: WakeLockSentinel | null = null;
  let pending = false;

  async function acquire(): Promise<void> {
    if (!want || sentinel || pending || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    pending = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!want) { void s.release(); return; }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    } catch {
      // 省電模式、權限政策等原因拿不到就算了
    } finally {
      pending = false;
    }
  }

  document.addEventListener('visibilitychange', () => { void acquire(); });

  return {
    set(on) {
      want = on;
      if (on) void acquire();
      else if (sentinel) { void sentinel.release(); sentinel = null; }
    },
  };
}
