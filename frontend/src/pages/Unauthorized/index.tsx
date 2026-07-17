import { useNavigate } from 'react-router-dom'
import { Button, Tile } from '@carbon/react'
import { UserAccessLocked } from '@carbon/icons-react'
import EmptyState from '@/components/EmptyState'
import { useAuth } from '@/context/auth/useAuth'

const UnauthorizedPage = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return (
    <div className="unauthorized-page">
      <Tile>
        <EmptyState
          headingLevel={1}
          title="Unauthorized"
          description="Your account is signed in but does not currently have a role mapped for this view."
          icon={<UserAccessLocked size={80} />}
          iconLabel="Access not granted"
          action={
            <div className="unauthorized-actions">
              <Button kind="primary" onClick={() => navigate('/')}>
                Back to Landing
              </Button>
              <Button
                kind="secondary"
                onClick={() => {
                  void logout()
                }}
              >
                Log Out
              </Button>
            </div>
          }
        />
      </Tile>
    </div>
  )
}

export default UnauthorizedPage
