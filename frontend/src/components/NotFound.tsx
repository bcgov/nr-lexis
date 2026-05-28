import type { FC } from 'react'
import { Button } from '@carbon/react'
import { useNavigate } from 'react-router-dom'

const NotFound: FC = () => {
  const navigate = useNavigate()
  const buttonClicked = () => {
    navigate('/')
  }
  return (
    <div className="not-found-page">
      <div>
        <h1>404</h1>
        <p>The page you're looking for does not exist.</p>
        <Button kind="secondary" name="homeBtn" id="homeBtn" onClick={() => buttonClicked()}>
          Back Home
        </Button>
      </div>
    </div>
  )
}

export default NotFound
