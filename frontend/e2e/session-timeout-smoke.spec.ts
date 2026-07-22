import { expect, test, type Page } from '@playwright/test'

const SESSION_IDLE_WARNING_DELAY_MS = 10 * 60 * 1000
const SESSION_IDLE_WARNING_DURATION_MS = 5 * 60 * 1000
const URGENT_COUNTDOWN_DURATION_MS = 30 * 1000

const authenticatedSession = {
  authenticated: true,
  principal: 'SESSION.TIMEOUT.TESTER',
  roles: ['ADMIN'],
  welcomeTarget: '/provincial/application',
  legacyPath: null,
  orgUnitNo: '1903',
  grantedActions: ['/applicationSearch'],
}

const applicationSearchOptions = {
  exemptionTypes: [],
  exemptionReasons: [],
  applicationStatuses: [],
  productTypes: [],
  growthTypes: [],
  regions: [],
  currentSchedules: [],
}

const installSyntheticLexisApi = async (page: Page) => {
  await page.route('**/api/lexis/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown

    switch (pathname) {
      case '/api/lexis/session/capabilities':
        body = authenticatedSession
        break
      case '/api/lexis/applications/search/options':
        body = applicationSearchOptions
        break
      case '/api/lexis/applications/search/count':
        body = { total: 0 }
        break
      default:
        body = { results: [], total: 0, page: 0, size: 25 }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

test.describe('session timeout regression', () => {
  test('opens, renders, and resets the warning without real-time waiting', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-07-22T12:00:00.000Z') })
    await installSyntheticLexisApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)

    const dialog = page.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    const urgencyIcon = dialog.locator('.lexis-session-timeout-warning__urgency-icon')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await expect(urgencyIcon).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    const layout = await dialog.evaluate((container) => {
      const footer = container.querySelector('.cds--modal-footer')
      const buttons = Array.from(container.querySelectorAll('.cds--modal-footer .cds--btn'))
      if (!(footer instanceof HTMLElement) || buttons.length !== 2) {
        throw new Error('Session timeout modal actions were not rendered.')
      }

      const containerBounds = container.getBoundingClientRect()
      const footerBounds = footer.getBoundingClientRect()
      const buttonBounds = buttons.map((button) => button.getBoundingClientRect())
      return {
        footerWithinContainer:
          footerBounds.left >= containerBounds.left - 1 &&
          footerBounds.right <= containerBounds.right + 1,
        buttonsWithinContainer: buttonBounds.every(
          (button) =>
            button.left >= containerBounds.left - 1 && button.right <= containerBounds.right + 1,
        ),
        buttonWidths: buttonBounds.map((button) => button.width),
        containerWidth: containerBounds.width,
      }
    })

    expect(layout.footerWithinContainer).toBe(true)
    expect(layout.buttonsWithinContainer).toBe(true)
    expect(layout.buttonWidths.every((width) => width < layout.containerWidth / 2)).toBe(true)

    await page.clock.fastForward(SESSION_IDLE_WARNING_DURATION_MS - URGENT_COUNTDOWN_DURATION_MS)

    await expect(dialog.getByText('0:30', { exact: true })).toBeVisible()
    await expect(urgencyIcon).toBeVisible()
    await expect(urgencyIcon).not.toHaveAttribute('hidden', '')

    await dialog.getByRole('button', { name: 'Stay logged in' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('You’re still logged in', { exact: true })).toBeVisible()

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
  })
})
