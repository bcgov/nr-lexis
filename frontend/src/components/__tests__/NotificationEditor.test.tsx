import { describe, expect, it, vi } from 'vitest'
import NotificationEditor from '@/components/NotificationEditor'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'

describe('NotificationEditor', () => {
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

    expect(within(dialog).getByText('Enter a valid HTTPS URL or mailto link.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply link' })).toBeDisabled()
  })
})
