import { render, screen } from '@testing-library/react'

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
        statusPlacement="end"
        actions={<button type="button">Edit application</button>}
        actionsLabel="Application actions"
        className="application-header"
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Application 123' })).toBeVisible()
    const status = screen.getByText('Approved')
    expect(status).toHaveAttribute('data-status-variant', 'positive')
    expect(status.parentElement).toHaveClass('lexis-page-header__status--end')
    expect(screen.getByRole('group', { name: 'Application actions' })).toContainElement(
      screen.getByRole('button', { name: 'Edit application' }),
    )
    expect(screen.getByRole('banner')).toHaveClass('application-header')
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
})
