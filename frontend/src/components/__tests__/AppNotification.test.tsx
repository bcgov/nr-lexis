import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppNotification } from '../AppNotification'
import { AppToastNotification, APP_NOTIFICATION_REGION_ID } from '../AppToastNotification'
import ConfirmationModal from '../ConfirmationModal'

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

describe('AppNotification scrolling', () => {
  const bounds = (top: number, bottom: number) => new DOMRect(0, top, 400, bottom - top)
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      bounds(0, 100),
    ] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    { top: 100, bottom: 180, expectedScroll: 0 },
    { top: 600, bottom: 700, expectedScroll: 300 },
    { top: 600.25, bottom: 700.25, expectedScroll: 301 },
    { top: 400, bottom: 900, expectedScroll: 300 },
    { top: 250, bottom: 350, expectedScroll: 100 },
  ])(
    'reveals a caller-owned error within the dialog ($top–$bottom)',
    ({ top, bottom, expectedScroll }) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('cds--modal-content')
          ? bounds(200, 500)
          : bounds(top, bottom)
      })
      render(
        <ConfirmationModal
          open
          title="Approve applications"
          errorMessage="Approval failed. Please try again."
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      )
      const dialog = screen.getByRole('dialog')
      const content = dialog.querySelector<HTMLElement>('.cds--modal-content')!
      Object.defineProperty(content, 'clientHeight', { value: 300 })
      content.scrollTop = 100
      const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
      cancel.focus()

      act(() => frames.forEach((callback) => callback(0)))

      expect(content.scrollTop).toBe(expectedScroll)
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
      expect(cancel).toHaveFocus()
      expect(within(dialog).queryByRole('button', { name: 'close notification' })).toBeNull()
    },
  )

  it.each([false, true])(
    'only scrolls page action feedback without a dialog (open: %s)',
    (open) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        bounds(window.innerHeight + 100, window.innerHeight + 200),
      )
      render(
        <>
          <AppNotification kind="error" title="Save failed" onCloseButtonClick={() => {}} />
          {open && <div className="cds--modal is-visible" role="dialog" />}
        </>,
      )
      act(() => frames.forEach((callback) => callback(0)))
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(open ? 0 : 1)
    },
  )

  it('leaves informational page banners in place', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      bounds(window.innerHeight + 100, window.innerHeight + 200),
    )
    render(<AppNotification kind="info" title="Application requirements" />)
    act(() => frames.forEach((callback) => callback(0)))
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})
