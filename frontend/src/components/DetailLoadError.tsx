import { Column } from '@carbon/react'
import { useState } from 'react'
import { AppNotification } from '@/components/AppNotification'

type DetailLoadErrorProps = {
  message: string
  title?: string
}

/** Keeps the load failure in the page after the matching toast is dismissed. */
const DetailLoadError = ({ message, title = 'Detail unavailable' }: DetailLoadErrorProps) => {
  const [dismissedToastMessage, setDismissedToastMessage] = useState<string | null>(null)
  const showToast = dismissedToastMessage !== message

  return (
    <>
      <Column sm={4} md={8} lg={16} className="detail-page-error">
        <p className="detail-page-inline-error" role="alert">
          {message}
        </p>
      </Column>
      {showToast ? (
        <AppNotification
          kind="error"
          title={title}
          subtitle={message}
          lowContrast
          onCloseButtonClick={() => setDismissedToastMessage(message)}
        />
      ) : null}
    </>
  )
}

export default DetailLoadError
