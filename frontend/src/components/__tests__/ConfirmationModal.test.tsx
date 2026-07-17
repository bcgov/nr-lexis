import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'

import ConfirmationModal from '@/components/ConfirmationModal'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('ConfirmationModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a controlled Carbon confirmation dialog without using window.confirm', async () => {
    const user = userEvent.setup()
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    render(
      <ConfirmationModal
        open
        title="Submit application?"
        description="The application will be sent for review."
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Submit application?' })).toBeVisible()
    expect(screen.getByText('The application will be sent for review.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('disables dismissal while an async destructive confirmation is pending', async () => {
    const user = userEvent.setup()
    const pendingConfirmation = deferred()
    const onClose = vi.fn()

    render(
      <ConfirmationModal
        open
        danger
        title="Delete package?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => pendingConfirmation.promise}
        onClose={onClose}
      />,
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toHaveClass('cds--btn--danger')

    await user.click(deleteButton)

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelButton).toBeDisabled()
    await user.click(cancelButton)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => pendingConfirmation.resolve())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the dialog open and delegates rejected work to the caller', async () => {
    const user = userEvent.setup()
    const error = new Error('database unavailable')
    const onClose = vi.fn()
    const onError = vi.fn()

    render(
      <ConfirmationModal
        open
        title="Approve exemption?"
        onConfirm={() => Promise.reject(error)}
        onClose={onClose}
        onError={onError}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Approve exemption?' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it('requests close from the secondary action without confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    render(
      <ConfirmationModal open title="Replace offer?" onConfirm={onConfirm} onClose={onClose} />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('guards confirmation while the caller marks it disabled', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmationModal
        open
        confirmDisabled
        title="Confirm accuracy"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toBeDisabled()
    await user.click(confirmButton)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
