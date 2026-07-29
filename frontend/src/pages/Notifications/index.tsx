import {
  Add,
  Edit,
  InformationFilled,
  Notification as NotificationIcon,
  Time,
  TrashCan,
  WarningAltFilled,
  WarningFilled,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
  TextInput,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmationModal from '@/components/ConfirmationModal'
import NotificationEditor from '@/components/NotificationEditor'
import { hasRole } from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import type {
  LexisNotification,
  LexisNotificationView,
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
const MAX_NOTIFICATION_TITLE_LENGTH = 80
const MAX_NOTIFICATION_CONTENT_LENGTH = 4_000

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

const isAdminNotification = (
  notification: LexisNotificationView,
): notification is LexisNotification =>
  'audienceRoles' in notification &&
  Array.isArray(notification.audienceRoles) &&
  'createUser' in notification &&
  typeof notification.createUser === 'string' &&
  'createTimestamp' in notification &&
  typeof notification.createTimestamp === 'string' &&
  'updateUserId' in notification &&
  typeof notification.updateUserId === 'string'

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

const notificationLevelIcon = (level: NotificationLevel) => {
  switch (level) {
    case 'CRITICAL':
      return <WarningFilled size={20} aria-hidden="true" />
    case 'WARNING':
      return <WarningAltFilled size={20} aria-hidden="true" />
    default:
      return <InformationFilled size={20} aria-hidden="true" />
  }
}

const notificationStatus = (notification: LexisNotificationView): string => {
  const currentDate = today()
  if (notification.displayStartDate > currentDate) {
    return 'Scheduled'
  }
  return notification.displayEndDate < currentDate ? 'Past' : 'Active'
}

const hasRecentUpdate = (notification: LexisNotificationView): boolean => {
  const updateTime = new Date(notification.updateTimestamp).getTime()
  if (Number.isNaN(updateTime)) {
    return false
  }
  return updateTime >= Date.now() - RECENT_UPDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

const contentText = (contentHtml: string): string => {
  const parsedDocument = new DOMParser().parseFromString(contentHtml, 'text/html')
  return (parsedDocument.body.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}

const contentTextLength = (contentHtml: string): number => contentText(contentHtml).length

export default function NotificationsPage() {
  const { capabilities } = useAuth()
  const isAdmin = hasRole(capabilities.roles, 'ADMIN')
  const [notifications, setNotifications] = useState<LexisNotificationView[]>([])
  const [audienceRoles, setAudienceRoles] = useState<string[]>([])
  const [form, setForm] = useState<NotificationForm>(emptyForm)
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<NotificationMessage | null>(null)
  const [showRecentUpdateMessage, setShowRecentUpdateMessage] = useState(false)
  const [notificationPendingDeletion, setNotificationPendingDeletion] =
    useState<LexisNotification | null>(null)
  const editorLauncherRef = useRef<HTMLElement>(null)

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
        setShowRecentUpdateMessage(loadedNotifications.some(hasRecentUpdate))
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
  const pageDescription =
    'Updates and bulletins from your administrators. Each notice shows until its posted end date.'
  const recentUpdateCount = useMemo(
    () => notifications.filter(hasRecentUpdate).length,
    [notifications],
  )
  const activeNotificationCount = useMemo(
    () =>
      notifications.filter((notification) => notificationStatus(notification) === 'Active').length,
    [notifications],
  )
  const contentCharacterCount = contentTextLength(form.contentHtml)

  const startCreate = (): void => {
    editorLauncherRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setForm(emptyForm())
    setMessage(null)
    setShowEditor(true)
  }

  const startEdit = (notification: LexisNotification): void => {
    editorLauncherRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setForm(toForm(notification))
    setMessage(null)
    setShowEditor(true)
  }

  const restoreEditorLauncherFocus = (): void => {
    const launcher = editorLauncherRef.current
    window.setTimeout(() => launcher?.focus())
  }

  const resetForm = (): void => {
    setForm(emptyForm())
    setShowEditor(false)
    setMessage(null)
    restoreEditorLauncherFocus()
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
      !contentText(form.contentHtml)
    ) {
      setMessage({
        kind: 'error',
        title: 'Complete the required fields',
        subtitle: 'Title, content, notification level, and display dates are required.',
      })
      return
    }
    if (form.title.trim().length > MAX_NOTIFICATION_TITLE_LENGTH) {
      setMessage({
        kind: 'error',
        title: 'Shorten the notification title',
        subtitle: 'Notification titles cannot exceed 80 characters.',
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
    if (contentTextLength(form.contentHtml) > MAX_NOTIFICATION_CONTENT_LENGTH) {
      setMessage({
        kind: 'error',
        title: 'Shorten the notification content',
        subtitle: 'Notification content cannot exceed 4,000 characters.',
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
    let restoreLauncherFocus = false
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
      restoreLauncherFocus = true
      await loadNotifications(false)
    } catch {
      setMessage({
        kind: 'error',
        title: 'Notification could not be saved',
        subtitle: 'Review the values and try again.',
      })
    } finally {
      setSaving(false)
      if (restoreLauncherFocus) {
        restoreEditorLauncherFocus()
      }
    }
  }

  const remove = async (notification: LexisNotification): Promise<void> => {
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
      throw new Error('Notification deletion failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="notifications-page">
      <section className="notifications-page__header" aria-labelledby="notifications-page-title">
        <div>
          <h1 id="notifications-page-title">Notifications</h1>
          <p>{pageDescription}</p>
        </div>
        {isAdmin && (
          <Button size="md" renderIcon={Add} onClick={startCreate} disabled={saving}>
            New notification
          </Button>
        )}
      </section>

      {showRecentUpdateMessage && !showEditor && recentUpdateCount > 0 && (
        <InlineNotification
          className="notifications-page__message"
          kind="info"
          title="Recently updated notifications"
          subtitle={`${recentUpdateCount} notification${recentUpdateCount === 1 ? ' was' : 's were'} updated in the last ${RECENT_UPDATE_WINDOW_DAYS} days.`}
          lowContrast
          onCloseButtonClick={() => setShowRecentUpdateMessage(false)}
        />
      )}

      {message && !showEditor && (
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
        <Modal
          open
          className="notifications-page__editor-modal"
          modalLabel={<span>Admin</span>}
          modalHeading={editorTitle}
          aria-label={editorTitle}
          hasScrollingContent
          launcherButtonRef={editorLauncherRef}
          selectorPrimaryFocus="#notification-title"
          primaryButtonText={isEditing ? 'Save changes' : 'Publish'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={saving}
          loadingStatus={saving ? 'active' : 'inactive'}
          loadingDescription="Saving notification…"
          loadingIconDescription="Saving notification"
          preventCloseOnClickOutside
          onRequestClose={() => {
            if (!saving) {
              resetForm()
            }
          }}
          onSecondarySubmit={resetForm}
          onRequestSubmit={() => void save()}
        >
          <p className="notifications-page__editor-help">
            Rich text is sanitized on the server before it is saved.
          </p>

          {message && (
            <InlineNotification
              className="notifications-page__editor-message"
              kind={message.kind}
              title={message.title}
              subtitle={message.subtitle}
              lowContrast
              onCloseButtonClick={() => setMessage(null)}
            />
          )}

          <div className="notifications-page__form-section">
            <h3>Message</h3>
            <TextInput
              id="notification-title"
              labelText="Title"
              value={form.title}
              maxLength={MAX_NOTIFICATION_TITLE_LENGTH}
              disabled={saving}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
            <div className="notifications-page__form-field">
              <p className="cds--label">Message</p>
              <p className="notifications-page__field-help">
                Explain what is happening and what, if anything, the reader should do.
              </p>
              <NotificationEditor
                value={form.contentHtml}
                disabled={saving}
                onChange={(contentHtml) => setForm((current) => ({ ...current, contentHtml }))}
              />
              <p className="notifications-page__character-count" aria-live="polite">
                {contentCharacterCount.toLocaleString('en-CA')} / 4,000 characters
              </p>
            </div>
          </div>

          <fieldset className="notifications-page__form-section notifications-page__level">
            <legend>Type</legend>
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
                  setForm((current) => ({
                    ...current,
                    displayStartDate: event.target.value,
                  }))
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
        </Modal>
      )}

      <section aria-labelledby="notification-list-heading">
        <h2 id="notification-list-heading" className="notifications-page__visually-hidden">
          {isAdmin ? 'Notification administration feed' : 'Active notifications'}
        </h2>
        <div className="notifications-page__results-bar">
          {!loading && (
            <p className="notifications-page__results-count">
              {isAdmin
                ? `${activeNotificationCount} active notification${activeNotificationCount === 1 ? '' : 's'}`
                : `${notifications.length} active notification${notifications.length === 1 ? '' : 's'}`}
            </p>
          )}
          {loading && <InlineLoading description="Loading notifications…" />}
        </div>

        {!loading && notifications.length === 0 && (
          <div className="notifications-page__empty-state">
            <div className="notifications-page__empty-state-icon" aria-hidden="true">
              <NotificationIcon size={32} />
            </div>
            <h3>No active notifications</h3>
            <p>
              {isAdmin
                ? 'Nothing is posted right now. When you publish a notification, it appears here for its audience until its end date.'
                : 'Nothing is posted right now. New notifications will appear here until their end date.'}
            </p>
          </div>
        )}

        {notifications.length > 0 && (
          <div
            className="notifications-page__list"
            role="list"
            aria-label={isAdmin ? 'All notifications' : 'Active notifications'}
          >
            {notifications.map((notification) => {
              const adminNotification = isAdminNotification(notification) ? notification : null
              return (
                <article
                  key={notification.id}
                  className={`notifications-page__notification notifications-page__notification--${notification.notificationLevel.toLowerCase()}`}
                  role="listitem"
                >
                  <div className="notifications-page__notification-icon" aria-hidden="true">
                    {notificationLevelIcon(notification.notificationLevel)}
                  </div>
                  <div className="notifications-page__notification-body">
                    <div className="notifications-page__notification-heading">
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
                      {isAdmin && adminNotification && (
                        <div className="notifications-page__notification-actions">
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Edit}
                            disabled={saving}
                            onClick={() => startEdit(adminNotification)}
                          >
                            Edit
                          </Button>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            disabled={saving}
                            onClick={() => setNotificationPendingDeletion(adminNotification)}
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
                    <div className="notifications-page__notification-meta">
                      <span>Posted {formatDate(notification.displayStartDate)}</span>
                      <span
                        className="notifications-page__notification-meta-dot"
                        aria-hidden="true"
                      />
                      <span className="notifications-page__notification-window">
                        <Time size={14} aria-hidden="true" />
                        Shows until {formatDate(notification.displayEndDate)}
                      </span>
                    </div>
                    {isAdmin && adminNotification && (
                      <dl className="notifications-page__metadata">
                        <div>
                          <dt>Created</dt>
                          <dd>
                            {formatDateTime(adminNotification.createTimestamp)} by{' '}
                            {adminNotification.createUser}
                          </dd>
                        </div>
                        <div>
                          <dt>Last updated</dt>
                          <dd>
                            {formatDateTime(adminNotification.updateTimestamp)} by{' '}
                            {adminNotification.updateUserId}
                          </dd>
                        </div>
                        <div>
                          <dt>Audience</dt>
                          <dd>
                            {adminNotification.audienceRoles.length > 0
                              ? adminNotification.audienceRoles.map(roleLabel).join(', ')
                              : 'All authenticated LEXIS users'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {notificationPendingDeletion && (
        <ConfirmationModal
          open
          title="Delete this notification?"
          description={
            <>
              <strong>{notificationPendingDeletion.title}</strong> will be removed from everyone’s
              view right away. This can’t be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          danger
          onConfirm={() => remove(notificationPendingDeletion)}
          onClose={() => setNotificationPendingDeletion(null)}
        />
      )}
    </div>
  )
}
