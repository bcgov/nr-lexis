import { type FC } from 'react'
import { Tag } from '@carbon/react'
import type { UploadQueueItem, UploadQueueStatus } from './uploadQueueTypes'

type UploadQueueReviewAccordionProps = {
  items: UploadQueueItem[]
  targetSummary: string
}

const statusTagType = (status: UploadQueueStatus): 'gray' | 'blue' | 'green' | 'red' => {
  if (status === 'invalid' || status === 'failed') {
    return 'red'
  }
  if (status === 'uploading') {
    return 'blue'
  }
  if (status === 'complete') {
    return 'green'
  }
  return 'gray'
}

const statusLabel = (status: UploadQueueStatus): string => {
  if (status === 'invalid') {
    return 'Invalid'
  }
  if (status === 'uploading') {
    return 'Uploading'
  }
  if (status === 'complete') {
    return 'Complete'
  }
  if (status === 'failed') {
    return 'Failed'
  }
  return 'Queued'
}

const formatScaleRows = (scaleRows: number): string =>
  `${scaleRows} scale row${scaleRows === 1 ? '' : 's'}`

const asList = (value: string[] | undefined): string[] => value?.filter(Boolean) ?? []

const UploadQueueReviewAccordion: FC<UploadQueueReviewAccordionProps> = ({
  items,
  targetSummary,
}) => {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="admin-upload-review" aria-labelledby="admin-upload-review-title">
      <div className="admin-upload-review__header">
        <h3 id="admin-upload-review-title">File Review</h3>
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
            typeof details?.scaleRows === 'number'
          const summary = details?.summary || item.message || 'Waiting for upload.'
          const target = item.targetSummary ?? targetSummary

          return (
            <details
              key={item.id}
              className={`admin-upload-review__item admin-upload-review__item--${item.status}`}
              open={
                item.status === 'complete' || item.status === 'failed' || item.status === 'invalid'
              }
            >
              <summary className="admin-upload-review__summary">
                <span className="admin-upload-review__file-name">{item.file.name}</span>
                <Tag type={statusTagType(item.status)}>{statusLabel(item.status)}</Tag>
                <span className="admin-upload-review__summary-text">{summary}</span>
              </summary>

              <div className="admin-upload-review__content">
                <dl className="admin-upload-review__meta">
                  <div>
                    <dt>Upload Type</dt>
                    <dd>{item.workflowLabel}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{target}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{statusLabel(item.status)}</dd>
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
                  {typeof details?.scaleRows === 'number' && (
                    <div>
                      <dt>Scale Rows</dt>
                      <dd>{formatScaleRows(details.scaleRows)}</dd>
                    </div>
                  )}
                </dl>

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

                {item.status === 'complete' && errors.length === 0 && warnings.length === 0 && (
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
