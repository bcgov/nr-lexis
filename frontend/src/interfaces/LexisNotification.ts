export type NotificationLevel = 'INFORMATION' | 'WARNING' | 'CRITICAL'

export type LexisNotification = {
  id: number
  title: string
  contentHtml: string
  notificationLevel: NotificationLevel
  displayStartDate: string
  displayEndDate: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
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
