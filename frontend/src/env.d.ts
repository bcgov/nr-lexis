/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_POOLS_ID?: string
  readonly VITE_USER_POOLS_WEB_CLIENT_ID?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_COGNITO_SCOPES?: string
  readonly VITE_REDIRECT_SIGN_IN?: string
  readonly VITE_REDIRECT_SIGN_OUT?: string
  readonly VITE_ZONE?: string
  readonly VITE_LEXIS_REPORT_ENDPOINT_BASE?: string
  readonly VITE_LEXIS_REPORT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  config: Record<string, string>
}
