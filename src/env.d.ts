// 建置時的設定（Vite 的 import.meta.env）
interface ImportMetaEnv {
  /** 專屬小人收件處（組員 Google 帳號裡的 Apps Script 網頁應用程式）的網址；沒設定就不顯示專屬小人（T19） */
  readonly VITE_CHIBI_ENDPOINT?: string;
}
