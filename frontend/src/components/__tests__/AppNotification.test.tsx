import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_NOTIFICATION_REGION_ID,
  AppNotification,
  syncAppNotificationRegionTheme,
} from '../AppNotification'

describe('AppNotification', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.getElementById(APP_NOTIFICATION_REGION_ID)?.remove()
  })

  it('renders in the global toast notification region', () => {
    const { container } = render(
      <main>
        <AppNotification kind="error" title="Upload error" subtitle="Upload failed." />
      </main>,
    )

    const notificationRegion = document.getElementById('lexis-toast-notification-region')

    expect(notificationRegion).toBeTruthy()
    expect(container.querySelector('main')).toBeEmptyDOMElement()
    expect(notificationRegion).toContainElement(screen.getByText('Upload error'))
    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
  })

  it('only renders a close control when the caller can dismiss the notification', () => {
    render(
      <AppNotification
        kind="warning"
        title="Lookup unavailable"
        subtitle="Try again later."
        onCloseButtonClick={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'close notification' })).toBeInTheDocument()
  })

  it('uses low-contrast toast styling by default', () => {
    render(<AppNotification kind="error" title="Upload error" subtitle="Upload failed." />)

    expect(document.querySelector('.cds--toast-notification')).toHaveClass(
      'cds--toast-notification--low-contrast',
    )
  })

  it('allows high-contrast toast styling when explicitly requested', () => {
    render(
      <AppNotification
        kind="error"
        lowContrast={false}
        title="Upload error"
        subtitle="Upload failed."
      />,
    )

    expect(document.querySelector('.cds--toast-notification')).not.toHaveClass(
      'cds--toast-notification--low-contrast',
    )
  })

  it('syncs the toast notification region to the selected app theme', () => {
    const lightRegion = syncAppNotificationRegionTheme(false)!

    expect(lightRegion).toHaveClass('app-notification-region')
    expect(lightRegion).toHaveClass('cds--white')
    expect(lightRegion).not.toHaveClass('cds--g100')

    const darkRegion = syncAppNotificationRegionTheme(true)!

    expect(darkRegion).toBe(lightRegion)
    expect(darkRegion).toHaveClass('cds--g100')
    expect(darkRegion).not.toHaveClass('cds--white')
  })

  it('auto-dismisses success notifications after the FSPTS timing and exit animation', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()

    render(
      <AppNotification
        kind="success"
        title="Saved"
        subtitle="Changes saved."
        onCloseButtonClick={onClose}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(5699)
    })
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(document.querySelector('.app-notification')).toHaveClass('app-notification--exiting')
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('honours a caller-provided success timeout without applying a minimum', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()

    render(
      <AppNotification
        kind="success"
        title="Saved"
        subtitle="Changes saved."
        autoDismissMs={1000}
        onCloseButtonClick={onClose}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(document.querySelector('.app-notification')).toHaveClass('app-notification--exiting')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows only the newest active notification without resurfacing the previous one', () => {
    const { rerender } = render(
      <>
        <AppNotification kind="warning" title="Earlier warning" subtitle="First message." />
        <AppNotification kind="error" title="Latest error" subtitle="Second message." />
      </>,
    )

    expect(screen.queryByText('Earlier warning')).not.toBeInTheDocument()
    expect(screen.getByText('Latest error')).toBeVisible()

    rerender(<AppNotification kind="warning" title="Earlier warning" subtitle="First message." />)

    expect(screen.queryByText('Earlier warning')).not.toBeInTheDocument()
    expect(screen.queryByText('Latest error')).not.toBeInTheDocument()
  })

  it('does not auto-dismiss error notifications', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()

    render(
      <AppNotification
        kind="error"
        title="Upload error"
        subtitle="Upload failed."
        autoDismissMs={1000}
        onCloseButtonClick={onClose}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not render raw technical response content', () => {
    render(
      <AppNotification
        kind="error"
        title="Submission failed"
        subtitle='{"timestamp":"2026-06-16T18:13:00Z","status":500,"error":"Internal Server Error","path":"/api/v1/fsp/submissions"}'
      />,
    )

    expect(screen.queryByText(/api\/v1\/fsp\/submissions/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Something went wrong. Please try again. If the problem persists, contact your administrator.',
      ),
    ).toBeInTheDocument()
  })
})
