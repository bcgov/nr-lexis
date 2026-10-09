import { Button } from '@carbon/react'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import {
  OPTIMISTIC_CONFLICT_EVENT,
  type OptimisticConflictEvent,
  type OptimisticConflictRequest,
  type OptimisticRecordType,
} from '@/service/optimistic-conflict'
import { formatBusinessIsoDate, LEXIS_BUSINESS_TIME_ZONE } from '@/utils/date'

import './OptimisticConflictModal.scss'

const RECORD_NOUNS: Record<OptimisticRecordType, string> = {
  application: 'application',
  'federal-application': 'application',
  exemption: 'exemption',
  permit: 'permit',
  offer: 'offer',
}

const formatSavedAt = (value: string | undefined): { date: string; time: string } | undefined => {
  if (!value) return undefined
  const savedAt = new Date(value)
  if (Number.isNaN(savedAt.getTime())) return undefined
  return {
    date: formatBusinessIsoDate(savedAt),
    // "10:39 a.m."
    time: new Intl.DateTimeFormat('en-CA', {
      timeZone: LEXIS_BUSINESS_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(savedAt),
  }
}

const staleRecordMessage = (conflict: OptimisticConflictRequest, recordNoun: string): string => {
  const updatedBy = conflict.problem.updatedBy?.trim()
  const savedAt = formatSavedAt(conflict.problem.savedAt)
  const when = savedAt ? ` on ${savedAt.date} at ${savedAt.time},` : ''
  const saved = updatedBy
    ? `${updatedBy} saved changes${when} after you opened this ${recordNoun}.`
    : `Changes were saved${when} after you opened this ${recordNoun}.`
  const notSaved = conflict.saveSubject
    ? `Your ${conflict.saveSubject} was not saved.`
    : 'Your changes were not saved.'
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
            <p>
              Refresh to load the latest version, then save again. What you entered will be lost.
            </p>
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
