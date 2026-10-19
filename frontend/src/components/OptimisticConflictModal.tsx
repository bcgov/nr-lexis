import { Button } from '@carbon/react'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import {
  OPTIMISTIC_CONFLICT_EVENT,
  type OptimisticConflictEvent,
  type OptimisticConflictRequest,
  type OptimisticRecordType,
} from '@/service/optimistic-conflict'
import { recordVersionLoadedAt } from '@/service/record-version-service'
import { formatBusinessIsoDate, formatIsoDateLabel, LEXIS_BUSINESS_TIME_ZONE } from '@/utils/date'

import './OptimisticConflictModal.scss'

const RECORD_NOUNS: Record<OptimisticRecordType, string> = {
  application: 'application',
  'federal-application': 'application',
  exemption: 'exemption',
  permit: 'permit',
  offer: 'offer',
}

// Accounts that save on the system's behalf are described by what they did, never named.
const SYSTEM_USER_MESSAGES: Record<string, string> = {
  EXPIRY_MONITOR: 'This exemption expired overnight.',
}

const systemUserMessage = (userId: string | undefined): string | undefined =>
  userId ? SYSTEM_USER_MESSAGES[userId.toUpperCase()] : undefined

const parseSavedAt = (value: string | undefined): Date | undefined => {
  if (!value) return undefined
  const savedAt = new Date(value)
  return Number.isNaN(savedAt.getTime()) ? undefined : savedAt
}

const formatSavedAt = (savedAt: Date): { date: string; time: string } => ({
  date: formatIsoDateLabel(formatBusinessIsoDate(savedAt)),
  // "10:39 a.m."
  time: new Intl.DateTimeFormat('en-CA', {
    timeZone: LEXIS_BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(savedAt),
})

const staleRecordMessage = (conflict: OptimisticConflictRequest, recordNoun: string): string => {
  const notSaved = conflict.saveSubject
    ? `Your ${conflict.saveSubject} was not saved.`
    : 'Your changes were not saved.'
  const savedAt = parseSavedAt(conflict.problem.savedAt)
  const openedAt =
    conflict.recordType && conflict.recordId
      ? recordVersionLoadedAt(conflict.recordType, conflict.recordId)
      : undefined
  // The newest saved row can be older than the version that was opened, such as after a delete.
  // That save is not the change that made this one stale, so its user and time are not shown.
  // Both times are the server's; with no server time for the opened version, the save is shown.
  const newerThanOpened = !savedAt || openedAt === undefined || savedAt.getTime() >= openedAt
  const updatedBy = newerThanOpened ? conflict.problem.updatedBy?.trim() : undefined

  const systemMessage = systemUserMessage(updatedBy)
  if (systemMessage) return `${systemMessage} ${notSaved}`

  const formatted = newerThanOpened && savedAt ? formatSavedAt(savedAt) : undefined
  const when = formatted ? ` on ${formatted.date} at ${formatted.time},` : ''
  const saved = updatedBy
    ? `${updatedBy} saved changes${when} after you opened this ${recordNoun}.`
    : `Changes were saved${when} after you opened this ${recordNoun}.`
  return `${saved} ${notSaved}`
}

const OptimisticConflictModal = ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => {
  const [queue, setQueue] = useState<OptimisticConflictRequest[]>([])
  const activeConflict = queue[0]
  const recordNoun = activeConflict?.recordType ? RECORD_NOUNS[activeConflict.recordType] : 'record'
  const versionRequired = activeConflict?.problem.code === 'RECORD_VERSION_REQUIRED'
  const heading = versionRequired
    ? 'Refresh required before saving'
    : `This ${recordNoun} was updated`

  useEffect(() => {
    const handleConflict = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      onOpenChange?.(true)
      setQueue((current) => [...current, conflictEvent.detail])
    }

    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
    return () => window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, handleConflict)
  }, [onOpenChange])

  const refresh = () => {
    if (!activeConflict) return
    activeConflict.refresh()
    setQueue([])
    onOpenChange?.(false)
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
        {!activeConflict ? null : versionRequired ? (
          <p>
            This record was loaded without a current version. Your changes were not saved. Refresh
            before editing and saving again.
          </p>
        ) : (
          <>
            <p>{staleRecordMessage(activeConflict, recordNoun)}</p>
            <p>Refresh to load the latest version, then save again.</p>
          </>
        )}

        <div className="lexis-optimistic-conflict-modal__actions">
          <Button size="md" id="lexis-conflict-refresh" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default OptimisticConflictModal
