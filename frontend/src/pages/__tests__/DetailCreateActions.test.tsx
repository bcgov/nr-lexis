import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type {
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
} from '@/interfaces/LexisDetails'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
} from '@/service/lexis-detail-service'
import { createTestAuthContext } from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialApplicationDetail: vi.fn(),
  fetchProvincialExemptionDetail: vi.fn(),
  releaseApplicationEditLock: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn().mockResolvedValue(null),
  fetchApplicationClientContacts: vi.fn().mockResolvedValue([]),
  fetchApplicationClientLocations: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/service/application-review-search-service', () => ({
  approveApplicationReview: vi.fn(),
  sendApplicationReviewStatusEmail: vi.fn(),
  updateApplicationReviewStatus: vi.fn(),
}))

vi.mock('@/service/provincial-application-documents-service', () => ({
  fetchApplicationDocuments: vi.fn().mockResolvedValue({ rows: [] }),
  openApplicationDocument: vi.fn(),
  removeApplicationDocument: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn().mockResolvedValue({ rows: [] }),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  checkApplicationVolumeUsage: vi.fn(),
  fetchApplicationEndUsesForSpeciesRegion: vi.fn().mockResolvedValue([]),
  fetchApplicationPermits: vi.fn().mockResolvedValue([]),
  fetchApplicationRemainingSpecies: vi.fn().mockResolvedValue([]),
  fetchApplicationSpecies: vi.fn().mockResolvedValue([]),
  fetchApplicationSummarySnapshot: vi.fn().mockResolvedValue(null),
  saveApplicationRemark: vi.fn(),
  updateApplicationSummary: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchApplicationReviewOptions: vi.fn().mockResolvedValue({ reviewStatuses: [] }),
  fetchProvincialApplicationOptions: vi.fn().mockResolvedValue({
    applicationStatuses: [],
    currentSchedules: [],
    exemptionReasons: [],
    exemptionTypes: [],
    growthTypes: [],
    productTypes: [],
    regions: [],
  }),
}))

vi.mock('@/service/report-service', () => ({
  runReport: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialApplicationDetail = vi.mocked(fetchProvincialApplicationDetail)
const mockedFetchProvincialExemptionDetail = vi.mocked(fetchProvincialExemptionDetail)

const defaultCanPerform = (action: string) =>
  [
    '/applicationSearch',
    '/exemptionDetails',
    '/exemptionSearch',
    '/offersSearch',
    '/permitSearch',
    'createOffer',
  ].includes(action)

const applicationDetail: ProvincialApplicationDetail = {
  applicationNumber: 321,
  exemptionNumber: 'EX-555',
  applicationStatusCode: 'ACTIVE',
  statusDescription: 'Active',
  ownerClientNumber: '00011122',
  agentClientNumber: '00033344',
  orgUnitNumber: 12,
  orgUnitName: 'Coast',
  productTypeCode: 'LOG',
  exemptionReasonCode: 'R1',
  applicationDate: '2026-01-01',
  receivedDate: '2026-01-02',
  listingDate: '2026-01-03',
  termDays: 30,
  applicationVolume: 100,
  averageLogVolume: 2,
  canCreateOffers: true,
  industryUser: false,
  readOnly: false,
  exemptionApprover: false,
  locked: false,
  packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 5 }],
  remarks: [{ remarkId: 88, title: 'Note', remark: 'ok' }],
  offers: [
    {
      offerNumber: 'OFF-1',
      companyName: 'Example Lumber',
      receivedDate: '2026-01-04',
      validOffer: true,
      withdrawalDate: null,
    },
  ],
}

const exemptionDetail: ProvincialExemptionDetail = {
  exemptionNumber: 'EX-777',
  exemptionTypeCode: 'TYPE1',
  exemptionTypeDescription: 'Type 1',
  exemptionStatusCode: 'ACTIVE',
  exemptionStatusDescription: 'Active',
  ownerClientNumber: '00055566',
  agentClientNumber: '00077788',
  applicationNumber: 654,
  applicationStatus: 'OPEN',
  approvalDate: '2026-02-01',
  expiryDate: '2026-12-31',
  approvedVolume: 99,
  usedVolume: 5,
  remainingVolume: 94,
  otherConditions: 'none',
  blanketOic: false,
  permitNumbers: ['P1'],
  remarks: [{ title: 'Remark', remark: 'ok' }],
}

describe('Detail Create Action Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: defaultCanPerform }))
  })

  it('enables Create Offer and navigates with prefill from provincial application detail', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue(applicationDetail)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const createOfferButton = await screen.findByRole('button', { name: /Create offer/i })
    expect(createOfferButton).toBeEnabled()

    await userEvent.click(createOfferButton)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/provincial/offers/create?applicationNumber=321&packageNumber=PKG-1&packageNumbers=PKG-1&offeringClientNumber=00011122&region=12',
    )
  })

  it('navigates to Create Offer with all application package options', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 200, pieceCount: 8 },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const createOfferButton = await screen.findByRole('button', { name: /Create offer/i })
    expect(createOfferButton).toBeEnabled()

    await userEvent.click(createOfferButton)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/provincial/offers/create?applicationNumber=321&packageNumber=PKG-1&packageNumbers=PKG-1%2CPKG-2&offeringClientNumber=00011122&region=12',
    )
  })

  it('disables Create Offer when application cannot create offers', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      canCreateOffers: false,
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const createOfferButton = await screen.findByRole('button', { name: /Create offer/i })
    expect(createOfferButton).toBeDisabled()
  })

  it('disables Create Offer until the application has at least one package', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const createOfferButton = await screen.findByRole('button', { name: /Create offer/i })
    expect(createOfferButton).toBeDisabled()
  })

  it('disables Create Offer for industry users', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const createOfferButton = await screen.findByRole('button', { name: /Create offer/i })
    expect(createOfferButton).toBeDisabled()
  })

  it('does not expose the retired Create Permit action on exemption detail', async () => {
    mockedFetchProvincialExemptionDetail.mockResolvedValue(exemptionDetail)

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Exemption summary')
    expect(screen.queryByRole('button', { name: /Create permit/i })).not.toBeInTheDocument()
  })
})
