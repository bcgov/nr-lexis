const LOGIN_DESTINATION_KEY = 'lexis.login-destination'

export const clearLoginDestination = (): void => {
  window.sessionStorage.removeItem(LOGIN_DESTINATION_KEY)
}

// The route catalog separately checks that this local URL names a supported route.
export const getLoginDestination = (): string | null => {
  const destination = window.sessionStorage.getItem(LOGIN_DESTINATION_KEY)
  if (
    !destination?.startsWith('/') ||
    destination.startsWith('//') ||
    /[\\\r\n\t]/.test(destination)
  ) {
    return null
  }
  return destination
}

export const setLoginDestination = (destination?: string): void => {
  clearLoginDestination()
  if (destination) {
    window.sessionStorage.setItem(LOGIN_DESTINATION_KEY, destination)
  }
}
