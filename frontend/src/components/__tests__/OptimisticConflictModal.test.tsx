import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OptimisticConflictModal, {
  normalizeChangedFields,
} from '@/components/OptimisticConflictModal'
import { createOptimisticConflictEvent } from '@/service/optimistic-conflict'

describe('OptimisticConflictModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows newer values and requires the user to refresh', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: {
            code: 'STALE_RECORD',
            detail: 'Application 999000001 was saved by another user.',
            currentVersion: 'v2',
            changedFields: [
              { field: 'receivedDate', currentValue: '2026-07-15' },
              { label: 'Remarks', currentValue: 'Updated review note' },
            ],
          },
          refresh,
        }),
      )
    })

    expect(screen.getByRole('dialog', { name: 'Newer changes were saved' })).toBeVisible()
    expect(screen.getByText('Application 999000001 was saved by another user.')).toBeVisible()
    expect(screen.getByText('Received Date').closest('li')).toHaveTextContent(
      'Received Date: 2026-07-15',
    )
    expect(screen.getByText('Remarks').closest('li')).toHaveTextContent(
      'Remarks: Updated review note',
    )
    expect(screen.getByText(/Your changes were not saved/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Overwrite' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the user requests current data', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: { code: 'STALE_RECORD' },
          refresh,
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('requires refresh when an existing record was loaded without a version', async () => {
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: {
            code: 'RECORD_VERSION_REQUIRED',
            detail: 'A current record version is required before saving.',
          },
          refresh,
        }),
      )
    })

    expect(screen.getByRole('dialog', { name: 'Refresh required before saving' })).toBeVisible()
    expect(screen.getByText(/loaded without a current version/)).toBeVisible()
    expect(screen.getByText('A current record version is required before saving.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
    expect(
      screen.queryByText('Changes detected since you opened this record'),
    ).not.toBeInTheDocument()
  })

  it('normalizes changed-field arrays and records supplied by the server', () => {
    expect(normalizeChangedFields(['receivedDate', { field: 'termDays', current: 30 }])).toEqual([
      { label: 'Received Date' },
      { label: 'Term Days', currentValue: '30' },
    ])
    expect(normalizeChangedFields({ applicationStatus: 'Approved' })).toEqual([
      { label: 'Application Status', currentValue: 'Approved' },
    ])
  })
})
