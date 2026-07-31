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
