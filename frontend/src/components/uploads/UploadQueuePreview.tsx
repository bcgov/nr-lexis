import { useMemo, useState, type FC, type ReactNode } from 'react'
import { Button, Tag, TextInput } from '@carbon/react'
import { Upload } from '@carbon/icons-react'
import UploadQueueReviewAccordion from './UploadQueueReviewAccordion'
import {
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
  renderCompleteAction?: (item: UploadQueueItem) => ReactNode
}

const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const formatFileType = (file: File): string => {
  const extension = getFileExtension(file.name)
  if (extension) {
    return extension.slice(1).toUpperCase()
  }
  return file.type || 'Unknown type'
}

const formatQueuedAt = (timestamp: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
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
  renderCompleteAction,
}) => {
  const [queueFilter, setQueueFilter] = useState('')
  const readyCount = items.filter((item) => item.status === 'queued').length
  const invalidCount = items.filter((item) => item.status === 'invalid').length
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

  return (
    <section className="admin-upload-panel" aria-labelledby={previewTitleId}>
      <div className="admin-upload-panel__header">
        <div>
          <h2 id={previewTitleId}>Data Preview</h2>
          <p>
            {items.length === 0
              ? 'Upload files to view them before submitting.'
              : `Review ${items.length} selected file${items.length === 1 ? '' : 's'} before submitting.`}
          </p>
        </div>
        <div className="admin-upload-preview-actions">
          {items.length > 0 && (
            <div className="admin-upload-queue-summary" aria-label="Upload preview summary">
              <Tag type="gray">Ready {readyCount}</Tag>
              <Tag type="red">Invalid {invalidCount}</Tag>
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
            {isSubmitting ? 'Submitting...' : 'Submit Upload'}
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
          <p>No data uploaded yet</p>
          <p>Upload files to see them here.</p>
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
                          {formatFileType(item.file)} | {formatFileSize(item.file.size)} | Added{' '}
                          {formatQueuedAt(item.queuedAt)}
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
                          Remove
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
              Showing {filteredItems.length} of {items.length} file{items.length === 1 ? '' : 's'}
            </span>
            <span>
              Ready {readyCount} | Invalid {invalidCount} | Complete {completeCount} | Failed{' '}
              {failedCount}
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
