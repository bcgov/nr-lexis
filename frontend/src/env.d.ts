/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_URL?: string
  readonly VITE_LOGOUT_URL?: string
  readonly VITE_ENABLE_DEV_ROLE_SIMULATION?: string
  readonly VITE_ENABLE_SEARCH_MOCK_FALLBACK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
