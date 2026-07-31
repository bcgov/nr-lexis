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
  default: ({
    value,
    required,
    onChange,
  }: {
    value: string
    required?: boolean
    onChange: (contentHtml: string) => void
  }) => (
    <textarea
      aria-label="Notification content editor"
      aria-required={required}
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
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible()
    expect(
      screen.getByText(
        'Updates and bulletins from your administrators. Each notice shows until its posted end date.',
      ),
    ).toBeVisible()
    expect(screen.getByText('1 active notification')).toBeVisible()
    const notificationFeed = screen.getByRole('list', { name: 'Active notifications' })
    const notificationRow = within(notificationFeed).getByRole('listitem')
    expect(within(notificationRow).getByText('Warning')).toBeVisible()
    expect(within(notificationRow).getByText('Services are available.')).toBeVisible()
    expect(within(notificationRow).queryByText(/^Posted /)).not.toBeInTheDocument()
    expect(within(notificationRow).queryByText(/Shows until/)).not.toBeInTheDocument()
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

  it('renders bulleted and numbered rich text in notification cards', async () => {
    mockedFetchNotifications.mockResolvedValue([
      {
        ...viewerNotification,
        contentHtml:
          '<ul><li>Bring identification</li></ul><ol><li>Submit the application</li></ol>',
      },
    ])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Bring identification')
    const content = document.querySelector('.notifications-page__notification-content')
    expect(content?.querySelector('ul')).toContainElement(screen.getByText('Bring identification'))
    expect(content?.querySelector('ol')).toContainElement(
      screen.getByText('Submit the application'),
    )
  })

  it('clamps long notification content until the reader requests more', async () => {
    const user = userEvent.setup()
    const longContent = `${'This notification explains an important operational update. '.repeat(6)}Final detail.`
    mockedFetchNotifications.mockResolvedValue([
      {
        ...viewerNotification,
        contentHtml: `<p>${longContent}</p>`,
      },
    ])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
      }),
    )

    render(<NotificationsPage />)

    const content = () => document.getElementById('notification-content-9')
    const showMore = await screen.findByRole('button', { name: 'Show more' })
    expect(showMore).toHaveAttribute('aria-expanded', 'false')
    expect(content()).toHaveTextContent('…')
    expect(content()).not.toHaveTextContent('Final detail.')

    await user.click(showMore)

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(content()).toHaveTextContent(longContent)

    await user.click(screen.getByRole('button', { name: 'Show less' }))

    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(content()).not.toHaveTextContent('Final detail.')
  })

  it('shows a status tag only for scheduled notifications', async () => {
    mockedFetchAdminNotifications.mockResolvedValue([
      {
        ...notification,
        id: 10,
        title: 'Active notification',
        displayStartDate: '2000-01-01',
        displayEndDate: '9999-12-31',
      },
      {
        ...notification,
        id: 11,
        title: 'Past notification',
        displayStartDate: '2000-01-01',
        displayEndDate: '2000-01-02',
      },
      {
        ...notification,
        id: 12,
        title: 'Scheduled notification',
        displayStartDate: '9999-01-01',
        displayEndDate: '9999-01-02',
      },
    ])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    expect(await screen.findByText('Scheduled notification')).toBeVisible()
    expect(screen.getByText('Scheduled', { exact: true })).toBeVisible()
    expect(screen.queryByText('Active', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Past', { exact: true })).not.toBeInTheDocument()
  })

  it('does not expose notification audit or display-period data in administrator cards', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByText('Winter service update')

    expect(screen.queryByText(/^Posted /)).not.toBeInTheDocument()
    expect(screen.queryByText(/Shows until/)).not.toBeInTheDocument()
    expect(screen.queryByText('Created', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Last updated', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Audience', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(/IDIR\\\\ADMIN/)).not.toBeInTheDocument()
  })

  it('opens notification content links in a new protected tab', async () => {
    mockedFetchNotifications.mockResolvedValue([
      {
        ...viewerNotification,
        contentHtml: '<p><a href="https://www2.gov.bc.ca" rel="nofollow">Read the notice</a></p>',
      },
    ])
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
      }),
    )

    render(<NotificationsPage />)

    const link = await screen.findByRole('link', { name: 'Read the notice' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer')
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
    expect(within(dialog).getByLabelText(/^Title/)).toHaveAttribute('maxlength', '80')
    expect(within(dialog).getByLabelText(/^Title/)).toBeRequired()
    expect(within(dialog).getByLabelText('Notification content editor')).toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(within(dialog).getByLabelText(/^Start date/)).toBeRequired()
    expect(within(dialog).getByLabelText(/^End date/)).toBeRequired()
    expect(
      within(dialog).getByText(
        'The notice appears to readers between these dates, then hides automatically. No one has to dismiss it.',
      ),
    ).toBeVisible()
    expect(within(dialog).getByText('0 / 4,000 characters')).toBeVisible()
    await user.type(within(dialog).getByLabelText(/^Title/), 'Office closure')
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

  it('clears and disables individual audiences when all roles are selected', async () => {
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
    const allRoles = within(dialog).getByRole('checkbox', { name: 'All roles' })
    const readOnly = within(dialog).getByRole('checkbox', { name: 'Read Only' })

    expect(allRoles).toBeChecked()
    expect(readOnly).toBeDisabled()
    expect(
      within(dialog).queryByText(
        'Choose specific roles only when the notification does not apply to everyone.',
      ),
    ).not.toBeInTheDocument()

    await user.click(allRoles)
    expect(readOnly).toBeEnabled()

    await user.click(readOnly)
    expect(readOnly).toBeChecked()

    await user.click(allRoles)
    expect(readOnly).toBeDisabled()
    expect(readOnly).not.toBeChecked()
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
    await user.type(within(dialog).getByLabelText(/^Title/), 'Office closure')
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
    expect(screen.getByLabelText(/^Start date/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^End date/)).not.toHaveAttribute('readonly')
  })

  it('does not show recent-update messaging and restores focus after cancelling', async () => {
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

    const launcher = await screen.findByRole('button', { name: 'New notification' })
    expect(screen.queryByText('Recently updated notifications')).not.toBeInTheDocument()
    await user.click(launcher)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(launcher).toHaveFocus())
    expect(screen.queryByText('Recently updated notifications')).not.toBeInTheDocument()
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
