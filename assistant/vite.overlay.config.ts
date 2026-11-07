import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// 引導層：打包成單一 IIFE 檔 dist/guide-overlay.js，
// 由 nginx / serve-local 注入到服務頁，或由 TownPass 用 initialUserScripts 注入。
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  define: {
    // overlay 不在 vite app 裡，import.meta.env.BASE_URL 用不到；catalog.ts 會退回 window 設定
    'import.meta.env.BASE_URL': JSON.stringify('/assistant/'),
    'import.meta.env.VITE_LLM_URL': JSON.stringify(process.env.VITE_LLM_URL ?? ''),
    __OVERLAY_BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' '))
  },
  build: {
    target: 'es2018',
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL('./src/overlay/index.ts', import.meta.url)),
      name: 'TPGuide',
      formats: ['iife'],
      fileName: () => 'guide-overlay.js'
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
