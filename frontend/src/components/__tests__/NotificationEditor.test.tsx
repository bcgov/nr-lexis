import { describe, expect, it, vi } from 'vitest'
import NotificationEditor from '@/components/NotificationEditor'
import { render, screen, waitFor } from '@/test-utils'

describe('NotificationEditor', () => {
  it('renders the supported toolbar without duplicate Tiptap extensions', async () => {
    const onChange = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      render(<NotificationEditor value="<p>Initial notification</p>" onChange={onChange} />)

      await screen.findByLabelText('Notification content editor')
      expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled()
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
})
