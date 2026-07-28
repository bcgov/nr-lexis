export type NotificationLevel = 'INFORMATION' | 'WARNING' | 'CRITICAL'

export type LexisNotificationView = {
  id: number
  title: string
  contentHtml: string
  notificationLevel: NotificationLevel
  displayStartDate: string
  displayEndDate: string
  updateTimestamp: string
}

export type LexisNotification = LexisNotificationView & {
  createUser: string
  createTimestamp: string
  updateUserId: string
  audienceRoles: string[]
}

export type NotificationUpsertRequest = {
  title: string
  contentHtml: string
  notificationLevel: NotificationLevel
  displayStartDate: string
  displayEndDate: string
  audienceRoles: string[]
}

export type NotificationAudienceRoles = {
  roles: string[]
}
