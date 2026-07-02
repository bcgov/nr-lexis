import { describe, expect, it } from 'vitest'
import {
  hasFederalSubmitterRole,
  hasProvincialSubmitterRole,
  hasRole,
} from '@/context/auth/role-utils'

describe('auth role utilities', () => {
  it('recognizes canonical and LEXIS-prefixed roles case-insensitively', () => {
    expect(hasRole([' admin '], 'ADMIN')).toBe(true)
    expect(hasRole(['LEXIS_APPLICATION_APPROVER'], 'APPLICATION_APPROVER')).toBe(true)
    expect(hasRole(['lexis_exemption_approver'], 'EXEMPTION_APPROVER')).toBe(true)
    expect(hasRole(['READ_ONLY'], 'ADMIN')).toBe(false)
  })

  it('recognizes provincial submitter role aliases', () => {
    expect(hasProvincialSubmitterRole(['PROVINCIAL_SUBMITTER'])).toBe(true)
    expect(hasProvincialSubmitterRole(['LEXIS_PROVINCIAL_SUBMITTER'])).toBe(true)
    expect(hasProvincialSubmitterRole(['PROVINCIAL_SUBMITTER_00012345'])).toBe(true)
    expect(hasProvincialSubmitterRole(['LEXIS_PROVINCIAL_SUBMITTER_00012345'])).toBe(true)
    expect(hasProvincialSubmitterRole(['LEXIS_INDUSTRY_00012345'])).toBe(false)
  })

  it('recognizes federal submitter role aliases', () => {
    expect(hasFederalSubmitterRole(['FEDERAL_SUBMITTER'])).toBe(true)
    expect(hasFederalSubmitterRole(['LEXIS_FEDERAL_SUBMITTER'])).toBe(true)
    expect(hasFederalSubmitterRole(['FEDERAL_SUBMITTER_00012345'])).toBe(true)
    expect(hasFederalSubmitterRole(['LEXIS_FEDERAL_SUBMITTER_00012345'])).toBe(true)
    expect(hasFederalSubmitterRole(['LEXIS_INDUSTRY_00012345'])).toBe(false)
  })

  it('handles empty or missing role lists', () => {
    expect(hasRole(undefined, 'ADMIN')).toBe(false)
    expect(hasProvincialSubmitterRole(null)).toBe(false)
    expect(hasFederalSubmitterRole([])).toBe(false)
  })
})
