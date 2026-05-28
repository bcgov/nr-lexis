const DEV_ROLES_STORAGE_KEY = 'lexis.dev.roles'

const normalizeRole = (role: string): string => role.trim().toUpperCase()

export const normalizeRoles = (roles: string[]): string[] => {
  const uniqueRoles = new Set<string>()

  roles
    .map(normalizeRole)
    .filter((role) => role.length > 0)
    .forEach((role) => uniqueRoles.add(role))

  return Array.from(uniqueRoles)
}

export const readDevRoles = (): string[] => {
  try {
    const rawValue = localStorage.getItem(DEV_ROLES_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsedValue = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }

    return normalizeRoles(parsedValue.filter((value): value is string => typeof value === 'string'))
  } catch (error) {
    console.warn('Unable to parse stored development roles.', error)
    return []
  }
}

export const writeDevRoles = (roles: string[]): void => {
  const normalizedRoles = normalizeRoles(roles)
  localStorage.setItem(DEV_ROLES_STORAGE_KEY, JSON.stringify(normalizedRoles))
}

export const clearDevRoles = (): void => {
  localStorage.removeItem(DEV_ROLES_STORAGE_KEY)
}

export const getDevRolesHeaderValue = (): string | null => {
  const roles = readDevRoles()
  if (roles.length === 0) {
    return null
  }

  return roles.join(',')
}
