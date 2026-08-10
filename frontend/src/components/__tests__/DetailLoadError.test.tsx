import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import DetailLoadError from '@/components/DetailLoadError'
import { APP_NOTIFICATION_REGION_ID } from '@/components/AppNotification'

describe('DetailLoadError', () => {
  afterEach(() => {
    document.getElementById(APP_NOTIFICATION_REGION_ID)?.remove()
  })

  it('keeps an inline failure visible after its toast is dismissed', async () => {
    render(<DetailLoadError message="No application was found." />)

    expect(screen.getByRole('alert')).toHaveTextContent('No application was found.')
    expect(screen.getByText('Detail unavailable')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No application was found.')
    await waitFor(() => {
      expect(screen.queryByText('Detail unavailable')).not.toBeInTheDocument()
    })
  })

  it('shows a fresh toast when the load failure changes', async () => {
    const { rerender } = render(<DetailLoadError message="First failure." />)

    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    rerender(<DetailLoadError message="Second failure." />)

    expect(await screen.findByText('Detail unavailable')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Second failure.')
  })
})
