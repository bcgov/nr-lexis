import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'

import './RecordHeaderSubtitle.css'

export type RelatedRecordLink = {
  recordNumber: string
  /** Omitted when the user can't open the record; the number then shows as plain text. */
  to?: string
  state?: unknown
}

export type RelatedRecordGroup = {
  label: string
  pluralLabel: string
  records: RelatedRecordLink[]
}

export const COLLAPSED_RELATED_RECORD_COUNT = 5

const RelatedRecordGroupLinks = ({ label, pluralLabel, records }: RelatedRecordGroup) => {
  const [showAllRecords, setShowAllRecords] = useState(false)
  const collapsible = records.length > COLLAPSED_RELATED_RECORD_COUNT
  const shownRecords =
    collapsible && !showAllRecords ? records.slice(0, COLLAPSED_RELATED_RECORD_COUNT) : records

  return (
    <span className="record-header-subtitle__item">
      {records.length === 1 ? label : pluralLabel}:{' '}
      {shownRecords.map((record, index) => (
        <Fragment key={record.recordNumber}>
          {index > 0 ? ', ' : null}
          {record.to ? (
            <Link to={record.to} state={record.state}>
              {record.recordNumber}
            </Link>
          ) : (
            record.recordNumber
          )}
        </Fragment>
      ))}
      {collapsible ? (
        <>
          {' '}
          <button
            type="button"
            className="record-header-subtitle__toggle"
            aria-expanded={showAllRecords}
            onClick={() => setShowAllRecords((current) => !current)}
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

/** A detail page's subtitle: links to its related records, then its author. */
const RecordHeaderSubtitle = ({ relatedRecordGroups, author }: RecordHeaderSubtitleProps) => (
  <span className="record-header-subtitle">
    {relatedRecordGroups
      .filter((group) => group.records.length > 0)
      .map((group) => (
        <RelatedRecordGroupLinks key={group.label} {...group} />
      ))}
    <span className="record-header-subtitle__item">Author: {author}</span>
  </span>
)

export default RecordHeaderSubtitle
