import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'

export type ApplicationUploadFileStatus = 'validating' | 'validated' | 'failed'

export type ApplicationUploadFile = {
  id: string
  file: File
  status: ApplicationUploadFileStatus
  /** Why the file failed validation; empty while it validates and once it passes. */
  errors: string[]
  summary?: LexisXmlSubmissionSummary
}

export type ApplicationCreateOutcome = {
  id: string
  fileName: string
  applicationNumber?: number
  packageNumber?: string
  /** Why the application wasn't created; empty when it was. */
  errors: string[]
}

export type ApplicationUploadIssue = {
  key: string
  fileName: string
  detail: string
}

export type ValidationResultNotice = {
  kind: 'error' | 'info'
  title: string
  subtitle: string
}

const countLabel = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

export const applicationCountLabel = (count: number): string =>
  countLabel(count, 'application', 'applications')

/** One notice for the whole batch once every file has finished validating. */
export const validationResultNotice = (
  files: ApplicationUploadFile[],
): ValidationResultNotice | null => {
  if (files.length === 0 || files.some((item) => item.status === 'validating')) {
    return null
  }

  const failedCount = files.filter((item) => item.status === 'failed').length
  const validCount = files.length - failedCount
  if (failedCount === 0) {
    return {
      kind: 'info',
      title: `${countLabel(validCount, 'file', 'files')} validated`,
      subtitle:
        validCount === 1
          ? 'Review it to create the application.'
          : 'Review them to create the applications.',
    }
  }
  if (validCount === 0) {
    return {
      kind: 'error',
      title: `${countLabel(failedCount, 'file', 'files')} failed validation`,
      subtitle:
        failedCount === 1
          ? 'Correct the file and add it again.'
          : 'Correct the files and add them again.',
    }
  }
  return {
    kind: 'error',
    title: `${failedCount} of ${files.length} files failed validation`,
    subtitle: `Correct the failed ${failedCount === 1 ? 'file and add it' : 'files and add them'} again, or review the ${countLabel(validCount, 'valid file', 'valid files')} and create ${validCount === 1 ? 'its application' : 'their applications'}.`,
  }
}

export const validationIssues = (files: ApplicationUploadFile[]): ApplicationUploadIssue[] =>
  files.flatMap((item) =>
    item.status === 'failed'
      ? item.errors.map((detail, index) => ({
          key: `${item.id}-${index}`,
          fileName: item.file.name,
          detail,
        }))
      : [],
  )

export const buildValidationIssuesCsv = (issues: ApplicationUploadIssue[]): string => {
  const escape = (value: string): string => {
    const safeValue = value.startsWith('\t') || /^\s*[=+\-@]/.test(value) ? `'${value}` : value
    return `"${safeValue.replace(/"/g, '""')}"`
  }
  const rows = [
    ['Application file', 'Detail'],
    ...issues.map((issue) => [issue.fileName, issue.detail]),
  ]
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
}

export type CreateResultSummary = {
  kind: 'success' | 'warning' | 'error'
  title: string
  /** Each entry is its own line. */
  lines: string[]
  /** A last line that ends by naming Application search, which the page links. */
  searchPrompt?: string
}

/** The result page's outcome for the files sent to be created. */
export const createResultSummary = (outcomes: ApplicationCreateOutcome[]): CreateResultSummary => {
  const createdCount = outcomes.filter((outcome) => outcome.applicationNumber).length
  const notCreatedCount = outcomes.length - createdCount

  if (notCreatedCount === 0) {
    return {
      kind: 'success',
      title: `${applicationCountLabel(createdCount)} created`,
      lines: [],
      searchPrompt: 'Open an application from the list, or find it later in',
    }
  }
  if (createdCount === 0) {
    return {
      kind: 'error',
      title: 'No applications created',
      lines: [
        outcomes.length === 1
          ? "The file couldn't be created. Check the reason in the list."
          : `None of the ${outcomes.length} files could be created. Check the reason for each file in the list.`,
      ],
    }
  }
  return {
    kind: 'warning',
    title: `${createdCount} of ${outcomes.length} applications created`,
    lines: [
      notCreatedCount === 1
        ? '1 file was not created. Check the reason before you upload it again.'
        : `${notCreatedCount} files were not created. Check the reason before you upload them again.`,
    ],
    searchPrompt:
      createdCount === 1
        ? 'Open the created application from the list, or find it later in'
        : 'Open the created applications from the list, or find them later in',
  }
}
