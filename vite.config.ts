import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相對路徑：之後部署到 GitHub Pages 的子路徑也不會壞
  base: './',
  // 只從 index.html 找依賴；legacy/ 裡的 demo 是只讀參考，不要被掃進來
  optimizeDeps: { entries: ['index.html'] },
  build: {
    // three.js 本身就超過 500 kB，預設警告沒有意義
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
