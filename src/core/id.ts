// 產生不重複的 id：建立時間（36 進位）＋ 64 位元亂數。
// 不用 crypto.randomUUID()：它只在 https 和 localhost 能用，手機連電腦的區網 IP 測試時會壞。

export function newId(now = Date.now()): string {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return `${now.toString(36)}-${Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
