import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { LexisNotification } from '@/interfaces/LexisNotification'
import NotificationsPage from '@/pages/Notifications'
import {
  createNotification,
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
  publishTimestamp: '2026-01-01T00:00:00',
  entryUserId: 'IDIR\\ADMIN',
  entryTimestamp: '2026-01-01T00:00:00',
  updateUserId: 'IDIR\\ADMIN',
  updateTimestamp: '2026-01-01T00:00:00',
  audienceRoles: ['LEXIS_READ_ONLY'],
}

const mockedUseAuth = vi.mocked(useAuth)
const mockedCreateNotification = vi.mocked(createNotification)
const mockedFetchAdminNotifications = vi.mocked(fetchAdminNotifications)
const mockedFetchNotificationAudienceRoles = vi.mocked(fetchNotificationAudienceRoles)
const mockedFetchNotifications = vi.mocked(fetchNotifications)

describe('Notifications page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchNotifications.mockResolvedValue([notification])
    mockedFetchAdminNotifications.mockResolvedValue([notification])
    mockedFetchNotificationAudienceRoles.mockResolvedValue(['LEXIS_ADMIN', 'LEXIS_READ_ONLY'])
    mockedCreateNotification.mockResolvedValue(notification)
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
    expect(screen.queryByRole('button', { name: 'Create notification' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('lets administrators create notifications from the same page', async () => {
    const user = userEvent.setup()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
      }),
    )

    render(<NotificationsPage />)

    await screen.findByRole('heading', { name: 'Create notification' })
    await user.type(screen.getByLabelText('Title'), 'Office closure')
    await user.type(screen.getByLabelText('Notification content editor'), 'Office closed Friday.')
    await user.click(screen.getByRole('button', { name: 'Create notification' }))

    await waitFor(() => {
      expect(mockedCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Office closure',
          contentHtml: 'Office closed Friday.',
          audienceRoles: [],
          publishTimestamp: expect.stringMatching(/T00:00:00$/),
        }),
      )
    })
  })
})
