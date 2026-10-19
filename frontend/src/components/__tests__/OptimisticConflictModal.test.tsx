import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OptimisticConflictModal from '@/components/OptimisticConflictModal'
import apiService from '@/service/api-service'
import {
  conflictSaveSubject,
  createOptimisticConflictEvent,
  type OptimisticConflictRequest,
  type OptimisticRecordType,
} from '@/service/optimistic-conflict'

// Notes that the record was opened at this server time, as its response Date header reports.
const openRecordAt = (recordType: OptimisticRecordType, recordId: string, isoTime: string) =>
  apiService.markRecordVersionLoaded(recordType, recordId, {
    date: new Date(isoTime).toUTCString(),
  })

const dispatchConflict = (request: OptimisticConflictRequest) =>
  act(() => {
    window.dispatchEvent(createOptimisticConflictEvent(request))
  })

describe('OptimisticConflictModal', () => {
  beforeEach(() => {
    apiService.clearRecordVersions()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('names the record, who saved it and when, and requires the user to refresh', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
    openRecordAt('permit', '9021022', '2026-10-06T20:00:00Z')
    render(<OptimisticConflictModal />)

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        detail: 'Permit 9021022 was saved by another user.',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T21:35:00Z',
        changedFields: [{ field: 'permitRemarks', currentValue: 'Updated' }],
      },
      recordType: 'permit',
      recordId: '9021022',
      saveSubject: 'scale',
      refresh,
    })

    const dialog = screen.getByRole('dialog', { name: 'This permit was updated' })
    expect(dialog).toBeVisible()
    expect(
      within(dialog).getByText(
        'IDIR\\JSMITH saved changes on Oct 6, 2026 at 2:35 p.m., after you opened this permit. Your scale was not saved.',
      ),
    ).toBeVisible()
    expect(
      within(dialog).getByText('Refresh to load the latest version, then save again.'),
    ).toBeVisible()
    expect(screen.queryByText('Permit 9021022 was saved by another user.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Permit remarks/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['application', 'This application was updated'],
    ['federal-application', 'This application was updated'],
    ['exemption', 'This exemption was updated'],
    ['offer', 'This offer was updated'],
  ] as const)('titles a %s conflict by its record', (recordType, title) => {
    render(<OptimisticConflictModal />)

    dispatchConflict({ problem: { code: 'STALE_RECORD' }, recordType, refresh: vi.fn() })

    expect(screen.getByRole('dialog', { name: title })).toBeVisible()
  })

  it('says only what it knows when the newer save has no user or time', () => {
    render(<OptimisticConflictModal />)

    dispatchConflict({
      problem: { code: 'STALE_RECORD' },
      recordType: 'exemption',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This exemption was updated' })).getByText(
        'Changes were saved after you opened this exemption. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it('does not name a save that predates the version that was opened', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('permit', '9021022', '2026-10-06T22:00:00Z')

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T21:35:00Z',
      },
      recordType: 'permit',
      recordId: '9021022',
      saveSubject: 'scale',
      refresh: vi.fn(),
    })

    const dialog = screen.getByRole('dialog', { name: 'This permit was updated' })
    expect(
      within(dialog).getByText(
        'Changes were saved after you opened this permit. Your scale was not saved.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/JSMITH/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Oct 6, 2026/)).not.toBeInTheDocument()
  })

  it('names a save made at the moment the version was opened or later', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('permit', '9021022', '2026-10-06T21:35:00Z')

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T21:35:00Z',
      },
      recordType: 'permit',
      recordId: '9021022',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This permit was updated' })).getByText(
        'IDIR\\JSMITH saved changes on Oct 6, 2026 at 2:35 p.m., after you opened this permit. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it('names a save when the server did not report when the record was opened', () => {
    render(<OptimisticConflictModal />)

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-05T17:00:00Z',
      },
      recordType: 'application',
      recordId: '999000001',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This application was updated' })).getByText(
        'IDIR\\JSMITH saved changes on Oct 5, 2026 at 10:00 a.m., after you opened this application. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it('compares the save with the server time the record was opened, not the browser clock', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('permit', '9021022', '2026-10-06T22:00:00Z')

    // The browser clock is 10 minutes ahead of the server: a save 3 minutes after opening is
    // still after it.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-10-06T22:10:00Z'))
    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T22:03:00Z',
      },
      recordType: 'permit',
      recordId: '9021022',
      refresh: vi.fn(),
    })
    expect(
      within(screen.getByRole('dialog', { name: 'This permit was updated' })).getByText(
        'IDIR\\JSMITH saved changes on Oct 6, 2026 at 3:03 p.m., after you opened this permit. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it('does not name an earlier save when the browser clock is behind the server', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('permit', '9021022', '2026-10-06T22:00:00Z')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-10-06T21:00:00Z'))
    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T21:35:00Z',
      },
      recordType: 'permit',
      recordId: '9021022',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This permit was updated' })).getByText(
        'Changes were saved after you opened this permit. Your changes were not saved.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/JSMITH/)).not.toBeInTheDocument()
  })

  it('compares a save with the time its own record was opened, not another record of the type', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('application', '999000001', '2026-10-06T20:00:00Z')
    openRecordAt('application', '999000002', '2026-10-06T22:00:00Z')

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'IDIR\\JSMITH',
        savedAt: '2026-10-06T21:00:00Z',
      },
      recordType: 'application',
      recordId: '999000001',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This application was updated' })).getByText(
        'IDIR\\JSMITH saved changes on Oct 6, 2026 at 2:00 p.m., after you opened this application. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it.each(['EXPIRY_MONITOR', ' expiry_monitor '])(
    'says the exemption expired when the system expiry job saved it (%j)',
    (updatedBy) => {
      render(<OptimisticConflictModal />)

      dispatchConflict({
        problem: { code: 'STALE_RECORD', updatedBy, savedAt: '2026-10-07T07:00:30Z' },
        recordType: 'application',
        saveSubject: 'remark',
        refresh: vi.fn(),
      })

      const dialog = screen.getByRole('dialog', { name: 'This application was updated' })
      expect(
        within(dialog).getByText('This exemption expired overnight. Your remark was not saved.'),
      ).toBeVisible()
      expect(
        within(dialog).getByText('Refresh to load the latest version, then save again.'),
      ).toBeVisible()
      expect(screen.queryByText(/EXPIRY_MONITOR/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/saved changes/)).not.toBeInTheDocument()
    },
  )

  it('says the exemption expired when the expiry job saved it without a time', () => {
    render(<OptimisticConflictModal />)

    dispatchConflict({
      problem: { code: 'STALE_RECORD', updatedBy: 'EXPIRY_MONITOR' },
      recordType: 'exemption',
      refresh: vi.fn(),
    })

    expect(
      within(screen.getByRole('dialog', { name: 'This exemption was updated' })).getByText(
        'This exemption expired overnight. Your changes were not saved.',
      ),
    ).toBeVisible()
  })

  it('does not blame the expiry job for a save that predates the version that was opened', () => {
    render(<OptimisticConflictModal />)
    openRecordAt('exemption', 'EX-9', '2026-10-08T16:00:00Z')

    dispatchConflict({
      problem: {
        code: 'STALE_RECORD',
        updatedBy: 'EXPIRY_MONITOR',
        savedAt: '2026-10-07T07:00:30Z',
      },
      recordType: 'exemption',
      recordId: 'EX-9',
      refresh: vi.fn(),
    })

    const dialog = screen.getByRole('dialog', { name: 'This exemption was updated' })
    expect(
      within(dialog).getByText(
        'Changes were saved after you opened this exemption. Your changes were not saved.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/expired overnight/)).not.toBeInTheDocument()
  })

  it('refreshes on Escape', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    dispatchConflict({ problem: { code: 'STALE_RECORD' }, recordType: 'permit', refresh })
    await user.keyboard('{Escape}')

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('requires refresh when an existing record was loaded without a version', () => {
    render(<OptimisticConflictModal />)

    dispatchConflict({
      problem: {
        code: 'RECORD_VERSION_REQUIRED',
        detail: 'A current record version is required before saving.',
      },
      recordType: 'application',
      refresh: vi.fn(),
    })

    expect(screen.getByRole('dialog', { name: 'Refresh required before saving' })).toBeVisible()
    expect(screen.getByText(/loaded without a current version/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })
})

describe('conflictSaveSubject', () => {
  it.each([
    ['post', '/lexis/rpc/permit-details/add-boic-scale', 'scale'],
    ['post', '/lexis/rpc/application-details/package-scale', 'scale'],
    ['post', '/lexis/rpc/permit-details/boic-package', 'package'],
    ['post', '/lexis/rpc/permit-details/boic-package/update', 'package'],
    ['post', '/lexis/rpc/application-details/remark?applicationNumber=321', 'remark'],
    ['post', '/lexis/federal/applications/321/remarks', 'remark'],
    ['put', '/lexis/federal/applications/321/remarks/45', 'remark'],
    ['post', '/lexis/rpc/permit-details/boic-package/delete', undefined],
    ['delete', '/lexis/rpc/application-details/scale', undefined],
    ['post', '/lexis/rpc/permit-details/update-permit', undefined],
  ])('names a %s to %s as %s', (method, url, subject) => {
    expect(conflictSaveSubject(method, url)).toBe(subject)
  })
})
