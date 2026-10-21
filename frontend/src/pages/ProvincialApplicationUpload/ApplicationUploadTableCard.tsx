import { useId, type ReactNode } from 'react'
import TableFrame from '@/components/TableFrame'

type ApplicationUploadTableCardProps = {
  title: string
  headingLevel: 2 | 3
  action?: ReactNode
  /** The table, labelled by the card title through `titleId`. */
  children: (titleId: string) => ReactNode
}

/** A titled, bordered table, such as the validation issues or the applications to create. */
function ApplicationUploadTableCard({
  title,
  headingLevel,
  action,
  children,
}: ApplicationUploadTableCardProps) {
  const cardId = useId()
  const titleId = `application-upload-table-${cardId.replaceAll(':', '')}`
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div className="admin-upload-validation-table-wrap application-upload-table">
      <div className="admin-upload-validation-table-header">
        <Heading id={titleId} className="application-upload-table__title">
          {title}
        </Heading>
        {action}
      </div>
      <TableFrame ariaLabel={title}>{children(titleId)}</TableFrame>
    </div>
  )
}

export default ApplicationUploadTableCard
