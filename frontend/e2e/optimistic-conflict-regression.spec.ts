import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticCognitoSession } from './utils'

// Real Carbon dialogs and API interception exercise browser stacking/focus and refresh recovery.
// These synthetic responses do not verify Oracle concurrency or deployed TEST persistence.
const installConflictFixture = async (page: Page, code: string) => {
  await installSyntheticCognitoSession(page, { username: 'CONFLICT.TESTER', orgUnitNo: '1903' })
  let writes = 0
  let reads = 0
  const application = {
    applicationNumber: 321,
    applicationStatusCode: 'APP',
    statusDescription: 'Approved',
    ownerClientNumber: null,
    agentClientNumber: null,
    orgUnitNumber: 1903,
    orgUnitName: 'Coast',
    productTypeCode: 'H',
    applicationDate: '2026-09-09',
    receivedDate: '2026-09-09',
    listingDate: '2999-12-31',
    termDays: 30,
    applicationVolume: 0,
    averageLogVolume: 0,
    canCreateOffers: false,
    industryUser: false,
    readOnly: false,
    canEditApplicationDetails: true,
    locked: false,
    packages: [],
    remarks: [] as Array<{
      remarkId: number
      title: string
      remark: string
      user: string
      date: string
    }>,
    offers: [],
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (
      (request.method() === 'POST' && path === '/api/lexis/rpc/application-details/remark') ||
      (request.method() === 'DELETE' && path === '/api/lexis/rpc/application-details/document')
    ) {
      writes += 1
      await route.fulfill({
        status: code === 'STALE_RECORD' ? 409 : 428,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code, detail: 'Refresh application 321 before saving.' }),
      })
      return
    }

    let body: unknown = []
    switch (path) {
      case '/api/lexis/session/capabilities':
        body = {
          authenticated: true,
          principal: 'CONFLICT.TESTER',
          roles: ['ADMIN'],
          welcomeTarget: '/provincial/application',
          orgUnitNo: '1903',
          grantedActions: [
            '/applicationSearch',
            '/applicationDetails',
            '/applicationRemarks',
            'createApplication',
          ],
        }
        break
      case '/api/lexis/session/preferences':
        body = { defaultRegion: '1903' }
        break
      case '/api/lexis/applications/321':
        reads += 1
        body = application
        break
      case '/api/lexis/rpc/application-details/application-summary':
        body = { ...application, applicationNumber: '321', jurisdictionCode: 'P' }
        break
      case '/api/lexis/rpc/application-details/document-details':
        body = [{ id: '625', name: 'synthetic-conflict.txt', uploadDate: '2026-09-09' }]
        break
      case '/api/lexis/applications/search/options':
        body = {
          exemptionTypes: [],
          exemptionReasons: [],
          applicationStatuses: [],
          productTypes: [],
          growthTypes: [],
          regions: [],
          currentSchedules: [],
        }
        break
    }
    await route.fulfill({
      status: 200,
      headers: { 'X-Lexis-Record-Version': writes ? 'v2' : 'v1' },
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  return { writes: () => writes, reads: () => reads, application }
}

for (const mode of ['add', 'edit'] as const) {
  for (const closeAction of ['cancel', 'escape', 'save'] as const) {
    test(`remark ${mode} restores launcher focus after ${closeAction}`, async ({ page }) => {
      const fixture = await installConflictFixture(page, 'STALE_RECORD')
      if (mode === 'edit') {
        fixture.application.remarks = [
          {
            remarkId: 88,
            title: 'Existing remark',
            remark: 'Existing remark',
            user: 'FOCUS.TESTER',
            date: '2026-09-10',
          },
        ]
      }
      let saved = 0
      await page.route('**/api/lexis/rpc/application-details/remark', async (route) => {
        saved += 1
        const body = Object.fromEntries(new URLSearchParams(route.request().postData() ?? ''))
        const remark = {
          remarkId: 88,
          title: body.remarkBody,
          remark: body.remarkBody,
          user: 'FOCUS.TESTER',
          date: '2026-09-10',
        }
        fixture.application.remarks = [remark]
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', ...remark }),
        })
      })
      await gotoSyntheticRoute(page, '/provincial/application/321')
      await page.getByRole('tab', { name: 'Remarks', exact: true }).click()
      const launcher =
        mode === 'add'
          ? page.getByRole('button', { name: 'Add remark', exact: true })
          : page
              .getByRole('region', { name: 'Application remarks' })
              .getByRole('button', { name: 'Edit', exact: true })
      await launcher.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', {
        name: mode === 'add' ? 'Add remark' : 'Edit remark',
      })
      const field = dialog.getByRole('textbox')
      await expect(field).toBeFocused()
      await field.fill('Updated synthetic remark')
      if (closeAction === 'escape') await page.keyboard.press('Escape')
      else {
        const action = dialog.getByRole('button', {
          name:
            closeAction === 'cancel' ? 'Cancel' : mode === 'add' ? 'Save Remark' : 'Update Remark',
          exact: true,
        })
        for (
          let i = 0;
          i < 5 && !(await action.evaluate((el) => el === document.activeElement));
          i++
        ) {
          await page.keyboard.press('Tab')
        }
        await expect(action).toBeFocused()
        await page.keyboard.press('Enter')
      }
      await expect(dialog).not.toBeVisible()
      await expect(launcher).toBeFocused()
      expect(saved).toBe(closeAction === 'save' ? 1 : 0)
      if (closeAction === 'save') {
        await expect(
          page.getByRole('cell', { name: 'Updated synthetic remark', exact: true }),
        ).toBeVisible()
      }
    })
  }
}

