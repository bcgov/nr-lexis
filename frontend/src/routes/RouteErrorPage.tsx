import { Button } from '@carbon/react'
import { useRouteError } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'

const STALE_CHUNK_ERROR =
  /dynamically imported module|loading chunk|chunkloaderror|unable to preload/i

type RouteErrorPageProps = {
  onReload?: () => void
}

const RouteErrorPage = ({ onReload = () => window.location.reload() }: RouteErrorPageProps) => {
  const routeError = useRouteError()
  const errorMessage = routeError instanceof Error ? routeError.message : ''
  const staleChunk = STALE_CHUNK_ERROR.test(errorMessage)

  return (
    <main className="not-found-page">
      <EmptyState
        headingLevel={1}
        role="alert"
        title={staleChunk ? 'Application update required' : 'Page could not be loaded'}
        description={
          staleChunk
            ? 'A newer version of LEXIS was deployed while this page was open. Reload to continue.'
            : 'LEXIS could not load this page. Reload and try again.'
        }
        action={
          <Button kind="primary" onClick={onReload}>
            Reload application
          </Button>
        }
      />
    </main>
  )
}

export default RouteErrorPage
