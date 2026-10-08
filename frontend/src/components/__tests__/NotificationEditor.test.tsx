import { describe, expect, it, vi } from 'vitest'
import NotificationEditor from '@/components/NotificationEditor'
import { fireEvent, render, screen, userEvent, waitFor, within } from '@/test-utils'

describe('NotificationEditor', () => {
  it.each([
    'Legacy plain content',
    '<div>Legacy block content</div>',
    '<p><span>Legacy formatted content</span></p>',
  ])(
    'does not emit a user change while initializing or disabling legacy content: %s',
    async (value) => {
      const onChange = vi.fn()
      const { rerender } = render(<NotificationEditor value={value} onChange={onChange} />)
      const editor = await screen.findByLabelText('Notification content editor')
      await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'true'))
      expect(onChange).not.toHaveBeenCalled()
      rerender(<NotificationEditor value={value} disabled onChange={onChange} />)
      await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'false'))
      rerender(<NotificationEditor value={value} onChange={onChange} />)
      await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'true'))
      expect(onChange).not.toHaveBeenCalled()
      editor.innerHTML = '<p>Genuine input update</p>'
      fireEvent.input(editor, { inputType: 'insertText', data: ' update' })
      await waitFor(() => expect(onChange).toHaveBeenCalled())
      expect(onChange.mock.calls.at(-1)?.[0]).toContain('update')
    },
  )

  it('associates a message error with the editable content and clears it when corrected', async () => {
    const { rerender } = render(
      <NotificationEditor
        value=""
        required
        invalid
        invalidText="Message is required"
        onChange={vi.fn()}
      />,
    )
    const editor = await screen.findByLabelText('Notification content editor')
    await waitFor(() => expect(editor).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Message is required')).toBeVisible()
    expect(editor).toHaveAccessibleDescription('Message is required')
    rerender(<NotificationEditor value="<p>Corrected message</p>" required onChange={vi.fn()} />)
    await waitFor(() => expect(editor).toHaveAttribute('aria-invalid', 'false'))
    expect(screen.queryByText('Message is required')).not.toBeInTheDocument()
  })

  it('renders the supported toolbar without duplicate Tiptap extensions', async () => {
    const onChange = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      render(
        <NotificationEditor value="<p>Initial notification</p>" required onChange={onChange} />,
      )

      expect(await screen.findByLabelText('Notification content editor')).toHaveAttribute(
        'aria-required',
        'true',
      )
      expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Strikethrough' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Underline' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add or edit link' })).toBeEnabled()

      await waitFor(() => {
        expect(warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Duplicate extension names found'),
        )
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('uses a Carbon modal to add a link instead of a browser prompt', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const prompt = vi.spyOn(window, 'prompt')

    try {
      render(<NotificationEditor value="<p>Initial notification</p>" onChange={onChange} />)

      await screen.findByLabelText('Notification content editor')
      await user.click(screen.getByRole('button', { name: 'Add or edit link' }))

      const dialog = await screen.findByRole('dialog', { name: 'Add or edit link' })
      const linkUrl = within(dialog).getByRole('textbox', { name: 'Link URL' })
      expect(linkUrl).toHaveFocus()
      expect(prompt).not.toHaveBeenCalled()
      expect(dialog).toHaveClass('cds--modal-container')
      expect(dialog.closest('.notification-editor__link-modal')?.parentElement).toBe(document.body)
      const actions = dialog.querySelector('.notification-editor__link-modal-actions')
      expect(actions).toBeInTheDocument()
      expect(
        within(actions as HTMLElement).getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument()
      expect(
        within(actions as HTMLElement).getByRole('button', { name: 'Apply link' }),
      ).toBeInTheDocument()
    } finally {
      prompt.mockRestore()
    }
  })

  it('keeps the apply action disabled until the link URL is supported', async () => {
    const user = userEvent.setup()

    render(<NotificationEditor value="<p>Initial notification</p>" onChange={vi.fn()} />)

    await screen.findByLabelText('Notification content editor')
    await user.click(screen.getByRole('button', { name: 'Add or edit link' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add or edit link' })
    const linkUrl = within(dialog).getByRole('textbox', { name: 'Link URL' })
    await user.type(linkUrl, 'javascript:alert(1)')

    expect(within(dialog).getByText('Enter a valid HTTPS URL or mailto link')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply link' })).toBeDisabled()
  })
})
