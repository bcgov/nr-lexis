import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import UnsavedChangesGuard, { formValuesEqual } from './index'

type HarnessProps = {
  isBusy?: boolean
  onDiscard?: () => void
  onSave: () => Promise<boolean>
  saveUnavailableReason?: string
  saveAcknowledgement?: {
    description: string
    label: string
  }
}

const GuardHarness = ({
  isBusy = false,
  onDiscard,
  onSave,
  saveUnavailableReason,
  saveAcknowledgement,
}: HarnessProps) => {
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
        onSave={onSave}
        onDiscard={() => {
          setValue('saved')
          onDiscard?.()
        }}
        subject="the test record"
        saveUnavailableReason={saveUnavailableReason}
        saveAcknowledgement={saveAcknowledgement}
      />
    </>
  )
}

const renderGuard = (
  onSave: () => Promise<boolean>,
  options: Omit<HarnessProps, 'onSave'> = {},
) => {
  const router = createMemoryRouter(
    [
      { path: '/edit/:recordId', element: <GuardHarness onSave={onSave} {...options} /> },
      { path: '/next', element: <h1>Next page</h1> },
      { path: '/other', element: <h1>Other page</h1> },
    ],
    { initialEntries: ['/edit/one'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const makeDirtyAndLeave = async () => {
  await userEvent.clear(screen.getByLabelText('Record value'))
  await userEvent.type(screen.getByLabelText('Record value'), 'changed')
  await userEvent.click(screen.getByRole('link', { name: 'Next page' }))
  await screen.findByRole('dialog', { name: 'Unsaved changes' })
}

describe('UnsavedChangesGuard', () => {
  it('allows clean navigation without opening the dialog', async () => {
    const router = renderGuard(vi.fn().mockResolvedValue(true))

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
  })

  it('stays on the dirty page when Stay is selected', async () => {
    const router = renderGuard(vi.fn().mockResolvedValue(true))
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))

    expect(router.state.location.pathname).toBe('/edit/one')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Record value')).toHaveValue('changed')
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveFocus()
  })

  it('discards changes and proceeds with the blocked navigation', async () => {
    const onDiscard = vi.fn()
    const router = renderGuard(vi.fn().mockResolvedValue(true), { onDiscard })
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Discard and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/next')
  })

  it('resets drafts before navigating between records that reuse the same route component', async () => {
    const onDiscard = vi.fn()
    const router = renderGuard(vi.fn().mockResolvedValue(true), { onDiscard })
    await userEvent.clear(screen.getByLabelText('Record value'))
    await userEvent.type(screen.getByLabelText('Record value'), 'changed')

    await userEvent.click(screen.getByRole('link', { name: 'Other record' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Discard and leave' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/edit/two'))
    expect(screen.getByLabelText('Record value')).toHaveValue('saved')
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('allows same-record query and hash changes without blocking filter navigation', async () => {
    const router = renderGuard(vi.fn().mockResolvedValue(true))
    await userEvent.clear(screen.getByLabelText('Record value'))
    await userEvent.type(screen.getByLabelText('Record value'), 'changed')

    await userEvent.click(screen.getByRole('link', { name: 'Filter this record' }))

    await waitFor(() => expect(router.state.location.search).toBe('?filter=active'))
    expect(router.state.location.pathname).toBe('/edit/one')
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
  })

  it('saves successfully before proceeding', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const router = renderGuard(onSave)
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/next')
  })

  it('keeps the blocked navigation open when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    const router = renderGuard(onSave)
    await makeDirtyAndLeave()

    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByText('Could not finish saving changes')).toBeInTheDocument()
    expect(screen.getByText(/Some changes may already have been saved/)).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/edit/one')
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
  })

  it('requires and resets an optional save acknowledgement', async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    renderGuard(onSave, {
      saveAcknowledgement: {
        description: 'Confirm that the record is accurate.',
        label: 'I Agree',
      },
    })
    await makeDirtyAndLeave()

    const acknowledgement = screen.getByRole('checkbox', { name: 'I Agree' })
    const saveButton = screen.getByRole('button', { name: 'Save and leave' })
    expect(acknowledgement).not.toBeChecked()
    expect(saveButton).toBeDisabled()
    await userEvent.click(saveButton)
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(acknowledgement)
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)

    expect(await screen.findByText('Could not finish saving changes')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: 'I Agree' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save and leave' })).toBeDisabled()
  })

  it('prevents save and discard while the page reports another mutation in flight', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onDiscard = vi.fn()
    const router = renderGuard(onSave, { isBusy: true, onDiscard })
    await makeDirtyAndLeave()

    expect(screen.getByRole('button', { name: 'Save and leave' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard and leave' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard and leave' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/edit/one')
  })

  it('blocks navigation and native unload while externally busy even after drafts are clean', async () => {
    const router = renderGuard(vi.fn().mockResolvedValue(true), { isBusy: true })

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))

    const dialog = await screen.findByRole('dialog', { name: 'Change in progress' })
    expect(dialog).toHaveAccessibleDescription(/is still being completed/)
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard and leave' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/edit/one')
    const busyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(busyUnload)
    expect(busyUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/edit/one')
  })

  it('closes a blocked busy dialog when the external operation finishes', async () => {
    let updateBusyExternally: ((busy: boolean) => void) | undefined
    const ExternalBusyHarness = () => {
      const [busy, setBusy] = useState(true)
      updateBusyExternally = setBusy
      return <GuardHarness isBusy={busy} onSave={vi.fn().mockResolvedValue(true)} />
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

  it('does not offer Save and leave when the page cannot safely automate its draft', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    renderGuard(onSave, {
      saveUnavailableReason: 'Finish or reset the queued upload before leaving.',
    })
    await makeDirtyAndLeave()

    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toHaveAccessibleDescription(
      /Finish or reset the queued upload/,
    )
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not follow a superseded navigation target after an awaited save', async () => {
    let resolveSave: ((saved: boolean) => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve
        }),
    )
    const router = renderGuard(onSave)
    await makeDirtyAndLeave()
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    await act(async () => {
      void router.navigate('/other')
    })
    await act(async () => resolveSave?.(true))

    await waitFor(() => expect(router.state.location.pathname).toBe('/edit/one'))
    expect(screen.queryByRole('heading', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Other page' })).not.toBeInTheDocument()
  })

  it('associates the visible explanation with the Carbon dialog', async () => {
    renderGuard(vi.fn().mockResolvedValue(true))
    await makeDirtyAndLeave()

    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toHaveAccessibleDescription(
      /You have unsaved changes to the test record/,
    )
  })

  it('prevents native unload only while dirty', async () => {
    renderGuard(vi.fn().mockResolvedValue(true))

    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)

    await userEvent.clear(screen.getByLabelText('Record value'))
    await userEvent.type(screen.getByLabelText('Record value'), 'changed')
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)
  })
})
