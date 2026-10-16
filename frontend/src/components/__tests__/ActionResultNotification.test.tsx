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

  it('links the record named in the title', () => {
    render(
      <MemoryRouter>
        <ActionResultNotification
          result={{
            kind: 'success',
            title: 'Application 46805 approved.',
            titleRecord: { id: '46805', to: '/provincial/application/46805' },
            message: '',
          }}
          onClose={() => undefined}
        />
      </MemoryRouter>,
    )

    const status = screen.getByRole('status')
    const link = within(status).getByRole('link', { name: '46805' })
    expect(link).toHaveAttribute('href', '/provincial/application/46805')
    expect(link.parentElement).toHaveTextContent(/^Application 46805 approved\.$/)
  })

  it('lists records without details on one line, separated by commas', () => {
    render(
      <MemoryRouter>
        <ActionResultNotification
          result={{
            kind: 'success',
            title: '3 applications approved.',
            message: '',
            records: [
              { id: '46801', to: '/provincial/application/46801' },
              { id: '46802', to: '/provincial/application/46802' },
              { id: '46803' },
            ],
          }}
          onClose={() => undefined}
        />
      </MemoryRouter>,
    )

    const status = screen.getByRole('status')
    expect(within(status).queryByRole('list')).not.toBeInTheDocument()
    expect(within(status).getByText(/46803$/)).toHaveTextContent('46801, 46802, 46803')
    expect(
      within(status)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['46801', '46802'])
  })

  it('lists a repeated detail once under its record', () => {
    render(
      <MemoryRouter>
        <ActionResultNotification
          result={{
            kind: 'error',
            title: '1 exemption was not approved',
            message: '',
            items: [
              {
                id: 'TEST-3',
                text: ':',
                details: ['Expiry date is required.', 'Expiry date is required.'],
              },
            ],
          }}
        />
      </MemoryRouter>,
    )

    const details = screen.getByRole('status').querySelector('.action-result-notification__details')
    expect(
      within(details as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Expiry date is required.'])
  })
})
