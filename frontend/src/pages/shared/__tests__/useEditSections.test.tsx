import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDirtyForm } from '@/pages/shared/useDirtyForm'
import { useEditSections } from '@/pages/shared/useEditSections'

type Section = 'permit' | 'shipping'

const SAVED: Record<Section, string> = { permit: 'Active', shipping: 'Barge' }
const LABELS: Record<Section, string> = { permit: 'Status', shipping: 'Transport type' }

const Harness = ({
  onLeave = vi.fn(),
  loadFieldsLater = false,
  pageDraftDirty = false,
  pageBusy = false,
  onDiscardPageDraft,
}: {
  onLeave?: () => void
  loadFieldsLater?: boolean
  pageDraftDirty?: boolean
  pageBusy?: boolean
  onDiscardPageDraft?: () => void
}) => {
  const [saved, setSaved] = useState(SAVED)
  const [draft, setDraft] = useState(SAVED)
  const [fieldsReady, setFieldsReady] = useState(!loadFieldsLater)
  const isDirty = useDirtyForm(saved, draft)
  const sections = useEditSections<Section>({
    isDirty,
    onDiscard: () => setDraft(saved),
    leaveGuard: onDiscardPageDraft
      ? {
          isDirty: isDirty || pageDraftDirty,
          isBusy: pageBusy,
          onDiscard: () => {
            setDraft(saved)
            onDiscardPageDraft()
          },
        }
      : undefined,
  })

  const card = (section: Section) => (
    <section aria-label={`${section} card`} ref={sections.sectionRef(section)}>
      {sections.isEditing(section) ? (
        <>
          {fieldsReady ? (
            <>
              <input aria-label="Locked number" disabled value="9021022" readOnly />
              <label htmlFor={`${section}-field`}>{LABELS[section]}</label>
              <input
                id={`${section}-field`}
                value={draft[section]}
                onChange={(event) => setDraft({ ...draft, [section]: event.target.value })}
              />
            </>
          ) : (
            <button type="button" onClick={() => setFieldsReady(true)}>
              Finish loading
            </button>
          )}
          <button type="button" onClick={sections.cancelEditing}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setSaved(draft)
              sections.finishEditing()
            }}
          >
            Save changes
          </button>
        </>
      ) : (
        <button
          type="button"
          ref={sections.editButtonRef(section)}
          onClick={() => sections.startEditing(section)}
        >
          Edit {section}
        </button>
      )}
    </section>
  )

  return (
    <>
      {card('permit')}
      {card('shipping')}
      <button type="button" onClick={() => sections.confirmLeave(onLeave)}>
        Fees tab
      </button>
      {sections.discardModal}
    </>
  )
}

// The record reloads after a save, so its Edit button returns several seconds later.
const ReloadingHarness = () => {
  const [reloading, setReloading] = useState(false)
  const sections = useEditSections<Section>({ isDirty: false, onDiscard: vi.fn() })
  return (
    <section ref={sections.sectionRef('permit')}>
      {sections.isEditing('permit') ? (
        <button
          type="button"
          onClick={() => {
            sections.finishEditing()
            setReloading(true)
            setTimeout(() => setReloading(false), 5_000)
          }}
        >
          Save changes
        </button>
      ) : reloading ? (
        <p>Loading…</p>
      ) : (
        <button
          type="button"
          ref={sections.editButtonRef('permit')}
          onClick={() => sections.startEditing('permit')}
        >
          Edit permit
        </button>
      )}
    </section>
  )
}

const permitCard = () => screen.getByRole('region', { name: 'permit card' })
const shippingCard = () => screen.getByRole('region', { name: 'shipping card' })

const ReusedEditButtonHarness = () => {
  const sections = useEditSections<Section>({ isDirty: false, onDiscard: vi.fn() })
  const editing = sections.isEditing('permit')
  return (
    <section ref={sections.sectionRef('permit')}>
      <div>{editing && <input aria-label="Status" defaultValue="Active" />}</div>
      <button
        ref={editing ? undefined : sections.editButtonRef('permit')}
        onClick={editing ? sections.cancelEditing : () => sections.startEditing('permit')}
      >
        {editing ? 'Cancel' : 'Edit permit'}
      </button>
    </section>
  )
}

