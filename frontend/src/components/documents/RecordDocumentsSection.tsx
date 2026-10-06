import { Add, Download, Launch, TrashCan } from '@carbon/icons-react'
import { AddDocument } from '@carbon/pictograms-react'
import {
  Button,
  InlineLoading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActionResultNotification } from '@/components/ActionResultNotification'
import ConfirmationModal from '@/components/ConfirmationModal'
import EmptyState from '@/components/EmptyState'
import TableFrame from '@/components/TableFrame'
import DetailDocumentUploadPanel from '@/components/uploads/DetailDocumentUploadPanel'
import {
  DOCUMENTS_EMPTY_DESCRIPTION,
  formatDocumentSource,
  savedDocumentsTitle,
  type DocumentRowBase,
} from '@/service/document-service-utils'
import type { ActionResult } from '@/utils/action-result'
import { displayTableValue } from '@/utils/text'

import './RecordDocumentsSection.scss'

export type DocumentsRecordType = 'application' | 'exemption' | 'permit'

/** Figma's in-tab feedback after documents are saved. */
export const documentsSavedResult = (savedCount: number): ActionResult => ({
  kind: 'success',
  title: savedDocumentsTitle(savedCount),
  message: '',
})

/** Figma's in-tab feedback after a document is deleted. */
export const DOCUMENT_DELETED_RESULT: ActionResult = {
  kind: 'success',
  title: 'Document deleted.',
  message: '',
}

type DocumentsUploadConfig = {
  /** The user can add documents to this record now. */
  enabled: boolean
  open: boolean
  /** Changes whenever the host discards a draft, so the panel starts empty. */
  resetKey: number
  targetNumber: string
  inputId: string
  /** The page region the slide-in panel pushes aside. */
  contentSelector: string
  busy?: boolean
  onOpen: () => void
  onClose: () => void
  onDirtyChange: (isDirty: boolean) => void
  onBusyChange: (isBusy: boolean) => void
  onUploadComplete: () => Promise<void> | void
  onSaved: (savedCount: number) => void
}

type RecordDocumentsSectionProps<Row extends DocumentRowBase> = {
  id: string
  recordType: DocumentsRecordType
  rows: Row[]
  loading?: boolean
  errorMessage?: string
  /** The latest Documents result; the host keeps other results at page level. */
  result?: ActionResult | null
  onDismissResult?: () => void
  /** Context shown above the list, such as why uploads are unavailable. */
  notices?: ReactNode
  upload: DocumentsUploadConfig
  openDisabled?: boolean
  onOpen: (row: Row, preview: boolean) => void
  /** The user can delete documents from this record at all. */
  canDelete: boolean
  /** Whether one row can be deleted here, beyond its own deletable flag. */
  canDeleteRow?: (row: Row) => boolean
  /** Anything else the deletion removes, said in the confirmation. */
  deleteConsequence?: (row: Row) => string | undefined
  removingId: string | null
  onDeleteStart?: () => void
  /** Rejects to keep the confirmation open with the failure. */
  onDelete: (row: Row) => Promise<void>
}

const RECORD_TYPE_LABELS: Record<DocumentsRecordType, string> = {
  application: 'Application',
  exemption: 'Exemption',
  permit: 'Permit',
}

const documentTypeLabel = (row: DocumentRowBase): string =>
  row.source?.trim() ? formatDocumentSource(row.source) : displayTableValue(row.type)

/**
 * The Documents tab shared by application, exemption and permit records: the list or empty
 * state on the tab background, the Add documents side panel, in-tab results and deletion.
 */
