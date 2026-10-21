import { Fragment, useId, useState, type ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableExpandedRow,
  TableExpandHeader,
  TableExpandRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'
import { displayValue } from '@/utils/display-value'
import { displayVolume } from '@/utils/volume'
import ApplicationUploadTableCard from './ApplicationUploadTableCard'
import type { ApplicationUploadFile } from './applicationUploadFiles'
import type { SubmissionSummaryLabels } from './useSubmissionSummaryLabels'

type ApplicationUploadReviewTableProps = {
  files: ApplicationUploadFile[]
  labelsFor: (summary: LexisXmlSubmissionSummary) => SubmissionSummaryLabels
}

const COLUMNS = [
  'Application file',
  'Owner client',
  'Agent client',
  'Package',
  'Application volume (m³)',
  'Region',
]

type FieldGroup = {
  title: string
  fields: [string, ReactNode][]
}

const scaleLinesLabel = (count: number | undefined): string =>
  typeof count === 'number' ? `${count} ${count === 1 ? 'line' : 'lines'}` : ''

// Groups and labels follow the application's Applicant, Application and Scale tabs.
const applicationFieldGroups = (
  summary: LexisXmlSubmissionSummary,
  labels: SubmissionSummaryLabels,
): FieldGroup[] => [
  { title: 'Applicant', fields: [['Contact name', displayValue(summary.ownerContactName)]] },
  {
    title: 'Application',
    fields: [
      ['Product type', displayValue(labels.productType ?? summary.productTypeCode)],
      ['Exemption reason', displayValue(labels.exemptionReason ?? summary.exemptionReasonCode)],
    ],
  },
  {
    title: 'Package',
    fields: [
      ['Location of logs', displayValue(summary.productLocation)],
      ['Age class', displayValue(labels.ageClass ?? summary.ageClass)],
      ['Average log volume (m³)', displayVolume(summary.averageLogVolume)],
      ['Species list', displayValue(summary.speciesCodes?.join(', '))],
      ['End use', displayValue(labels.endUse ?? summary.endUseCode)],
      ['Package volume (m³)', displayVolume(summary.applicationVolume)],
      ['Average length (m)', displayValue(summary.averageLength)],
      ['Average top diameter (rads)', displayValue(summary.averageDiameter)],
      ['Summary of scale', displayValue(scaleLinesLabel(summary.scaleRows))],
    ],
  },
]

/** One row per application to create; a row opens to show the rest of what the file holds. */
function ApplicationUploadReviewTable({ files, labelsFor }: ApplicationUploadReviewTableProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set())
  const reviewId = useId()
  const idPrefix = `application-upload-review-${reviewId.replaceAll(':', '')}`
  const expandHeaderId = `${idPrefix}-expand`

  const toggleRow = (id: string): void =>
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  return (
    <ApplicationUploadTableCard title={`Applications to create (${files.length})`} headingLevel={3}>
      {(titleId) => (
        <Table
          size="md"
          useZebraStyles
          className="application-upload-review-table"
          aria-labelledby={titleId}
        >
          <TableHead>
            <TableRow>
              <TableExpandHeader id={expandHeaderId} aria-label="Application details" />
              {COLUMNS.map((column) => (
                <TableHeader key={column}>{column}</TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {files.map((item, index) => {
              const summary = item.summary ?? {}
              const isExpanded = expandedIds.has(item.id)
              const detailsId = `${idPrefix}-details-${index}`
              return (
                <Fragment key={item.id}>
                  <TableExpandRow
                    isExpanded={isExpanded}
                    onExpand={() => toggleRow(item.id)}
                    aria-label={`Details for ${item.file.name}`}
                    aria-controls={detailsId}
                    expandHeader={expandHeaderId}
                  >
                    <TableCell>{item.file.name}</TableCell>
                    <TableCell>{displayValue(summary.ownerClientNumber)}</TableCell>
                    <TableCell>{displayValue(summary.agentClientNumber)}</TableCell>
                    <TableCell>{displayValue(summary.packageNumber)}</TableCell>
                    <TableCell>{displayVolume(summary.applicationVolume)}</TableCell>
                    <TableCell>{displayValue(summary.regionCode)}</TableCell>
                  </TableExpandRow>
                  {/* Collapsed details stay in the table, so each keeps its row's stripe. */}
                  <TableExpandedRow
                    id={detailsId}
                    colSpan={COLUMNS.length + 1}
                    hidden={!isExpanded}
                  >
                    <div className="application-upload-review__details">
                      {applicationFieldGroups(summary, labelsFor(summary)).map((group) => (
                        <section key={group.title} className="application-upload-review__group">
                          <h4 className="application-upload-review__group-title">{group.title}</h4>
                          <dl className="application-upload-review__fields">
                            {group.fields.map(([label, value]) => (
                              <div key={label} className="application-upload-review__field">
                                <dt className="detail-field-label">{label}</dt>
                                <dd className="detail-field-value">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </div>
                  </TableExpandedRow>
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}
    </ApplicationUploadTableCard>
  )
}

export default ApplicationUploadReviewTable
