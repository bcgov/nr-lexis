import { render, screen } from '@testing-library/react'

import EmptyState from '@/components/EmptyState'

describe('EmptyState', () => {
  it('renders an accessible labelled region with a decorative default pictogram', () => {
    const { container } = render(
      <EmptyState title="No applications found" description="Try changing your search criteria." />,
    )

    const region = screen.getByRole('region', { name: 'No applications found' })
    const heading = screen.getByRole('heading', { level: 2, name: 'No applications found' })
    const description = screen.getByText('Try changing your search criteria.')
    const pictogram = container.querySelector('.lexis-empty-state__default-pictogram')

    expect(region).toHaveAttribute('aria-labelledby', heading.id)
    expect(region).toHaveAttribute('aria-describedby', description.id)
    expect(pictogram).toHaveAttribute('aria-hidden', 'true')
    expect(pictogram).toHaveAttribute('focusable', 'false')
  })

  it('supports a meaningful custom icon, action, heading level, and custom class', () => {
    render(
      <EmptyState
        title="No documents"
        description={<span>Upload a document to continue.</span>}
        icon={<svg data-testid="document-icon" />}
        iconLabel="Empty document folder"
        action={<button type="button">Upload document</button>}
        headingLevel={1}
        className="documents-empty-state"
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'No documents' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Empty document folder' })).toContainElement(
      screen.getByTestId('document-icon'),
    )
    expect(screen.getByRole('button', { name: 'Upload document' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'No documents' })).toHaveClass(
      'documents-empty-state',
    )
  })
})
