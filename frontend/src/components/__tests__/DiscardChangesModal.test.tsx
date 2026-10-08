import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useDiscardPrompt } from '@/components/DiscardChangesModal'

const Harness = ({
  onClose,
  restoreFieldFocus = false,
}: {
  onClose: () => void
  restoreFieldFocus?: boolean
}) => {
  const [value, setValue] = useState('saved')
  const { confirmDiscard, discardModal } = useDiscardPrompt(
    value !== 'saved',
    undefined,
    restoreFieldFocus ? () => document.getElementById('harness-value') : undefined,
  )

  return (
    <>
      <label htmlFor="harness-value">Volume</label>
      <input id="harness-value" value={value} onChange={(event) => setValue(event.target.value)} />
      <button
        type="button"
        onClick={() =>
          confirmDiscard(() => {
            setValue('saved')
            onClose()
          })
        }
      >
        Cancel
      </button>
      {discardModal}
    </>
  )
}

describe('useDiscardPrompt', () => {
  it('runs the action straight away when nothing changed', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before discarding changes, with focus on Keep editing', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Volume'), '1')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    const dialog = screen.getByRole('dialog', { name: 'Discard changes?' })
    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveClass('cds--btn--danger')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the changes and returns focus to where the user was', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Volume'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Volume')).toHaveValue('saved1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
  })

  it('completes the action on Discard', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Volume'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Volume')).toHaveValue('saved')
  })

  it('returns focus to the supplied field when the close action has no focused control', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} restoreFieldFocus />)
    const volume = screen.getByLabelText('Volume')
    await userEvent.type(volume, '1')
    volume.blur()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(volume).toHaveValue('saved1')
    await waitFor(() => expect(volume).toHaveFocus())
  })
})
