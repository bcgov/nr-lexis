import { Button, InlineNotification, Loading, Modal } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'
import {
  OPTIMISTIC_CONFLICT_EVENT,
  OptimisticOverwriteConflictError,
  type OptimisticConflictEvent,
  type OptimisticConflictRequest,
} from '@/service/optimistic-conflict'
import { LEXIS_BUSINESS_TIME_ZONE } from '@/utils/date'

import './OptimisticConflictModal.scss'

type ChangedField = {
  label: string
  currentValue?: string
}

const humanizeFieldName = (value: string): string => {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[._-]+/g, ' ')
    .trim()
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : 'Record field'
}

const formatValue = (value: unknown): string | undefined => {
  if (value === null) return 'Not provided'
  if (typeof value === 'string') return value.trim() || 'Not provided'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === undefined) return undefined

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const asChangedField = (value: unknown): ChangedField | null => {
  if (typeof value === 'string') {
    return { label: humanizeFieldName(value) }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const field = value as Record<string, unknown>
  const name =
    (typeof field.label === 'string' && field.label) ||
    (typeof field.field === 'string' && field.field) ||
    (typeof field.name === 'string' && field.name)
  if (!name) return null

  return {
    label: humanizeFieldName(name),
    currentValue: formatValue(field.currentValue ?? field.current),
  }
}

export const normalizeChangedFields = (value: unknown): ChangedField[] => {
  if (Array.isArray(value)) {
    return value.map(asChangedField).filter((field): field is ChangedField => field !== null)
  }
  if (!value || typeof value !== 'object') {
    return []
  }

  return Object.entries(value as Record<string, unknown>).map(([name, currentValue]) => ({
    label: humanizeFieldName(name),
    currentValue: formatValue(currentValue),
  }))
}

const PendingIcon = () => <Loading small withOverlay={false} description="" />

const formatSavedAt = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: LEXIS_BUSINESS_TIME_ZONE,
  }).format(date)
}

const OptimisticConflictModal = () => {
  const [queue, setQueue] = useState<OptimisticConflictRequest[]>([])
  const [overwriting, setOverwriting] = useState(false)
  const [overwriteError, setOverwriteError] = useState<'changed-again' | 'failed' | null>(null)
  const activeConflict = queue[0]
  const changedFields = useMemo(
    () => normalizeChangedFields(activeConflict?.problem.changedFields),
    [activeConflict],
  )
  const savedAt = formatSavedAt(activeConflict?.problem.savedAt)

  useEffect(() => {
    const handleConflict = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      setQueue((current) => [...current, conflictEvent.detail])
    }

    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
    return () => window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
  }, [])

  const removeActiveConflict = () => {
    setQueue((current) => current.slice(1))
    setOverwriteError(null)
  }

  const refresh = () => {
    if (!activeConflict || overwriting) return
    activeConflict.refresh()
    setQueue([])
    setOverwriteError(null)
  }

  const overwrite = async () => {
    if (!activeConflict || overwriting) return

    setOverwriting(true)
    setOverwriteError(null)
    try {
      await activeConflict.overwrite(activeConflict.problem.currentVersion)
      removeActiveConflict()
    } catch (error) {
      if (error instanceof OptimisticOverwriteConflictError) {
        setQueue((current) =>
          current.length > 0
            ? [{ ...current[0], problem: error.problem }, ...current.slice(1)]
            : current,
        )
        setOverwriteError('changed-again')
      } else {
        setOverwriteError('failed')
      }
    } finally {
      setOverwriting(false)
    }
  }

  return (
    <Modal
      open={Boolean(activeConflict)}
      passiveModal
      size="sm"
      modalHeading="Newer changes were saved"
      aria-label="Newer changes were saved"
      className="lexis-optimistic-conflict-modal"
      selectorPrimaryFocus="#lexis-conflict-refresh"
      preventCloseOnClickOutside
      onRequestClose={refresh}
    >
      <div className="lexis-optimistic-conflict-modal__body">
        <p>
          Another user saved newer changes after you opened this record. Refresh to review all newer
          data. Overwrite retries your original save and may replace newer values included in that
          save. Other sections are not intentionally changed.
        </p>

        {activeConflict?.problem.detail ? (
          <p className="lexis-optimistic-conflict-modal__detail">{activeConflict.problem.detail}</p>
        ) : null}

        {savedAt || activeConflict?.problem.updatedBy ? (
          <p className="lexis-optimistic-conflict-modal__detail">
            Newer save
            {savedAt ? ` at ${savedAt}` : ''}
            {activeConflict.problem.updatedBy ? ` by ${activeConflict.problem.updatedBy}` : ''}.
          </p>
        ) : null}

        {changedFields.length > 0 ? (
          <div>
            <h3>Changes detected since you opened this record</h3>
            <ul className="lexis-optimistic-conflict-modal__changes">
              {changedFields.slice(0, 5).map((field) => (
                <li key={`${field.label}:${field.currentValue ?? ''}`}>
                  <strong>{field.label}</strong>
                  {field.currentValue ? `: ${field.currentValue}` : ''}
                </li>
              ))}
            </ul>
            {changedFields.length > 5 ? (
              <p className="lexis-optimistic-conflict-modal__more">
                And {changedFields.length - 5} more changed{' '}
                {changedFields.length - 5 === 1 ? 'field' : 'fields'}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="lexis-optimistic-conflict-modal__detail">
            The newer fields could not be summarized here. Refresh to review the complete record
            before deciding whether to overwrite.
          </p>
        )}

        {overwriteError ? (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="error"
            title={
              overwriteError === 'changed-again'
                ? 'Newer changes were saved again'
                : 'Overwrite failed'
            }
            subtitle={
              overwriteError === 'changed-again'
                ? 'Review the latest values, then refresh or choose Overwrite again.'
                : 'The save could not be completed. Refresh the record and try again.'
            }
          />
        ) : null}

        {activeConflict && !activeConflict.problem.currentVersion ? (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="warning"
            title="Overwrite unavailable"
            subtitle="Refresh the record to load the latest version before saving again."
          />
        ) : null}

        <div className="lexis-optimistic-conflict-modal__actions">
          <Button
            id="lexis-conflict-refresh"
            kind="secondary"
            disabled={overwriting}
            onClick={refresh}
          >
            Refresh
          </Button>
          <Button
            kind="danger"
            disabled={overwriting || !activeConflict?.problem.currentVersion}
            renderIcon={overwriting ? PendingIcon : undefined}
            onClick={() => void overwrite()}
          >
            {overwriting ? 'Overwriting…' : 'Overwrite'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default OptimisticConflictModal
