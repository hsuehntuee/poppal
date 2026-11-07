/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
interface ImportMetaEnv {
  /** 服務頁所在的 origin（預設同源 ''） */
  readonly VITE_SERVICES_BASE?: string;
  /** LLM 引擎網址（預設 '/llm'，由 serve-local / nginx 轉發） */
  readonly VITE_LLM_URL?: string;
}
declare const flutterObject: { postMessage(s: string): void; addEventListener(t: string, cb: (e: { data: string }) => void): void; removeEventListener(t: string, cb: (e: { data: string }) => void): void } | undefined;
declare const __OVERLAY_BUILD__: string;
declare const __APP_BUILD__: string;
