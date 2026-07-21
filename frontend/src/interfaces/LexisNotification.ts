export type LexisNotification = {
  id: number
  title: string
  contentHtml: string
  publishTimestamp: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
  audienceRoles: string[]
}

export type NotificationUpsertRequest = {
  title: string
  contentHtml: string
  publishTimestamp: string
  audienceRoles: string[]
}

export type NotificationAudienceRoles = {
  roles: string[]
}
