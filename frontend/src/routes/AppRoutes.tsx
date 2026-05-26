import { Loading } from '@carbon/react'
import { Suspense, useMemo, type FC } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { getAppRoutes } from '@/routes/routePaths'

const AppRoutes: FC = () => {
  const routesToUse = useMemo(() => getAppRoutes(), [])
  const browserRouter = useMemo(() => createBrowserRouter(routesToUse), [routesToUse])

  return (
    <Suspense fallback={<Loading withOverlay={true} description="Loading routes..." />}>
      <RouterProvider router={browserRouter} />
    </Suspense>
  )
}

export default AppRoutes
