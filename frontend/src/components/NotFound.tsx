import { useEffect } from 'react'
import { Button } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'

const NOT_FOUND_TITLE = 'Page not found'

const NotFound = () => {
  const navigate = useNavigate()
  const buttonClicked = () => {
    navigate('/')
  }

  // The heading isn't a PageHeader, so the page names the browser tab itself and gives the
  // previous name back when it goes away.
  useEffect(() => {
    const previousTitle = document.title
    document.title = NOT_FOUND_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <div className="not-found-page">
      <EmptyState
        headingLevel={1}
        title={NOT_FOUND_TITLE}
        description="The page you're looking for does not exist."
        action={
          <Button
            kind="tertiary"
            size="md"
            name="homeBtn"
            id="homeBtn"
            onClick={() => buttonClicked()}
          >
            Go to my landing page
          </Button>
        }
      />
    </div>
  )
}

export default NotFound
