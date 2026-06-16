import { type FC } from 'react'
import { Tag } from '@carbon/react'
import {
  formatScaleRows,
  formatUploadFileSize,
  formatUploadQueuedAt,
  uploadQueueStatusLabel,
  uploadQueueStatusTagType,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

type UploadQueueReviewAccordionProps = {
  items: UploadQueueItem[]
  targetSummary: string
  idPrefix?: string
}

const asList = (value: string[] | undefined): string[] => value?.filter(Boolean) ?? []

const formatOptional = (value: string | number | undefined | null): string =>
  value === undefined || value === null || value === '' ? 'Not provided' : String(value)

const formatDecimal = (value: number | undefined): string =>
  typeof value === 'number' ? value.toFixed(1) : 'Not provided'

const UploadQueueReviewAccordion: FC<UploadQueueReviewAccordionProps> = ({
  items,
  targetSummary,
  idPrefix = 'adminUploadReview',
}) => {
  if (items.length === 0) {
    return null
  }

  const titleId = `${idPrefix}Title`

  return (
    <section className="admin-upload-review" aria-labelledby={titleId}>
      <div className="admin-upload-review__header">
        <h3 id={titleId}>File Review</h3>
        <span>
          {items.length} file{items.length === 1 ? '' : 's'}
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
                    <dt>Upload Type</dt>
                    <dd>{item.workflowLabel}</dd>
                  </div>
                  <div>
                    <dt>File Name</dt>
                    <dd>{item.file.name}</dd>
                  </div>
                  <div>
                    <dt>File Size</dt>
                    <dd>{formatUploadFileSize(item.file.size)}</dd>
                  </div>
                  <div>
                    <dt>Submission Timestamp</dt>
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
                      <dt>Scale Rows</dt>
                      <dd>{formatScaleRows(details.scaleRows)}</dd>
                    </div>
                  )}
                </dl>

                {submissionSummary && (
                  <div className="admin-upload-review__issue-group">
                    <h4>Application Summary</h4>
                    <dl className="admin-upload-review__meta">
                      <div>
                        <dt>Owner Client</dt>
                        <dd>
                          {formatOptional(submissionSummary.ownerClientNumber)}
                          {submissionSummary.ownerClientLocationCode
                            ? `-${submissionSummary.ownerClientLocationCode}`
                            : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Owner Contact</dt>
                        <dd>{formatOptional(submissionSummary.ownerContactName)}</dd>
                      </div>
                      <div>
                        <dt>Region</dt>
                        <dd>{formatOptional(submissionSummary.orgUnitNumber)}</dd>
                      </div>
                      <div>
                        <dt>Jurisdiction</dt>
                        <dd>{formatOptional(submissionSummary.jurisdictionCode)}</dd>
                      </div>
                      <div>
                        <dt>Product Type</dt>
                        <dd>{formatOptional(submissionSummary.productTypeCode)}</dd>
                      </div>
                      <div>
                        <dt>Product Location</dt>
                        <dd>{formatOptional(submissionSummary.productLocation)}</dd>
                      </div>
                      <div>
                        <dt>Application Volume</dt>
                        <dd>{formatDecimal(submissionSummary.applicationVolume)}</dd>
                      </div>
                      <div>
                        <dt>Average Log Volume</dt>
                        <dd>{formatDecimal(submissionSummary.averageLogVolume)}</dd>
                      </div>
                      <div>
                        <dt>Average Length</dt>
                        <dd>{formatDecimal(submissionSummary.averageLength)}</dd>
                      </div>
                      <div>
                        <dt>Average Diameter</dt>
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
                        <dt>End Use</dt>
                        <dd>{formatOptional(submissionSummary.endUseCode)}</dd>
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
                      {hasMetadata ? 'No validation issues returned.' : summary}
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
