import { Loading } from '@carbon/react'
import { Suspense, useEffect, useMemo } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { clearLoginDestination } from '@/context/auth/login-destination'
import ForestClientSelectionPage from '@/pages/ForestClientSelection'
import { getNoRoleRoutes, getProtectedRoutes, getPublicRoutes } from '@/routes/routePaths'
import RouteErrorPage from '@/routes/RouteErrorPage'

const AppRoutes = () => {
  const { capabilities, hasAnyRole, isLoading, isLoggedIn } = useAuth()
  useEffect(() => {
    if (!isLoading && isLoggedIn && !hasAnyRole) {
      clearLoginDestination()
    }
  }, [hasAnyRole, isLoading, isLoggedIn])
  const routesToUse = useMemo(() => {
    if (!isLoggedIn) {
      return getPublicRoutes()
    }
    if (!hasAnyRole) {
      return getNoRoleRoutes()
    }
    return getProtectedRoutes()
  }, [hasAnyRole, isLoggedIn])
  const routesWithErrorBoundary = useMemo(
    () =>
      routesToUse.map((route) => ({
        ...route,
        errorElement: route.errorElement ?? <RouteErrorPage />,
      })),
    [routesToUse],
  )
  const browserRouter = useMemo(
    () => createBrowserRouter(routesWithErrorBoundary),
    [routesWithErrorBoundary],
  )

  if (isLoading) {
    return <Loading withOverlay={true} description="Loading session…" />
  }

  if (
    isLoggedIn &&
    capabilities.forestClientSelectionRequired &&
    !capabilities.forestClientNumber
  ) {
    return <ForestClientSelectionPage />
  }

  return (
    <Suspense fallback={<Loading withOverlay={true} description="Loading routes…" />}>
      <RouterProvider router={browserRouter} />
    </Suspense>
  )
}

export default AppRoutes