test('conflict recovery also releases a pending document deletion without retrying it', async ({
  page,
}) => {
  const fixture = await installConflictFixture(page, 'STALE_RECORD')
  await gotoSyntheticRoute(page, '/provincial/application/321')
  await page.getByRole('tab', { name: 'Documents', exact: true }).click()
  await page.getByRole('button', { name: 'Edit documents', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const deletion = page.getByRole('dialog', { name: 'Delete document', includeHidden: true })
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click()

  const conflict = page.getByRole('dialog', { name: 'Newer changes were saved' })
  const refresh = conflict.getByRole('button', { name: 'Refresh', exact: true })
  await expect(refresh).toBeFocused()
  await expect(deletion.locator('button').filter({ hasText: 'Deleting' })).toBeDisabled()
  await expect(page.locator('.app-shell')).toHaveJSProperty('inert', true)
  const readsBeforeRefresh = fixture.reads()
  await refresh.click()

  await expect.poll(fixture.reads).toBeGreaterThan(readsBeforeRefresh)
  await expect(conflict).not.toBeVisible()
  await expect(deletion).not.toBeVisible()
  await expect(page.locator('.app-shell')).toHaveJSProperty('inert', false)
  expect(fixture.writes()).toBe(1)
  await page.getByRole('tab', { name: 'Documents', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: 'synthetic-conflict.txt', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit documents', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
})

for (const { code, heading, recovery } of [
  { code: 'STALE_RECORD', heading: 'Newer changes were saved', recovery: 'click' },
  { code: 'STALE_RECORD', heading: 'Newer changes were saved', recovery: 'keyboard' },
  {
    code: 'RECORD_VERSION_REQUIRED',
    heading: 'Refresh required before saving',
    recovery: 'escape',
  },
]) {
  test(`conflict recovery stays above a saving remark: ${code}, ${recovery}`, async ({ page }) => {
    const fixture = await installConflictFixture(page, code)
    await gotoSyntheticRoute(page, '/provincial/application/321')
    await expect(page.getByRole('heading', { level: 1, name: 'Application 321' })).toBeVisible()
    await page.getByRole('tab', { name: 'Remarks', exact: true }).click()
    await page.getByRole('button', { name: 'Add remark', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Add remark', includeHidden: true })
    await form.getByRole('textbox', { name: /New Remark/ }).fill('Unsaved synthetic remark')
    await form.getByRole('button', { name: 'Save Remark', exact: true }).click()

    const conflict = page.getByRole('dialog', { name: heading })
    const refresh = conflict.getByRole('button', { name: 'Refresh', exact: true })
    await expect(conflict).toBeVisible()
    await expect(page.locator('.app-shell')).toHaveJSProperty('inert', true)
    await expect(refresh).toBeFocused()
    await expect(form.locator('button').filter({ hasText: 'Saving' })).toBeDisabled()
    await expect(refresh).toBeInViewport()
    expect(
      await refresh.evaluate((button) => {
        const box = button.getBoundingClientRect()
        return button.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        )
      }),
    ).toBe(true)

    // A lower dialog's close button must not steal focus back from recovery.
    await form.locator('.cds--modal-close').evaluate((button: HTMLElement) => button.focus())
    await expect(refresh).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(conflict.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(refresh).toBeFocused()

    const readsBeforeRefresh = fixture.reads()
    if (recovery === 'click') await refresh.click()
    else await page.keyboard.press(recovery === 'escape' ? 'Escape' : 'Enter')

    await expect.poll(fixture.reads).toBeGreaterThan(readsBeforeRefresh)
    await expect(page.getByRole('heading', { level: 1, name: 'Application 321' })).toBeVisible()
    await expect(conflict).not.toBeVisible()
    await expect(form).not.toBeVisible()
    await expect(page.locator('.app-shell')).toHaveJSProperty('inert', false)
    expect(fixture.writes()).toBe(1)
    await page.getByRole('tab', { name: 'Remarks', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Add remark', exact: true })).toBeEnabled()
    await expect(page.getByText('Unsaved synthetic remark', { exact: true })).toHaveCount(0)
  })
}
