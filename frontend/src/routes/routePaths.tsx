import { Loading } from '@carbon/react'
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, useNavigate, type RouteObject } from 'react-router-dom'
import AppLayout from '../components/Layout'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import { isProdRtmOnlyPathAllowed } from '@/config/features'
import { useAuth } from '@/context/auth/useAuth'
import LandingPage from '@/pages/Landing'
import NotFoundPage from '@/pages/NotFound'
import ForbiddenPage from '@/pages/Forbidden'
import ForestClientSelectionPage from '@/pages/ForestClientSelection'
import UnauthorizedPage from '@/pages/Unauthorized'
import type { RouteActionMatch, RouteRoleScope } from '@/routes/routeAccessTypes'

const AdminPoliciesPage = lazy(() => import('@/pages/AdminPolicies'))
const AdminUploadsPage = lazy(() => import('@/pages/AdminUploads'))
const FederalPage = lazy(() => import('@/pages/Federal'))
const FederalApplicationDetailsPage = lazy(() => import('@/pages/FederalApplicationDetails'))
const NotificationsPage = lazy(() => import('@/pages/Notifications'))
const ProvincialApplicationPage = lazy(() => import('@/pages/ProvincialApplication'))
const ProvincialApplicationCreatePage = lazy(() => import('@/pages/ProvincialApplicationCreate'))
const ProvincialApplicationDetailsPage = lazy(() => import('@/pages/ProvincialApplicationDetails'))
const ProvincialExemptionPage = lazy(() => import('@/pages/ProvincialExemption'))
const ProvincialExemptionCreatePage = lazy(() => import('@/pages/ProvincialExemptionCreate'))
const ProvincialExemptionDetailsPage = lazy(() => import('@/pages/ProvincialExemptionDetails'))
const ProvincialOfferCreatePage = lazy(() => import('@/pages/ProvincialOfferCreate'))
const ProvincialOfferDetailsPage = lazy(() => import('@/pages/ProvincialOfferDetails'))
const ProvincialOffersPage = lazy(() => import('@/pages/ProvincialOffers'))
const ProvincialPage = lazy(() => import('@/pages/Provincial'))
const ProvincialPermitPage = lazy(() => import('@/pages/ProvincialPermit'))
const ProvincialPermitDetailsPage = lazy(() => import('@/pages/ProvincialPermitDetails'))
const ProvincialReviewPage = lazy(() => import('@/pages/ProvincialReview'))
const ProvincialSummaryPage = lazy(() => import('@/pages/ProvincialSummary'))
const ReportsPage = lazy(() => import('@/pages/Reports'))
const RTMEmsLogAmvPage = lazy(() => import('@/pages/RTMEmsLogAmv'))
const RTMEmsLogAmvUploadPage = lazy(() => import('@/pages/RTMEmsLogAmv/LegacyUploadWorkflow'))

const Layout = ({ children }: { children: ReactNode }) => (
  <AppLayout>
    <Suspense fallback={<Loading withOverlay description="Loading page..." />}>{children}</Suspense>
  </AppLayout>
)

export type RouteDescription = {
  id: string
  path: string
  element: ReactNode
  isNavigation: boolean
  requiredActions?: string[]
  requiredActionsMatch?: RouteActionMatch
  roleScope?: RouteRoleScope
} & RouteObject

function ProtectedRootRedirect() {
  const { defaultRoute } = useAuth()
  return <Navigate to={defaultRoute} replace />
}

function ForestClientSelectionRoute() {
  const { capabilities, defaultRoute } = useAuth()
  const navigate = useNavigate()

  if (capabilities.availableForestClientNumbers.length < 2) {
    return <Navigate to={defaultRoute} replace />
  }

  return <ForestClientSelectionPage onSelected={() => navigate(defaultRoute, { replace: true })} />
}

export type RouteGuardProps = {
  path: string
  requiredActions?: string[]
  requiredActionsMatch?: RouteActionMatch
  roleScope?: RouteDescription['roleScope']
  children: ReactNode
}

const canAccessRoleScope = (
  roles: string[],
  roleScope: RouteDescription['roleScope'] = undefined,
): boolean => {
  if (!roleScope) {
    return true
  }

  if (roleScope === 'provincialSubmitter') {
    return hasProvincialSubmitterRole(roles) && !hasRole(roles, 'ADMIN')
  }

  const hasAdminRole = hasRole(roles, 'ADMIN')
  if (hasAdminRole) {
    return true
  }

  const hasProvincialSubmitter = hasProvincialSubmitterRole(roles)
  const hasProvincialStaffRole =
    hasRole(roles, 'READ_ONLY') ||
    hasRole(roles, 'APPLICATION_APPROVER') ||
    hasRole(roles, 'EXEMPTION_APPROVER')
  const hasProvincialRole = hasProvincialSubmitter || hasProvincialStaffRole

  if (roleScope === 'provincialApplicationSubmission') {
    return hasProvincialRole
  }

  return hasProvincialRole
}

