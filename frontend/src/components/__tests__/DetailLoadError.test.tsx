import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DetailLoadError from '@/components/DetailLoadError'

describe('DetailLoadError', () => {
  it('shows one persistent banner in the page for a load failure', () => {
    const { container } = render(<DetailLoadError message="No application was found." />)

    expect(screen.getByRole('alert')).toHaveTextContent('No application was found.')
    expect(screen.getAllByText('No application was found.')).toHaveLength(1)
    expect(container.querySelector('.detail-page-error')).toContainElement(
      screen.getByRole('alert'),
    )
    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
    expect(document.querySelector('.cds--toast-notification')).toBeNull()
  })

  it('updates the banner when the load failure changes', () => {
    const { rerender } = render(<DetailLoadError message="First failure." />)
    rerender(<DetailLoadError message="Second failure." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Second failure.')
    expect(screen.queryByText('First failure.')).not.toBeInTheDocument()
  })
})
