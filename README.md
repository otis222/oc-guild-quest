# 公會委託單（暫名）

大同大學媒體設計學系「數位創作與整合」第 29 組的課堂原型。

把基礎課作業拆成 10 分鐘的公會委託：每完成一個任務，OC 設定卡亮一片；交件時，作業成果變成 OC 的一部分，作業照片變成大廳的展品。

**網址：https://otis222.github.io/oc-guild-quest/**　手機直接打開就能玩。

- 不用帳號。進度、作業照片和 OC 圖只存在你自己的瀏覽器（IndexedDB），不會上傳到任何地方。
- 換手機、換瀏覽器或清除網站資料，進度就不見了。
- 需要支援 WebGL2 的瀏覽器（新版的 Chrome、Safari、Edge）。

## 開發

需要 Node.js 18 以上（自動部署用 Node 22）。

```bash
npm install
npm run dev       # 開發伺服器
npm test          # 單元測試（Vitest）
npm run build     # 打包到 dist/
npm run preview   # 預覽打包結果
```

## 部署

push 到 `main` 以後，GitHub Actions（`.github/workflows/deploy.yml`）會跑測試、打包，再部署到 GitHub Pages。測試沒過就不會部署。

## 文件

- `docs/企劃表.md`：企劃、任務卡、規格
- `docs/進度紀錄.md`：每張任務卡做了什麼、怎麼驗收、需要人確認的
- `docs/對映表.md`：紙原型和網頁原型的對照
- `CLAUDE.md`：給 Claude Code 的工作說明
