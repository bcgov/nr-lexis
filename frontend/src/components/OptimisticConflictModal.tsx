import { Button, Modal } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'
import {
  OPTIMISTIC_CONFLICT_EVENT,
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
  const activeConflict = queue[0]
  const changedFields = useMemo(
    () => normalizeChangedFields(activeConflict?.problem.changedFields),
    [activeConflict],
  )
  const savedAt = formatSavedAt(activeConflict?.problem.savedAt)
  const versionRequired = activeConflict?.problem.code === 'RECORD_VERSION_REQUIRED'
  const heading = versionRequired ? 'Refresh required before saving' : 'Newer changes were saved'

  useEffect(() => {
    const handleConflict = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      setQueue((current) => [...current, conflictEvent.detail])
    }

    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
    return () => window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
  }, [])

  const refresh = () => {
    if (!activeConflict) return
    activeConflict.refresh()
    setQueue([])
  }

  return (
    <Modal
      open={Boolean(activeConflict)}
      passiveModal
      size="sm"
      modalHeading={heading}
      aria-label={heading}
      className="lexis-optimistic-conflict-modal"
      selectorPrimaryFocus="#lexis-conflict-refresh"
      preventCloseOnClickOutside
      onRequestClose={refresh}
    >
      <div className="lexis-optimistic-conflict-modal__body">
        {versionRequired ? (
          <p>
            This record was loaded without a current version. Your changes were not saved. Refresh
            before editing and saving again.
          </p>
        ) : (
          <p>
            Another user saved newer changes after you opened this record. Your changes were not
            saved. Refresh to load the current record before editing and saving again.
          </p>
        )}

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

        {versionRequired ? null : changedFields.length > 0 ? (
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
            before editing and saving again.
          </p>
        )}

        <div className="lexis-optimistic-conflict-modal__actions">
          <Button id="lexis-conflict-refresh" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default OptimisticConflictModal
