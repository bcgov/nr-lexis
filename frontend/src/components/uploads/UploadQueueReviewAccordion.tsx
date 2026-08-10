import type { ReactNode } from 'react'
import { Document, Folder, Package, Product, WarningAltFilled } from '@carbon/icons-react'
import { displayValue } from '@/utils/text'
import {
  formatScaleRows,
  formatUploadFileSize,
  formatUploadQueuedAt,
  uploadQueueStatusLabel,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

export type UploadQueueReviewAccordionProps = {
  items: UploadQueueItem[]
  targetSummary: string
  idPrefix?: string
  itemNoun?: string
  showHeader?: boolean
}

const asList = (value: string[] | undefined): string[] => value?.filter(Boolean) ?? []

const formatDecimal = (value: number | undefined): string =>
  typeof value === 'number' ? value.toFixed(1) : 'Not provided'

const formatSubmissionDecimal = (value: number | undefined): string =>
  typeof value === 'number' ? value.toFixed(1) : '—'

type ReviewTableRow = {
  label: string
  value: string
}

const clientLocationValue = (
  clientNumber: string | undefined,
  locationCode: string | undefined,
): string => {
  const client = displayValue(clientNumber)
  return locationCode ? `${client}-${locationCode}` : client
}

const submissionClientLocationValue = (
  clientNumber: string | undefined,
  locationCode: string | undefined,
): string => {
  const client = clientNumber?.trim()
  if (!client) {
    return '—'
  }
  return locationCode ? `${client}-${locationCode}` : client
}

const submissionValue = (value: string | number | undefined): string => {
  if (value === undefined || value === '' || (typeof value === 'string' && !value.trim())) {
    return '—'
  }
  return String(value)
}

type SubmissionReviewSectionProps = {
  title: string
  icon: ReactNode
  children: ReactNode
}

function SubmissionReviewSection({ title, icon, children }: SubmissionReviewSectionProps) {
  return (
    <section className="admin-upload-submission-review__section">
      <h3 className="admin-upload-submission-review__section-title">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function SubmissionReviewList({ title, rows }: { title: string; rows: ReviewTableRow[] }) {
  return (
    <table className="admin-upload-submission-review__list" aria-label={`${title} review`}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SubmissionReview({
  items,
  targetSummary,
}: {
  items: UploadQueueItem[]
  targetSummary: string
}) {
  const showFileHeadings = items.length > 1

  return (
    <div className="admin-upload-submission-review">
      {items.map((item) => {
        const details = item.details
        const errors = asList(details?.errors)
        const warnings = asList(details?.warnings)
        const applicationNumber = details?.applicationNumber ?? item.resultApplicationNumber
        const target = item.targetSummary ?? targetSummary
        const submissionSummary = details?.submissionSummary
        const packageRows: ReviewTableRow[] = [
          ...(applicationNumber
            ? [{ label: 'Application', value: `Application ${applicationNumber}` }]
            : []),
          { label: 'Package', value: submissionValue(details?.packageNumber) },
          {
            label: 'Scale rows',
            value:
              typeof details?.scaleRows === 'number' ? formatScaleRows(details.scaleRows) : '—',
          },
          ...(details?.userReference
            ? [{ label: 'User reference', value: details.userReference }]
            : []),
        ]
        const hasPackageDetails =
          !!applicationNumber ||
          !!details?.packageNumber ||
          !!details?.userReference ||
          typeof details?.scaleRows === 'number'
        const validationIssues = [
          ...errors.map((detail, index) => ({
            key: `${item.id}-error-${index}`,
            issue: 'Error',
            detail,
          })),
          ...warnings.map((detail, index) => ({
            key: `${item.id}-warning-${index}`,
            issue: 'Warning',
            detail,
          })),
        ]

        return (
          <article
            key={item.id}
            className={`admin-upload-submission-review__item admin-upload-submission-review__item--${item.status}`}
            aria-label={showFileHeadings ? `Submission ${item.file.name}` : undefined}
          >
            {showFileHeadings && (
              <div className="admin-upload-submission-review__item-heading">
                <h3>{item.file.name}</h3>
                <span
                  className={`admin-upload-status-text admin-upload-status-text--${item.status}`}
                >
                  {uploadQueueStatusLabel(item.status)}
                </span>
              </div>
            )}

            <SubmissionReviewSection
              title="Submission metadata"
              icon={<Document size={20} aria-hidden="true" />}
            >
              <SubmissionReviewList
                title="Submission metadata"
                rows={[
                  { label: 'Submission type', value: item.workflowLabel },
                  { label: 'File name', value: item.file.name },
                  { label: 'File size', value: formatUploadFileSize(item.file.size) },
                  { label: 'Submission timestamp', value: formatUploadQueuedAt(item.queuedAt) },
                  { label: 'Target', value: target },
                  { label: 'Status', value: uploadQueueStatusLabel(item.status) },
                ]}
              />
            </SubmissionReviewSection>

            {submissionSummary && (
              <SubmissionReviewSection
                title="Application details"
                icon={<Folder size={20} aria-hidden="true" />}
              >
                <SubmissionReviewList
                  title="Application details"
                  rows={[
                    {
                      label: 'Owner client',
                      value: submissionClientLocationValue(
                        submissionSummary.ownerClientNumber,
                        submissionSummary.ownerClientLocationCode,
                      ),
                    },
                    {
                      label: 'Owner contact',
                      value: submissionValue(submissionSummary.ownerContactName),
                    },
                    { label: 'Region', value: submissionValue(submissionSummary.orgUnitNumber) },
                    {
                      label: 'Jurisdiction',
                      value: submissionValue(submissionSummary.jurisdictionCode),
                    },
                    {
                      label: 'Federal application',
                      value: submissionValue(submissionSummary.federalApplicationNumber),
                    },
                    {
                      label: 'Source status',
                      value: submissionValue(submissionSummary.sourceApplicationStatusCode),
                    },
                    {
                      label: 'Exemption reason',
                      value: submissionValue(submissionSummary.exemptionReasonCode),
                    },
                    {
                      label: 'Applicant type',
                      value: submissionValue(submissionSummary.applicantTypeCode),
                    },
                  ]}
                />
              </SubmissionReviewSection>
            )}

            {hasPackageDetails && (
              <SubmissionReviewSection
                title="Package details"
                icon={<Package size={20} aria-hidden="true" />}
              >
                <SubmissionReviewList title="Package details" rows={packageRows} />
              </SubmissionReviewSection>
            )}

            {submissionSummary && (
              <SubmissionReviewSection
                title="Product details"
                icon={<Product size={20} aria-hidden="true" />}
              >
                <div className="admin-upload-submission-review__table-wrap">
                  <table
                    className="admin-upload-submission-review__table"
                    aria-label="Product details review"
                  >
                    <thead>
                      <tr>
                        <th>Product type</th>
                        <th>Age class</th>
                        <th>Product location</th>
                        <th>Application volume</th>
                        <th>Average log volume</th>
                        <th>Average length</th>
                        <th>Average diameter</th>
                        <th>Species</th>
                        <th>End use</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{submissionValue(submissionSummary.productTypeCode)}</td>
                        <td>{submissionValue(submissionSummary.ageClass)}</td>
                        <td>{submissionValue(submissionSummary.productLocation)}</td>
                        <td>{formatSubmissionDecimal(submissionSummary.applicationVolume)}</td>
                        <td>{formatSubmissionDecimal(submissionSummary.averageLogVolume)}</td>
                        <td>{formatSubmissionDecimal(submissionSummary.averageLength)}</td>
                        <td>{formatSubmissionDecimal(submissionSummary.averageDiameter)}</td>
                        <td>
                          {submissionSummary.speciesCodes?.length
                            ? submissionSummary.speciesCodes.join(', ')
                            : '—'}
                        </td>
                        <td>{submissionValue(submissionSummary.endUseCode)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SubmissionReviewSection>
            )}

            {validationIssues.length > 0 && (
              <SubmissionReviewSection
                title={`Validation issues (${validationIssues.length})`}
                icon={<WarningAltFilled size={20} aria-hidden="true" />}
              >
                <div className="admin-upload-submission-review__table-wrap">
                  <table
                    className="admin-upload-submission-review__table admin-upload-submission-review__table--issues"
                    aria-label={`Validation issues for ${item.file.name}`}
                  >
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationIssues.map((issue) => (
                        <tr key={issue.key}>
                          <td>{issue.issue}</td>
                          <td>{issue.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SubmissionReviewSection>
            )}
          </article>
        )
      })}
    </div>
  )
}

const renderFieldValueTable = (
  title: string,
  rows: ReviewTableRow[],
  emptyValue = 'Not provided',
) => (
  <div className="admin-upload-review__table-group">
    <h4>{title}</h4>
    <div className="admin-upload-review-table">
      <table
        className="cds--data-table admin-upload-review-field-table"
        aria-label={`${title} review`}
      >
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value || emptyValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const reviewEmptyResultMessage = (
  item: UploadQueueItem,
  itemNoun: string,
  hasMetadata: boolean,
  summary: string,
): string => {
  if (itemNoun === 'submission' && item.status === 'complete') {
    return 'Application submission submitted successfully.'
  }

  return hasMetadata ? 'No validation issues returned.' : summary
}

function UploadQueueReviewAccordion({
  items,
  targetSummary,
  idPrefix = 'adminUploadReview',
  itemNoun = 'file',
  showHeader = true,
}: UploadQueueReviewAccordionProps) {
  if (items.length === 0) {
    return null
  }

  if (itemNoun === 'submission') {
    return <SubmissionReview items={items} targetSummary={targetSummary} />
  }

  const titleId = `${idPrefix}Title`
  const itemNounTitle = `${itemNoun.charAt(0).toUpperCase()}${itemNoun.slice(1)}`
  const itemNounPlural = `${itemNoun}s`
  const typeLabel = itemNoun === 'submission' ? 'Submission type' : 'Upload type'

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
                              <th>Product type</th>
                              <th>Age class</th>
                              <th>Product location</th>
                              <th>Application volume</th>
                              <th>Average log volume</th>
                              <th>Average length</th>
                              <th>Average diameter</th>
                              <th>Species</th>
                              <th>End use</th>
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
                                  : 'Not provided'}
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
