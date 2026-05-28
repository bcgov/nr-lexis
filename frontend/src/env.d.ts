/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_URL?: string
  readonly VITE_LOGOUT_URL?: string
  readonly VITE_ENABLE_DEV_ROLE_SIMULATION?: string
  readonly VITE_ENABLE_SEARCH_MOCK_FALLBACK?: string
  readonly VITE_LEXIS_REPORT_ENDPOINT_BASE?: string
  readonly VITE_LEXIS_REPORT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  config: Record<string, string>
}
