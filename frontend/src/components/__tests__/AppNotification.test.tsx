import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppNotification } from '../AppNotification'
import { AppToastNotification, APP_NOTIFICATION_REGION_ID } from '../AppToastNotification'

describe('AppNotification', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.getElementById(APP_NOTIFICATION_REGION_ID)?.remove()
  })

  it('keeps action feedback inside the page that owns it', () => {
    const { container } = render(
      <main>
        <AppNotification kind="error" title="Upload error" subtitle="Upload failed." />
      </main>,
    )

    expect(container.querySelector('main')).toContainElement(screen.getByText('Upload error'))
    expect(screen.getByRole('status')).toHaveClass(
      'cds--inline-notification',
      'cds--inline-notification--low-contrast',
    )
    expect(document.getElementById(APP_NOTIFICATION_REGION_ID)).toBeNull()
    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
  })

  it('keeps success feedback until the caller dismisses or replaces it', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { rerender } = render(
      <AppNotification kind="success" title="Saved" onCloseButtonClick={onClose} />,
    )

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Saved')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'close notification' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<AppNotification kind="error" title="Save failed" onCloseButtonClick={onClose} />)
    expect(screen.getByText('Save failed')).toBeVisible()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('keeps independent page and dialog messages visible alongside a session toast', () => {
    render(
      <>
        <main>
          <AppNotification kind="warning" title="Options unavailable" />
          <AppNotification kind="success" title="Saved" />
        </main>
        <div role="dialog" aria-label="Upload">
          <AppNotification kind="error" title="Upload failed" />
        </div>
        <AppToastNotification kind="success" title="Session extended" />
      </>,
    )

    expect(screen.getByText('Options unavailable')).toBeVisible()
    expect(screen.getByText('Saved')).toBeVisible()
    expect(within(screen.getByRole('dialog')).getByText('Upload failed')).toBeVisible()
    expect(document.getElementById(APP_NOTIFICATION_REGION_ID)).toContainElement(
      screen.getByText('Session extended'),
    )
  })

  it('sanitizes technical errors and allows an urgent announcement', () => {
    render(
      <AppNotification
        kind="error"
        role="alert"
        title="Save failed"
        subtitle='{"status":500,"error":"Internal Server Error","path":"/api/lexis/example"}'
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again. If the problem persists, contact your administrator.',
    )
    expect(screen.queryByText(/Internal Server Error/)).not.toBeInTheDocument()
  })
})
