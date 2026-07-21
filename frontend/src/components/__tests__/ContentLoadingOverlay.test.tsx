import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ContentLoadingOverlay from '../ContentLoadingOverlay'

describe('ContentLoadingOverlay', () => {
  it('renders a polite status indicator outside the busy content region', () => {
    render(<ContentLoadingOverlay loading loadingDescription="Refreshing application detail..." />)

    expect(screen.getByRole('status')).toHaveTextContent('Refreshing application detail...')
    expect(screen.getByText('Refreshing application detail...')).toBeInTheDocument()
  })

  it('omits the status indicator once loading completes', () => {
    render(
      <ContentLoadingOverlay
        loading={false}
        loadingDescription="Refreshing application detail..."
      />,
    )

    expect(screen.queryByText('Refreshing application detail...')).not.toBeInTheDocument()
  })
})
