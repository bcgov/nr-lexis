import { env } from '@/env'

const DEFAULT_FAM_MANAGE_URLS: Record<string, string> = {
  dev: 'https://fam-dev.nrs.gov.bc.ca',
  local: 'https://fam-dev.nrs.gov.bc.ca',
  test: 'https://fam-tst.nrs.gov.bc.ca',
  tst: 'https://fam-tst.nrs.gov.bc.ca',
  tools: 'https://fam-tools.nrs.gov.bc.ca',
  prod: 'https://fam.nrs.gov.bc.ca',
  production: 'https://fam.nrs.gov.bc.ca',
}

export const resolveFamManageUrl = (): string => {
  const configured = env.VITE_FAM_MANAGE_URL?.trim()
  if (configured) {
    return configured
  }

  const zone = env.VITE_ZONE?.trim().toLowerCase() ?? 'dev'
  return DEFAULT_FAM_MANAGE_URLS[zone] ?? DEFAULT_FAM_MANAGE_URLS.dev
}
