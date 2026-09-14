import type { Locator, Page, Request, Response } from '@playwright/test'

export const FRONTEND_RECOVERY_TIMEOUT_MS = 150_000
const DOCUMENT_TIMEOUT_MS = 10_000
const RENDER_TIMEOUT_MS = 30_000
const TRANSIENT_NAVIGATION_ERROR =
  /net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|TIMED_OUT|NAME_NOT_RESOLVED|FAILED)|page\.goto: Timeout \d+ms exceeded/i
const GATEWAY_STATUSES = new Set([502, 503, 504])
const MODULE_LOAD_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed/i

type NavigationOptions = NonNullable<Parameters<Page['goto']>[1]> & { ready?: Locator }

// Retry only document GETs and interrupted frontend bootstrapping, never a test body or a save.
export const gotoWithRecovery = async (
  page: Page,
  url: string,
  { ready, ...options }: NavigationOptions = {},
): Promise<Response | null> => {
  const origin = new URL(url).origin
  const deadline = Date.now() + FRONTEND_RECOVERY_TIMEOUT_MS
  let attempt = 0
  let lastReason = 'document transport failure'

  const isFrontendResource = (request: Request): boolean => {
    const resourceUrl = new URL(request.url())
    return (
      request.method() === 'GET' &&
      resourceUrl.origin === origin &&
      (['document', 'script', 'stylesheet'].includes(request.resourceType()) ||
        resourceUrl.pathname === '/config.js')
    )
  }

  while (Date.now() < deadline) {
    attempt += 1
    let interruptedResource = false
    let applicationError: Error | undefined
    const onRequestFailed = (request: Request) => {
      if (
        isFrontendResource(request) &&
        TRANSIENT_NAVIGATION_ERROR.test(request.failure()?.errorText ?? '')
      ) {
        interruptedResource = true
      }
    }
    const onResponse = (response: Response) => {
      if (!isFrontendResource(response.request())) return
      if (GATEWAY_STATUSES.has(response.status())) interruptedResource = true
      else if (response.status() >= 400)
        applicationError ??= new Error(
          `LEXIS frontend resource returned HTTP ${response.status()}.`,
        )
    }
    const onPageError = (error: Error) => {
      // A failed lazy module may also raise a page error. Its failed request is handled above;
      // missing modules (404) and unrelated JavaScript exceptions must still stop recovery.
      if (!MODULE_LOAD_ERROR.test(error.message)) applicationError ??= error
    }
    page.on('requestfailed', onRequestFailed)
    page.on('response', onResponse)
    page.on('pageerror', onPageError)

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        ...options,
        timeout: Math.max(
          1,
          Math.min(options.timeout || DOCUMENT_TIMEOUT_MS, deadline - Date.now()),
        ),
      })
      if (response && GATEWAY_STATUSES.has(response.status())) {
        lastReason = `frontend HTTP ${response.status()}`
      } else {
        // A denied/missing route is an assertion failure, not a transient gateway outage.
        let renderInterrupted = false
        if (ready) {
          try {
            await ready.waitFor({
              state: 'visible',
              timeout: Math.max(1, Math.min(RENDER_TIMEOUT_MS, deadline - Date.now())),
            })
          } catch (error) {
            const root = page.locator('#root')
            const emptyShell =
              (await root.count()) === 1 && (await root.innerText({ timeout: 1_000 })).trim() === ''
            if (applicationError || (!interruptedResource && !emptyShell)) throw error
            lastReason = interruptedResource
              ? 'frontend resource transport failure'
              : 'empty app shell'
            renderInterrupted = true
          }
        }
        if (applicationError) throw applicationError
        if (!renderInterrupted) return response
      }
    } catch (error) {
      if (applicationError || !TRANSIENT_NAVIGATION_ERROR.test(String(error))) throw error
      lastReason = 'document transport failure'
    } finally {
      page.off('requestfailed', onRequestFailed)
      page.off('response', onResponse)
      page.off('pageerror', onPageError)
    }

    const delay = Math.min(
      attempt === 1 ? 5_000 : attempt === 2 ? 10_000 : 20_000,
      deadline - Date.now(),
    )
    if (delay > 0) {
      // Public CI logs contain timing and failure category only, never URLs, credentials or page text.
      console.warn(
        `[LEXIS navigation] ${new Date().toISOString()} attempt ${attempt}: ${lastReason}; retry in ${delay}ms`,
      )
      await page.waitForTimeout(delay)
    }
  }

  throw new Error(
    `LEXIS navigation did not recover within ${FRONTEND_RECOVERY_TIMEOUT_MS / 1_000}s (${attempt} attempts; ${lastReason}).`,
  )
}
