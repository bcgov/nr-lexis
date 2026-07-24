import { Loading } from '@carbon/react'
import { Suspense, useMemo } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { getNoRoleRoutes, getProtectedRoutes, getPublicRoutes } from '@/routes/routePaths'
import RouteErrorPage from '@/routes/RouteErrorPage'

const AppRoutes = () => {
  const { hasAnyRole, isLoading, isLoggedIn } = useAuth()
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
    return <Loading withOverlay={true} description="Loading session..." />
  }

  return (
    <Suspense fallback={<Loading withOverlay={true} description="Loading routes..." />}>
      <RouterProvider router={browserRouter} />
    </Suspense>
  )
}

export default AppRoutes
