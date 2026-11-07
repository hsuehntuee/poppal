import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 小幫手一律部署在 /assistant/ 底下（服務頁在 /）。
export default defineConfig({
  base: '/assistant/',
  plugins: [vue()],
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    host: true,
    port: 5174,
    // 開發時把 /llm 轉到本機 llama-server
    proxy: {
      '/llm': { target: process.env.LLM_URL || 'http://127.0.0.1:8080', changeOrigin: true, rewrite: (p) => p.replace(/^\/llm/, '') }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true
  }
});