// INTENTIONAL_LEGACY_DIVERGENCE(DETAIL_DOCUMENTS_LAYOUT): one Figma Documents tab for every record.
const RecordDocumentsSection = <Row extends DocumentRowBase>({
  id,
  recordType,
  rows,
  loading = false,
  errorMessage = '',
  result,
  onDismissResult,
  notices,
  upload,
  openDisabled = false,
  onOpen,
  canDelete,
  canDeleteRow,
  deleteConsequence,
  removingId,
  onDeleteStart,
  onDelete,
}: RecordDocumentsSectionProps<Row>) => {
  const launcherRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef(false)
  const [pendingDeletion, setPendingDeletion] = useState<Row | null>(null)

  // The host unmounts the side panel when it closes, so return focus to Add documents here once
  // the save that closed it has finished.
  useEffect(() => {
    if (upload.open) {
      returnFocusRef.current = true
      return
    }
    if (upload.busy || !returnFocusRef.current) return
    returnFocusRef.current = false
    const frame = requestAnimationFrame(() => launcherRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [upload.busy, upload.open])
  const recordLabel = RECORD_TYPE_LABELS[recordType]
  const empty = !loading && !errorMessage && rows.length === 0
  const pendingDeletionConsequence = pendingDeletion
    ? deleteConsequence?.(pendingDeletion)
    : undefined
  const addButton = upload.enabled ? (
    <Button
      kind="tertiary"
      size="md"
      className="detail-documents-add-button"
      renderIcon={Add}
      ref={launcherRef}
      disabled={upload.busy}
      onClick={upload.onOpen}
    >
      Add documents
    </Button>
  ) : null

  return (
    <section
      id={id}
      className="application-detail-section detail-documents-section"
      aria-label="Documents"
    >
      {result && <ActionResultNotification result={result} onClose={onDismissResult} />}
      {notices}
      {!empty && addButton && (
        <div className="detail-section-card__header detail-section-card__header--actions-only">
          {addButton}
        </div>
      )}
      {upload.enabled && upload.open && (
        <DetailDocumentUploadPanel
          key={`${id}-upload-${upload.targetNumber}-${upload.resetKey}`}
          workflowType={recordType}
          targetNumber={upload.targetNumber}
          inputId={upload.inputId}
          disabled={!upload.targetNumber}
          presentation="side-panel"
          drawer={{
            contentSelector: upload.contentSelector,
            fallbackFocusSelector: `#${id} button`,
            launcherRef,
          }}
          initiallyOpen
          onClose={upload.onClose}
          onDirtyChange={upload.onDirtyChange}
          onBusyChange={upload.onBusyChange}
          onUploadComplete={upload.onUploadComplete}
          onUploadSuccess={(_, savedCount) => upload.onSaved(savedCount)}
        />
      )}
      {loading ? (
        <InlineLoading description={`Loading ${recordType} documents…`} />
      ) : errorMessage ? (
        <EmptyState
          title="Documents unavailable"
          description={errorMessage}
          headingLevel={2}
          role="alert"
        />
      ) : rows.length > 0 ? (
        <TableFrame ariaLabel={`${recordLabel} document rows`}>
          <Table size="md" useZebraStyles className="detail-documents-table">
            <TableHead>
              <TableRow>
                <TableHeader>File name</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                // A document added on another record, or one this user can't delete, has no
                // Delete action here rather than a disabled one.
                const deletable =
                  canDelete && row.deletable !== false && (canDeleteRow?.(row) ?? true)
                const removing = removingId === row.id
                return (
                  <TableRow key={row.id}>
                    <TableCell className="detail-documents-table__text">{row.name}</TableCell>
                    <TableCell className="detail-documents-table__text">
                      {displayTableValue(row.description)}
                    </TableCell>
                    <TableCell>{documentTypeLabel(row)}</TableCell>
                    <TableCell>
                      <div className="legacy-search-actions detail-documents-table__actions">
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Launch}
                          disabled={openDisabled}
                          title="Open supported files in a new tab; other formats download."
                          onClick={() => onOpen(row, true)}
                        >
                          Open
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Download}
                          disabled={openDisabled}
                          onClick={() => onOpen(row, false)}
                        >
                          Download
                        </Button>
                        {deletable && (
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            disabled={removing}
                            onClick={() => {
                              onDeleteStart?.()
                              setPendingDeletion(row)
                            }}
                          >
                            {removing ? 'Deleting…' : 'Delete'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableFrame>
      ) : (
        <EmptyState
          title={`No documents for this ${recordType}`}
          description={DOCUMENTS_EMPTY_DESCRIPTION}
          icon={<AddDocument width={48} height={48} />}
          action={addButton}
          headingLevel={2}
        />
      )}
      {pendingDeletion && (
        <ConfirmationModal
          open
          danger
          title="Are you sure you want to delete this document?"
          description={
            <>
              <strong>{pendingDeletion.name || 'This document'}</strong> will be deleted.
              {pendingDeletionConsequence ? ` ${pendingDeletionConsequence}` : ''} This action
              cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle="Failed to delete document"
          onClose={() => setPendingDeletion(null)}
          onConfirm={() => onDelete(pendingDeletion)}
        />
      )}
    </section>
  )
}

export default RecordDocumentsSection
