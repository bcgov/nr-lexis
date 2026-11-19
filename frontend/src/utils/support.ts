const SUPPORT_EMAIL = 'Heartwood@gov.bc.ca'

/** Where "Report an issue" leads, in the side navigation and in failure messages. */
export const REPORT_ISSUE_HREF = `mailto:${SUPPORT_EMAIL}`

const isIndustryRole = (role: string): boolean =>
  role === 'PROVINCIAL_SUBMITTER' ||
  role.startsWith('PROVINCIAL_SUBMITTER_') ||
  role === 'FEDERAL_READ_ONLY'

const USER_MANUALS = [
  {
    name: 'Administrator',
    href: '/manuals/LEXIS-Administrator-User-Manual.pdf',
    appliesTo: (role: string) => role === 'ADMIN',
  },
  {
    name: 'Application Approver',
    href: '/manuals/LEXIS-Application-Approver-User-Manual.pdf',
    appliesTo: (role: string) => role === 'APPLICATION_APPROVER',
  },
  {
    name: 'Exemption Approver',
    href: '/manuals/LEXIS-Exemption-Approver-User-Manual.pdf',
    appliesTo: (role: string) => role === 'EXEMPTION_APPROVER',
  },
  {
    name: 'Read Only',
    href: '/manuals/LEXIS-Read-Only-User-Manual.pdf',
    appliesTo: (role: string) => role === 'READ_ONLY',
  },
  {
    name: 'Industry',
    href: '/manuals/LEXIS-Industry-User-Manual.pdf',
    appliesTo: isIndustryRole,
  },
]

/** One download link per distinct user manual the roles map to; labelled by manual when several. */
export const userManualsForRoles = (
  roles: string[] | null | undefined,
): { label: string; href: string }[] => {
  const normalizedRoles = (roles ?? []).map((role) => role.trim().toUpperCase())
  const manuals = USER_MANUALS.filter((manual) => normalizedRoles.some(manual.appliesTo))
  return manuals.map((manual) => ({
    label: manuals.length === 1 ? 'User manual' : `User manual (${manual.name})`,
    href: manual.href,
  }))
}
