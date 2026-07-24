import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RouteErrorPage from '@/routes/RouteErrorPage'

describe('RouteErrorPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('explains a stale deployment chunk and lets the user reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const BrokenPage = () => {
      throw new TypeError(
        'Failed to fetch dynamically imported module: /assets/ProvincialOffers-old.js',
      )
    }
    const router = createMemoryRouter([
      {
        path: '/',
        element: <BrokenPage />,
        errorElement: <RouteErrorPage onReload={reload} />,
      },
    ])

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Application update required' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'A newer version of LEXIS was deployed while this page was open. Reload to continue.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload application' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
