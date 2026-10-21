import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Column,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import { ArrowRight, Download } from '@carbon/icons-react'
import { useLocation } from 'react-router-dom'
import { AppNotification } from '@/components/AppNotification'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import UnsavedChangesGuard from '@/components/UnsavedChangesGuard'
import MultiFileDropZone from '@/components/uploads/MultiFileDropZone'
import UploadWorkflowProgress from '@/components/uploads/UploadWorkflowProgress'
import {
  extractUploadErrorDetails,
  uploadQueueFileKey,
  validateUploadFileSize,
} from '@/components/uploads/uploadQueueHelpers'
import { useAuth } from '@/context/auth/useAuth'
import {
  submitAdminUpload,
  validateApplicationSubmissionUpload,
  type AdminUploadResult,
} from '@/service/admin-upload-service'
import { getResponseStatus } from '@/utils/http-error'
import ApplicationUploadFileList from './ApplicationUploadFileList'
import ApplicationUploadResult from './ApplicationUploadResult'
import ApplicationUploadReviewTable from './ApplicationUploadReviewTable'
import ApplicationUploadTableCard from './ApplicationUploadTableCard'
import { reasonContent } from './reasonContent'
import {
  applicationCountLabel,
  buildValidationIssuesCsv,
  validationIssues,
  validationResultNotice,
  type ApplicationCreateOutcome,
  type ApplicationUploadFile,
} from './applicationUploadFiles'
import { useSubmissionSummaryLabels } from './useSubmissionSummaryLabels'
import './ApplicationUpload.scss'

type ApplicationUploadStep = 'upload' | 'review' | 'result'

const PAGE_TITLE = 'Upload applications'
const UPLOAD_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]
const UPLOAD_ACCEPT =
  '.xml,.zip,.geojson,.json,application/xml,text/xml,application/zip,application/json,application/geo+json'
const UPLOAD_FIELD_HELPER =
  'Accepted file types: XML, ZIP, GeoJSON, and JSON. Maximum file size: 20 MB per file.\nA ZIP file can contain only one application.'
const NO_FILES_ERROR = 'Add at least one file to review.'
const NO_VALID_FILES_ERROR =
  'No files are ready for review. Correct the failed files and add them again.'
const FILE_EMPTY_MESSAGE = 'The file is empty.'
const FILE_TOO_LARGE_MESSAGE = 'The file must be 20 MB or smaller.'
const VALIDATION_FAILURE_MESSAGE =
  "We couldn't check this file. Try again later. If it keeps happening, report an issue."
const SAVE_FAILURE_MESSAGE =
  "We couldn't save this application. Try again later. If it keeps happening, report an issue."

const localFileError = (file: File): string => {
  if (!file.name.trim()) {
    return 'File name is required.'
  }
  if (file.size === 0) {
    return FILE_EMPTY_MESSAGE
  }
  return validateUploadFileSize(file) ? FILE_TOO_LARGE_MESSAGE : ''
}

// A server or database failure shows the generic message, never what its response carries.
const failureReasons = (error: unknown, fallbackMessage: string): string[] => {
  const status = getResponseStatus(error) ?? 0
  if (status === 413) {
    return [FILE_TOO_LARGE_MESSAGE]
  }
  if (status >= 500) {
    return [fallbackMessage]
  }
  const { details } = extractUploadErrorDetails(error, fallbackMessage)
  return details.errors?.length ? details.errors : [fallbackMessage]
}

const isValidationFailure = (result: AdminUploadResult): boolean => {
  const status = result.status?.trim().toLowerCase()
  if (status && status !== 'validated') {
    return true
  }
  return Array.isArray(result.errors) && result.errors.length > 0
}

const validateFile = async (
  file: File,
): Promise<Pick<ApplicationUploadFile, 'status' | 'errors' | 'summary'>> => {
  try {
    const result = await validateApplicationSubmissionUpload({ file })
    if (!isValidationFailure(result)) {
      return { status: 'validated', errors: [], summary: result.submissionSummary }
    }
    return {
      status: 'failed',
      errors: failureReasons({ response: { data: result } }, VALIDATION_FAILURE_MESSAGE),
    }
  } catch (error) {
    return { status: 'failed', errors: failureReasons(error, VALIDATION_FAILURE_MESSAGE) }
  }
}

const createApplication = async (
  item: ApplicationUploadFile,
): Promise<ApplicationCreateOutcome> => {
  const outcome = {
    id: item.id,
    fileName: item.file.name,
    packageNumber: item.summary?.packageNumber,
  }
  try {
    const result = await submitAdminUpload('applicationSubmission', { file: item.file })
    if (result.applicationNumber && !result.errors?.length) {
      return {
        ...outcome,
        applicationNumber: result.applicationNumber,
        packageNumber: result.packageNumber ?? outcome.packageNumber,
        errors: [],
      }
    }
    return {
      ...outcome,
      errors: failureReasons({ response: { data: result } }, SAVE_FAILURE_MESSAGE),
    }
  } catch (error) {
    return { ...outcome, errors: failureReasons(error, SAVE_FAILURE_MESSAGE) }
  }
}

