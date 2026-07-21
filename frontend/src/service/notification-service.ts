import type {
  LexisNotification,
  NotificationAudienceRoles,
  NotificationUpsertRequest,
} from '@/interfaces/LexisNotification'
import apiService from '@/service/api-service'

const notificationsFrom = (value: unknown): LexisNotification[] =>
  Array.isArray(value) ? (value as LexisNotification[]) : []

export const fetchNotifications = async (): Promise<LexisNotification[]> => {
  const response = await apiService.getAxiosInstance().get<unknown>('/lexis/notifications')
  return notificationsFrom(response.data)
}

export const fetchAdminNotifications = async (): Promise<LexisNotification[]> => {
  const response = await apiService.getAxiosInstance().get<unknown>('/lexis/admin/notifications')
  return notificationsFrom(response.data)
}

export const fetchNotificationAudienceRoles = async (): Promise<string[]> => {
  const response = await apiService
    .getAxiosInstance()
    .get<NotificationAudienceRoles>('/lexis/admin/notifications/audience-roles')
  return Array.isArray(response.data?.roles) ? response.data.roles : []
}

export const createNotification = async (
  request: NotificationUpsertRequest,
): Promise<LexisNotification> => {
  const response = await apiService
    .getAxiosInstance()
    .post<LexisNotification>('/lexis/admin/notifications', request)
  return response.data
}

export const updateNotification = async (
  notificationId: number,
  request: NotificationUpsertRequest,
): Promise<LexisNotification> => {
  const response = await apiService
    .getAxiosInstance()
    .put<LexisNotification>(`/lexis/admin/notifications/${notificationId}`, request)
  return response.data
}

export const deleteNotification = async (notificationId: number): Promise<void> => {
  await apiService.getAxiosInstance().delete(`/lexis/admin/notifications/${notificationId}`)
}
