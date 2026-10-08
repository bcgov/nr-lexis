import { expect, test } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticOidcSession } from './utils'

// Headless Chromium normally hides scrollbars, which masks this layout regression.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.beforeEach(async ({ page }) => {
  await installSyntheticOidcSession(page, { username: 'UI.TESTER', orgUnitNo: '1903' })
  await page.route('**/api/lexis/**', async (route) => {
    expect(route.request().method()).toBe('GET')
    const pathname = new URL(route.request().url()).pathname
    await route.fulfill({
      json:
        pathname === '/api/lexis/session/capabilities'
          ? {
              authenticated: true,
              principal: 'UI.TESTER',
              roles: ['ADMIN'],
              welcomeTarget: '/notifications',
              legacyPath: null,
              orgUnitNo: '1903',
              grantedActions: [],
            }
          : pathname === '/api/lexis/session/preferences'
            ? { defaultRegion: null }
            : [],
    })
  })
})

for (const width of [1440, 390]) {
  test(`keeps drawer geometry while nested dialogs lock page scrolling (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.route('**/api/lexis/admin/notifications', async (route) => {
      expect(route.request().method()).toBe('GET')
      await route.fulfill({
        json: Array.from({ length: 24 }, (_, index) => ({
          id: index + 1,
          title: `Scrollbar sample ${index + 1}`,
          contentHtml: '<p>A synthetic notice that makes the page scroll.</p>',
          notificationLevel: 'INFORMATION',
          displayStartDate: '2000-01-01',
          displayEndDate: '2099-01-01',
          audienceRoles: [],
        })),
      })
    })
    await page.route('**/api/lexis/admin/notifications/audience-roles', (route) =>
      route.fulfill({ json: { roles: ['LEXIS_ADMIN'] } }),
    )
    await gotoSyntheticRoute(page, '/notifications', {
      ready: page.getByRole('heading', { level: 1, name: 'Notifications', exact: true }),
    })
    // Give overlay-scrollbar platforms a real, measurable classic scrollbar in this fixture.
    // Keep overflow untouched so Carbon's body lock still removes the viewport scrollbar.
    await page.addStyleTag({
      content: 'html::-webkit-scrollbar { width: 16px; }',
    })
    await expect(
      page.getByRole('heading', { name: 'Scrollbar sample 24', exact: true }),
    ).toBeVisible()
    const launcher = page.getByRole('button', { name: 'New notification', exact: true })
    await launcher.click()
    const panel = page.getByRole('complementary', { name: 'New notification', exact: true })
    const title = panel.getByLabel('Title', { exact: true })
    await expect(title).toBeFocused()
    await expect
      .poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(await page.evaluate(() => document.documentElement.clientWidth))

    const readLayout = () =>
      panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          width: bounds.width,
          left: bounds.left,
          right: bounds.right,
          bodyWidth: document.body.clientWidth,
        }
      })
    const gap = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)
    expect(gap).toBeGreaterThan(0)
    const before = await readLayout()
    const states: Record<string, unknown> = { gap, before }

    await panel.getByRole('button', { name: 'Add or edit link', exact: true }).click()
    const linkDialog = page.getByRole('dialog', { name: 'Add or edit link', exact: true })
    await expect(linkDialog.getByLabel('Link URL')).toBeFocused()
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    await expect.poll(readLayout).toEqual(before)
    states.linkOpen = await readLayout()
    await linkDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(linkDialog).toBeHidden()
    await expect(panel.getByRole('button', { name: 'Add or edit link', exact: true })).toBeFocused()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect.poll(readLayout).toEqual(before)

    await title.fill('Retain this notification draft')
    const close = panel.getByRole('button', { name: 'Close', exact: true })
    await close.click()
    const discard = page.getByRole('dialog', {
      name: 'Discard changes?',
      exact: true,
    })
    const keepEditing = discard.getByRole('button', { name: 'Keep editing', exact: true })
    await expect(keepEditing).toBeFocused()
    await expect(page.locator('body')).toHaveClass(/cds--body--with-modal-open/)
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    await expect.poll(readLayout).toEqual(before)
    states.discardOpen = await readLayout()
    // The confirmation keeps its focus trap while the drawer behind it keeps its geometry.
    await page.keyboard.press('Shift+Tab')
    await expect(discard.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(
      discard.getByRole('button', { name: 'Discard changes', exact: true }),
    ).toBeFocused()
    await keepEditing.click()
    await expect(discard).toBeHidden()
    await expect(title).toHaveValue('Retain this notification draft')
    await expect(close).toBeFocused()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect.poll(readLayout).toEqual(before)
    states.cancelled = await readLayout()

    await close.click()
    await expect(discard).toBeVisible()
    await expect.poll(readLayout).toEqual(before)
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(discard).toBeHidden()
    await expect(launcher).toBeFocused()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'auto')
    expect(
      await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth),
    ).toBe(gap)
    await testInfo.attach('drawer-gutter-layout', {
      body: JSON.stringify(states, null, 2),
      contentType: 'application/json',
    })
  })
}
