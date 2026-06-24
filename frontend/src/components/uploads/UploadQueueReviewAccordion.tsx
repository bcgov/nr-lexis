import { Tag } from '@carbon/react'
import { displayValue } from '@/utils/text'
import {
  formatScaleRows,
  formatUploadFileSize,
  formatUploadQueuedAt,
  uploadQueueStatusLabel,
  uploadQueueStatusTagType,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

export type UploadQueueReviewAccordionProps = {
  items: UploadQueueItem[]
  targetSummary: string
  idPrefix?: string
  itemNoun?: string
}

const asList = (value: string[] | undefined): string[] => value?.filter(Boolean) ?? []

const formatDecimal = (value: number | undefined): string =>
  typeof value === 'number' ? value.toFixed(1) : 'Not provided'

const reviewEmptyResultMessage = (
  item: UploadQueueItem,
  itemNoun: string,
  hasMetadata: boolean,
  summary: string,
): string => {
  if (itemNoun === 'submission' && item.status === 'complete') {
    return 'Application submission finalized successfully.'
  }

  return hasMetadata ? 'No validation issues returned.' : summary
}

function UploadQueueReviewAccordion({
  items,
  targetSummary,
  idPrefix = 'adminUploadReview',
  itemNoun = 'file',
}: UploadQueueReviewAccordionProps) {
  if (items.length === 0) {
    return null
  }

  const titleId = `${idPrefix}Title`
  const itemNounTitle = `${itemNoun.charAt(0).toUpperCase()}${itemNoun.slice(1)}`
  const itemNounPlural = `${itemNoun}s`
  const typeLabel = itemNoun === 'submission' ? 'Submission type' : 'Upload type'

  return (
    <section className="admin-upload-review" aria-labelledby={titleId}>
      <div className="admin-upload-review__header">
        <h3 id={titleId}>{itemNounTitle} review</h3>
        <span>
          {items.length} {items.length === 1 ? itemNoun : itemNounPlural}
        </span>
      </div>

      <div className="admin-upload-review__list">
        {items.map((item) => {
          const details = item.details
          const errors = asList(details?.errors)
          const warnings = asList(details?.warnings)
          const applicationNumber = details?.applicationNumber ?? item.resultApplicationNumber
          const hasMetadata =
            !!applicationNumber ||
            !!details?.packageNumber ||
            !!details?.userReference ||
            !!item.file.name ||
            typeof details?.scaleRows === 'number'
          const summary = details?.summary || item.message || 'Waiting for upload.'
          const target = item.targetSummary ?? targetSummary
          const submissionSummary = details?.submissionSummary

          return (
            <details
              key={item.id}
              className={`admin-upload-review__item admin-upload-review__item--${item.status}`}
              open={
                item.status === 'validated' ||
                item.status === 'complete' ||
                item.status === 'failed' ||
                item.status === 'invalid'
              }
            >
              <summary className="admin-upload-review__summary">
                <span className="admin-upload-review__file-name">{item.file.name}</span>
                <Tag type={uploadQueueStatusTagType(item.status)}>
                  {uploadQueueStatusLabel(item.status)}
                </Tag>
                <span className="admin-upload-review__summary-text">{summary}</span>
              </summary>

              <div className="admin-upload-review__content">
                <dl className="admin-upload-review__meta">
                  <div>
                    <dt>{typeLabel}</dt>
                    <dd>{item.workflowLabel}</dd>
                  </div>
                  <div>
                    <dt>File name</dt>
                    <dd>{item.file.name}</dd>
                  </div>
                  <div>
                    <dt>File size</dt>
                    <dd>{formatUploadFileSize(item.file.size)}</dd>
                  </div>
                  <div>
                    <dt>Submission timestamp</dt>
                    <dd>{formatUploadQueuedAt(item.queuedAt)}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{target}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{uploadQueueStatusLabel(item.status)}</dd>
                  </div>
                  {applicationNumber && (
                    <div>
                      <dt>Application</dt>
                      <dd>Application {applicationNumber}</dd>
                    </div>
                  )}
                  {details?.packageNumber && (
                    <div>
                      <dt>Package</dt>
                      <dd>Package {details.packageNumber}</dd>
                    </div>
                  )}
                  {details?.userReference && (
                    <div>
                      <dt>User Reference</dt>
                      <dd>{details.userReference}</dd>
                    </div>
                  )}
                  {typeof details?.scaleRows === 'number' && (
                    <div>
                      <dt>Scale rows</dt>
                      <dd>{formatScaleRows(details.scaleRows)}</dd>
                    </div>
                  )}
                </dl>

                {submissionSummary && (
                  <div className="admin-upload-review__issue-group">
                    <h4>Application summary</h4>
                    <dl className="admin-upload-review__meta">
                      <div>
                        <dt>Owner client</dt>
                        <dd>
                          {displayValue(submissionSummary.ownerClientNumber)}
                          {submissionSummary.ownerClientLocationCode
                            ? `-${submissionSummary.ownerClientLocationCode}`
                            : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Owner contact</dt>
                        <dd>{displayValue(submissionSummary.ownerContactName)}</dd>
                      </div>
                      <div>
                        <dt>Region</dt>
                        <dd>{displayValue(submissionSummary.orgUnitNumber)}</dd>
                      </div>
                      <div>
                        <dt>Jurisdiction</dt>
                        <dd>{displayValue(submissionSummary.jurisdictionCode)}</dd>
                      </div>
                      {submissionSummary.federalApplicationNumber && (
                        <div>
                          <dt>Federal application</dt>
                          <dd>{submissionSummary.federalApplicationNumber}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Source status</dt>
                        <dd>{displayValue(submissionSummary.sourceApplicationStatusCode)}</dd>
                      </div>
                      <div>
                        <dt>Exemption reason</dt>
                        <dd>{displayValue(submissionSummary.exemptionReasonCode)}</dd>
                      </div>
                      <div>
                        <dt>Applicant type</dt>
                        <dd>{displayValue(submissionSummary.applicantTypeCode)}</dd>
                      </div>
                      <div>
                        <dt>Product type</dt>
                        <dd>{displayValue(submissionSummary.productTypeCode)}</dd>
                      </div>
                      <div>
                        <dt>Age class</dt>
                        <dd>{displayValue(submissionSummary.ageClass)}</dd>
                      </div>
                      <div>
                        <dt>Product location</dt>
                        <dd>{displayValue(submissionSummary.productLocation)}</dd>
                      </div>
                      <div>
                        <dt>Application volume</dt>
                        <dd>{formatDecimal(submissionSummary.applicationVolume)}</dd>
                      </div>
                      <div>
                        <dt>Average log volume</dt>
                        <dd>{formatDecimal(submissionSummary.averageLogVolume)}</dd>
                      </div>
                      <div>
                        <dt>Average length</dt>
                        <dd>{formatDecimal(submissionSummary.averageLength)}</dd>
                      </div>
                      <div>
                        <dt>Average diameter</dt>
                        <dd>{formatDecimal(submissionSummary.averageDiameter)}</dd>
                      </div>
                      <div>
                        <dt>Species</dt>
                        <dd>
                          {submissionSummary.speciesCodes?.length
                            ? submissionSummary.speciesCodes.join(', ')
                            : 'Not provided'}
                        </dd>
                      </div>
                      <div>
                        <dt>End use</dt>
                        <dd>{displayValue(submissionSummary.endUseCode)}</dd>
                      </div>
                    </dl>
                  </div>
                )}

                {errors.length > 0 && (
                  <div className="admin-upload-review__issue-group">
                    <h4>Errors</h4>
                    <ul>
                      {errors.map((error) => (
                        <li key={`${item.id}-error-${error}`}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="admin-upload-review__issue-group">
                    <h4>Warnings</h4>
                    <ul>
                      {warnings.map((warning) => (
                        <li key={`${item.id}-warning-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {(item.status === 'validated' || item.status === 'complete') &&
                  errors.length === 0 &&
                  warnings.length === 0 && (
                    <p className="admin-upload-review__empty-result">
                      {reviewEmptyResultMessage(item, itemNoun, hasMetadata, summary)}
                    </p>
                  )}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

export default UploadQueueReviewAccordion
