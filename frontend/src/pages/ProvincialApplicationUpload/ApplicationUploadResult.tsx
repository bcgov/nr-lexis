import { useEffect, useRef } from 'react'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import { CheckmarkFilled, Upload, WarningAltFilled, WarningFilled } from '@carbon/icons-react'
import { Link } from 'react-router-dom'
import { displayValue } from '@/utils/display-value'
import ApplicationUploadTableCard from './ApplicationUploadTableCard'
import { reasonContent } from './reasonContent'
import { createResultSummary, type ApplicationCreateOutcome } from './applicationUploadFiles'

type ApplicationUploadResultProps = {
  outcomes: ApplicationCreateOutcome[]
  canOpenApplications: boolean
  canSearchApplications: boolean
  /** Where an opened application's breadcrumb returns to. */
  returnTo: { label: string; to: string }
  onUploadMore: () => void
}

const RESULT_ICONS = {
  success: CheckmarkFilled,
  warning: WarningAltFilled,
  error: WarningFilled,
}

/** What happened to each file sent to be created, with links to the created applications. */
function ApplicationUploadResult({
  outcomes,
  canOpenApplications,
  canSearchApplications,
  returnTo,
  onUploadMore,
}: ApplicationUploadResultProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const summary = createResultSummary(outcomes)
  const created = outcomes.filter((outcome) => outcome.applicationNumber)
  const notCreated = outcomes.filter((outcome) => !outcome.applicationNumber)
  const ResultIcon = RESULT_ICONS[summary.kind]

  // The result opens at the top of the page, with its title read out.
  useEffect(() => {
    window.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="application-upload-result">
      <div className="application-upload-result__summary">
        <ResultIcon
          size={48}
          className={`application-upload-result__icon application-upload-result__icon--${summary.kind}`}
          aria-hidden="true"
        />
        <h1 ref={titleRef} className="application-upload-result__title" tabIndex={-1}>
          {summary.title}
        </h1>
        <div className="application-upload-result__text">
          {summary.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {summary.searchPrompt && (
            <p>
              {summary.searchPrompt}{' '}
              {canSearchApplications ? (
                <Link to="/provincial/application">Application search</Link>
              ) : (
                'Application search'
              )}
              .
            </p>
          )}
        </div>
        <Button
          kind={summary.kind === 'success' ? 'tertiary' : 'primary'}
          size="md"
          renderIcon={Upload}
          onClick={onUploadMore}
        >
          {created.length > 0 ? 'Upload more applications' : 'Upload applications'}
        </Button>
      </div>

      {notCreated.length > 0 && (
        <ApplicationUploadTableCard title={`Not created (${notCreated.length})`} headingLevel={2}>
          {(titleId) => (
            <Table size="md" useZebraStyles aria-labelledby={titleId}>
              <TableHead>
                <TableRow>
                  <TableHeader>Application file</TableHeader>
                  <TableHeader>Reason</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {notCreated.map((outcome) => (
                  <TableRow key={outcome.id}>
                    <TableCell>{outcome.fileName}</TableCell>
                    <TableCell>
                      {outcome.errors.map((reason) => (
                        <p key={reason} className="application-upload-result__reason">
                          {reasonContent(reason)}
                        </p>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ApplicationUploadTableCard>
      )}

      {created.length > 0 && (
        <ApplicationUploadTableCard title={`Created (${created.length})`} headingLevel={2}>
          {(titleId) => (
            <Table size="md" useZebraStyles aria-labelledby={titleId}>
              <TableHead>
                <TableRow>
                  <TableHeader>Application file</TableHeader>
                  <TableHeader>Application</TableHeader>
                  <TableHeader>Package</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {created.map((outcome) => (
                  <TableRow key={outcome.id}>
                    <TableCell>{outcome.fileName}</TableCell>
                    <TableCell>
                      {canOpenApplications ? (
                        <Link
                          to={`/provincial/application/${outcome.applicationNumber}`}
                          state={{ returnTo }}
                        >
                          {outcome.applicationNumber}
                        </Link>
                      ) : (
                        outcome.applicationNumber
                      )}
                    </TableCell>
                    <TableCell>{displayValue(outcome.packageNumber)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ApplicationUploadTableCard>
      )}
    </div>
  )
}

export default ApplicationUploadResult
