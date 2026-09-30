import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ActionResultNotification } from '@/components/ActionResultNotification'

describe('ActionResultNotification', () => {
  it('lists linked records under the result and stays a dismissible status', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <ActionResultNotification
          result={{
            kind: 'error',
            title: '1 exemption was not approved',
            message: 'It stays in New status and no email was sent.',
            items: [
              { id: 'TEST-1', text: ': Rejected.', to: '/provincial/exemption/TEST-1' },
              { id: 'TEST-2', text: ': Rejected.' },
            ],
          }}
          onClose={onClose}
        />
      </MemoryRouter>,
    )

    const status = screen.getByRole('status')
    expect(within(status).getByText('1 exemption was not approved')).toBeVisible()
    expect(within(status).getByText('It stays in New status and no email was sent.')).toBeVisible()
    expect(
      within(status)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['TEST-1: Rejected.', 'TEST-2: Rejected.'])
    expect(within(status).getByRole('link', { name: 'TEST-1' })).toHaveAttribute(
      'href',
      '/provincial/exemption/TEST-1',
    )
    expect(within(status).queryByRole('link', { name: 'TEST-2' })).not.toBeInTheDocument()
    expect(within(status).queryByText('Focus sentinel')).not.toBeInTheDocument()

    await userEvent.click(within(status).getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