describe('useEditSections', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('focuses the field when React reuses the Edit button as Cancel', async () => {
    render(<ReusedEditButtonHarness />)
    const edit = screen.getByRole('button', { name: 'Edit permit' })
    await userEvent.click(edit)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(edit)
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
  })

  it('focuses the first editable field on edit and the Edit button after Save', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Edit permit' }))

    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
    await user.type(screen.getByLabelText('Status'), ' now')
    await user.click(within(permitCard()).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit permit' })).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits for fields that render after edit mode starts', async () => {
    const user = userEvent.setup()
    render(<Harness loadFieldsLater />)

    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    screen.getByRole('button', { name: 'Finish loading' }).click()

    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
  })

  it('cancels without asking when nothing changed, returning focus to Edit', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))

    await user.click(within(permitCard()).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit permit' })).toHaveFocus())
  })

  it('asks before cancelling changes, and Keep editing keeps them', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await user.type(await screen.findByLabelText('Status'), ' now')

    await user.click(within(permitCard()).getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Status')).toHaveValue('Active now')
    await waitFor(() =>
      expect(within(permitCard()).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    )
  })

  it('discards changes on Discard and returns focus to Edit', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await user.type(await screen.findByLabelText('Status'), ' now')

    await user.click(within(permitCard()).getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit permit' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    expect(await screen.findByLabelText('Status')).toHaveValue('Active')
  })

  it('lets only one section edit at a time', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))

    // A clean section gives way without asking.
    await user.click(screen.getByRole('button', { name: 'Edit shipping' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(permitCard()).queryByLabelText('Status')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Transport type')).toHaveFocus())

    await user.type(screen.getByLabelText('Transport type'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Transport type')).toHaveValue('Barge 2')
    expect(within(permitCard()).queryByLabelText('Status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
    expect(within(shippingCard()).queryByLabelText('Transport type')).not.toBeInTheDocument()
  })

  it('asks before leaving a changed section and leaves edit mode on Discard', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await user.type(await screen.findByLabelText('Status'), ' now')

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    expect(onLeave).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit permit' })).not.toHaveFocus()
  })

  it('leaves a clean section without asking', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
  })

  it('asks before leaving a changed page draft without an active edit section', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    const onDiscardPageDraft = vi.fn()
    render(<Harness pageDraftDirty onLeave={onLeave} onDiscardPageDraft={onDiscardPageDraft} />)

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(onLeave).not.toHaveBeenCalled()
    expect(onDiscardPageDraft).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(onDiscardPageDraft).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('uses one prompt for a section draft and other page drafts', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    const onDiscardPageDraft = vi.fn()
    const { rerender } = render(
      <Harness onLeave={onLeave} onDiscardPageDraft={onDiscardPageDraft} />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    onDiscardPageDraft.mockClear()
    await user.type(await screen.findByLabelText('Status'), ' now')
    rerender(<Harness pageDraftDirty onLeave={onLeave} onDiscardPageDraft={onDiscardPageDraft} />)

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Status')).toHaveValue('Active now')
    expect(onDiscardPageDraft).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(onDiscardPageDraft).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('asks before replacing an independent page draft with an edit section', async () => {
    const user = userEvent.setup()
    const onDiscardPageDraft = vi.fn()
    render(<Harness pageDraftDirty onDiscardPageDraft={onDiscardPageDraft} />)
    const edit = screen.getByRole('button', { name: 'Edit permit' })

    await user.click(edit)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(onDiscardPageDraft).not.toHaveBeenCalled()
    await waitFor(() => expect(edit).toHaveFocus())

    await user.click(edit)
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onDiscardPageDraft).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
  })

  it('waits for page work to finish before starting another editor', async () => {
    const user = userEvent.setup()
    const onDiscardPageDraft = vi.fn()
    const { rerender } = render(<Harness pageBusy onDiscardPageDraft={onDiscardPageDraft} />)

    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDiscardPageDraft).not.toHaveBeenCalled()

    rerender(<Harness onDiscardPageDraft={onDiscardPageDraft} />)
    await user.click(screen.getByRole('button', { name: 'Edit permit' }))
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
  })

  it('waits for page work to finish before leaving', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    const onDiscardPageDraft = vi.fn()
    const { rerender } = render(
      <Harness pageBusy onLeave={onLeave} onDiscardPageDraft={onDiscardPageDraft} />,
    )

    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDiscardPageDraft).not.toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()

    rerender(<Harness onLeave={onLeave} onDiscardPageDraft={onDiscardPageDraft} />)
    await user.click(screen.getByRole('button', { name: 'Fees tab' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the Edit button on the visible tab when a section has two', async () => {
    const user = userEvent.setup()
    const TwoButtons = () => {
      const [editingSection, setEditingSection] = useState<Section | null>(null)
      const [tab, setTab] = useState<'permit' | 'fees'>('fees')
      const sections = useEditSections<Section>({
        isDirty: false,
        onDiscard: vi.fn(),
        state: [editingSection, setEditingSection],
      })
      const panel = (id: 'permit' | 'fees') => (
        <div role="tabpanel" aria-label={id} hidden={tab !== id}>
          {editingSection === 'permit' ? (
            <section ref={sections.sectionRef('permit')}>
              <label htmlFor={`${id}-receipt`}>{id} field</label>
              <input id={`${id}-receipt`} />
              <button type="button" onClick={sections.finishEditing}>
                Save {id}
              </button>
            </section>
          ) : (
            <button
              type="button"
              ref={sections.editButtonRef('permit')}
              onClick={() => sections.startEditing('permit')}
            >
              Edit from {id}
            </button>
          )}
        </div>
      )
      return (
        <>
          <button type="button" onClick={() => setTab(tab === 'fees' ? 'permit' : 'fees')}>
            Switch tab
          </button>
          {panel('permit')}
          {panel('fees')}
        </>
      )
    }
    render(<TwoButtons />)

    await user.click(screen.getByRole('button', { name: 'Edit from fees' }))
    await waitFor(() => expect(screen.getByLabelText('fees field')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Save fees' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit from fees' })).toHaveFocus(),
    )
  })

  it('returns focus to Edit when a save reloads the record before the button returns', async () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'Date',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    render(<ReloadingHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit permit' }))
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(screen.getByRole('button', { name: 'Edit permit' })).toHaveFocus()
  })
})
