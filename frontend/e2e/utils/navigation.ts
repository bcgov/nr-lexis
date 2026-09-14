import { errors, type Locator, type Page, type Request, type Response } from '@playwright/test'

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
    const attemptRequests = new Set<Request>()
    const interruptedRequests = new Set<Request>()
    let applicationError: Error | undefined
    let moduleLoadError: Error | undefined
    const assertNoApplicationError = () => {
      if (applicationError) throw applicationError
      if (
        moduleLoadError &&
        ![...interruptedRequests].some((request) => request.resourceType() === 'script')
      )
        throw moduleLoadError
    }
    const onRequest = (request: Request) => {
      if (isFrontendResource(request)) attemptRequests.add(request)
    }
    const onRequestFailed = (request: Request) => {
      // A new navigation cancels outstanding requests from the previous timed-out attempt.
      if (!attemptRequests.has(request) || interruptedRequests.has(request)) return
      const errorText = request.failure()?.errorText ?? 'Unknown request failure'
      if (TRANSIENT_NAVIGATION_ERROR.test(errorText)) {
        interruptedResource = true
        interruptedRequests.add(request)
      } else applicationError ??= new Error(`LEXIS frontend resource failed: ${errorText}.`)
    }
    const onResponse = (response: Response) => {
      if (!attemptRequests.has(response.request())) return
      if (GATEWAY_STATUSES.has(response.status())) {
        interruptedResource = true
        // Chromium can also report ERR_ABORTED for this same unsuccessful resource.
        interruptedRequests.add(response.request())
      } else if (response.status() >= 400)
        applicationError ??= new Error(
          `LEXIS frontend resource returned HTTP ${response.status()}.`,
        )
    }
    const onPageError = (error: Error) => {
      // A module error is recoverable only when accompanied by an interrupted script.
      // Preserve unexplained module failures and all unrelated JavaScript exceptions.
      if (MODULE_LOAD_ERROR.test(error.message)) moduleLoadError ??= error
      else applicationError ??= error
    }
    page.on('request', onRequest)
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
      assertNoApplicationError()
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
            assertNoApplicationError()
            if (!(error instanceof errors.TimeoutError)) throw error
            if (!interruptedResource) {
              const root = page.locator('#root')
              const emptyShell =
                (await root.count()) === 1 &&
                (await root.evaluate(
                  (element) =>
                    element.childElementCount === 0 && !(element.textContent ?? '').trim(),
                  undefined,
                  { timeout: Math.max(1, Math.min(1_000, deadline - Date.now())) },
                ))
              if (!emptyShell) throw error
            }
            renderInterrupted = true
          }
        }
        assertNoApplicationError()
        if (interruptedResource) lastReason = 'frontend resource transport failure'
        else if (renderInterrupted) lastReason = 'empty app shell'
        else return response
      }
    } catch (error) {
      assertNoApplicationError()
      if (!TRANSIENT_NAVIGATION_ERROR.test(String(error))) throw error
      lastReason = 'document transport failure'
    } finally {
      page.off('request', onRequest)
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
