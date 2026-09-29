const normalizeRoles = (roles: string[] | null | undefined): string[] =>
  Array.isArray(roles) ? roles : []

const normalizeRole = (role: string): string => role.trim().toUpperCase()

export const hasProvincialSubmitterRole = (roles: string[] | null | undefined): boolean => {
  return normalizeRoles(roles).some((role) => {
    const normalizedRole = normalizeRole(role)
    return (
      normalizedRole === 'PROVINCIAL_SUBMITTER' ||
      normalizedRole === 'LEXIS_PROVINCIAL_SUBMITTER' ||
      normalizedRole.startsWith('PROVINCIAL_SUBMITTER_') ||
      normalizedRole.startsWith('LEXIS_PROVINCIAL_SUBMITTER_')
    )
  })
}

export const hasRole = (roles: string[] | null | undefined, role: string): boolean => {
  const expectedRole = normalizeRole(role)
  return normalizeRoles(roles).some((entry) => {
    const normalizedRole = normalizeRole(entry)
    return normalizedRole === expectedRole || normalizedRole === `LEXIS_${expectedRole}`
  })
}

export const isPureReadOnlyRole = (roles: string[] | null | undefined): boolean =>
  normalizeRoles(roles).length === 1 && hasRole(roles, 'READ_ONLY')

// Mirrors the backend rule: only Application Approver and Read Only (or Administrator) see
// non-Ministerial exemptions, so a user whose staff role is Exemption Approver sees Ministerial only.
export const isPureExemptionApprover = (roles: string[] | null | undefined): boolean =>
  hasRole(roles, 'EXEMPTION_APPROVER') &&
  !['ADMIN', 'APPLICATION_APPROVER', 'READ_ONLY'].some((role) => hasRole(roles, role)) &&
  !hasProvincialSubmitterRole(roles)

export const hasProvincialStaffRole = (roles: string[] | null | undefined): boolean =>
  ['ADMIN', 'READ_ONLY', 'APPLICATION_APPROVER', 'EXEMPTION_APPROVER'].some((role) =>
    hasRole(roles, role),
  )
