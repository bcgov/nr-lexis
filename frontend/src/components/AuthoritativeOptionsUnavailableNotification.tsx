import { AppNotification } from '@/components/AppNotification'
import { SEARCH_OPTIONS_UNAVAILABLE_MESSAGE } from '@/constants/search-options'

type AuthoritativeOptionsUnavailableNotificationProps = {
  title?: string
}

const AuthoritativeOptionsUnavailableNotification = ({
  title = 'Options unavailable',
}: AuthoritativeOptionsUnavailableNotificationProps) => (
  <AppNotification
    kind="warning"
    title={title}
    subtitle={SEARCH_OPTIONS_UNAVAILABLE_MESSAGE}
    lowContrast
  />
)

export default AuthoritativeOptionsUnavailableNotification
