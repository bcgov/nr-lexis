import type { AxiosResponse } from 'axios'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OptimisticConflictModal, {
  normalizeChangedFields,
} from '@/components/OptimisticConflictModal'
import {
  OptimisticOverwriteConflictError,
  createOptimisticConflictEvent,
} from '@/service/optimistic-conflict'

const completedResponse = {} as AxiosResponse<unknown>

describe('OptimisticConflictModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows newer values and retries the preserved save when overwrite is confirmed', async () => {
    const user = userEvent.setup()
    const overwrite = vi.fn().mockResolvedValue(completedResponse)
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: {
            code: 'STALE_RECORD',
            detail: 'Application 46079 was saved by another user.',
            currentVersion: 'v2',
            changedFields: [
              { field: 'receivedDate', currentValue: '2026-07-15' },
              { label: 'Remarks', currentValue: 'Updated review note' },
            ],
          },
          overwrite,
          refresh,
        }),
      )
    })

    expect(screen.getByRole('dialog', { name: 'Newer changes were saved' })).toBeVisible()
    expect(screen.getByText('Application 46079 was saved by another user.')).toBeVisible()
    expect(screen.getByText('Received Date').closest('li')).toHaveTextContent(
      'Received Date: 2026-07-15',
    )
    expect(screen.getByText('Remarks').closest('li')).toHaveTextContent(
      'Remarks: Updated review note',
    )

    await user.click(screen.getByRole('button', { name: 'Overwrite' }))

    await waitFor(() => expect(overwrite).toHaveBeenCalledWith('v2'))
    expect(refresh).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.querySelector('.lexis-optimistic-conflict-modal')).not.toHaveClass(
        'is-visible',
      ),
    )
  })

  it('refreshes instead of overwriting when the user requests current data', async () => {
    const user = userEvent.setup()
    const overwrite = vi.fn().mockResolvedValue(completedResponse)
    const refresh = vi.fn()
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: { code: 'STALE_RECORD' },
          overwrite,
          refresh,
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(overwrite).not.toHaveBeenCalled()
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

  it('shows a newer conflict and requires another decision when the guarded retry conflicts', async () => {
    const user = userEvent.setup()
    const overwrite = vi
      .fn()
      .mockRejectedValueOnce(
        new OptimisticOverwriteConflictError({
          code: 'STALE_RECORD',
          currentVersion: 'v3',
          changedFields: [{ field: 'remarks', currentValue: 'Third save' }],
        }),
      )
      .mockResolvedValueOnce(completedResponse)
    render(<OptimisticConflictModal />)

    act(() => {
      window.dispatchEvent(
        createOptimisticConflictEvent({
          problem: { code: 'STALE_RECORD', currentVersion: 'v2' },
          overwrite,
          refresh: vi.fn(),
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Overwrite' }))

    expect(await screen.findByText('Newer changes were saved again')).toBeVisible()
    expect(screen.getByText('Remarks').closest('li')).toHaveTextContent('Remarks: Third save')

    await user.click(screen.getByRole('button', { name: 'Overwrite' }))
    await waitFor(() => expect(overwrite).toHaveBeenLastCalledWith('v3'))
  })
})
