import { expect, test } from '@playwright/test'
import { gotoSyntheticRoute } from './utils'

const unauthenticatedSession = {
  authenticated: false,
  principal: null,
  roles: [],
  welcomeTarget: null,
  legacyPath: null,
  grantedActions: [],
}

test.describe('frontend smoke coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/lexis/session/capabilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unauthenticatedSession),
      })
    })
  })

  test('landing page renders core login shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoSyntheticRoute(page, '/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Log Exemption Information System' }),
    ).toBeVisible()
    await expect(page.getByAltText('Government of British Columbia')).toBeVisible()
    await expect(
      page.getByAltText('Log sorting operation at a British Columbia harbour'),
    ).toBeVisible()
    const idirLogin = page.getByRole('button', { name: /log in with idir/i })
    const businessBceidLogin = page.getByRole('button', { name: /log in with business bceid/i })
    await expect(idirLogin).toBeVisible()
    await expect(idirLogin).toBeEnabled()
    await expect(businessBceidLogin).toBeVisible()
    await expect(businessBceidLogin).toBeEnabled()

    const layoutBounds = await page.locator('.landing-grid').evaluate((grid) => {
      const container = grid.parentElement
      if (!(container instanceof HTMLElement)) throw new Error('Landing container not found')

      return {
        gridWidth: grid.getBoundingClientRect().width,
        containerWidth: container.getBoundingClientRect().width,
        documentOverflows:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })

    expect(layoutBounds.gridWidth).toBeLessThanOrEqual(layoutBounds.containerWidth)
    expect(layoutBounds.documentOverflows).toBe(false)
  })

  test('matches the FSPTS desktop landing composition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()

    const layout = await page.evaluate(() => {
      const content = document.querySelector('.landing-content-col')
      const image = document.querySelector('.landing-img-col')
      const wrapper = document.querySelector('.landing-content-wrapper')
      const title = document.querySelector('.landing-title')
      const subtitle = document.querySelector('.landing-subtitle')
      const primaryAction = document.querySelector('[data-testid="landing-button__idir"]')
      if (!(content instanceof HTMLElement)) throw new Error('Landing content not found')
      if (!(image instanceof HTMLElement)) throw new Error('Landing image not found')
      if (!(wrapper instanceof HTMLElement)) throw new Error('Landing wrapper not found')
      if (!(title instanceof HTMLElement)) throw new Error('Landing title not found')
      if (!(subtitle instanceof HTMLElement)) throw new Error('Landing subtitle not found')
      if (!(primaryAction instanceof HTMLElement)) throw new Error('Landing action not found')

      const contentBounds = content.getBoundingClientRect()
      const imageBounds = image.getBoundingClientRect()
      const titleBounds = title.getBoundingClientRect()
      const subtitleBounds = subtitle.getBoundingClientRect()
      const actionBounds = primaryAction.getBoundingClientRect()
      const contentStyle = getComputedStyle(content)
      const wrapperStyle = getComputedStyle(wrapper)
      const titleStyle = getComputedStyle(title)
      const subtitleStyle = getComputedStyle(subtitle)

      return {
        contentLeft: contentBounds.left,
        contentWidth: contentBounds.width,
        imageLeft: imageBounds.left,
        imageWidth: imageBounds.width,
        contentPaddingLeft: contentStyle.paddingLeft,
        wrapperGap: wrapperStyle.gap,
        titleSubtitleGap: subtitleBounds.top - titleBounds.bottom,
        subtitleActionGap: actionBounds.top - subtitleBounds.bottom,
        titleColor: titleStyle.color,
        subtitleColor: subtitleStyle.color,
      }
    })

    expect(layout.contentLeft).toBe(0)
    expect(layout.contentWidth).toBe(720)
    expect(layout.imageLeft).toBe(720)
    expect(layout.imageWidth).toBe(720)
    expect(layout.contentPaddingLeft).toBe('32px')
    expect(layout.wrapperGap).toBe('96px')
    expect(layout.titleSubtitleGap).toBe(96)
    expect(layout.subtitleActionGap).toBe(64)
    expect(layout.subtitleColor).toBe(layout.titleColor)
  })

  test('keeps the session-expiry notice in the FSPTS landing rhythm', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('lexis.session-expired-login-notice', 'true')
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/', { waitUntil: 'domcontentloaded' })

    const notice = page.locator('.landing-session-expired-notification')
    await expect(notice).toBeVisible()

    const layout = await page.evaluate(() => {
      const subtitle = document.querySelector('.landing-subtitle')
      const notification = document.querySelector('.landing-session-expired-notification')
      const primaryAction = document.querySelector('[data-testid="landing-button__idir"]')
      if (!(subtitle instanceof HTMLElement)) throw new Error('Landing subtitle not found')
      if (!(notification instanceof HTMLElement)) throw new Error('Landing notice not found')
      if (!(primaryAction instanceof HTMLElement)) throw new Error('Landing action not found')

      const subtitleBounds = subtitle.getBoundingClientRect()
      const notificationBounds = notification.getBoundingClientRect()
      const actionBounds = primaryAction.getBoundingClientRect()

      return {
        notificationMarginTop: getComputedStyle(notification).marginTop,
        subtitleNotificationGap: notificationBounds.top - subtitleBounds.bottom,
        notificationActionGap: actionBounds.top - notificationBounds.bottom,
      }
    })

    expect(layout.notificationMarginTop).toBe('0px')
    expect(layout.subtitleNotificationGap).toBe(96)
    expect(layout.notificationActionGap).toBe(64)

    await page.getByRole('button', { name: /close notification/i }).click()
    await expect(notice).toBeHidden()
  })

  test('protected routes are not directly accessible without authenticated session', async ({
    page,
  }) => {
    await gotoSyntheticRoute(page, '/provincial/application', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText(/does not exist/i)).toBeVisible()

    await page.getByRole('button', { name: /back home/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
  })
})
