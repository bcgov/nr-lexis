import { useMemo, useState, type FC, type ReactNode } from 'react'
import { Button, Tag, TextInput } from '@carbon/react'
import { Upload } from '@carbon/icons-react'
import UploadQueueReviewAccordion from './UploadQueueReviewAccordion'
import {
  formatUploadFileSize,
  formatUploadQueuedAt,
  getFileExtension,
  uploadQueueStatusLabel,
  uploadQueueStatusTagType,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

type UploadQueuePreviewProps = {
  items: UploadQueueItem[]
  targetSummary: string
  canSubmit: boolean
  isSubmitting: boolean
  onSubmit: () => void
  onReset: () => void
  onClear: () => void
  onRemove: (id: string) => void
  idPrefix?: string
  previewTitle?: string
  emptyDescription?: string
  emptyStateTitle?: string
  emptyStateDescription?: string
  itemNoun?: string
  submitLabel?: string
  submittingLabel?: string
  removeLabel?: string
  renderCompleteAction?: (item: UploadQueueItem) => ReactNode
}

const formatFileType = (file: File): string => {
  const extension = getFileExtension(file.name)
  if (extension) {
    return extension.slice(1).toUpperCase()
  }
  return file.type || 'Unknown type'
}

const UploadQueuePreview: FC<UploadQueuePreviewProps> = ({
  items,
  targetSummary,
  canSubmit,
  isSubmitting,
  onSubmit,
  onReset,
  onClear,
  onRemove,
  idPrefix = 'adminUpload',
  previewTitle = 'Data preview',
  emptyDescription = 'Upload files to view them before submitting.',
  emptyStateTitle = 'No data uploaded yet',
  emptyStateDescription = 'Upload files to see them here.',
  itemNoun = 'file',
  submitLabel = 'Submit Upload',
  submittingLabel = 'Submitting...',
  removeLabel = 'Remove',
  renderCompleteAction,
}) => {
  const [queueFilter, setQueueFilter] = useState('')
  const readyCount = items.filter((item) => item.status === 'queued').length
  const invalidCount = items.filter((item) => item.status === 'invalid').length
  const validatedCount = items.filter((item) => item.status === 'validated').length
  const completeCount = items.filter((item) => item.status === 'complete').length
  const failedCount = items.filter((item) => item.status === 'failed').length

  const filteredItems = useMemo(() => {
    const query = queueFilter.trim().toLowerCase()
    if (!query) {
      return items
    }

    return items.filter((item) =>
      [
        item.workflowLabel,
        item.file.name,
        item.targetSummary ?? targetSummary,
        uploadQueueStatusLabel(item.status),
        item.message,
        item.details?.summary,
        item.details?.errors?.join(' '),
        item.details?.warnings?.join(' '),
        item.details?.applicationNumber?.toString(),
        item.details?.packageNumber,
        item.details?.userReference,
        item.details?.scaleRows?.toString(),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [items, queueFilter, targetSummary])

  const clearQueue = (): void => {
    setQueueFilter('')
    onClear()
  }

  const resetUpload = (): void => {
    setQueueFilter('')
    onReset()
  }
  const previewTitleId = `${idPrefix}PreviewTitle`
  const queueFilterId = `${idPrefix}QueueFilter`
  const itemNounPlural = `${itemNoun}s`
  const selectedItemLabel = `${items.length} selected ${
    items.length === 1 ? itemNoun : itemNounPlural
  }`

  return (
    <section className="admin-upload-panel" aria-labelledby={previewTitleId}>
      <div className="admin-upload-panel__header">
        <div>
          <h2 id={previewTitleId}>{previewTitle}</h2>
          <p>
            {items.length === 0
              ? emptyDescription
              : `Review ${selectedItemLabel} before submitting.`}
          </p>
        </div>
        <div className="admin-upload-preview-actions">
          {items.length > 0 && (
            <div className="admin-upload-queue-summary" aria-label="Upload preview summary">
              <Tag type="gray">Ready {readyCount}</Tag>
              <Tag type="red">Invalid {invalidCount}</Tag>
              <Tag type="green">Validated {validatedCount}</Tag>
              <Tag type="green">Complete {completeCount}</Tag>
              <Tag type="red">Failed {failedCount}</Tag>
            </div>
          )}
          {items.length > 0 && (
            <Button kind="ghost" size="sm" onClick={clearQueue} disabled={isSubmitting}>
              Clear
            </Button>
          )}
          <Button kind="primary" size="sm" onClick={onSubmit} disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? submittingLabel : submitLabel}
          </Button>
          <Button kind="ghost" size="sm" onClick={resetUpload} disabled={isSubmitting}>
            Reset
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="admin-upload-empty-state">
          <div className="admin-upload-empty-state__icon" aria-hidden="true">
            <Upload size={32} />
          </div>
          <p>{emptyStateTitle}</p>
          <p>{emptyStateDescription}</p>
        </div>
      ) : (
        <>
          <div className="admin-upload-preview-filter">
            <TextInput
              id={queueFilterId}
              labelText="Filter queued files"
              placeholder="Filter by upload type, file name, target, status, or message"
              value={queueFilter}
              onChange={(event) => setQueueFilter(event.target.value)}
            />
          </div>
          <table className="cds--data-table admin-upload-queue__table">
            <thead>
              <tr>
                <th>Upload Type</th>
                <th>File</th>
                <th>Target</th>
                <th>Status</th>
                <th>Message</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>No queued files match the current filter.</td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.workflowLabel}</td>
                    <td>
                      <div className="admin-upload-file-cell">
                        <span>{item.file.name}</span>
                        <span>
                          {formatFileType(item.file)} | {formatUploadFileSize(item.file.size)} |
                          Added {formatUploadQueuedAt(item.queuedAt)}
                        </span>
                      </div>
                    </td>
                    <td>{item.targetSummary ?? targetSummary}</td>
                    <td>
                      <Tag type={uploadQueueStatusTagType(item.status)}>
                        {uploadQueueStatusLabel(item.status)}
                      </Tag>
                    </td>
                    <td>{item.message || 'Not submitted yet.'}</td>
                    <td>
                      <div className="admin-upload-row-actions">
                        {renderCompleteAction?.(item)}
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => onRemove(item.id)}
                          disabled={isSubmitting && item.status === 'uploading'}
                        >
                          {removeLabel}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="admin-upload-preview-footer">
            <span>
              Showing {filteredItems.length} of {items.length}{' '}
              {items.length === 1 ? itemNoun : itemNounPlural}
            </span>
            <span>
              Ready {readyCount} | Invalid {invalidCount} | Validated {validatedCount} | Complete{' '}
              {completeCount} | Failed {failedCount}
            </span>
          </div>
          <UploadQueueReviewAccordion
            items={filteredItems}
            targetSummary={targetSummary}
            idPrefix={`${idPrefix}Review`}
          />
        </>
      )}
    </section>
  )
}

export default UploadQueuePreview
