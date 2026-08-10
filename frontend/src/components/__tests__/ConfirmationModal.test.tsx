import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    const dialog = screen.getByRole('dialog', { name: 'Submit application?' })
    expect(dialog).toBeVisible()
    expect(dialog).toHaveAccessibleDescription('The application will be sent for review.')
    expect(screen.getByText('The application will be sent for review.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('cds--btn--tertiary')

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

  it('uses the confirmation action as the default pending label', async () => {
    const user = userEvent.setup()
    const pendingConfirmation = deferred()

    render(
      <ConfirmationModal
        open
        title="Approve application?"
        confirmLabel="Approve"
        onConfirm={() => pendingConfirmation.promise}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    expect(screen.getByRole('button', { name: 'Approve…' })).toBeDisabled()

    await act(async () => pendingConfirmation.resolve())
  })

  it('shows rejected work, keeps the dialog open, and allows retry', async () => {
    const user = userEvent.setup()
    const error = new Error('database unavailable')
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)

    render(
      <ConfirmationModal open title="Approve exemption?" onConfirm={onConfirm} onClose={onClose} />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(screen.getByText('database unavailable')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Approve exemption?' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('database unavailable')).not.toBeInTheDocument()
  })

  it('delegates rejected work when the caller owns error feedback', async () => {
    const user = userEvent.setup()
    const error = new Error('policy conflict')
    const onError = vi.fn()

    render(
      <ConfirmationModal
        open
        title="Delete policy?"
        onConfirm={() => Promise.reject(error)}
        onClose={vi.fn()}
        onError={onError}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error))
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete policy?' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  it('requests close from the supporting action without confirming', async () => {
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

  it('runs a separate supporting action before closing', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    render(
      <ConfirmationModal
        open
        title="Save your changes?"
        cancelLabel="Discard changes"
        confirmLabel="Save changes"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps the confirmation open when the backdrop is clicked', () => {
    const onClose = vi.fn()

    render(
      <ConfirmationModal open title="Delete application?" onConfirm={vi.fn()} onClose={onClose} />,
    )

    const modalRoot = screen
      .getByRole('dialog', { name: 'Delete application?' })
      .closest('.cds--modal')
    expect(modalRoot).not.toBeNull()

    fireEvent.click(modalRoot as HTMLElement)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Delete application?' })).toBeVisible()
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
