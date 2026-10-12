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
    await gotoSyntheticRoute(page, '/', {
      waitUntil: 'domcontentloaded',
      ready: page.getByRole('heading', { level: 1, name: 'LEXIS', exact: true }),
    })
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Log Exemption Information System' }),
    ).toBeVisible()
    await expect(
      page.getByText('Manage provincial log applications for exemptions, offers and permits.'),
    ).toBeVisible()
    await expect(page.getByRole('img', { name: 'Government of British Columbia' })).toBeVisible()
    const supportingImage = page.locator('.landing-img')
    await expect(supportingImage).toBeVisible()
    await expect(supportingImage).toHaveAttribute('alt', '')
    await expect(supportingImage).toHaveAttribute('aria-hidden', 'true')
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
        imageFollowsContent:
          document.querySelector('.landing-img-col')!.getBoundingClientRect().top >=
          document.querySelector('.landing-content-col')!.getBoundingClientRect().bottom,
      }
    })

    expect(layoutBounds.gridWidth).toBeLessThanOrEqual(layoutBounds.containerWidth)
    expect(layoutBounds.documentOverflows).toBe(false)
    expect(layoutBounds.imageFollowsContent).toBe(true)
  })

  test('lays out the desktop landing page', async ({ page }) => {
    await page.setViewportSize({ width: 1584, height: 1080 })
    await gotoSyntheticRoute(page, '/', {
      waitUntil: 'domcontentloaded',
      ready: page.getByRole('heading', { level: 1, name: 'LEXIS', exact: true }),
    })
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()

    const layout = await page.evaluate(() => {
      const content = document.querySelector('.landing-content-col')
      const image = document.querySelector('.landing-img-col')
      const logo = document.querySelector('.landing-logo')
      const textContent = document.querySelector('.landing-text-content')
      const title = document.querySelector('.landing-title')
      const subtitle = document.querySelector('.landing-subtitle')
      const description = document.querySelector('.landing-description')
      const primaryAction = document.querySelector('[data-testid="landing-button__idir"]')
      const requestAccess = document.querySelector('.landing-request-access')
      const requestAccessLink = document.querySelector('.landing-request-access__link')
      const requestAccessNote = document.querySelector('.landing-request-access__note')
      if (!(content instanceof HTMLElement)) throw new Error('Landing content not found')
      if (!(image instanceof HTMLElement)) throw new Error('Landing image not found')
      if (!(logo instanceof SVGElement)) throw new Error('Landing logo not found')
      if (!(textContent instanceof HTMLElement)) throw new Error('Landing text not found')
      if (!(title instanceof HTMLElement)) throw new Error('Landing title not found')
      if (!(subtitle instanceof HTMLElement)) throw new Error('Landing subtitle not found')
      if (!(description instanceof HTMLElement)) throw new Error('Landing description not found')
      if (!(primaryAction instanceof HTMLElement)) throw new Error('Landing action not found')
      if (!(requestAccess instanceof HTMLElement)) throw new Error('Request access not found')
      if (!(requestAccessLink instanceof HTMLElement)) throw new Error('Request link not found')
      if (!(requestAccessNote instanceof HTMLElement)) throw new Error('Request note not found')

      const contentBounds = content.getBoundingClientRect()
      const imageBounds = image.getBoundingClientRect()
      const textBounds = textContent.getBoundingClientRect()
      const titleBounds = title.getBoundingClientRect()
      const subtitleBounds = subtitle.getBoundingClientRect()
      const descriptionBounds = description.getBoundingClientRect()
      const actionBounds = primaryAction.getBoundingClientRect()
      const requestAccessBounds = requestAccess.getBoundingClientRect()
      const linkBounds = requestAccessLink.getBoundingClientRect()
      const noteBounds = requestAccessNote.getBoundingClientRect()

      return {
        contentLeft: contentBounds.left,
        contentWidth: contentBounds.width,
        imageLeft: imageBounds.left,
        imageWidth: imageBounds.width,
        logoWidth: logo.getBoundingClientRect().width,
        logoHeight: logo.getBoundingClientRect().height,
        contentPaddingLeft: getComputedStyle(content).paddingLeft,
        titleSubtitleGap: subtitleBounds.top - titleBounds.bottom,
        subtitleDescriptionGap: descriptionBounds.top - subtitleBounds.bottom,
        descriptionActionGap: actionBounds.top - descriptionBounds.bottom,
        actionRequestAccessGap: requestAccessBounds.top - actionBounds.bottom,
        linkNoteGap: noteBounds.top - linkBounds.bottom,
        actionHeight: actionBounds.height,
        actionFontSize: getComputedStyle(primaryAction).fontSize,
        actionColor: getComputedStyle(primaryAction).backgroundColor,
        linkColor: getComputedStyle(requestAccessLink).color,
        textCentreOffset:
          titleBounds.top - textBounds.top - (textBounds.bottom - requestAccessBounds.bottom),
        titleColor: getComputedStyle(title).color,
        subtitleColor: getComputedStyle(subtitle).color,
        descriptionColor: getComputedStyle(description).color,
        descriptionFontSize: getComputedStyle(description).fontSize,
        noteColor: getComputedStyle(requestAccessNote).color,
        linkTextDecoration: getComputedStyle(requestAccessLink).textDecorationLine,
      }
    })

    expect(layout.contentLeft).toBe(0)
    expect(layout.contentWidth).toBe(945)
    expect(layout.imageLeft).toBe(951)
    expect(layout.imageWidth).toBe(633)
    expect(layout.logoWidth).toBe(160)
    expect(layout.logoHeight).toBe(46)
    expect(layout.contentPaddingLeft).toBe('40px')
    expect(layout.titleSubtitleGap).toBe(16)
    expect(layout.subtitleDescriptionGap).toBe(40)
    expect(layout.descriptionActionGap).toBe(40)
    expect(layout.actionRequestAccessGap).toBe(40)
    expect(layout.linkNoteGap).toBe(8)
    expect(layout.actionHeight).toBe(48)
    expect(layout.actionFontSize).toBe('16px')
    expect(layout.actionColor).toBe('rgb(0, 115, 230)')
    expect(layout.linkColor).toBe('rgb(0, 92, 184)')
    expect(Math.abs(layout.textCentreOffset)).toBeLessThanOrEqual(1)
    expect(layout.titleColor).toBe('rgb(19, 19, 21)')
    expect(layout.subtitleColor).toBe('rgb(96, 96, 98)')
    expect(layout.descriptionColor).toBe('rgb(96, 96, 98)')
    expect(layout.descriptionFontSize).toBe('20px')
    expect(layout.noteColor).toBe('rgb(96, 96, 98)')
    expect(layout.linkTextDecoration).toBe('underline')
  })

  test('opens the request access dialog from the landing link', async ({ page }) => {
    await page.setViewportSize({ width: 1584, height: 1080 })
    await gotoSyntheticRoute(page, '/', {
      waitUntil: 'domcontentloaded',
      ready: page.getByRole('heading', { level: 1, name: 'LEXIS', exact: true }),
    })

    const requestAccess = page.getByRole('button', { name: 'Request access to LEXIS' })
    await expect(page.getByText('An active Business BCeID account is required.')).toBeVisible()
    await requestAccess.click()

    const dialog = page.getByRole('dialog', { name: 'Request access to LEXIS' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('width', '590px')
    await expect(dialog).toHaveCSS('height', '406px')
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText([
      'Where to send your request',
      'What to include',
    ])
    await expect(
      dialog.getByRole('link', { name: 'Provincial.Log.Export.Analyst@gov.bc.ca' }),
    ).toBeFocused()
    await expect(dialog.getByRole('link')).toHaveCount(3)
    await expect(dialog.getByRole('link').first()).toHaveCSS('color', 'rgb(0, 92, 184)')
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(requestAccess).toBeFocused()
  })

  test('keeps the session-expiry notice in the landing rhythm', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('lexis.session-expired-login-notice', 'true')
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/', {
      waitUntil: 'domcontentloaded',
      ready: page.locator('.landing-session-expired-notification'),
    })

    const notice = page.locator('.landing-session-expired-notification')
    await expect(notice).toBeVisible()

    const layout = await page.evaluate(() => {
      const description = document.querySelector('.landing-description')
      const notification = document.querySelector('.landing-session-expired-notification')
      const primaryAction = document.querySelector('[data-testid="landing-button__idir"]')
      if (!(description instanceof HTMLElement)) throw new Error('Landing description not found')
      if (!(notification instanceof HTMLElement)) throw new Error('Landing notice not found')
      if (!(primaryAction instanceof HTMLElement)) throw new Error('Landing action not found')

      const descriptionBounds = description.getBoundingClientRect()
      const notificationBounds = notification.getBoundingClientRect()
      const actionBounds = primaryAction.getBoundingClientRect()

      return {
        notificationMarginTop: getComputedStyle(notification).marginTop,
        descriptionNotificationGap: notificationBounds.top - descriptionBounds.bottom,
        notificationActionGap: actionBounds.top - notificationBounds.bottom,
      }
    })

    expect(layout.notificationMarginTop).toBe('0px')
    expect(layout.descriptionNotificationGap).toBe(40)
    expect(layout.notificationActionGap).toBe(40)

    await page.getByRole('button', { name: /close notification/i }).click()
    await expect(notice).toBeHidden()
  })

  test('known protected links show login while retaining the destination', async ({ page }) => {
    await gotoSyntheticRoute(page, '/provincial/application?packageNumber=TEST#results', {
      waitUntil: 'domcontentloaded',
      ready: page.getByRole('heading', { level: 1, name: 'LEXIS', exact: true }),
    })
    await expect(page).toHaveURL(/\/provincial\/application\?packageNumber=TEST#results$/)
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0)
  })

  test('unknown routes still show not found', async ({ page }) => {
    await gotoSyntheticRoute(page, '/unknown-parity-route', {
      waitUntil: 'domcontentloaded',
      ready: page.getByRole('heading', { level: 1, name: '404', exact: true }),
    })
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText(/does not exist/i)).toBeVisible()

    await page.getByRole('button', { name: /back home/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
  })
})
