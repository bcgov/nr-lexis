import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OptimisticConflictModal from '@/components/OptimisticConflictModal'
import {
  conflictSaveSubject,
  createOptimisticConflictEvent,
  type OptimisticConflictRequest,
} from '@/service/optimistic-conflict'

const dispatchConflict = (request: OptimisticConflictRequest) =>
  act(() => {
    window.dispatchEvent(createOptimisticConflictEvent(request))
  })

describe('OptimisticConflictModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('names the record, who saved it and when, and requires the user to refresh', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
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
      saveSubject: 'scale',
      refresh,
    })

    const dialog = screen.getByRole('dialog', { name: 'This permit was updated' })
    expect(dialog).toBeVisible()
    expect(
      within(dialog).getByText(
        'IDIR\\JSMITH saved changes on 2026-10-06 at 2:35 p.m., after you opened this permit. Your scale was not saved.',
      ),
    ).toBeVisible()
    expect(
      within(dialog).getByText(
        'Refresh to load the latest version, then save again. What you entered will be lost.',
      ),
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
    ['post', '/lexis/rpc/permit-details/boic-package/delete', undefined],
    ['delete', '/lexis/rpc/application-details/scale', undefined],
    ['post', '/lexis/rpc/permit-details/update-permit', undefined],
  ])('names a %s to %s as %s', (method, url, subject) => {
    expect(conflictSaveSubject(method, url)).toBe(subject)
  })
})
