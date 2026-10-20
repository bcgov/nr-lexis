import type { ReactNode } from 'react'
import EmptyValue from '@/components/EmptyValue'
import { displayValue, displayValueText } from '@/utils/display-value'
import {
  formatScaleRows,
  formatUploadFileSize,
  formatUploadQueuedAt,
  uploadQueueStatusLabel,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

type UploadQueueReviewAccordionProps = {
  items: UploadQueueItem[]
  targetSummary: string
  idPrefix?: string
  itemNoun?: string
  showHeader?: boolean
  renderFileDescription?: (item: UploadQueueItem) => ReactNode
}

const asList = (value: string[] | undefined): string[] => value?.filter(Boolean) ?? []

const formatDecimal = (value: number | undefined): ReactNode =>
  typeof value === 'number' ? value.toFixed(1) : <EmptyValue />

type ReviewTableRow = {
  label: string
  value: ReactNode
}

const clientLocationValue = (
  clientNumber: string | undefined,
  locationCode: string | undefined,
): string => {
  const client = displayValueText(clientNumber)
  return locationCode ? `${client}-${locationCode}` : client
}

const renderFieldValueTable = (title: string, rows: ReviewTableRow[]) => (
  <div className="admin-upload-review__table-group">
    <h4>{title}</h4>
    <div className="admin-upload-review-table">
      <table
        className="cds--data-table admin-upload-review-field-table"
        aria-label={`${title} review`}
      >
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value || <EmptyValue />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const reviewEmptyResultMessage = (hasMetadata: boolean, summary: string): string =>
  hasMetadata ? 'No validation issues returned.' : summary

function UploadQueueReviewAccordion({
  items,
  targetSummary,
  idPrefix = 'adminUploadReview',
  itemNoun = 'file',
  showHeader = true,
  renderFileDescription,
}: UploadQueueReviewAccordionProps) {
  if (items.length === 0) {
    return null
  }

  const titleId = `${idPrefix}Title`
  const itemNounTitle = `${itemNoun.charAt(0).toUpperCase()}${itemNoun.slice(1)}`
  const itemNounPlural = `${itemNoun}s`

  return (
    <section
      className="admin-upload-review"
      {...(showHeader
        ? { 'aria-labelledby': titleId }
        : { 'aria-label': `${itemNounTitle} review` })}
    >
      {showHeader && (
        <div className="admin-upload-review__header">
          <h3 id={titleId}>{itemNounTitle} review</h3>
          <span>
            {items.length} {items.length === 1 ? itemNoun : itemNounPlural}
          </span>
        </div>
      )}

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
          const applicationSummaryRows = submissionSummary
            ? [
                {
                  label: 'Owner client',
                  value: clientLocationValue(
                    submissionSummary.ownerClientNumber,
                    submissionSummary.ownerClientLocationCode,
                  ),
                },
                {
                  label: 'Owner contact',
                  value: displayValue(submissionSummary.ownerContactName),
                },
                {
                  label: 'Region',
                  value: displayValue(submissionSummary.orgUnitNumber),
                },
                {
                  label: 'Jurisdiction',
                  value: displayValue(submissionSummary.jurisdictionCode),
                },
                {
                  label: 'Federal application',
                  value: displayValue(submissionSummary.federalApplicationNumber),
                },
                {
                  label: 'Source status',
                  value: displayValue(submissionSummary.sourceApplicationStatusCode),
                },
                {
                  label: 'Exemption reason',
                  value: displayValue(submissionSummary.exemptionReasonCode),
                },
                {
                  label: 'Applicant type',
                  value: displayValue(submissionSummary.applicantTypeCode),
                },
              ]
            : []

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
                <span
                  className={`admin-upload-status-text admin-upload-status-text--${item.status}`}
                >
                  {uploadQueueStatusLabel(item.status)}
                </span>
                <span className="admin-upload-review__summary-text">{summary}</span>
              </summary>

              <div className="admin-upload-review__content">
                {renderFileDescription?.(item)}
                <dl className="admin-upload-review__meta">
                  <div>
                    <dt>Upload type</dt>
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
                      <dt>User reference</dt>
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
                    {renderFieldValueTable('Application details', applicationSummaryRows)}
                    <div className="admin-upload-review__table-group">
                      <h4>Product details</h4>
                      <div className="admin-upload-review-table">
                        <table
                          className="cds--data-table admin-upload-review-product-table"
                          aria-label="Product details review"
                        >
                          <thead>
                            <tr>
                              <th scope="col">Product type</th>
                              <th scope="col">Age class</th>
                              <th scope="col">Product location</th>
                              <th scope="col">Application volume</th>
                              <th scope="col">Average log volume</th>
                              <th scope="col">Average length</th>
                              <th scope="col">Average diameter</th>
                              <th scope="col">Species</th>
                              <th scope="col">End use</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>{displayValue(submissionSummary.productTypeCode)}</td>
                              <td>{displayValue(submissionSummary.ageClass)}</td>
                              <td>{displayValue(submissionSummary.productLocation)}</td>
                              <td>{formatDecimal(submissionSummary.applicationVolume)}</td>
                              <td>{formatDecimal(submissionSummary.averageLogVolume)}</td>
                              <td>{formatDecimal(submissionSummary.averageLength)}</td>
                              <td>{formatDecimal(submissionSummary.averageDiameter)}</td>
                              <td>
                                {submissionSummary.speciesCodes?.length
                                  ? submissionSummary.speciesCodes.join(', ')
                                  : displayValue('')}
                              </td>
                              <td>{displayValue(submissionSummary.endUseCode)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
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
                      {reviewEmptyResultMessage(hasMetadata, summary)}
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
