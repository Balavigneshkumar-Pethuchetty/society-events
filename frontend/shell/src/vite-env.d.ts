/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: 'dev' | 'test' | 'stage' | 'prod';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