function RouteActionGuard({
  children,
  path,
  requiredActions,
  requiredActionsMatch = 'any',
  roleScope,
}: RouteGuardProps) {
  const { capabilities, canPerform } = useAuth()

  if (!isProdRtmOnlyPathAllowed(path)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (!requiredActions || requiredActions.length === 0) {
    return <>{children}</>
  }

  if (!canAccessRoleScope(capabilities.roles, roleScope)) {
    return <Navigate to="/unauthorized" replace />
  }

  const canAccessRoute =
    requiredActionsMatch === 'all'
      ? requiredActions.every((action) => canPerform(action))
      : requiredActions.some((action) => canPerform(action))
  if (!canAccessRoute) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}

export const PUBLIC_ROUTES: RouteDescription[] = [
  {
    path: '/',
    id: 'Landing',
    element: <LandingPage />,
    isNavigation: false,
  },
  {
    path: '/dashboard',
    id: 'Legacy Dashboard Redirect',
    element: <Navigate to="/" replace />,
    isNavigation: false,
  },
  {
    path: '/unauthorized',
    id: 'Unauthorized Login Redirect',
    element: <Navigate to="/" replace />,
    isNavigation: false,
  },
  {
    path: '/logout',
    id: 'Logout Login Redirect',
    element: <Navigate to="/" replace />,
    isNavigation: false,
  },
  {
    path: '*',
    id: 'Not Found',
    element: <NotFoundPage />,
    isNavigation: false,
  },
]

// INTENTIONAL_LEGACY_DIVERGENCE(ADMIN_PAGE_RETIREMENT):
// The Users & Access landing page and IDIR lookup are deliberately absent from protected routes.
// INTENTIONAL_LEGACY_DIVERGENCE(INDIGENOUS_RESERVE_MODULE_RETIREMENT):
// Legacy Indian/Indigenous Reserve search, create, and detail pages are deliberately not routed.
export const PROTECTED_ROUTES: RouteDescription[] = [
  {
    path: '/',
    id: 'RedirectRoot',
    element: <ProtectedRootRedirect />,
    isNavigation: false,
  },
  {
    path: '/select-organization',
    id: 'Select Organization',
    element: <ForestClientSelectionRoute />,
    isNavigation: false,
  },
  {
    path: '/dashboard',
    id: 'Legacy Callback Redirect',
    element: <ProtectedRootRedirect />,
    isNavigation: false,
  },
  {
    // INTENTIONAL_LEGACY_DIVERGENCE(NOTIFICATION_MODULE_ADDITION):
    // Modern LEXIS provides role-targeted operational notices with no legacy screen equivalent.
    path: '/notifications',
    id: 'Notifications',
    element: (
      <Layout>
        <NotificationsPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/provincial',
    id: 'Provincial',
    roleScope: 'provincial',
    requiredActions: [
      '/applicationsReview',
      '/applicationSearch',
      'uploadApplicationSubmission',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
    ],
    element: (
      <Layout>
        <ProvincialPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/provincial/summary',
    id: 'Provincial Summary',
    roleScope: 'provincialSubmitter',
    requiredActions: ['/summary'],
    element: (
      <Layout>
        <ProvincialSummaryPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/application',
    id: 'Provincial Application',
    requiredActions: ['/applicationSearch'],
    element: (
      <Layout>
        <ProvincialApplicationPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/application/create',
    id: 'Create Provincial Application',
    requiredActions: ['/applicationSearch', 'createApplication'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialApplicationCreatePage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/application/:applicationNumber',
    id: 'Provincial Application Details',
    requiredActions: ['/applicationDetails'],
    element: (
      <Layout>
        <ProvincialApplicationDetailsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/exemption',
    id: 'Provincial Exemption',
    requiredActions: ['/exemptionSearch'],
    element: (
      <Layout>
        <ProvincialExemptionPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/exemption/create',
    id: 'Create Provincial Exemption',
    requiredActions: ['/exemptionSearch', '/createExemption'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialExemptionCreatePage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/exemption/:exemptionNumber',
    id: 'Provincial Exemption Details',
    requiredActions: ['/exemptionSearch', '/exemptionDetails'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialExemptionDetailsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/offers',
    id: 'Provincial Offers',
    requiredActions: ['/offersSearch'],
    element: (
      <Layout>
        <ProvincialOffersPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/offers/create',
    id: 'Create Provincial Offer',
    requiredActions: ['/offersSearch', 'createOffer'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialOfferCreatePage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/offers/:offerNumber',
    id: 'Provincial Offer Details',
    requiredActions: ['/offersSearch', '/offerDetails'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialOfferDetailsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/permit',
    id: 'Provincial Permit',
    requiredActions: ['/permitSearch'],
    element: (
      <Layout>
        <ProvincialPermitPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/permit/:permitNumber',
    id: 'Provincial Permit Details',
    requiredActions: ['/permitSearch', '/permitDetails'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialPermitDetailsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/review',
    id: 'Provincial Review',
    requiredActions: ['/applicationsReview'],
    element: (
      <Layout>
        <ProvincialReviewPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/federal',
    id: 'Federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
    element: (
      <Layout>
        <FederalPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/federal/application/upload',
    id: 'Retired Federal Upload Redirect',
    element: <Navigate to="/federal" replace />,
    isNavigation: false,
  },
  {
    path: '/federal/application/:applicationNumber',
    id: 'Federal Application Details',
    requiredActions: ['/federalApplicationDetails', 'viewFederalApplication'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <FederalApplicationDetailsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/reports',
    id: 'Reports',
    requiredActions: [
      '/applicationReport',
      '/offerReport',
      '/teacReport',
      '/exemptionReport',
      '/permitLedgerReport',
      '/transportReport',
      '/speciesGradeReport',
      '/feeReport',
      '/tenureReport',
      'mofrListing',
    ],
    element: (
      <Layout>
        <ReportsPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/reports/:reportId',
    id: 'Report Details',
    requiredActions: [
      '/applicationReport',
      '/offerReport',
      '/teacReport',
      '/exemptionReport',
      '/permitLedgerReport',
      '/transportReport',
      '/speciesGradeReport',
      '/feeReport',
      '/tenureReport',
      'mofrListing',
    ],
    element: (
      <Layout>
        <ReportsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/rtm/emslogamv',
    id: 'Admin - Average Monthly Values',
    requiredActions: ['/lexisAgentAdmin'],
    element: (
      <Layout>
        <RTMEmsLogAmvPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    // INTENTIONAL_LEGACY_DIVERGENCE(RTM_AMV_TRANSITIONAL_UPLOAD):
    // The workbook workflow is temporarily available beside the modern grid for client evaluation.
    path: '/admin/rtm/emslogamv/upload',
    id: 'Admin - AMV Spreadsheet Upload',
    requiredActions: ['/lexisAgentAdmin'],
    element: (
      <Layout>
        <RTMEmsLogAmvUploadPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/uploads',
    id: 'Data Upload',
    requiredActions: ['/lexisAgentAdmin'],
    element: (
      <Layout>
        <AdminUploadsPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/application/upload',
    id: 'Upload Application Submission',
    roleScope: 'provincialApplicationSubmission',
    requiredActions: ['uploadApplicationSubmission'],
    element: (
      <Layout>
        <AdminUploadsPage
          lockedWorkflowType="applicationSubmission"
          pageTitle="Upload Application Submission"
        />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/policies',
    id: 'Policy Center',
    requiredActions: ['/lexisPolicyAdmin'],
    element: (
      <Layout>
        <Navigate to="/admin/policies/fee" replace />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/policies/fee',
    id: 'Fee Policy Administration',
    requiredActions: ['/lexisPolicyAdmin'],
    element: (
      <Layout>
        <AdminPoliciesPage area="fee" />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/policies/fil',
    id: 'Fee In Lieu Policy Administration',
    requiredActions: ['/lexisFILAdmin'],
    element: (
      <Layout>
        <AdminPoliciesPage area="fil" />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/admin/schedules',
    id: 'Export Schedule Administration',
    requiredActions: ['/lexisPolicyAdmin'],
    element: (
      <Layout>
        <AdminPoliciesPage area="schedule" />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/unauthorized',
    id: 'Forbidden',
    element: (
      <Layout>
        <ForbiddenPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '*',
    id: 'Not Found',
    element: (
      <Layout>
        <NotFoundPage />
      </Layout>
    ),
    isNavigation: false,
  },
]

export const getPublicRoutes = (): RouteDescription[] => PUBLIC_ROUTES

export const getNoRoleRoutes = (): RouteDescription[] => {
  return [
    {
      path: '/unauthorized',
      id: 'Unauthorized',
      element: <UnauthorizedPage />,
      isNavigation: false,
    },
    {
      path: '*',
      id: 'UnauthorizedRedirect',
      element: <Navigate to="/unauthorized" replace />,
      isNavigation: false,
    },
  ]
}

export const getProtectedRoutes = (): RouteDescription[] => {
  return PROTECTED_ROUTES.map((route) => ({
    ...route,
    element: (
      <RouteActionGuard
        path={route.path}
        requiredActions={route.requiredActions}
        requiredActionsMatch={route.requiredActionsMatch}
        roleScope={route.roleScope}
      >
        {route.element}
      </RouteActionGuard>
    ),
  }))
}
