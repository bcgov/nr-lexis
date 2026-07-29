import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { LexisNotification, LexisNotificationView } from '@/interfaces/LexisNotification'
import NotificationsPage from '@/pages/Notifications'
import {
  createNotification,
  deleteNotification,
  fetchAdminNotifications,
  fetchNotificationAudienceRoles,
  fetchNotifications,
} from '@/service/notification-service'
import { render, userEvent } from '@/test-utils'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/components/NotificationEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (contentHtml: string) => void }) => (
    <textarea
      aria-label="Notification content editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/service/notification-service', () => ({
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
  fetchAdminNotifications: vi.fn(),
  fetchNotificationAudienceRoles: vi.fn(),
  fetchNotifications: vi.fn(),
  updateNotification: vi.fn(),
}))

const notification: LexisNotification = {
  id: 9,
  title: 'Winter service update',
  contentHtml: '<p>Services are available.</p>',
  notificationLevel: 'WARNING',
  displayStartDate: '2026-01-01',
  displayEndDate: '2026-01-08',
  createUser: 'IDIR\\ADMIN',
  createTimestamp: '2026-01-01T00:00:00',
  updateUserId: 'IDIR\\ADMIN',
  updateTimestamp: '2026-01-01T00:00:00',
  audienceRoles: ['LEXIS_READ_ONLY'],
}

const viewerNotification: LexisNotificationView = {
  id: notification.id,
  title: notification.title,
  contentHtml: notification.contentHtml,
  notificationLevel: notification.notificationLevel,
  displayStartDate: notification.displayStartDate,
  displayEndDate: notification.displayEndDate,
  updateTimestamp: notification.updateTimestamp,
}

const mockedUseAuth = vi.mocked(useAuth)
const mockedCreateNotification = vi.mocked(createNotification)
const mockedDeleteNotification = vi.mocked(deleteNotification)
const mockedFetchAdminNotifications = vi.mocked(fetchAdminNotifications)
const mockedFetchNotificationAudienceRoles = vi.mocked(fetchNotificationAudienceRoles)
const mockedFetchNotifications = vi.mocked(fetchNotifications)

describe('Notifications page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchNotifications.mockResolvedValue([viewerNotification])
    mockedFetchAdminNotifications.mockResolvedValue([notification])
    mockedFetchNotificationAudienceRoles.mockResolvedValue(['LEXIS_ADMIN', 'LEXIS_READ_ONLY'])
    mockedCreateNotification.mockResolvedValue(notification)
    mockedDeleteNotification.mockResolvedValue()
  })

  it('shows only the role-filtered notification view to non-administrators', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
      }),
    )

    render(<NotificationsPage />)

    expect(await screen.findByText('Winter service update')).toBeVisible()
    expect(mockedFetchNotifications).toHaveBeenCalledOnce()
    expect(mockedFetchAdminNotifications).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'New notification' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByText(/IDIR\\ADMIN/)).not.toBeInTheDocument()
    expect(document.querySelector('.notifications-page')?.tagName).toBe('DIV')
  })

  it('shows the empty state when no notification is visible to the signed-in user', async () => {
    mockedFetchNotifications.mockResolvedValue([])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
      }),
    )

    render(<NotificationsPage />)

    expect(await screen.findByRole('heading', { name: 'No active notifications' })).toBeVisible()
    expect(
      screen.getByText(
        'Nothing is posted right now. New notifications will appear here until their end date.',
      ),
    ).toBeVisible()
  })

  it('lets administrators create notifications from the same page', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Winter service update')
    const launcher = screen.getByRole('button', { name: 'New notification' })
    await user.click(launcher)
    const dialog = await screen.findByRole('dialog', { name: 'New notification' })
    expect(within(dialog).getByRole('heading', { name: 'New notification' })).toBeVisible()
    expect(within(dialog).getByLabelText('Title')).toHaveAttribute('maxlength', '80')
    expect(within(dialog).getByText('0 / 4,000 characters')).toBeVisible()
    await user.type(within(dialog).getByLabelText('Title'), 'Office closure')
    await user.type(
      within(dialog).getByLabelText('Notification content editor'),
      'Office closed Friday.',
    )
    expect(within(dialog).getByText('21 / 4,000 characters')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() => {
      expect(mockedCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Office closure',
          contentHtml: 'Office closed Friday.',
          notificationLevel: 'INFORMATION',
          audienceRoles: [],
          displayStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          displayEndDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
    })
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('treats formatted empty HTML as missing notification content', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Winter service update')
    await user.click(screen.getByRole('button', { name: 'New notification' }))
    const dialog = await screen.findByRole('dialog', { name: 'New notification' })
    await user.type(within(dialog).getByLabelText('Title'), 'Office closure')
    await user.type(within(dialog).getByLabelText('Notification content editor'), '<p>&nbsp;</p>')
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))

    expect(await screen.findByText('Complete the required fields')).toBeVisible()
    expect(mockedCreateNotification).not.toHaveBeenCalled()
  })

  it('keeps the original start date read-only while an administrator edits', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Winter service update')
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('dialog', { name: 'Edit notification' })).toBeVisible()
    expect(screen.getByLabelText('Start date')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('End date')).not.toHaveAttribute('readonly')
  })

  it('keeps recent-update messaging in page flow and restores focus after cancelling', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )
    mockedFetchAdminNotifications.mockResolvedValue([
      {
        ...notification,
        updateTimestamp: new Date().toISOString(),
      },
    ])

    render(<NotificationsPage />)

    const recentUpdateMessage = await screen.findByText('Recently updated notifications')
    expect(recentUpdateMessage).toBeVisible()
    expect(document.querySelector('.notifications-page')).toContainElement(recentUpdateMessage)
    const launcher = screen.getByRole('button', { name: 'New notification' })
    await user.click(launcher)

    expect(screen.queryByText('Recently updated notifications')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(launcher).toHaveFocus())
    expect(screen.getByText('Recently updated notifications')).toBeVisible()
  })

  it('asks an administrator to confirm before deleting a notification', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Winter service update')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete this notification?' })
    expect(dialog).toHaveTextContent('Winter service update will be removed from everyone’s view')

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedDeleteNotification).toHaveBeenCalledWith(notification.id))
  })
})
