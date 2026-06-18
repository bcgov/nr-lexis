import type { FC, ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import Layout from '@/components/Layout'
import { useAuth } from '@/context/auth/useAuth'
import AdminPage from '@/pages/Admin'
import AdminPoliciesPage from '@/pages/AdminPolicies'
import AdminUploadsPage from '@/pages/AdminUploads'
import FederalPage from '@/pages/Federal'
import FederalApplicationDetailsPage from '@/pages/FederalApplicationDetails'
import LandingPage from '@/pages/Landing'
import NotFoundPage from '@/pages/NotFound'
import ProvincialApplicationPage from '@/pages/ProvincialApplication'
import ProvincialApplicationCreatePage from '@/pages/ProvincialApplicationCreate'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'
import ProvincialExemptionPage from '@/pages/ProvincialExemption'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import ProvincialOfferDetailsPage from '@/pages/ProvincialOfferDetails'
import ProvincialOffersPage from '@/pages/ProvincialOffers'
import ProvincialPage from '@/pages/Provincial'
import ProvincialPermitPage from '@/pages/ProvincialPermit'
import ProvincialPermitCreatePage from '@/pages/ProvincialPermitCreate'
import ProvincialPermitDetailsPage from '@/pages/ProvincialPermitDetails'
import ProvincialReviewPage from '@/pages/ProvincialReview'
import ProvincialSummaryPage from '@/pages/ProvincialSummary'
import ReportsPage from '@/pages/Reports'
import UnauthorizedPage from '@/pages/Unauthorized'

export type RouteDescription = {
  id: string
  path: string
  element: ReactNode
  isNavigation: boolean
  requiredActions?: string[]
  requiredActionsMatch?: 'any' | 'all'
} & RouteObject

const ProtectedRootRedirect: FC = () => {
  const { defaultRoute } = useAuth()
  return <Navigate to={defaultRoute} replace />
}

type RouteGuardProps = {
  requiredActions?: string[]
  requiredActionsMatch?: 'any' | 'all'
  children: ReactNode
}

const RouteActionGuard: FC<RouteGuardProps> = ({
  children,
  requiredActions,
  requiredActionsMatch = 'any',
}) => {
  const { canPerform } = useAuth()

  if (!requiredActions || requiredActions.length === 0) {
    return <>{children}</>
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
    id: 'Landing Callback',
    element: <LandingPage />,
    isNavigation: false,
  },
  {
    path: '/unauthorized',
    id: 'Unauthorized',
    element: <UnauthorizedPage />,
    isNavigation: false,
  },
  {
    path: '*',
    id: 'Not Found',
    element: <NotFoundPage />,
    isNavigation: false,
  },
]

export const PROTECTED_ROUTES: RouteDescription[] = [
  {
    path: '/',
    id: 'RedirectRoot',
    element: <ProtectedRootRedirect />,
    isNavigation: false,
  },
  {
    path: '/dashboard',
    id: 'Legacy Callback Redirect',
    element: <ProtectedRootRedirect />,
    isNavigation: false,
  },
  {
    path: '/provincial',
    id: 'Provincial',
    requiredActions: [
      '/summary',
      '/applicationsReview',
      '/applicationSearch',
      'createApplication',
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
    requiredActions: ['/applicationSearch', '/applicationDetails'],
    requiredActionsMatch: 'all',
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
    path: '/provincial/permit/create',
    id: 'Create Provincial Permit',
    requiredActions: ['/permitSearch', 'createPermit'],
    requiredActionsMatch: 'all',
    element: (
      <Layout>
        <ProvincialPermitCreatePage />
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
    path: '/provincial/summary',
    id: 'Provincial Summary',
    requiredActions: ['/summary'],
    element: (
      <Layout>
        <ProvincialSummaryPage />
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
    path: '/admin',
    id: 'Admin',
    requiredActions: ['/lexisAgentAdmin'],
    element: (
      <Layout>
        <AdminPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/admin/uploads',
    id: 'Data Upload',
    requiredActions: [
      '/lexisAgentAdmin',
      '/fileApplicationUpload',
      '/fileExemptionUpload',
      '/filePermitUpload',
      '/fileInvoiceUpload',
    ],
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
    requiredActions: ['createApplication'],
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
    requiredActions: ['/lexisAgentAdmin'],
    element: (
      <Layout>
        <AdminPoliciesPage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/unauthorized',
    id: 'Unauthorized',
    element: (
      <Layout>
        <UnauthorizedPage />
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
      element: (
        <Layout>
          <UnauthorizedPage />
        </Layout>
      ),
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
        requiredActions={route.requiredActions}
        requiredActionsMatch={route.requiredActionsMatch}
      >
        {route.element}
      </RouteActionGuard>
    ),
  }))
}
