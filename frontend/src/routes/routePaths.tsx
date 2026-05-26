import { DashboardReference, Document, Search, UserAvatar } from '@carbon/icons-react'
import type { ComponentType, ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import Layout from '@/components/Layout'
import AdminPage from '@/pages/Admin'
import DashboardPage from '@/pages/Dashboard'
import FederalPage from '@/pages/Federal'
import IndianReservePage from '@/pages/IndianReserve'
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
import ProvincialReviewPage from '@/pages/ProvincialReview'
import ProvincialSummaryPage from '@/pages/ProvincialSummary'
import ReportsPage from '@/pages/Reports'

export type RouteDescription = {
  id: string
  path: string
  element: ReactNode
  icon?: ComponentType
  isNavigation: boolean
} & RouteObject

export type MenuItem = Pick<RouteDescription, 'id' | 'path' | 'icon'>

export const APP_ROUTES: RouteDescription[] = [
  {
    path: '/',
    id: 'RedirectRoot',
    element: <Navigate to="/dashboard" replace />,
    isNavigation: false,
  },
  {
    path: '/dashboard',
    id: 'Dashboard',
    icon: DashboardReference,
    element: (
      <Layout>
        <DashboardPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/provincial',
    id: 'Provincial',
    icon: Search,
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
    element: (
      <Layout>
        <ProvincialPermitCreatePage />
      </Layout>
    ),
    isNavigation: false,
  },
  {
    path: '/provincial/review',
    id: 'Provincial Review',
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
    icon: Search,
    element: (
      <Layout>
        <FederalPage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/indian-reserve',
    id: 'Indian Reserve',
    icon: Search,
    element: (
      <Layout>
        <IndianReservePage />
      </Layout>
    ),
    isNavigation: true,
  },
  {
    path: '/reports',
    id: 'Reports',
    icon: Document,
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
    icon: UserAvatar,
    element: (
      <Layout>
        <AdminPage />
      </Layout>
    ),
    isNavigation: true,
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

export const getNavigationRoutes = (): MenuItem[] => {
  return APP_ROUTES.filter((route) => route.isNavigation).map(({ id, path, icon }) => ({
    id,
    path,
    icon,
  }))
}

export const getAppRoutes = (): RouteDescription[] => APP_ROUTES
