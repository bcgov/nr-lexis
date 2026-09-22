import { Column } from '@carbon/react'
import { AppNotification } from '@/components/AppNotification'

type DetailLoadErrorProps = {
  message: string
  title?: string
}

/** A load failure stays visible until the detail can be loaded. */
const DetailLoadError = ({ message, title = 'Detail unavailable' }: DetailLoadErrorProps) => (
  <Column sm={4} md={8} lg={16} className="detail-page-error">
    <AppNotification kind="error" role="alert" title={title} subtitle={message} />
  </Column>
)

export default DetailLoadError
