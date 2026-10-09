import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsPage from '@/pages/Notifications'
import { useAuth } from '@/context/auth/useAuth'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'
import {
  createNotification,
  fetchAdminNotifications,
  fetchNotificationAudienceRoles,
  updateNotification,
} from '@/service/notification-service'

vi.mock('@/context/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/service/notification-service', () => ({
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
  fetchAdminNotifications: vi.fn(),
  fetchNotificationAudienceRoles: vi.fn(),
  fetchNotifications: vi.fn(),
  updateNotification: vi.fn(),
}))

const record = {
  id: 9,
  title: 'Legacy notice',
  contentHtml: 'Legacy plain content',
  notificationLevel: 'INFORMATION' as const,
  displayStartDate: '2026-01-01',
  displayEndDate: '2099-01-01',
  audienceRoles: [],
  createUser: 'IDIR\\UI.TESTER',
  createTimestamp: '2026-01-01T00:00:00',
  updateUserId: 'IDIR\\UI.TESTER',
  updateTimestamp: '2026-01-01T00:00:00',
}

describe('Notification editing with the rich editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )
    vi.mocked(fetchNotificationAudienceRoles).mockResolvedValue(['LEXIS_ADMIN'])
    vi.mocked(updateNotification).mockResolvedValue(record)
  })

  it.each([
    'Legacy plain content',
    '<div>Legacy block content</div>',
    '<p><span>Legacy formatted content</span></p>',
  ])('keeps stored HTML unchanged after an unedited save: %s', async (contentHtml) => {
    vi.mocked(fetchAdminNotifications).mockResolvedValue([{ ...record, contentHtml }])
    render(<NotificationsPage />)
    const edit = await screen.findByRole('button', { name: 'Edit' })
    await userEvent.click(edit)
    const panel = screen.getByRole('complementary', { name: 'Edit notification' })
    const editor = within(panel).getByLabelText('Notification content editor')
    await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'true'))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(edit).toHaveFocus())
    expect(updateNotification).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    expect(fetchAdminNotifications).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(screen.queryByText('Notification updated')).not.toBeInTheDocument()
  })

  it('focuses the rich editor and describes its required-field error without publishing', async () => {
    vi.mocked(fetchAdminNotifications).mockResolvedValue([])
    render(<NotificationsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'New notification' }))
    const panel = within(screen.getByRole('complementary', { name: 'New notification' }))
    await userEvent.type(panel.getByLabelText('Title'), 'New notice')
    const editor = panel.getByLabelText('Notification content editor')
    expect(editor).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(panel.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(editor).toHaveFocus())
    expect(editor).toHaveAttribute('aria-invalid', 'true')
    const errorId = editor.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()
    expect(document.getElementById(errorId!)).toHaveTextContent('Message is required')
    expect(createNotification).not.toHaveBeenCalled()
    expect(updateNotification).not.toHaveBeenCalled()
  })

  it('submits a genuine rich-text change with the existing request contract', async () => {
    vi.mocked(fetchAdminNotifications).mockResolvedValue([record])
    render(<NotificationsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const editor = await screen.findByLabelText('Notification content editor')
    editor.innerHTML = '<p>Legacy plain content updated</p>'
    fireEvent.input(editor, { inputType: 'insertText', data: ' updated' })
    await waitFor(() => expect(editor).toHaveTextContent('updated'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateNotification).toHaveBeenCalledTimes(1))
    expect(updateNotification).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        title: record.title,
        notificationLevel: record.notificationLevel,
        contentHtml: expect.stringContaining('updated'),
      }),
    )
    expect(createNotification).not.toHaveBeenCalled()
  })
})
