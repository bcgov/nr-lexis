import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import './RecordHeaderSubtitle.css'

export type RelatedRecordLink = {
  recordNumber: string
  /** Omitted when the user can't open the record; the number then shows as plain text. */
  to?: string
  state?: unknown
  /** Shown in brackets after the number, as legacy did. */
  status?: string | null
}

export type RelatedRecordGroup = {
  label: string
  pluralLabel: string
  records: RelatedRecordLink[]
  /** Opens the full list elsewhere, such as a tab, instead of expanding it in the header. */
  onShowAllRecords?: () => void
}

export const COLLAPSED_RELATED_RECORD_COUNT = 5

const RelatedRecordGroupLinks = ({
  label,
  pluralLabel,
  records,
  onShowAllRecords,
}: RelatedRecordGroup) => {
  const [showAllRecords, setShowAllRecords] = useState(false)
  const revealedRecordsRef = useRef<HTMLSpanElement>(null)
  const collapsible = records.length > COLLAPSED_RELATED_RECORD_COUNT

  // Keyboard users continue from the first record they revealed, not past the whole list.
  useEffect(() => {
    if (showAllRecords) revealedRecordsRef.current?.querySelector('a')?.focus()
  }, [showAllRecords])

  const renderRecord = (record: RelatedRecordLink, index: number) => (
    <Fragment key={record.recordNumber}>
      {index > 0 ? ', ' : null}
      <span className="record-header-subtitle__record">
        {record.to ? (
          <Link to={record.to} state={record.state}>
            {record.recordNumber}
          </Link>
        ) : (
          record.recordNumber
        )}
        {record.status?.trim() ? ` (${record.status.trim()})` : null}
      </span>
    </Fragment>
  )

  return (
    <span className="record-header-subtitle__item">
      {records.length === 1 ? label : pluralLabel}:{' '}
      {records.slice(0, COLLAPSED_RELATED_RECORD_COUNT).map(renderRecord)}
      {collapsible && showAllRecords ? (
        <span ref={revealedRecordsRef}>
          {records
            .slice(COLLAPSED_RELATED_RECORD_COUNT)
            .map((record, index) => renderRecord(record, index + COLLAPSED_RELATED_RECORD_COUNT))}
        </span>
      ) : null}
      {collapsible ? (
        <>
          {' '}
          <button
            type="button"
            className="record-header-subtitle__toggle"
            aria-expanded={onShowAllRecords ? undefined : showAllRecords}
            onClick={onShowAllRecords ?? (() => setShowAllRecords((current) => !current))}
          >
            {showAllRecords
              ? 'Show fewer'
              : `+${records.length - COLLAPSED_RELATED_RECORD_COUNT} more`}
          </button>
        </>
      ) : null}
    </span>
  )
}

type RecordHeaderSubtitleProps = {
  relatedRecordGroups: RelatedRecordGroup[]
  author: string
}

/** A detail page's subtitle: its author, then links to its related records, one per line. */
const RecordHeaderSubtitle = ({ relatedRecordGroups, author }: RecordHeaderSubtitleProps) => (
  <span className="record-header-subtitle">
    <span className="record-header-subtitle__item">Author: {author}</span>
    {relatedRecordGroups
      .filter((group) => group.records.length > 0)
      .map((group) => (
        <RelatedRecordGroupLinks key={group.label} {...group} />
      ))}
  </span>
)

export default RecordHeaderSubtitle
