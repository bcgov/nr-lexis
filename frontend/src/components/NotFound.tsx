import { Button } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'

const NotFound = () => {
  const navigate = useNavigate()
  const buttonClicked = () => {
    navigate('/')
  }
  return (
    <div className="not-found-page">
      <EmptyState
        headingLevel={1}
        title="404"
        description="The page you're looking for does not exist."
        action={
          <Button kind="secondary" name="homeBtn" id="homeBtn" onClick={() => buttonClicked()}>
            Back Home
          </Button>
        }
      />
    </div>
  )
}

export default NotFound
