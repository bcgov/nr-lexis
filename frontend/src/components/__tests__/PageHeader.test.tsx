import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, Outlet, RouterProvider, useNavigate } from 'react-router-dom'

import PageHeader from '@/components/PageHeader'
import StatusTag from '@/components/StatusTag'

describe('PageHeader', () => {
  it('labels the semantic page header with its h1 and optional subtitle', () => {
    render(
      <PageHeader
        title="Provincial applications"
        subtitle="Find applications and manage their workflows."
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Provincial applications' })
    const header = screen.getByRole('banner')
    const subtitle = screen.getByText('Find applications and manage their workflows.')

    expect(header).toHaveAttribute('aria-labelledby', heading.id)
    expect(header).toHaveAttribute('aria-describedby', subtitle.id)
  })

  it('renders status and actions without changing the title semantics', () => {
    render(
      <PageHeader
        title="Application 123"
        status={<StatusTag status="Approved" />}
        actions={<button type="button">Edit application</button>}
        actionsLabel="Application actions"
        className="application-header"
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Application 123' })).toBeVisible()
    const status = screen.getByText('Approved')
    expect(status).toHaveAttribute('data-status-variant', 'positive')
    expect(status.parentElement).toHaveClass('lexis-page-header__status')
    expect(screen.getByRole('group', { name: 'Application actions' })).toContainElement(
      screen.getByRole('button', { name: 'Edit application' }),
    )
    expect(screen.getByRole('banner')).toHaveClass('application-header')
  })

  it('keeps the subtitle with the title, ahead of the actions', () => {
    render(
      <PageHeader
        title="Application search"
        subtitle="Find applications and check their status"
        actions={<button type="button">Create application</button>}
      />,
    )

    const subtitle = screen.getByText('Find applications and check their status')
    const actions = screen.getByRole('group', { name: 'Page actions' })
    expect(subtitle.closest('.lexis-page-header__heading')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Application search' }),
    )
    expect(
      subtitle.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('names the browser tab after the title and restores the previous name on unmount', () => {
    document.title = 'Log Exemption Information System'
    const { rerender, unmount } = render(<PageHeader title="Provincial applications" />)
    expect(document.title).toBe('Provincial applications')

    rerender(
      <PageHeader
        title={
          <>
            Permit <span> 9021022 </span>
          </>
        }
      />,
    )
    expect(document.title).toBe('Permit 9021022')

    unmount()
    expect(document.title).toBe('Log Exemption Information System')
  })

  it('keeps the tab name while the title is empty', () => {
    document.title = 'Log Exemption Information System'
    const { rerender, unmount } = render(<PageHeader title="Reports" />)
    rerender(<PageHeader title="" />)
    expect(document.title).toBe('Reports')

    unmount()
    expect(document.title).toBe('Log Exemption Information System')
  })

  it('supports an explicit heading id and caller-provided header attributes', () => {
    render(
      <PageHeader
        title="Reports"
        headingId="reports-title"
        data-testid="reports-header"
        aria-describedby="reports-help"
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toHaveAttribute(
      'id',
      'reports-title',
    )
    expect(screen.getByTestId('reports-header')).toHaveAttribute('aria-describedby', 'reports-help')
  })

  it('focuses the title when the page opens only when asked', () => {
    const { unmount } = render(<PageHeader title="Apply for new permit" focusTitle />)

    const heading = screen.getByRole('heading', { level: 1, name: 'Apply for new permit' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    unmount()

    render(<PageHeader title="Permit 9021022" />)
    const detailHeading = screen.getByRole('heading', { level: 1, name: 'Permit 9021022' })
    expect(detailHeading).not.toHaveFocus()
    expect(detailHeading).not.toHaveAttribute('tabindex')
  })

  it('focuses the title once per visit unless a remount lost focus', () => {
    window.history.replaceState({ key: 'visit-1', idx: 0 }, '')
    const first = render(<PageHeader title="Apply for new permit" focusTitle />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    first.unmount()

    // The page replaced its header while loading, so the new title takes focus back.
    const reloaded = render(<PageHeader title="Apply for new permit" focusTitle />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    reloaded.unmount()

    // The user has moved on, so a later remount leaves focus where it is.
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    const remount = render(<PageHeader title="Apply for new permit" focusTitle />)
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
    expect(field).toHaveFocus()
    remount.unmount()
    field.remove()

    window.history.replaceState({ key: 'visit-2', idx: 1 }, '')
    render(<PageHeader title="Apply for new permit" focusTitle />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    window.history.replaceState(null, '')
  })

  it('focuses the title only when the page opens with nothing focused, when asked', () => {
    const first = render(<PageHeader title="Application search" focusTitle="whenFocusLost" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Application search' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    first.unmount()

    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    render(<PageHeader title="Application search" focusTitle="whenFocusLost" />)
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
    expect(field).toHaveFocus()
    field.remove()
  })

  it('lands on the title after the control that left the last page went away with it', async () => {
    const CreatePage = () => {
      const navigate = useNavigate()
      return (
        <>
          <h1>Create new application</h1>
          <button type="button" onClick={() => navigate('/search')}>
            Cancel
          </button>
        </>
      )
    }
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <nav>
                <Link to="/search">Application search</Link>
              </nav>
              <Outlet />
            </>
          ),
          children: [
            { path: '/create', element: <CreatePage /> },
            {
              path: '/search',
              element: <PageHeader title="Application search" focusTitle="whenFocusLost" />,
            },
          ],
        },
      ],
      { initialEntries: ['/create'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Application search' }),
    ).toHaveFocus()

    // Opened from the menu, focus stays on the menu link.
    await router.navigate('/create')
    const menuLink = screen.getByRole('link', { name: 'Application search' })
    await userEvent.click(menuLink)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Application search' }),
    ).not.toHaveFocus()
    expect(menuLink).toHaveFocus()
  })
})
