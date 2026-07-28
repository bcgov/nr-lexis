const PAGE_UNLOAD_AUTHORIZATION_WINDOW_MS = 1_000

let pageUnloadAuthorizedUntil = 0

export const authorizePageUnload = (): void => {
  pageUnloadAuthorizedUntil = Date.now() + PAGE_UNLOAD_AUTHORIZATION_WINDOW_MS
}

export const isPageUnloadAuthorized = (): boolean => Date.now() < pageUnloadAuthorizedUntil

export const reloadPageIgnoringUnsavedChanges = (): void => {
  authorizePageUnload()
  window.location.reload()
}
