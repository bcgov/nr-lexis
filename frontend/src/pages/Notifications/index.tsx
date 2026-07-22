import { Add, Edit, TrashCan } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  TextInput,
  Tile,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppNotification } from '@/components/AppNotification'
import NotificationEditor from '@/components/NotificationEditor'
import { hasRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import type {
  LexisNotification,
  NotificationLevel,
  NotificationUpsertRequest,
} from '@/interfaces/LexisNotification'
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
const DEFAULT_DISPLAY_DURATION_DAYS = 7

const notificationLevels: ReadonlyArray<{
  value: NotificationLevel
  label: string
  description: string
}> = [
  { value: 'INFORMATION', label: 'Information', description: 'General update' },
  { value: 'WARNING', label: 'Warning', description: 'Needs attention' },
  { value: 'CRITICAL', label: 'Critical', description: 'Time-sensitive' },
]

type NotificationForm = {
  id: number | null
  title: string
  contentHtml: string
  notificationLevel: NotificationLevel
  displayStartDate: string
  displayEndDate: string
  audienceMode: 'ALL' | 'ROLES'
  audienceRoles: string[]
}

type NotificationMessage = {
  kind: 'error' | 'success'
  title: string
  subtitle: string
}

const toDateValue = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const today = (): string => toDateValue(new Date())

const addDays = (value: string, days: number): string => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toDateValue(date)
}

const emptyForm = (): NotificationForm => {
  const displayStartDate = today()
  return {
    id: null,
    title: '',
    contentHtml: '',
    notificationLevel: 'INFORMATION',
    displayStartDate,
    displayEndDate: addDays(displayStartDate, DEFAULT_DISPLAY_DURATION_DAYS),
    audienceMode: 'ALL',
    audienceRoles: [],
  }
}

const toDateInputValue = (value: string): string => value.slice(0, 10)

const toForm = (notification: LexisNotification): NotificationForm => ({
  id: notification.id,
  title: notification.title,
  contentHtml: notification.contentHtml,
  notificationLevel: notification.notificationLevel,
  displayStartDate: toDateInputValue(notification.displayStartDate),
  displayEndDate: toDateInputValue(notification.displayEndDate),
  audienceMode: notification.audienceRoles.length === 0 ? 'ALL' : 'ROLES',
  audienceRoles: notification.audienceRoles,
})

const toRequest = (form: NotificationForm): NotificationUpsertRequest => ({
  title: form.title.trim(),
  contentHtml: form.contentHtml,
  notificationLevel: form.notificationLevel,
  displayStartDate: form.displayStartDate,
  displayEndDate: form.displayEndDate,
  audienceRoles: form.audienceMode === 'ALL' ? [] : form.audienceRoles,
})

