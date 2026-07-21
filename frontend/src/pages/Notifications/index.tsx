import { Add, Edit, TrashCan } from '@carbon/icons-react'
import { Button, Checkbox, InlineLoading, InlineNotification, TextInput, Tile } from '@carbon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppNotification } from '@/components/AppNotification'
import NotificationEditor from '@/components/NotificationEditor'
import { hasRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import type { LexisNotification, NotificationUpsertRequest } from '@/interfaces/LexisNotification'
import {
  createNotification,
  deleteNotification,
  fetchAdminNotifications,
  fetchNotificationAudienceRoles,
  fetchNotifications,
  updateNotification,
} from '@/service/notification-service'
import './Notifications.scss'

const RECENT_UPDATE_WINDOW_DAYS = 3

type NotificationForm = {
  id: number | null
  title: string
  contentHtml: string
  publishDate: string
  audienceRoles: string[]
}

type NotificationMessage = {
  kind: 'error' | 'success'
  title: string
  subtitle: string
}

const today = (): string => new Date().toISOString().slice(0, 10)

const emptyForm = (): NotificationForm => ({
  id: null,
  title: '',
  contentHtml: '',
  publishDate: today(),
  audienceRoles: [],
})

const toPublishDate = (value: string): string => value.slice(0, 10)

const toForm = (notification: LexisNotification): NotificationForm => ({
  id: notification.id,
  title: notification.title,
  contentHtml: notification.contentHtml,
  publishDate: toPublishDate(notification.publishTimestamp),
  audienceRoles: notification.audienceRoles,
})

const toRequest = (form: NotificationForm): NotificationUpsertRequest => ({
  title: form.title.trim(),
  contentHtml: form.contentHtml,
  publishTimestamp: `${form.publishDate}T00:00:00`,
  audienceRoles: form.audienceRoles,
})

const formatDateTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const roleLabel = (role: string): string =>
  role
    .replace(/^LEXIS_/, '')
    .toLowerCase()
    .split('_')
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ')

const hasRecentUpdate = (notification: LexisNotification): boolean => {
  const updateTime = new Date(notification.updateTimestamp).getTime()
  if (Number.isNaN(updateTime)) {
    return false
  }
  return updateTime >= Date.now() - RECENT_UPDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

export default function NotificationsPage() {
  const { capabilities } = useAuth()
  const isAdmin = hasRole(capabilities.roles, 'ADMIN')
  const [notifications, setNotifications] = useState<LexisNotification[]>([])
  const [audienceRoles, setAudienceRoles] = useState<string[]>([])
  const [form, setForm] = useState<NotificationForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<NotificationMessage | null>(null)
  const [showRecentUpdateToast, setShowRecentUpdateToast] = useState(false)

  const loadNotifications = useCallback(
    async (clearMessage = true) => {
      setLoading(true)
      if (clearMessage) {
        setMessage(null)
      }
      try {
        const [loadedNotifications, loadedAudienceRoles] = await Promise.all([
          isAdmin ? fetchAdminNotifications() : fetchNotifications(),
          isAdmin ? fetchNotificationAudienceRoles() : Promise.resolve([]),
        ])
        setNotifications(loadedNotifications)
        setAudienceRoles(loadedAudienceRoles)
        setShowRecentUpdateToast(loadedNotifications.some(hasRecentUpdate))
      } catch {
        setMessage({
          kind: 'error',
          title: 'Notifications could not be loaded',
          subtitle: 'Please refresh the page or try again later.',
        })
      } finally {
        setLoading(false)
      }
    },
    [isAdmin],
  )

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const isEditing = form.id !== null
  const formTitle = isEditing ? 'Edit notification' : 'Create notification'
  const pageDescription = isAdmin
    ? 'Create, edit, delete, and review notifications for LEXIS users.'
    : 'View LEXIS notifications that apply to your assigned roles.'

  const recentUpdateCount = useMemo(
    () => notifications.filter(hasRecentUpdate).length,
    [notifications],
  )

  const toggleAudienceRole = (role: string, selected: boolean): void => {
    setForm((current) => ({
      ...current,
      audienceRoles: selected
        ? [...new Set([...current.audienceRoles, role])]
        : current.audienceRoles.filter((entry) => entry !== role),
    }))
  }

  const resetForm = (): void => {
    setForm(emptyForm())
    setMessage(null)
  }

  const save = async (): Promise<void> => {
    if (
      !form.title.trim() ||
      !form.publishDate ||
      !form.contentHtml.replace(/<[^>]*>/g, '').trim()
    ) {
      setMessage({
        kind: 'error',
        title: 'Complete the required fields',
        subtitle: 'Title, publish date, and notification content are required.',
      })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      if (form.id === null) {
        await createNotification(toRequest(form))
        setMessage({
          kind: 'success',
          title: 'Notification created',
          subtitle: 'The notification has been saved.',
        })
      } else {
        await updateNotification(form.id, toRequest(form))
        setMessage({
          kind: 'success',
          title: 'Notification updated',
          subtitle: 'The notification has been saved.',
        })
      }
      setForm(emptyForm())
      await loadNotifications(false)
    } catch {
      setMessage({
        kind: 'error',
        title: 'Notification could not be saved',
        subtitle: 'Review the values and try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (notification: LexisNotification): Promise<void> => {
    if (!window.confirm(`Delete the notification “${notification.title}”?`)) {
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await deleteNotification(notification.id)
      if (form.id === notification.id) {
        setForm(emptyForm())
      }
      setMessage({
        kind: 'success',
        title: 'Notification deleted',
        subtitle: 'The notification has been removed.',
      })
      await loadNotifications(false)
    } catch {
      setMessage({
        kind: 'error',
        title: 'Notification could not be deleted',
        subtitle: 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="notifications-page" id="main-content">
      <section className="page-banner" aria-labelledby="notifications-page-title">
        <div>
          <p className="page-banner__eyebrow">LEXIS</p>
          <h1 id="notifications-page-title">Notifications</h1>
          <p>{pageDescription}</p>
        </div>
      </section>

      {showRecentUpdateToast && recentUpdateCount > 0 && (
        <AppNotification
          kind="info"
          title="Recently updated notifications"
          subtitle={`${recentUpdateCount} notification${recentUpdateCount === 1 ? ' was' : 's were'} updated in the last ${RECENT_UPDATE_WINDOW_DAYS} days.`}
          onCloseButtonClick={() => setShowRecentUpdateToast(false)}
        />
      )}

      {message && (
        <InlineNotification
          className="notifications-page__message"
          kind={message.kind}
          title={message.title}
          subtitle={message.subtitle}
          lowContrast
          onCloseButtonClick={() => setMessage(null)}
        />
      )}

      {isAdmin && (
        <section
          className="notifications-page__editor"
          aria-labelledby="notification-editor-heading"
        >
          <Tile>
            <div className="notifications-page__section-heading">
              <div>
                <h2 id="notification-editor-heading">{formTitle}</h2>
                <p>Rich text is sanitized on the server before it is saved.</p>
              </div>
              {isEditing && (
                <Button kind="ghost" onClick={resetForm} disabled={saving}>
                  Cancel edit
                </Button>
              )}
            </div>

            <div className="notifications-page__form-grid">
              <TextInput
                id="notification-title"
                labelText="Title"
                value={form.title}
                maxLength={500}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
              <TextInput
                id="notification-publish-date"
                type="date"
                labelText="Publish date"
                value={form.publishDate}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({ ...current, publishDate: event.target.value }))
                }
              />
            </div>

            <div className="notifications-page__form-field">
              <p className="cds--label">Notification content</p>
              <NotificationEditor
                value={form.contentHtml}
                disabled={saving}
                onChange={(contentHtml) => setForm((current) => ({ ...current, contentHtml }))}
              />
            </div>

            <fieldset className="notifications-page__audience">
              <legend>Audience roles</legend>
              <p>
                Selecting no roles makes the notification visible to all authenticated LEXIS users.
              </p>
              <div className="notifications-page__audience-options">
                {audienceRoles.map((role) => (
                  <Checkbox
                    key={role}
                    id={`notification-audience-${role}`}
                    labelText={roleLabel(role)}
                    checked={form.audienceRoles.includes(role)}
                    disabled={saving}
                    onChange={(_, { checked }) => toggleAudienceRole(role, Boolean(checked))}
                  />
                ))}
              </div>
            </fieldset>

            <div className="notifications-page__editor-actions">
              <Button
                kind="primary"
                renderIcon={isEditing ? Edit : Add}
                disabled={saving}
                onClick={() => void save()}
              >
                {isEditing ? 'Save notification' : 'Create notification'}
              </Button>
              {saving && <InlineLoading description="Saving notification…" />}
            </div>
          </Tile>
        </section>
      )}

      <section aria-labelledby="notification-list-heading">
        <div className="notifications-page__list-heading">
          <h2 id="notification-list-heading">Current notifications</h2>
          {loading && <InlineLoading description="Loading notifications…" />}
        </div>

        {!loading && notifications.length === 0 && (
          <Tile>
            <p>No notifications are available.</p>
          </Tile>
        )}

        <div className="notifications-page__list">
          {notifications.map((notification) => (
            <article key={notification.id} className="notifications-page__notification">
              <Tile>
                <div className="notifications-page__notification-heading">
                  <div>
                    <h3>{notification.title}</h3>
                    <p>
                      Published {formatDateTime(notification.publishTimestamp)} · Updated{' '}
                      {formatDateTime(notification.updateTimestamp)} by {notification.updateUserId}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="notifications-page__notification-actions">
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Edit}
                        disabled={saving}
                        onClick={() => {
                          setForm(toForm(notification))
                          setMessage(null)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        renderIcon={TrashCan}
                        disabled={saving}
                        onClick={() => void remove(notification)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
                <div
                  className="notifications-page__notification-content"
                  // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- API HTML is sanitized server-side before every write.
                  dangerouslySetInnerHTML={{ __html: notification.contentHtml }}
                />
                {isAdmin && (
                  <dl className="notifications-page__metadata">
                    <div>
                      <dt>Created</dt>
                      <dd>
                        {formatDateTime(notification.entryTimestamp)} by {notification.entryUserId}
                      </dd>
                    </div>
                    <div>
                      <dt>Audience</dt>
                      <dd>
                        {notification.audienceRoles.length > 0
                          ? notification.audienceRoles.map(roleLabel).join(', ')
                          : 'All authenticated LEXIS users'}
                      </dd>
                    </div>
                  </dl>
                )}
              </Tile>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
