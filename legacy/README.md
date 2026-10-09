# legacy：原始 demo（只讀）

- `oc_plaza_demo.html`：可以直接用瀏覽器打開的完整 demo（小人圖已經用 base64 塞進檔案裡，需要連網載入 Three.js 和 PixiJS）。
- `oc_plaza_demo.template.html`：同一份 demo 的原始碼。`const CHARS = /*__CHARS__*/[];` 這行在打包時會被換成小人資料
  （`[{ name, src: "data:image/png;base64,..." }]`）。搬進 Vite 時改成讀 `public/sprites/manifest.json`。
- 技術：Three.js 0.170.0 畫 3D 大廳，PixiJS 8.13.2 用同一個 WebGL context 畫 2D 小人
  （每幀先 `three.resetState(); three.render(...)`，再 `pixi.resetState(); pixi.render(...)`）。
- 小人：一張圖，不拆件。走路是上下彈跳＋壓扁拉伸＋左右翻轉，腳下的影子畫在 3D 地板上，前後順序用相機空間深度排序。
- 已知限制：PixiJS 畫的小人永遠在 3D 物件前面，所以高的物件都放在廣場後方，小人走不到它們後面。