const formatDate = (value: string): string => {
  const date = new Date(`${toDateInputValue(value)}T12:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' }).format(date)
}

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

const levelLabel = (level: NotificationLevel): string =>
  notificationLevels.find((entry) => entry.value === level)?.label ?? level

const notificationStatus = (notification: LexisNotification): string => {
  const currentDate = today()
  if (notification.displayStartDate > currentDate) {
    return 'Scheduled'
  }
  return notification.displayEndDate < currentDate ? 'Past' : 'Active'
}

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
  const [showEditor, setShowEditor] = useState(false)
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
  const editorTitle = isEditing ? 'Edit notification' : 'New notification'
  const pageDescription = isAdmin
    ? 'Create, edit, delete, and review LEXIS notifications.'
    : 'Updates and bulletins from LEXIS administrators. Notices hide automatically after their end date.'
  const recentUpdateCount = useMemo(
    () => notifications.filter(hasRecentUpdate).length,
    [notifications],
  )
  const activeNotificationCount = useMemo(
    () =>
      notifications.filter((notification) => notificationStatus(notification) === 'Active').length,
    [notifications],
  )

  const startCreate = (): void => {
    setForm(emptyForm())
    setMessage(null)
    setShowEditor(true)
  }

  const startEdit = (notification: LexisNotification): void => {
    setForm(toForm(notification))
    setMessage(null)
    setShowEditor(true)
  }

  const resetForm = (): void => {
    setForm(emptyForm())
    setShowEditor(false)
    setMessage(null)
  }

  const toggleAudienceRole = (role: string, selected: boolean): void => {
    setForm((current) => ({
      ...current,
      audienceMode: 'ROLES',
      audienceRoles: selected
        ? [...new Set([...current.audienceRoles, role])]
        : current.audienceRoles.filter((entry) => entry !== role),
    }))
  }

  const save = async (): Promise<void> => {
    if (
      !form.title.trim() ||
      !form.displayStartDate ||
      !form.displayEndDate ||
      !form.contentHtml.replace(/<[^>]*>/g, '').trim()
    ) {
      setMessage({
        kind: 'error',
        title: 'Complete the required fields',
        subtitle: 'Title, content, notification level, and display dates are required.',
      })
      return
    }
    if (form.displayEndDate < form.displayStartDate) {
      setMessage({
        kind: 'error',
        title: 'Check the display period',
        subtitle: 'The end date cannot be before the start date.',
      })
      return
    }
    if (form.audienceMode === 'ROLES' && form.audienceRoles.length === 0) {
      setMessage({
        kind: 'error',
        title: 'Choose an audience',
        subtitle: 'Select at least one role or use all authenticated LEXIS roles.',
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
          title: 'Notification published',
          subtitle: 'The notification is now scheduled for its display period.',
        })
      } else {
        await updateNotification(form.id, toRequest(form))
        setMessage({
          kind: 'success',
          title: 'Notification updated',
          subtitle: 'The notification changes have been saved.',
        })
      }
      setForm(emptyForm())
      setShowEditor(false)
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
        setShowEditor(false)
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
      <section
        className="notifications-page__header page-banner"
        aria-labelledby="notifications-page-title"
      >
        <div>
          <p className="page-banner__eyebrow">LEXIS</p>
          <h1 id="notifications-page-title">Notifications</h1>
          <p>{pageDescription}</p>
        </div>
        {isAdmin && (
          <Button renderIcon={Add} onClick={startCreate} disabled={saving}>
            New notification
          </Button>
        )}
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

      {isAdmin && showEditor && (
        <section
          className="notifications-page__editor"
          aria-labelledby="notification-editor-heading"
        >
          <Tile className="notifications-page__editor-tile">
            <div className="notifications-page__section-heading">
              <div>
                <p className="notifications-page__section-eyebrow">Admin</p>
                <h2 id="notification-editor-heading">{editorTitle}</h2>
                <p>Rich text is sanitized on the server before it is saved.</p>
              </div>
              <Button kind="ghost" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            </div>

            <div className="notifications-page__form-section">
              <h3>Message</h3>
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
              <div className="notifications-page__form-field">
                <p className="cds--label">Message</p>
                <NotificationEditor
                  value={form.contentHtml}
                  disabled={saving}
                  onChange={(contentHtml) => setForm((current) => ({ ...current, contentHtml }))}
                />
              </div>
            </div>

            <fieldset className="notifications-page__form-section notifications-page__level">
              <legend>Notification level</legend>
              <RadioButtonGroup
                legendText=""
                name="notification-level"
                valueSelected={form.notificationLevel}
                disabled={saving}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    notificationLevel: value as NotificationLevel,
                  }))
                }
              >
                {notificationLevels.map((level) => (
                  <RadioButton
                    key={level.value}
                    id={`notification-level-${level.value.toLowerCase()}`}
                    value={level.value}
                    labelText={
                      <span className="notifications-page__level-option">
                        <span
                          className={`notifications-page__level-dot notifications-page__level-dot--${level.value.toLowerCase()}`}
                        />
                        <span>{level.label}</span>
                        <span>{level.description}</span>
                      </span>
                    }
                  />
                ))}
              </RadioButtonGroup>
            </fieldset>

            <fieldset className="notifications-page__form-section notifications-page__audience">
              <legend>Audience</legend>
              <Checkbox
                id="notification-audience-all"
                labelText="All authenticated LEXIS roles"
                checked={form.audienceMode === 'ALL'}
                disabled={saving}
                onChange={(_, { checked }) =>
                  setForm((current) => ({
                    ...current,
                    audienceMode: checked ? 'ALL' : 'ROLES',
                    audienceRoles: checked ? [] : current.audienceRoles,
                  }))
                }
              />
              <p>Choose specific roles only when the notification does not apply to everyone.</p>
              <div
                className="notifications-page__audience-options"
                aria-disabled={form.audienceMode === 'ALL'}
              >
                {audienceRoles.map((role) => (
                  <Checkbox
                    key={role}
                    id={`notification-audience-${role}`}
                    labelText={roleLabel(role)}
                    checked={form.audienceRoles.includes(role)}
                    disabled={saving || form.audienceMode === 'ALL'}
                    onChange={(_, { checked }) => toggleAudienceRole(role, Boolean(checked))}
                  />
                ))}
              </div>
            </fieldset>

            <section className="notifications-page__form-section">
              <h3>Display period</h3>
              <div className="notifications-page__form-grid">
                <TextInput
                  id="notification-display-start-date"
                  type="date"
                  labelText="Start date"
                  value={form.displayStartDate}
                  disabled={saving}
                  readOnly={isEditing}
                  helperText={isEditing ? 'The original start date cannot be changed.' : undefined}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, displayStartDate: event.target.value }))
                  }
                />
                <TextInput
                  id="notification-display-end-date"
                  type="date"
                  labelText="End date"
                  value={form.displayEndDate}
                  min={form.displayStartDate}
                  disabled={saving}
                  helperText="The notification hides automatically after this date."
                  onChange={(event) =>
                    setForm((current) => ({ ...current, displayEndDate: event.target.value }))
                  }
                />
              </div>
            </section>

            <div className="notifications-page__editor-actions">
              <Button
                kind="primary"
                renderIcon={isEditing ? Edit : Add}
                disabled={saving}
                onClick={() => void save()}
              >
                {isEditing ? 'Save changes' : 'Publish notification'}
              </Button>
              {saving && <InlineLoading description="Saving notification…" />}
            </div>
          </Tile>
        </section>
      )}

      <section aria-labelledby="notification-list-heading">
        <div className="notifications-page__list-heading">
          <div>
            <h2 id="notification-list-heading">
              {isAdmin ? 'Notifications' : 'Current notifications'}
            </h2>
            {!loading && (
              <p>
                {isAdmin
                  ? `${activeNotificationCount} active notification${activeNotificationCount === 1 ? '' : 's'}`
                  : `${notifications.length} active notification${notifications.length === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
          {loading && <InlineLoading description="Loading notifications…" />}
        </div>

        {!loading && notifications.length === 0 && (
          <Tile>
            <p>
              {isAdmin ? 'No notifications have been created.' : 'No notifications are available.'}
            </p>
          </Tile>
        )}

        <div className="notifications-page__list">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`notifications-page__notification notifications-page__notification--${notification.notificationLevel.toLowerCase()}`}
            >
              <Tile>
                <div className="notifications-page__notification-heading">
                  <div>
                    <div className="notifications-page__notification-title-row">
                      <h3>{notification.title}</h3>
                      <span
                        className={`notifications-page__level-tag notifications-page__level-tag--${notification.notificationLevel.toLowerCase()}`}
                      >
                        {levelLabel(notification.notificationLevel)}
                      </span>
                      {isAdmin && (
                        <span className="notifications-page__status">
                          {notificationStatus(notification)}
                        </span>
                      )}
                    </div>
                    <p>
                      Posted {formatDate(notification.displayStartDate)} · Shows until{' '}
                      {formatDate(notification.displayEndDate)}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="notifications-page__notification-actions">
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Edit}
                        disabled={saving}
                        onClick={() => startEdit(notification)}
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
                      <dt>Last updated</dt>
                      <dd>
                        {formatDateTime(notification.updateTimestamp)} by{' '}
                        {notification.updateUserId}
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
