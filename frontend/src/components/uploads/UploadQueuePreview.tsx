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
  showReviewQueueTable?: boolean
  showReviewAccordionHeader?: boolean
  canReview?: boolean
  reviewItems?: UploadQueueItem[]
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
  showReviewQueueTable = true,
  showReviewAccordionHeader = true,
  canReview,
  reviewItems,
}: UploadQueuePreviewProps) {
  const [queueFilter, setQueueFilter] = useState('')
  const [reviewQueueIdentity, setReviewQueueIdentity] = useState<string | null>(null)
  const blockedCount = items.filter(
    (item) => item.status === 'invalid' || item.status === 'failed',
  ).length
  const pendingValidationCount = items.filter(
    (item) => item.status === 'queued' || item.status === 'validating',
  ).length
  const queueIdentity = useMemo(() => items.map((item) => item.id).join('|'), [items])
  const isReviewStep =
    currentStepId !== undefined
      ? currentStepId === 'review'
      : !showWorkflowProgress || (items.length > 0 && reviewQueueIdentity === queueIdentity)
  const effectiveQueueFilter = isReviewStep ? queueFilter : ''

  const effectiveItems = isReviewStep && reviewItems ? reviewItems : items

  const filteredItems = useMemo(() => {
    const query = effectiveQueueFilter.trim().toLowerCase()
    if (!query) {
      return effectiveItems
    }

    return effectiveItems.filter((item) =>
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
  }, [effectiveItems, effectiveQueueFilter, targetSummary])

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
  const reviewSelectedItemLabel = `${effectiveItems.length} selected ${
    effectiveItems.length === 1 ? itemNoun : itemNounPlural
  }`
  const canReviewUpload = canReview ?? (canSubmit && items.length > 0 && blockedCount === 0)
  const reviewableItemCount =
    reviewItems?.length ??
    items.filter(
      (item) =>
        item.status === 'validated' ||
        item.status === 'uploading' ||
        item.status === 'complete' ||
        item.submitted,
    ).length
  const displayedItems = isReviewStep ? filteredItems : items
  const uploadStepDescription =
    blockedCount > 0 && canReviewUpload
      ? `${blockedCount} selected ${blockedCount === 1 ? itemNoun : itemNounPlural} ${
          blockedCount === 1 ? 'needs' : 'need'
        } attention. Review ${reviewableItemCount} validated ${
          reviewableItemCount === 1 ? itemNoun : itemNounPlural
        } before submitting.`
      : blockedCount > 0
        ? `${selectedItemLabel} ${items.length === 1 ? 'needs' : 'need'} attention before review.`
        : pendingValidationCount > 0
          ? `${selectedItemLabel} validating. Continue after validation completes.`
          : `${selectedItemLabel} validated. Continue to review before submitting.`
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
                ? `Review ${reviewSelectedItemLabel} before submitting.`
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
          {isReviewStep && showReviewQueueTable && (
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
          {showReviewQueueTable && (
            <div className="admin-upload-fspts-table-wrap">
              <table className="admin-upload-queue__table admin-upload-queue__table--generic">
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
            </div>
          )}
          {isReviewStep && (
            <>
              {showReviewQueueTable && (
                <div className="admin-upload-preview-footer">
                  <span>
                    Showing {filteredItems.length} of {effectiveItems.length}{' '}
                    {effectiveItems.length === 1 ? itemNoun : itemNounPlural}
                  </span>
                </div>
              )}
              <UploadQueueReviewAccordion
                items={filteredItems}
                targetSummary={targetSummary}
                idPrefix={`${idPrefix}Review`}
                itemNoun={itemNoun}
                showHeader={showReviewAccordionHeader}
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
