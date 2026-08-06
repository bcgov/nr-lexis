import { render, screen, waitFor } from '@testing-library/react'

import Modal from '@/components/Modal'

describe('Modal', () => {
  it('focuses the first dialog control instead of the close icon', async () => {
    render(
      <Modal
        open
        passiveModal
        modalHeading="Edit details"
        aria-label="Edit details"
        onRequestClose={() => undefined}
      >
        <input aria-label="Detail name" />
      </Modal>,
    )

    const detailName = screen.getByRole('textbox', { name: 'Detail name' })
    await waitFor(() => expect(detailName).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus()
  })

  it('honours an explicit primary-focus selector', async () => {
    render(
      <Modal
        open
        passiveModal
        modalHeading="Edit details"
        aria-label="Edit details"
        selectorPrimaryFocus="#secondDetail"
        onRequestClose={() => undefined}
      >
        <input aria-label="First detail" />
        <input id="secondDetail" aria-label="Second detail" />
      </Modal>,
    )

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Second detail' })).toHaveFocus(),
    )
  })
})
