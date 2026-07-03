import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFamManageUrl } from '@/service/fam-manage-url'

describe('fam-manage-url', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    window.config = {}
  })

  it('defaults local and unknown zones to FAM dev', () => {
    expect(resolveFamManageUrl()).toBe('https://fam-dev.nrs.gov.bc.ca')

    vi.stubEnv('VITE_ZONE', '123')
    expect(resolveFamManageUrl()).toBe('https://fam-dev.nrs.gov.bc.ca')
  })

  it('maps known deployment zones to the FAM vanity domains', () => {
    vi.stubEnv('VITE_ZONE', 'test')
    expect(resolveFamManageUrl()).toBe('https://fam-tst.nrs.gov.bc.ca')

    vi.stubEnv('VITE_ZONE', 'tools')
    expect(resolveFamManageUrl()).toBe('https://fam-tools.nrs.gov.bc.ca')

    vi.stubEnv('VITE_ZONE', 'prod')
    expect(resolveFamManageUrl()).toBe('https://fam.nrs.gov.bc.ca')
  })

  it('lets runtime config override the zone-derived FAM URL', () => {
    vi.stubEnv('VITE_ZONE', 'prod')
    window.config = {
      VITE_FAM_MANAGE_URL: ' https://fam.example.gov.bc.ca/manage ',
    }

    expect(resolveFamManageUrl()).toBe('https://fam.example.gov.bc.ca/manage')
  })
})
