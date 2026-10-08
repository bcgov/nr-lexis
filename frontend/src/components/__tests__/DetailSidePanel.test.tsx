import { Dropdown, Modal } from '@carbon/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState, type ReactNode } from 'react'
import { afterEach, vi } from 'vitest'

import DetailSidePanel from '@/components/DetailSidePanel'

const RemarkPanel = ({
  onClose,
  children,
  busy = false,
}: {
  onClose?: () => void
  children?: ReactNode
  busy?: boolean
}) => {
  const launcherRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className="detail-page">
      <button ref={launcherRef} type="button" onClick={() => setOpen(true)}>
        Add remark
      </button>
      <button type="button">Page action</button>
      <DetailSidePanel
        open={open}
        title="Add remark"
        contentSelector=".detail-page"
        initialFocusSelector="#remark"
        launcherRef={launcherRef}
        busy={busy}
        fallbackFocusSelector=".detail-page button"
        actions={[
          { label: 'Cancel', kind: 'tertiary', onClick: () => setOpen(false) },
          { label: 'Save remark', kind: 'primary', onClick: () => undefined },
        ]}
        onClose={() => {
          onClose?.()
          setOpen(false)
        }}
      >
        <textarea id="remark" aria-label="Remark" />
        {children}
      </DetailSidePanel>
    </div>
  )
}

const mockScreenWidth = (wide: boolean) => {
  const originalMatchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...originalMatchMedia(query),
    matches: wide && query === '(min-width: 1312px)',
  }))
}

describe('DetailSidePanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['beside the page', true],
    ['over part of the page', false],
  ])('leaves the page usable %s', async (_layout, wide) => {
    mockScreenWidth(wide)
    const { container } = render(<RemarkPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    const panel = await screen.findByRole('complementary', { name: 'Add remark' })
    await waitFor(() => expect(screen.getByLabelText('Remark')).toHaveFocus())

    expect(container.querySelector('.c4p--side-panel__overlay')).toBeNull()
    expect(panel).toHaveClass('c4p--side-panel--slide-in')
    expect(panel.classList.contains('detail-side-panel--over-page')).toBe(!wide)
    // Only a page with room moves aside for the panel.
    const page = container.querySelector<HTMLElement>('.detail-page')
    expect(page?.style.marginInlineEnd).toBe(wide ? '30rem' : '')

    // Tab moves past the panel's last control rather than wrapping inside it.
    screen.getByRole('button', { name: 'Save remark' }).focus()
    await userEvent.tab()
    expect(panel).not.toContainElement(document.activeElement as HTMLElement)
    screen.getByRole('button', { name: 'Page action' }).focus()
    expect(screen.getByRole('button', { name: 'Page action' })).toHaveFocus()
  })

  it('closes on Escape or × and returns focus to the launcher', async () => {
    render(<RemarkPanel />)
    const launcher = screen.getByRole('button', { name: 'Add remark' })

    await userEvent.click(launcher)
    await waitFor(() => expect(screen.getByLabelText('Remark')).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Add remark' })).not.toBeInTheDocument()
    await waitFor(() => expect(launcher).toHaveFocus())

    await userEvent.click(launcher)
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('complementary', { name: 'Add remark' })).not.toBeInTheDocument()
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('lets Escape close an open menu before it closes the panel', async () => {
    const onClose = vi.fn()
    render(
      <RemarkPanel onClose={onClose}>
        <Dropdown
          id="remarkType"
          titleText="Remark type"
          label=""
          items={['Staff', 'Public']}
          onChange={() => undefined}
        />
      </RemarkPanel>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    const remarkType = await screen.findByRole('combobox', { name: 'Remark type' })

    await userEvent.click(remarkType)
    expect(screen.getByRole('option', { name: 'Staff' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('option', { name: 'Staff' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(remarkType).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from a collapsed Dropdown after native Escape first dismisses its menu', async () => {
    const onClose = vi.fn()
    render(
      <RemarkPanel onClose={onClose}>
        <Dropdown
          id="nativeRemarkType"
          titleText="Remark type"
          label=""
          items={['Staff', 'Public']}
        />
      </RemarkPanel>,
    )
    const launcher = screen.getByRole('button', { name: 'Add remark' })
    await userEvent.click(launcher)
    const dropdown = await screen.findByRole('combobox', { name: 'Remark type' })
    await userEvent.click(dropdown)
    expect(dropdown).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(dropdown, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 })
    expect(dropdown).toHaveAttribute('aria-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(dropdown, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 })
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('keeps a busy panel open on native Escape from a collapsed Dropdown', async () => {
    const onClose = vi.fn()
    render(
      <RemarkPanel onClose={onClose} busy>
        <Dropdown id="busyRemarkType" titleText="Remark type" label="" items={['Staff']} />
      </RemarkPanel>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    const dropdown = await screen.findByRole('combobox', { name: 'Remark type' })
    dropdown.focus()
    fireEvent.keyDown(dropdown, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('complementary', { name: 'Add remark' })).toBeInTheDocument()
  })

  it('leaves Escape to a dialog above the panel', async () => {
    const onClose = vi.fn()
    const onDialogClose = vi.fn()
    render(
      <RemarkPanel onClose={onClose}>
        <Modal open modalHeading="Discard changes?" passiveModal onRequestClose={onDialogClose}>
          <button type="button">Keep editing</button>
        </Modal>
      </RemarkPanel>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))

    fireEvent.keyDown(await screen.findByRole('button', { name: 'Keep editing' }), {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
    })
    expect(onDialogClose).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the page pushed aside when a closed panel on it unmounts', async () => {
    mockScreenWidth(true)
    const launcherRef = { current: null }
    const panel = (title: string, open: boolean) => (
      <DetailSidePanel
        open={open}
        title={title}
        contentSelector=".detail-page"
        initialFocusSelector="#remark"
        launcherRef={launcherRef}
        fallbackFocusSelector=".detail-page"
        actions={[]}
        onClose={() => undefined}
      >
        <textarea id="remark" aria-label="Remark" />
      </DetailSidePanel>
    )
    const page = (withClosedPanel: boolean) => (
      <div>
        <div className="detail-page" />
        {panel('Add documents', true)}
        {withClosedPanel && panel('Add scale', false)}
      </div>
    )
    const { container, rerender } = render(page(true))
    await screen.findByRole('complementary', { name: 'Add documents' })
    const content = container.querySelector<HTMLElement>('.detail-page')
    await waitFor(() => expect(content?.style.marginInlineEnd).toBe('30rem'))

    rerender(page(false))
    expect(content?.style.marginInlineEnd).toBe('30rem')
  })

  it('does not close on an Escape pressed on the page', async () => {
    const onClose = vi.fn()
    render(<RemarkPanel onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    await screen.findByRole('complementary', { name: 'Add remark' })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Page action' }), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
