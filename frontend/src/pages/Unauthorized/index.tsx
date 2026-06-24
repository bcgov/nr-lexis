import { useNavigate } from 'react-router-dom'
import { Button, Tile } from '@carbon/react'
import { useAuth } from '@/context/auth/useAuth'

const UnauthorizedPage = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return (
    <div className="unauthorized-page">
      <Tile>
        <h1>Unauthorized</h1>
        <p>Your account is signed in but does not currently have a role mapped for this view.</p>
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
      </Tile>
    </div>
  )
}

export default UnauthorizedPage
