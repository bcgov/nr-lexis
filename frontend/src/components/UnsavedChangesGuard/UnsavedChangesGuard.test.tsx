import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { discardNewRecordCopy } from '@/components/DiscardChangesModal'
import { authorizePageUnload } from '@/utils/page-unload'

import UnsavedChangesGuard, { formValuesEqual } from './index'

type HarnessProps = {
  isBusy?: boolean
  onDiscard?: () => void
  newRecord?: boolean
}

const GuardHarness = ({ isBusy = false, onDiscard, newRecord = false }: HarnessProps) => {
  const [value, setValue] = useState('saved')
  const isDirty = !formValuesEqual({ value }, { value: 'saved' })

  return (
    <>
      <label htmlFor="guard-value">Record value</label>
      <input id="guard-value" value={value} onChange={(event) => setValue(event.target.value)} />
      <Link to="?filter=active">Filter this record</Link>
      <Link to="/edit/two">Other record</Link>
      <Link to="/next">Next page</Link>
      <UnsavedChangesGuard
        isDirty={isDirty}
        isBusy={isBusy}
        onDiscard={() => {
          setValue('saved')
          onDiscard?.()
        }}
        discardCopy={newRecord ? discardNewRecordCopy('record') : undefined}
        subject="the test record"
      />
    </>
  )
}

const renderGuard = (options: HarnessProps = {}) => {
  const router = createMemoryRouter(
    [
      { path: '/edit/:recordId', element: <GuardHarness {...options} /> },
      { path: '/next', element: <h1>Next page</h1> },
    ],
    { initialEntries: ['/edit/one'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const changeValue = async () => {
  await userEvent.clear(screen.getByLabelText('Record value'))
  await userEvent.type(screen.getByLabelText('Record value'), 'changed')
}

const makeDirtyAndLeave = async (title = 'Discard changes?') => {
  await changeValue()
  await userEvent.click(screen.getByRole('link', { name: 'Next page' }))
  return screen.findByRole('dialog', { name: title })
}

describe('UnsavedChangesGuard', () => {
  it('allows clean navigation without opening the dialog', async () => {
    const router = renderGuard()

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks to discard changes with Keep editing focused and no save option', async () => {
    renderGuard()

    const dialog = await makeDirtyAndLeave()

    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveClass('cds--btn--danger')
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  })

  it('stays on the page and returns focus to where the user was on Keep editing', async () => {
    const router = renderGuard()
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/edit/one')
    expect(screen.getByLabelText('Record value')).toHaveValue('changed')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Next page' })).toHaveFocus())
  })

  it('discards changes and completes the navigation', async () => {
    const onDiscard = vi.fn()
    const router = renderGuard({ onDiscard })
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/next')
  })

  it('uses the new record copy on create pages', async () => {
    const router = renderGuard({ newRecord: true })

    const dialog = await makeDirtyAndLeave('Discard this record?')

    expect(dialog).toHaveAccessibleDescription(
      "The record hasn't been created yet. Everything you've entered will be lost.",
    )
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
  })

  it('resets drafts before navigating between records that reuse the same route component', async () => {
    const onDiscard = vi.fn()
    const router = renderGuard({ onDiscard })
    await changeValue()

    await userEvent.click(screen.getByRole('link', { name: 'Other record' }))
    await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/edit/two'))
    expect(screen.getByLabelText('Record value')).toHaveValue('saved')
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('allows same-record query and hash changes without asking', async () => {
    const router = renderGuard()
    await changeValue()

    await userEvent.click(screen.getByRole('link', { name: 'Filter this record' }))

    await waitFor(() => expect(router.state.location.search).toBe('?filter=active'))
    expect(router.state.location.pathname).toBe('/edit/one')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('prevents discarding while the page reports another change in flight', async () => {
    const onDiscard = vi.fn()
    const router = renderGuard({ isBusy: true, onDiscard })
    await makeDirtyAndLeave()

    const discard = screen.getByRole('button', { name: 'Discard changes' })
    expect(discard).toBeDisabled()
    await userEvent.click(discard)

    expect(onDiscard).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/edit/one')
  })

  it('blocks navigation and native unload while busy even when nothing changed', async () => {
    const router = renderGuard({ isBusy: true })

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))

    const dialog = await screen.findByRole('dialog', { name: 'Change in progress' })
    expect(dialog).toHaveAccessibleDescription(/is still being completed/)
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/edit/one')
    const busyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(busyUnload)
    expect(busyUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/edit/one')
  })

  it('closes a blocked busy dialog when the change finishes', async () => {
    let updateBusyExternally: ((busy: boolean) => void) | undefined
    const ExternalBusyHarness = () => {
      const [busy, setBusy] = useState(true)
      updateBusyExternally = setBusy
      return <GuardHarness isBusy={busy} />
    }
    const router = createMemoryRouter(
      [
        { path: '/edit/:recordId', element: <ExternalBusyHarness /> },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/edit/one'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))
    await screen.findByRole('dialog', { name: 'Change in progress' })
    await act(async () => updateBusyExternally?.(false))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Change in progress' })).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe('/edit/one')
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveFocus()
  })

  it('prevents a changed native unload unless it was explicitly authorized', async () => {
    renderGuard()

    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)

    await changeValue()
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    authorizePageUnload()
    const authorizedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(authorizedUnload)
    expect(authorizedUnload.defaultPrevented).toBe(false)
  })
})
