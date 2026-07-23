/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_POOLS_ID?: string
  readonly VITE_USER_POOLS_WEB_CLIENT_ID?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_COGNITO_SCOPES?: string
  readonly VITE_REDIRECT_SIGN_IN?: string
  readonly VITE_REDIRECT_SIGN_OUT?: string
  readonly VITE_LOGOUT_SITEMINDER_URL?: string
  readonly VITE_LOGOUT_KEYCLOAK_URL?: string
  readonly VITE_LOGOUT_KEYCLOAK_CLIENT_ID?: string
  readonly VITE_ZONE?: string
  readonly VITE_LEXIS_PROD_RTM_ONLY?: string
  readonly VITE_FAM_MANAGE_URL?: string
  readonly VITE_LEXIS_REPORT_ENDPOINT_BASE?: string
  readonly VITE_LEXIS_REPORT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  config: Record<string, string>
}
