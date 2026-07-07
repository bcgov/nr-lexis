import { useMemo, useState, type ReactNode } from 'react'
import { Button, TextInput } from '@carbon/react'
import { ArrowRight, Upload } from '@carbon/icons-react'
import UploadQueueReviewAccordion from './UploadQueueReviewAccordion'
import UploadWorkflowProgress from './UploadWorkflowProgress'
import {
  formatUploadFileSize,
  formatUploadQueuedAt,
  getFileExtension,
  uploadQueueStatusLabel,
} from './uploadQueueHelpers'
import type { UploadQueueItem } from './uploadQueueTypes'

export type UploadQueuePreviewProps = {
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
  pendingMessage?: string
  canRemoveItem?: (item: UploadQueueItem) => boolean
  renderCompleteAction?: (item: UploadQueueItem) => ReactNode
  showWorkflowProgress?: boolean
  currentStepId?: 'upload' | 'review'
  validationTitle?: string
  reviewLabel?: string
  actionsPlacement?: 'header' | 'footer'
  onReview?: () => void
  onBack?: () => void
  backLabel?: string
  showQueueManagementActions?: boolean
}

const formatFileType = (file: File): string => {
  const extension = getFileExtension(file.name)
  if (extension) {
    return extension.slice(1).toUpperCase()
  }
  return file.type || 'Unknown type'
}

const UPLOAD_REVIEW_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]