/**
 * INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_UPLOAD_FLOW): files validate as they are added, are
 * reviewed together and are created in one step that ends on a result page.
 */
function ProvincialApplicationUploadPage() {
  const { canPerform } = useAuth()
  const location = useLocation()
  const [step, setStep] = useState<ApplicationUploadStep>('upload')
  const [files, setFiles] = useState<ApplicationUploadFile[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [reviewError, setReviewError] = useState('')
  const [announcedValidationCount, setAnnouncedValidationCount] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [outcomes, setOutcomes] = useState<ApplicationCreateOutcome[]>([])
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  // Files validate one at a time, in the order they were added.
  const validationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const hasUploadAccess = canPerform('uploadApplicationSubmission')
  const validatingCount = files.filter((item) => item.status === 'validating').length
  const validFiles = useMemo(() => files.filter((item) => item.status === 'validated'), [files])
  const validSummaries = useMemo(
    () => validFiles.flatMap((item) => (item.summary ? [item.summary] : [])),
    [validFiles],
  )
  const labelsFor = useSubmissionSummaryLabels(validSummaries, {
    applicationOptions: canPerform('/applicationSearch') || canPerform('/applicationDetails'),
    endUses: canPerform('/applicationDetails'),
  })
  const notice = validationResultNotice(files)
  const issues = validationIssues(files)

  const focusStepHeading = (): void => {
    requestAnimationFrame(() => stepHeadingRef.current?.focus())
  }

  const showReviewError = (message: string): void => {
    setReviewError(message)
    document.getElementById('uploadFile-drop-zone')?.focus()
  }

  const enqueueValidation = (item: ApplicationUploadFile): void => {
    validationQueueRef.current = validationQueueRef.current.then(async () => {
      if (unmountedRef.current) {
        return
      }
      const result = await validateFile(item.file)
      // A file removed or added again meanwhile keeps its own entry.
      setFiles((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, ...result } : currentItem,
        ),
      )
    })
  }

  const addFiles = (fileList: FileList | null): void => {
    if (!fileList || fileList.length === 0 || isCreating) {
      return
    }

    const addedAt = Date.now()
    // A file added again replaces the earlier one with the same name.
    const addedByName = new Map<string, ApplicationUploadFile>()
    Array.from(fileList).forEach((file, index) => {
      const error = localFileError(file)
      addedByName.set(uploadQueueFileKey(file), {
        id: `${addedAt}-${index}-${file.name}`,
        file,
        status: error ? 'failed' : 'validating',
        errors: error ? [error] : [],
      })
    })
    const added = Array.from(addedByName.values())
    const isKept = (item: ApplicationUploadFile) => !addedByName.has(uploadQueueFileKey(item.file))

    // A result can arrive before this render catches up, so the update starts from current files.
    setFiles((current) => [...current.filter(isKept), ...added])
    setAnnouncedValidationCount(
      [...files.filter(isKept), ...added].filter((item) => item.status === 'validating').length,
    )
    setReviewError('')
    setFileInputKey((current) => current + 1)
    added.filter((item) => item.status === 'validating').forEach(enqueueValidation)
  }

  const removeFile = (id: string): void => {
    setFiles((current) => current.filter((item) => item.id !== id))
    setReviewError('')
  }

  const startNewUpload = (): void => {
    setFiles([])
    setOutcomes([])
    setReviewError('')
    setFileInputKey((current) => current + 1)
    setStep('upload')
    focusStepHeading()
  }

  const onReview = (): void => {
    if (files.length === 0) {
      showReviewError(NO_FILES_ERROR)
      return
    }
    if (validFiles.length === 0) {
      showReviewError(NO_VALID_FILES_ERROR)
      return
    }
    setStep('review')
    focusStepHeading()
  }

  const onBack = (): void => {
    setStep('upload')
    focusStepHeading()
  }

  const onCreate = async (): Promise<void> => {
    setIsCreating(true)
    const results: ApplicationCreateOutcome[] = []
    for (const item of validFiles) {
      results.push(await createApplication(item))
    }
    if (unmountedRef.current) {
      return
    }
    setOutcomes(results)
    setIsCreating(false)
    setStep('result')
  }

  const unsavedChangesGuard = (
    <UnsavedChangesGuard
      isDirty={step !== 'result' && files.length > 0}
      isBusy={isCreating}
      onDiscard={() => setFiles([])}
      subject="the applications"
    />
  )

  if (step === 'result') {
    return (
      <Grid fullWidth className="default-grid admin-upload-fspts-page application-upload-page">
        <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content">
          <ApplicationUploadResult
            outcomes={outcomes}
            canOpenApplications={canPerform('/applicationDetails')}
            canSearchApplications={canPerform('/applicationSearch')}
            returnTo={{ label: PAGE_TITLE, to: `${location.pathname}${location.search}` }}
            onUploadMore={startNewUpload}
          />
        </Column>
        {unsavedChangesGuard}
      </Grid>
    )
  }

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page application-upload-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header">
        <PageHeader
          title={PAGE_TITLE}
          subtitle="Create one or more applications by uploading their LEXIS files."
          focusTitle="whenFocusLost"
          style={{ marginBlockEnd: '1.5rem' }}
        />
        <UploadWorkflowProgress
          steps={UPLOAD_STEPS}
          currentStepId={step}
          completedStepIds={step === 'review' ? ['upload'] : []}
          ariaLabel="Upload applications progress"
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content">
        <div className="admin-upload-workflow">
          {step === 'upload' ? (
            <>
              <div className="admin-upload-section-heading">
                <h2 ref={stepHeadingRef} tabIndex={-1}>
                  Upload
                </h2>
                <p>Each file creates one application. You can add several files at once.</p>
              </div>

              <div className="admin-upload-panel admin-upload-panel--application-submission">
                <MultiFileDropZone
                  title="Application files"
                  description={UPLOAD_FIELD_HELPER}
                  inputId="uploadFile"
                  inputKey={fileInputKey}
                  inputLabel="Application files"
                  required
                  accept={UPLOAD_ACCEPT}
                  invalidText={reviewError || undefined}
                  disabled={!hasUploadAccess || isCreating}
                  disabledDescription="Your session does not include the required upload permission."
                  renderAsPanel={false}
                  variant="fspts"
                  showMultipleFileGuidance={false}
                  onFilesSelected={addFiles}
                />

                {files.length > 0 && (
                  <ApplicationUploadFileList
                    files={files}
                    onRemove={removeFile}
                    emptyFocusTargetId="uploadFile-drop-zone"
                  />
                )}

                {notice && (
                  <div className="application-upload-notice">
                    <AppNotification
                      kind={notice.kind}
                      title={notice.title}
                      subtitle={notice.subtitle}
                      role={notice.kind === 'error' ? 'alert' : 'status'}
                    />
                  </div>
                )}

                {issues.length > 0 && (
                  <ApplicationUploadTableCard
                    title={`Validation issues (${issues.length})`}
                    headingLevel={3}
                    action={
                      <a
                        className="admin-upload-validation-table-download"
                        href={buildValidationIssuesCsv(issues)}
                        download="lexis-validation-issues.csv"
                      >
                        Download issues (.csv)
                        <Download size={16} aria-hidden="true" />
                      </a>
                    }
                  >
                    {(titleId) => (
                      <Table size="md" useZebraStyles aria-labelledby={titleId}>
                        <TableHead>
                          <TableRow>
                            <TableHeader>Application file</TableHeader>
                            <TableHeader>Detail</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {issues.map((issue) => (
                            <TableRow key={issue.key}>
                              <TableCell>{issue.fileName}</TableCell>
                              <TableCell>{reasonContent(issue.detail)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </ApplicationUploadTableCard>
                )}
              </div>

              {/* Each file shows its own progress; the result is read out by the notice above. */}
              <div className="cds--visually-hidden" aria-live="polite" aria-atomic="true">
                {validatingCount > 0
                  ? `Validating ${announcedValidationCount} ${announcedValidationCount === 1 ? 'file' : 'files'}`
                  : ''}
              </div>

              <div className="admin-upload-fspts-button-row admin-upload-fspts-button-row--upload-step">
                <Button
                  kind="primary"
                  size="md"
                  className="admin-upload-fspts-action-button"
                  renderIcon={ArrowRight}
                  disabled={!hasUploadAccess || validatingCount > 0}
                  onClick={onReview}
                >
                  Review
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="admin-upload-section-heading">
                <h2 ref={stepHeadingRef} tabIndex={-1}>
                  Review
                </h2>
                <p>Check the applications before you create them.</p>
              </div>

              <ApplicationUploadReviewTable files={validFiles} labelsFor={labelsFor} />

              <div className="admin-upload-fspts-button-row application-upload-review__actions">
                <Button kind="tertiary" size="md" disabled={isCreating} onClick={onBack}>
                  Back
                </Button>
                <Button
                  kind="primary"
                  size="md"
                  className="admin-upload-fspts-action-button"
                  disabled={isCreating}
                  renderIcon={isCreating ? PendingIcon : undefined}
                  onClick={() => void onCreate()}
                >
                  {isCreating ? 'Creating…' : `Create ${applicationCountLabel(validFiles.length)}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Column>
      {unsavedChangesGuard}
    </Grid>
  )
}

export default ProvincialApplicationUploadPage
