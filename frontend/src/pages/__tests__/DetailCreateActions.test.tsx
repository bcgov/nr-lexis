import { render, screen } from '@testing-library/react'
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

describe('Detail Quick Action Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: defaultCanPerform }))
  })

  it('does not expose the retired Create Offer shortcut on application detail', async () => {
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

    expect(await screen.findByRole('tab', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create offer/i })).not.toBeInTheDocument()
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
