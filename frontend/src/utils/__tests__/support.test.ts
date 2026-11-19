import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { userManualsForRoles } from '../support'

describe('userManualsForRoles', () => {
  it('returns a single unlabelled manual for one ministry role', () => {
    expect(userManualsForRoles(['ADMIN'])).toEqual([
      { label: 'User manual', href: '/manuals/LEXIS-Administrator-User-Manual.pdf' },
    ])
  })

  it('returns labelled manuals in fixed order for two roles', () => {
    expect(userManualsForRoles(['READ_ONLY', 'EXEMPTION_APPROVER'])).toEqual([
      {
        label: 'User manual (Exemption Approver)',
        href: '/manuals/LEXIS-Exemption-Approver-User-Manual.pdf',
      },
      { label: 'User manual (Read Only)', href: '/manuals/LEXIS-Read-Only-User-Manual.pdf' },
    ])
  })

  it('offers no manual to Federal Read Only', () => {
    expect(userManualsForRoles(['FEDERAL_READ_ONLY'])).toEqual([])
  })

  it('maps regional provincial submitter roles to the industry manual', () => {
    expect(userManualsForRoles([' provincial_submitter_rco '])).toEqual([
      { label: 'User manual', href: '/manuals/LEXIS-Industry-User-Manual.pdf' },
    ])
  })

  it('returns both approver manuals for a user holding both approver roles', () => {
    expect(userManualsForRoles(['EXEMPTION_APPROVER', 'APPLICATION_APPROVER'])).toEqual([
      {
        label: 'User manual (Application Approver)',
        href: '/manuals/LEXIS-Application-Approver-User-Manual.pdf',
      },
      {
        label: 'User manual (Exemption Approver)',
        href: '/manuals/LEXIS-Exemption-Approver-User-Manual.pdf',
      },
    ])
  })

  it('links only to manuals that are in public/manuals', () => {
    const everyManual = userManualsForRoles([
      'ADMIN',
      'APPLICATION_APPROVER',
      'EXEMPTION_APPROVER',
      'READ_ONLY',
      'PROVINCIAL_SUBMITTER',
    ])
    expect(everyManual).toHaveLength(5)
    for (const { href } of everyManual) {
      expect(existsSync(path.join(process.cwd(), 'public', href)), href).toBe(true)
    }
  })

  it('returns nothing without known roles', () => {
    expect(userManualsForRoles(['SOMETHING_ELSE'])).toEqual([])
    expect(userManualsForRoles([])).toEqual([])
    expect(userManualsForRoles(null)).toEqual([])
    expect(userManualsForRoles(undefined)).toEqual([])
  })
})
