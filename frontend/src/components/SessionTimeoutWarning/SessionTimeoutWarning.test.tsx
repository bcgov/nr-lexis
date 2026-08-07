import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SessionTimeoutWarning, { formatSessionCountdown } from './index'

const FIVE_MINUTES_MS = 5 * 60 * 1000

type WarningHarnessProps = {
  expiresAt: number
  onStayLoggedIn: () => void
  onLogOut: () => void
}

const WarningHarness = ({ expiresAt, onStayLoggedIn, onLogOut }: WarningHarnessProps) => {
  const launcherButtonRef = useRef<HTMLElement | null>(null)

  return (
    <SessionTimeoutWarning
      open
      expiresAt={expiresAt}
      launcherButtonRef={launcherButtonRef}
      onStayLoggedIn={onStayLoggedIn}
      onLogOut={onLogOut}
    />
  )
}

const renderWarning = () => {
  const onStayLoggedIn = vi.fn()
  const onLogOut = vi.fn()
  const expiresAt = Date.now() + FIVE_MINUTES_MS

  render(
    <WarningHarness expiresAt={expiresAt} onStayLoggedIn={onStayLoggedIn} onLogOut={onLogOut} />,
  )

  return { onLogOut, onStayLoggedIn }
}

const FocusHarness = () => {
  const [open, setOpen] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const launcherButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={launcherButtonRef}
        type="button"
        onClick={() => {
          setExpiresAt(Date.now() + FIVE_MINUTES_MS)
          setOpen(true)
        }}
      >
        Open session warning
      </button>
      <SessionTimeoutWarning
        open={open}
        expiresAt={expiresAt}
        launcherButtonRef={launcherButtonRef}
        onStayLoggedIn={() => setOpen(false)}
        onLogOut={vi.fn()}
      />
    </>
  )
}

describe('SessionTimeoutWarning', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'))
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-carbon-theme')
    vi.useRealTimers()
  })

  it('formats the remaining time as minutes and seconds', () => {
    expect(formatSessionCountdown(300)).toBe('5:00')
    expect(formatSessionCountdown(9)).toBe('0:09')
    expect(formatSessionCountdown(-1)).toBe('0:00')
  })

  it('requires an explicit choice and gives an urgent warning in the final 30 seconds', () => {
    const { onLogOut, onStayLoggedIn } = renderWarning()

    const dialog = screen.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('5:00').parentElement).toHaveAttribute('aria-live', 'polite')
    expect(document.querySelector('.lexis-session-timeout-warning__urgency-icon')).toHaveAttribute(
      'hidden',
    )
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(document.querySelector('.lexis-session-timeout-warning__overlay')).toBeInTheDocument()
    expect(dialog).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(
      document.querySelector('.lexis-session-timeout-warning__overlay') as HTMLElement,
    )
    expect(dialog).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000 + 30 * 1000)
    })

    const countdown = screen.getByText('0:30')
    expect(countdown).toHaveClass('lexis-session-timeout-warning__countdown--urgent')
    expect(
      document.querySelector('.lexis-session-timeout-warning__urgency-icon'),
    ).not.toHaveAttribute('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onStayLoggedIn).toHaveBeenCalledTimes(1)
    expect(onLogOut).toHaveBeenCalledTimes(1)
  })

  it('applies the active Carbon theme to the portal', () => {
    document.documentElement.setAttribute('data-carbon-theme', 'g100')

    renderWarning()

    expect(document.querySelector('.lexis-session-timeout-warning__overlay')).toHaveClass(
      'cds--g100',
    )
  })

  it('traps focus and returns it to the launcher after the user stays logged in', async () => {
    render(<FocusHarness />)

    const launcher = screen.getByRole('button', { name: 'Open session warning' })
    launcher.focus()
    fireEvent.click(launcher)

    const dialog = screen.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    const stayLoggedInButton = screen.getByRole('button', { name: 'Stay logged in' })
    const logOutButton = screen.getByRole('button', { name: 'Log out' })
    expect(dialog).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(stayLoggedInButton).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(logOutButton).toHaveFocus()

    await act(async () => {
      fireEvent.click(stayLoggedInButton)
    })

    expect(document.activeElement).toBe(launcher)
  })
})
