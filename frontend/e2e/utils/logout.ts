import type { Page } from '@playwright/test'
import { E2E_BASE_URL } from './index'

const SITEMINDER_LOGOFF_PATH = '/clp-cgi/logoff.cgi'
const END_SESSION_PATH = '/protocol/openid-connect/logout'

// Answers the SiteMinder logoff and realm end-session requests with a redirect to the login shell.
export const redirectExternalLogoutToLoginShell = async (
  page: Page,
  onEndSessionRequest?: (endSessionUrl: URL) => void,
): Promise<void> => {
  const loginShellUrl = `${new URL(E2E_BASE_URL).origin}/`

  await page.route(
    (url) =>
      url.pathname.endsWith(SITEMINDER_LOGOFF_PATH) || url.pathname.endsWith(END_SESSION_PATH),
    async (route) => {
      const requestUrl = new URL(route.request().url())
      // SiteMinder carries the end-session URL in returl.
      const returnUrl = requestUrl.searchParams.get('returl')
      onEndSessionRequest?.(returnUrl ? new URL(returnUrl) : requestUrl)
      await route.fulfill({ status: 302, headers: { location: loginShellUrl }, body: '' })
    },
  )
}
