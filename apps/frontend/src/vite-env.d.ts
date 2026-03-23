/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __AI_TRADER_RUNTIME__?: {
    apiBase?: string;
    backendUrl?: string;
    frontendUrl?: string;
    generatedAt?: string;
  };
}