function UploadQueuePreview({
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
  submitLabel = 'Submit upload',
  submittingLabel = 'Submitting upload...',
  removeLabel = 'Remove',
  pendingMessage = 'Not submitted yet.',
  canRemoveItem = () => true,
  renderCompleteAction,
  showWorkflowProgress = true,
  currentStepId,
  validationTitle = 'Validation status',
  reviewLabel = 'Review upload',
  actionsPlacement = 'header',
  onReview,
  onBack,
  backLabel = 'Back',
  showQueueManagementActions = false,
}: UploadQueuePreviewProps) {
  const [queueFilter, setQueueFilter] = useState('')
  const [reviewQueueIdentity, setReviewQueueIdentity] = useState<string | null>(null)
  const invalidCount = items.filter((item) => item.status === 'invalid').length
  const queueIdentity = useMemo(() => items.map((item) => item.id).join('|'), [items])
  const isReviewStep =
    currentStepId !== undefined
      ? currentStepId === 'review'
      : !showWorkflowProgress || (items.length > 0 && reviewQueueIdentity === queueIdentity)
  const effectiveQueueFilter = isReviewStep ? queueFilter : ''

  const filteredItems = useMemo(() => {
    const query = effectiveQueueFilter.trim().toLowerCase()
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
  }, [effectiveQueueFilter, items, targetSummary])

  const clearQueue = (): void => {
    setQueueFilter('')
    setReviewQueueIdentity(null)
    onClear()
  }

  const resetUpload = (): void => {
    setQueueFilter('')
    setReviewQueueIdentity(null)
    onReset()
  }

  const enterReviewStep = (): void => {
    setQueueFilter('')
    onReview?.()
    setReviewQueueIdentity(queueIdentity)
  }

  const previewTitleId = `${idPrefix}PreviewTitle`
  const displayedPreviewTitle = isReviewStep ? previewTitle : validationTitle
  const queueFilterId = `${idPrefix}QueueFilter`
  const itemNounPlural = `${itemNoun}s`
  const isSubmissionQueue = itemNoun === 'submission'
  const workflowColumnLabel = isSubmissionQueue ? 'Submission type' : 'Upload type'
  const fileColumnLabel = isSubmissionQueue ? 'Submission file' : 'File'
  const currentWorkflowStep = items.length > 0 && isReviewStep ? 'review' : 'upload'
  const completedWorkflowSteps = items.length > 0 && isReviewStep ? ['upload'] : []
  const selectedItemLabel = `${items.length} selected ${
    items.length === 1 ? itemNoun : itemNounPlural
  }`
  const canReviewUpload = canSubmit && items.length > 0 && invalidCount === 0
  const displayedItems = isReviewStep ? filteredItems : items
  const uploadStepDescription =
    invalidCount > 0
      ? `${selectedItemLabel} ${items.length === 1 ? 'needs' : 'need'} attention before review.`
      : `${selectedItemLabel} ready. Continue to review before submitting.`
  const actionControls = (
    <>
      {showQueueManagementActions && items.length > 0 && (
        <Button kind="ghost" size="md" onClick={clearQueue} disabled={isSubmitting}>
          Clear
        </Button>
      )}
      {isReviewStep ? (
        <Button
          kind="primary"
          size="md"
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
          renderIcon={ArrowRight}
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      ) : (
        <Button
          kind="primary"
          size="md"
          onClick={enterReviewStep}
          disabled={isSubmitting || !canReviewUpload}
          renderIcon={ArrowRight}
        >
          {reviewLabel}
        </Button>
      )}
      {showQueueManagementActions && (
        <Button kind="ghost" size="md" onClick={resetUpload} disabled={isSubmitting}>
          Reset
        </Button>
      )}
    </>
  )

  return (
    <section className="admin-upload-panel" aria-labelledby={previewTitleId}>
      {showWorkflowProgress && (
        <UploadWorkflowProgress
          steps={UPLOAD_REVIEW_STEPS}
          currentStepId={currentWorkflowStep}
          completedStepIds={completedWorkflowSteps}
          ariaLabel="Upload queue workflow progress"
        />
      )}

      <div className="admin-upload-panel__header">
        <div>
          <h2 id={previewTitleId}>{displayedPreviewTitle}</h2>
          <p>
            {items.length === 0
              ? emptyDescription
              : isReviewStep
                ? `Review ${selectedItemLabel} before submitting.`
                : uploadStepDescription}
          </p>
        </div>
        <div className="admin-upload-preview-actions">
          {actionsPlacement === 'header' && actionControls}
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
          {isReviewStep && (
            <div className="admin-upload-preview-filter">
              <TextInput
                id={queueFilterId}
                labelText={`Filter queued ${itemNounPlural}`}
                placeholder={`Filter by ${workflowColumnLabel.toLowerCase()}, file name, target, status, or message`}
                value={queueFilter}
                onChange={(event) => setQueueFilter(event.target.value)}
              />
            </div>
          )}
          <table className="cds--data-table admin-upload-queue__table">
            <thead>
              <tr>
                <th>{workflowColumnLabel}</th>
                <th>{fileColumnLabel}</th>
                <th>Target</th>
                <th>Status</th>
                <th>Message</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>No queued {itemNounPlural} match the current filter.</td>
                </tr>
              ) : (
                displayedItems.map((item) => (
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
                      <span
                        className={`admin-upload-status-text admin-upload-status-text--${item.status}`}
                      >
                        {uploadQueueStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>{item.message || pendingMessage}</td>
                    <td>
                      <div className="admin-upload-row-actions">
                        {renderCompleteAction?.(item)}
                        {canRemoveItem(item) && (
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => onRemove(item.id)}
                            disabled={isSubmitting && item.status === 'uploading'}
                          >
                            {removeLabel}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {isReviewStep && (
            <>
              <div className="admin-upload-preview-footer">
                <span>
                  Showing {filteredItems.length} of {items.length}{' '}
                  {items.length === 1 ? itemNoun : itemNounPlural}
                </span>
              </div>
              <UploadQueueReviewAccordion
                items={filteredItems}
                targetSummary={targetSummary}
                idPrefix={`${idPrefix}Review`}
                itemNoun={itemNoun}
              />
            </>
          )}
        </>
      )}
      {actionsPlacement === 'footer' && (
        <div className="admin-upload-fspts-button-row admin-upload-fspts-button-row--split admin-upload-preview-footer-actions">
          <div>
            {isReviewStep && onBack && (
              <Button kind="ghost" size="md" onClick={onBack} disabled={isSubmitting}>
                {backLabel}
              </Button>
            )}
          </div>
          <div className="admin-upload-preview-footer-actions__right">{actionControls}</div>
        </div>
      )}
    </section>
  )
}

export default UploadQueuePreview
