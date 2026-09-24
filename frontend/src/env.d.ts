/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OIDC_ISSUER_URI?: string
  readonly VITE_OIDC_CLIENT_ID?: string
  readonly VITE_OIDC_IDIR_HINT?: string
  readonly VITE_OIDC_BCEID_HINT?: string
  readonly VITE_OIDC_SITEMINDER_LOGOUT_URL?: string
  readonly VITE_LEXIS_PROD_RTM_ONLY?: string
  readonly VITE_LEXIS_REPORT_ENDPOINT_BASE?: string
  readonly VITE_LEXIS_REPORT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  config: Record<string, string>
}
