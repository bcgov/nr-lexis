import { describe, expect, it } from 'vitest'
import {
  getConfiguredBasePath,
  getConfiguredString,
  isEnabledConfig,
} from '@/service/service-config-utils'

describe('service-config-utils', () => {
  it('uses trimmed configured strings when present', () => {
    expect(getConfiguredString(' /lexis/custom ', '/lexis/fallback')).toBe('/lexis/custom')
    expect(getConfiguredString('', '/lexis/fallback')).toBe('/lexis/fallback')
    expect(getConfiguredString(undefined, '/lexis/fallback')).toBe('/lexis/fallback')
  })

  it('normalizes configured base paths without changing empty fallbacks', () => {
    expect(getConfiguredBasePath('/lexis/reports/', '/lexis/fallback')).toBe('/lexis/reports')
    expect(getConfiguredBasePath(' ', '/lexis/fallback')).toBe('/lexis/fallback')
  })

  it('treats common disabled flag values as false', () => {
    expect(isEnabledConfig(undefined)).toBe(true)
    expect(isEnabledConfig('true')).toBe(true)
    expect(isEnabledConfig('0')).toBe(false)
    expect(isEnabledConfig(' false ')).toBe(false)
    expect(isEnabledConfig('no')).toBe(false)
  })
})
