import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { FederalApplicationDetail, ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import FederalApplicationDetailsPage from '@/pages/FederalApplicationDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchFederalApplicationDetail,
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
} from '@/service/federal-application-documents-service'
import { fetchApplicationPackageScales } from '@/service/provincial-application-items-service'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
} from '@/service/federal-application-remarks-service'
import {
  fetchExemptionDocuments,
  openExemptionDocument,
  removeExemptionDocument,
} from '@/service/provincial-exemption-documents-service'
import {
  addApplicationToExemption,
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  removeApplicationFromExemption,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  saveFederalPermit,
  updateFederalApplicationStatus,
} from '@/service/federal-application-mutation-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

const openDocumentUploadModal = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
  await screen.findByRole('complementary', { name: 'Add documents' })
}

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchFederalApplicationDetail: vi.fn(),
  fetchProvincialApplicationDetail: vi.fn(),
  fetchProvincialExemptionDetail: vi.fn(),
  releaseApplicationEditLock: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn().mockResolvedValue(null),
  fetchApplicationClientLocations: vi.fn().mockResolvedValue([]),
  fetchExemptionClientData: vi.fn().mockResolvedValue(null),
  fetchExemptionClientLocations: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn(),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-detail-service', () => ({
  addApplicationToExemption: vi.fn(),
  approveExemptions: vi.fn(),
  fetchExemptionApplications: vi.fn(),
  fetchExemptionBlanketOicTotals: vi.fn(),
  fetchExemptionEditContext: vi.fn(),
  fetchExemptionPermits: vi.fn(),
  removeApplicationFromExemption: vi.fn(),
  sendExemptionApprovalEmails: vi.fn(),
  updateExemption: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

vi.mock('@/service/federal-application-documents-service', () => ({
  fetchFederalApplicationDocuments: vi.fn(),
  openFederalApplicationDocument: vi.fn(),
  removeFederalApplicationDocument: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateAdminUpload: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationPackageScales: vi.fn(),
}))

vi.mock('@/service/federal-application-remarks-service', () => ({
  fetchFederalApplicationRemarks: vi.fn(),
  saveFederalApplicationRemark: vi.fn(),
}))

vi.mock('@/service/federal-application-mutation-service', () => ({
  saveFederalPermit: vi.fn(),
  updateFederalApplicationStatus: vi.fn(),
}))

vi.mock('@/service/shipping-reference-service', () => ({
  fetchShippingReferenceOptions: vi.fn(),
  formatShippingReferenceOption: (option: { code: string; name: string }) =>
    `${option.name} (${option.code})`,
  shippingReferenceLabel: (
    options: Array<{ code: string; name: string }> | undefined,
    code: string | null | undefined,
  ) => {
    const normalizedCode = code?.trim().toUpperCase() ?? ''
    const option = options?.find((candidate) => candidate.code === normalizedCode)
    return option ? `${option.name} (${option.code})` : normalizedCode
  },
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchFederalApplicationDetail = vi.mocked(fetchFederalApplicationDetail)
const mockedFetchProvincialExemptionDetail = vi.mocked(fetchProvincialExemptionDetail)
const mockedReleaseApplicationEditLock = vi.mocked(releaseApplicationEditLock)
const mockedFetchFederalApplicationDocuments = vi.mocked(fetchFederalApplicationDocuments)
const mockedOpenFederalApplicationDocument = vi.mocked(openFederalApplicationDocument)
const mockedRemoveFederalApplicationDocument = vi.mocked(removeFederalApplicationDocument)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateAdminUpload = vi.mocked(validateAdminUpload)
const mockedFetchApplicationPackageScales = vi.mocked(fetchApplicationPackageScales)
const mockedFetchFederalApplicationRemarks = vi.mocked(fetchFederalApplicationRemarks)
const mockedSaveFederalApplicationRemark = vi.mocked(saveFederalApplicationRemark)
const mockedSaveFederalPermit = vi.mocked(saveFederalPermit)
const mockedUpdateFederalApplicationStatus = vi.mocked(updateFederalApplicationStatus)
const mockedFetchShippingReferenceOptions = vi.mocked(fetchShippingReferenceOptions)
const mockedFetchExemptionDocuments = vi.mocked(fetchExemptionDocuments)
const mockedOpenExemptionDocument = vi.mocked(openExemptionDocument)
const mockedRemoveExemptionDocument = vi.mocked(removeExemptionDocument)
const mockedFetchExemptionApplications = vi.mocked(fetchExemptionApplications)
const mockedFetchExemptionBlanketOicTotals = vi.mocked(fetchExemptionBlanketOicTotals)
const mockedFetchExemptionEditContext = vi.mocked(fetchExemptionEditContext)
const mockedFetchExemptionPermits = vi.mocked(fetchExemptionPermits)
const mockedUpdateExemption = vi.mocked(updateExemption)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)

const selectDetailTab = async (name: string) => {
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

// Documents have no edit mode: their actions show whenever the user may use them.
const waitForDocumentsSection = async (): Promise<void> => {
  await waitFor(() => expect(document.querySelector('.detail-documents-section')).not.toBeNull())
}

const enterFederalStatusEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit federal status' }))
}

const enterFederalRemarkEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Add remark' }))
}

const renderFederalDataRouter = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/federal/:applicationNumber',
        element: (
          <>
            <FederalApplicationDetailsPage />
            <Link to="/elsewhere">Leave federal application</Link>
          </>
        ),
      },
      { path: '/elsewhere', element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: ['/federal/888'] },
  )
  render(<RouterProvider router={router} />)
  return router
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

const federalDetail: FederalApplicationDetail = {
  applicationNumber: 888,
  federalApplicationNumber: 'FED-888',
  statusCode: 'SUBMITTED',
  statusDescription: 'Submitted',
  ownerClientNumber: '00021234',
  ownerClientLocationCode: '01',
  ownerApplicantType: 'A',
  ownerContactName: 'Owner Contact',
  ownerCompanyName: 'Owner Company',
  ownerClientContext: {
    address: '1 Owner Road',
    city: 'Victoria',
    province: 'BC',
    postalCode: 'V8V 1V1',
    country: 'Canada',
    phone: '250-555-0101',
    fax: '250-555-0102',
    email: 'owner@example.test',
  },
  agentClientNumber: '00011234',
  agentClientLocationCode: '01',
  agentApplicantType: 'A',
  agentContactName: 'Agent Contact',
  agentCompanyName: 'Agent Company',
  agentClientContext: {
    address: '2 Agent Avenue',
    city: 'Nanaimo',
    province: 'BC',
    postalCode: 'V9R 1R1',
    country: 'Canada',
    phone: '250-555-0201',
    fax: '250-555-0202',
    email: 'agent@example.test',
  },
  exemptionNumber: 'EX-555',
  exemptionType: 'Section 1',
  exemptionReason: 'Economic',
  region: 'RSC',
  productType: 'Standing Timber',
  applicationDate: '2026-01-10',
  receivedDate: '2026-01-11',
  listingDate: '2026-01-12',
  termDays: 14,
  logLocation: 'Forest service road',
  ageClass: 'Mature',
  averageLogVolume: 12.5,
  applicationVolume: 42,
  endUse: 'HE/PL',
  author: 'IDIR\\TESTER',
  readOnly: false,
  locked: false,
  lockHeldByCurrentUser: true,
  lockedBy: null,
  lockMessage: null,
  packages: ['PKG-1'],
  remarks: ['Remark'],
  offers: [
    {
      offerNumber: '81001',
      companyName: 'Federal Buyer',
      receivedDate: '2026-01-13',
    },
  ],
  federalPermit: {
    permitNumber: 90001,
    permitIssueDate: '2026-02-01',
    destinationCountry: 'US',
    transportType: 'S',
    transportName: 'Truck',
    shippingDate: '2026-02-10',
    portOfExport: 'VA',
    otherPortOfExport: null,
  },
}

describe('Exemption and Federal Detail Document Actions', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialExemptionDetail.mockResolvedValue(exemptionDetail)
    mockedFetchFederalApplicationDetail.mockResolvedValue(federalDetail)
    mockedReleaseApplicationEditLock.mockResolvedValue(undefined)
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchExemptionApplications.mockResolvedValue({
      applications: [],
      containsUnmanu: false,
      ownerNumber: '00055566',
    })
    mockedFetchExemptionPermits.mockResolvedValue([
      {
        permitNumber: 'P1',
        permitVolume: '25.5',
        permitStatus: 'Active',
        permitIssueDate: '12-Jul-2026',
        canViewPermit: true,
      },
    ])
    mockedFetchExemptionBlanketOicTotals.mockResolvedValue({
      requestedVolume: '500.0',
      completedVolume: '125.5',
    })
    mockedFetchExemptionEditContext.mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'TYPE1', label: 'Type 1' }],
      exemptionStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      regions: [],
    })
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM-1',
        species: 'Fir',
        pieces: 12,
        grade: 'A',
        volume: '34.5',
        id: 'SCALE-1',
        cascadeSplitCode: '',
      },
    ])
    mockedFetchFederalApplicationRemarks.mockResolvedValue([
      {
        remarkId: 44,
        remark: 'Review note',
        user: 'idir\\reviewer',
        date: '2026-07-18T04:37:21Z',
      },
    ])
    mockedSaveFederalApplicationRemark.mockResolvedValue({
      success: true,
      message: 'Federal application remark saved.',
      remark: {
        remarkId: 45,
        remark: 'New note',
        user: 'idir\\approver',
        date: '2026-07-10T21:00:00Z',
      },
      errors: [],
    })
    mockedSaveFederalPermit.mockResolvedValue({
      success: true,
      message: 'Federal permit updated.',
      errors: [],
    })
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: true,
      message: 'Federal application status updated.',
      errors: [],
    })
    mockedFetchShippingReferenceOptions.mockResolvedValue({
      countries: [
        { code: 'CA', name: 'Canada' },
        { code: 'US', name: 'United States' },
      ],
      transportTypes: [
        { code: 'S', name: 'Ship' },
        { code: 'T', name: 'Truck' },
      ],
      ports: [
        { code: 'OT', name: 'Other' },
        { code: 'VA', name: 'Vancouver' },
      ],
    })
    mockedOpenExemptionDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'exemption-doc.pdf',
    })
    mockedOpenFederalApplicationDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'federal-doc.pdf',
    })
    mockedRemoveExemptionDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedRemoveFederalApplicationDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
  })

  it('shows the embedded exemption upload panel with the exemption detail header', async () => {
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

    for (const tabName of ['Exemption details', 'Documents', 'Permits']) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    const exemptionHeading = screen.getByRole('heading', {
      name: 'Exemption EX-777',
      level: 1,
    })
    const exemptionHeader = exemptionHeading.closest('header')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(exemptionHeader).toBeTruthy()
    expect(within(exemptionHeader as HTMLElement).getByText('Author: —')).toBeInTheDocument()
    expect(within(exemptionHeader as HTMLElement).getByText('Active')).toHaveAttribute(
      'data-status-variant',
      'positive',
    )
    expect(screen.queryByLabelText('Exemption highlights')).not.toBeInTheDocument()
    const exemptionSummaryTile = screen
      .getByRole('heading', { name: 'Exemption details' })
      .closest('.cds--tile')
    expect(exemptionSummaryTile).toBeTruthy()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Exemption type'),
    ).toBeInTheDocument()
    expect(exemptionHeading).toHaveTextContent('EX-777')
    expect(
      within(exemptionSummaryTile as HTMLElement).queryByText('Application number'),
    ).not.toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).queryByText('Application status'),
    ).not.toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Approval volume (m³)'),
    ).toBeInTheDocument()
    await selectDetailTab('Permits')
    expect(screen.getByText('Balance remaining (m³)')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Exemption Document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Approved Exemption Report' })).toBeNull()

    await selectDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit documents' })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'No documents for this exemption', level: 2 }),
    ).toBeInTheDocument()
  })

  it('restores the exemption tab after a conflict refresh', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/exemption/EX-777',
            state: { lexisDetailTab: 'documents' },
          },
        ]}
      >
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('shows the exemption document modal to a scoped Provincial Submitter', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00055566'],
        }),
        canPerform: (action: string) => action === '/fileExemptionUpload',
      }),
    )

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

    await selectDetailTab('Documents')

    await openDocumentUploadModal()
    expect(screen.getByLabelText('Document File')).toBeInTheDocument()
  })

  it('keeps staff exemption controls away from a scoped Provincial Submitter', async () => {
    const submitterActions = new Set([
      '/exemptionDetails',
      '/fileExemptionUpload',
      '/applicationDetails',
    ])
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    mockedFetchExemptionApplications.mockResolvedValue({
      applications: [
        {
          applicationNumber: '654',
          requestedVolume: '12.5',
          scaleVolume: '',
          locked: false,
          jurisdiction: 'P',
          ownerClientNumber: '00055566',
          agentClientNumber: '',
          ownerClientLocationCode: '00',
          agentClientLocationCode: '',
          applicantTypeCode: 'O',
          ownerContactName: '',
          agentContactName: '',
          ownerCompanyName: '',
          agentCompanyName: '',
        },
      ],
      containsUnmanu: false,
      ownerNumber: '00055566',
    })
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [{ id: '700', name: 'exemption-doc.pdf', description: 'API file', type: 'Attachment' }],
      source: 'api',
    })
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00055566'],
        }),
        canPerform: (action: string) => submitterActions.has(action),
      }),
    )

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

    await selectDetailTab('Applications')
    expect(await screen.findByRole('link', { name: '654' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve exemption' })).not.toBeInTheDocument()

    await selectDetailTab('Exemption details')
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
  })

  it.each([
    ['a NEW exemption', { exemptionStatusCode: 'NEW', exemptionStatusDescription: 'New' }],
    [
      'a Blanket OIC exemption',
      { exemptionTypeCode: 'B', exemptionTypeDescription: 'BOIC', blanketOic: true },
    ],
  ])(
    'does not offer exemption uploads to a Provincial Submitter on %s',
    async (_label, overrides) => {
      mockedFetchProvincialExemptionDetail.mockResolvedValue({ ...exemptionDetail, ...overrides })
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({
            principal: 'bceid\\scoped-submitter',
            roles: ['LEXIS_PROVINCIAL_SUBMITTER_00055566'],
          }),
          canPerform: (action: string) => action === '/fileExemptionUpload',
        }),
      )

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

      await selectDetailTab('Documents')
      expect(await screen.findByText('No documents for this exemption')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    },
  )

  it('keeps exemption uploads available to staff on NEW exemptions', async () => {
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })

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

    await selectDetailTab('Documents')
    await openDocumentUploadModal()
    expect(screen.getByLabelText('Document File')).toBeInTheDocument()
  })

  it('renders semantic empty states for empty exemption detail collections', async () => {
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      permitNumbers: [],
      remarks: [],
    })
    mockedFetchExemptionPermits.mockResolvedValue([])

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

    await screen.findByRole('heading', { name: 'Exemption EX-777', level: 1 })

    await selectDetailTab('Applications')
    expect(
      await screen.findByRole('heading', { name: 'No applications found', level: 3 }),
    ).toBeInTheDocument()

    await selectDetailTab('Permits')
    expect(
      await screen.findByRole('heading', { name: 'No permits for this exemption', level: 3 }),
    ).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this exemption', level: 2 }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
  })

  it('confirms application links with the Figma titles inside the Applications card', async () => {
    const linkedApplication = {
      applicationNumber: '654',
      requestedVolume: '12.5',
      scaleVolume: '',
      locked: false,
      jurisdiction: 'P',
      ownerClientNumber: '00055566',
      agentClientNumber: '',
      ownerClientLocationCode: '00',
      agentClientLocationCode: '',
      applicantTypeCode: 'O',
      ownerContactName: '',
      agentContactName: '',
      ownerCompanyName: '',
      agentCompanyName: '',
    }
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    mockedFetchExemptionApplications.mockResolvedValue({
      applications: [linkedApplication],
      containsUnmanu: false,
      ownerNumber: '00055566',
    })
    vi.mocked(addApplicationToExemption).mockResolvedValueOnce({
      success: true,
      message: 'Application linked.',
      exemptionNumber: 'EX-777',
      errors: [],
      warnings: [],
    })
    vi.mocked(removeApplicationFromExemption).mockResolvedValueOnce({
      success: true,
      message: 'Application unlinked.',
      exemptionNumber: 'EX-777',
      errors: [],
      warnings: [],
    })

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

    await selectDetailTab('Applications')
    const applications = (
      await screen.findByRole('heading', { name: 'Applications', level: 2 })
    ).closest('.cds--tile') as HTMLElement
    await userEvent.click(within(applications).getByRole('button', { name: 'Add application' }))
    await userEvent.type(await screen.findByLabelText('Application number'), '655')
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
    expect(await within(applications).findByText('Application added')).toBeInTheDocument()

    await userEvent.click(within(applications).getByRole('button', { name: 'Remove' }))
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to remove this application?',
    })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }))
    expect(await within(applications).findByText('Application removed')).toBeInTheDocument()
  })

  it('checks the application number when Save is clicked and asks before dropping it', async () => {
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

    await selectDetailTab('Applications')
    const addButton = screen.getByRole('button', { name: 'Add application' })
    expect(addButton).toBeEnabled()
    await userEvent.click(addButton)
    const applicationInput = await screen.findByLabelText('Application number')
    expect(applicationInput).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(applicationInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('Application number is required').length).toBeGreaterThan(0)
    expect(applicationInput).toHaveFocus()
    expect(addApplicationToExemption).not.toHaveBeenCalled()

    await userEvent.type(applicationInput, '654')
    expect(applicationInput).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(applicationInput).toHaveValue('654')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    await waitFor(() => expect(addButton).toHaveFocus())
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
  })

  it('shows an add application failure inline and clears it when the panel is cancelled', async () => {
    vi.mocked(addApplicationToExemption).mockResolvedValueOnce({
      success: false,
      message: '',
      exemptionNumber: 'EX-777',
      errors: ['Applications must have a status of approved.'],
      warnings: [],
    })
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

    await selectDetailTab('Applications')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    const applicationInput = await screen.findByLabelText('Application number')
    expect(screen.getByText('Approved applications for client 00055566 only.')).toBeVisible()
    await userEvent.type(applicationInput, '654')
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    const message = 'Application 654 is not approved. Only approved applications can be added.'
    expect(await screen.findAllByText(message)).toHaveLength(1)
    expect(applicationInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Application could not be added')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument())
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    expect(await screen.findByLabelText('Application number')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it.each([
    [
      'Application 654 does not exist',
      'No application found with number 654. Check the number and try again.',
    ],
    [
      'Application cannot be added to this exemption because its owner or agent client details do not match the other applications.',
      'Application 654 belongs to a different client. This exemption only includes applications from client 00055566.',
    ],
    [
      'Application listing date has not passed.',
      "Application 654 can't be added while it's being advertised or has a valid offer",
    ],
    [
      'Application has valid offers and cannot be added to an exemption.',
      "Application 654 can't be added while it's being advertised or has a valid offer",
    ],
    [
      'Insufficient privileges to add this application.',
      "Application 654 can't be added. Insufficient privileges to add this application.",
    ],
    [
      '',
      "Application 654 can't be added. Check that it's approved, belongs to client 00055566 and isn't on another exemption.",
    ],
  ])('explains the add application failure "%s" on the field', async (serverError, copy) => {
    vi.mocked(addApplicationToExemption).mockResolvedValueOnce({
      success: false,
      message: '',
      exemptionNumber: 'EX-777',
      errors: [serverError],
      warnings: [],
    })
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

    await selectDetailTab('Applications')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '654')
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(await screen.findByText(copy)).toBeVisible()
    // The error text is not a live region, so focus returns to the field it describes.
    await waitFor(() => expect(applicationInput).toHaveFocus())
    expect(applicationInput).toHaveAccessibleDescription(expect.stringContaining(copy))
    await userEvent.type(applicationInput, '1')
    expect(screen.queryByText(copy)).not.toBeInTheDocument()
  })

  it.each([
    [
      'a permission error',
      { response: { status: 403, data: { message: 'Forbidden' } } },
      'You do not have permission to add application 654 to this exemption',
      false,
    ],
    [
      'a validation error',
      { response: { status: 400, data: { detail: 'Expired exemptions are read-only.' } } },
      "Application 654 can't be added. Expired exemptions are read-only.",
      false,
    ],
    [
      'a server error',
      { response: { status: 503, data: {} } },
      'Adding application 654 could not be confirmed. Check the Applications list before trying again.',
      true,
    ],
    [
      'a lost response',
      new Error('Network Error'),
      'Adding application 654 could not be confirmed. Check the Applications list before trying again.',
      true,
    ],
  ])('explains %s when adding an application', async (_case, error, copy, refreshes) => {
    vi.mocked(addApplicationToExemption).mockRejectedValueOnce(error)
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

    await selectDetailTab('Applications')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '654')
    const applicationLoads = mockedFetchExemptionApplications.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(await screen.findByText(copy)).toBeVisible()
    await waitFor(() => expect(applicationInput).toHaveFocus())
    // Only an unconfirmed link reloads the list, since it may have been saved.
    expect(mockedFetchExemptionApplications.mock.calls.length > applicationLoads).toBe(refreshes)
  })

  it.each([
    [
      'This application is already assigned to an exemption.',
      'EX-900',
      'Application 654 is already on exemption EX-900',
    ],
    [
      'This application is already assigned to an exemption.',
      'EX-777',
      'Application 654 is already on this exemption',
    ],
    // The server checks the approved status first, and an application on an exemption is Exempted.
    [
      'Applications must have a status of approved.',
      'EX-900',
      'Application 654 is already on exemption EX-900',
    ],
  ])(
    'answers "%s" by naming the exemption %s the application is on',
    async (serverError, assignedExemptionNumber, copy) => {
      vi.mocked(addApplicationToExemption).mockResolvedValueOnce({
        success: false,
        message: '',
        exemptionNumber: 'EX-777',
        errors: [serverError],
        warnings: [],
      })
      vi.mocked(fetchProvincialApplicationDetail).mockResolvedValueOnce({
        exemptionNumber: assignedExemptionNumber,
      } as Awaited<ReturnType<typeof fetchProvincialApplicationDetail>>)
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

      await selectDetailTab('Applications')
      await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
      await userEvent.type(await screen.findByLabelText('Application number'), '654')
      await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

      expect(await screen.findByText(copy)).toBeVisible()
      expect(fetchProvincialApplicationDetail).toHaveBeenCalledWith('654')
    },
  )

  it('rejects malformed associated application numbers without rewriting them', async () => {
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

    await selectDetailTab('Applications')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))

    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '654x')
    expect(
      screen.queryByText('Application number must be a positive whole number'),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(applicationInput).toHaveValue('654x')
    expect(
      screen.getAllByText('Application number must be a positive whole number').length,
    ).toBeGreaterThan(0)
    expect(addApplicationToExemption).not.toHaveBeenCalled()
  })

  it('rejects associated application numbers beyond the Oracle boundary', async () => {
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

    await selectDetailTab('Applications')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))

    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '12345678901')
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(applicationInput).toHaveValue('12345678901')
    expect(
      screen.getAllByText('Application number must be 10 digits or fewer').length,
    ).toBeGreaterThan(0)
    expect(addApplicationToExemption).not.toHaveBeenCalled()
  })

  it('renders authoritative permit metadata and omits rows without record access', async () => {
    mockedFetchExemptionPermits.mockResolvedValue([
      {
        permitNumber: '900101',
        permitVolume: '25.5',
        permitStatus: 'Active',
        permitIssueDate: '12-Jul-2026',
        canViewPermit: true,
      },
      {
        permitNumber: '900102',
        permitVolume: '14.0',
        permitStatus: 'Complete',
        permitIssueDate: '10-Jul-2026',
        canViewPermit: false,
      },
    ])

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777?permitFilter=not-a-match']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Permits')
    expect(
      await screen.findByRole('region', { name: 'Related exemption permits' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Volume (m³)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Issue date' })).toBeInTheDocument()
    expect(screen.getByText('900101 (Pending)')).toBeInTheDocument()
    expect(screen.getByText('25.5')).toBeInTheDocument()
    expect(screen.getByText('12-Jul-2026')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter permits')).not.toBeInTheDocument()
    expect(screen.queryByText('900102')).not.toBeInTheDocument()
    expect(screen.queryByText('10-Jul-2026')).not.toBeInTheDocument()
  })

  it('keeps a visible permit as text when route permission is unavailable', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/permitSearch',
      }),
    )

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

    await selectDetailTab('Permits')
    expect(await screen.findByText('P1 (Pending)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'P1 (Pending)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('omits placeholder totals and their lookup for Blanket OIC permits', async () => {
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      exemptionTypeCode: 'B',
      exemptionTypeDescription: 'Blanket Order in Council',
      blanketOic: true,
    })

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

    await selectDetailTab('Permits')
    expect(await screen.findByText('P1 (Pending)')).toBeInTheDocument()
    const permits = within(screen.getByRole('tabpanel'))
    expect(permits.getByRole('heading', { name: 'Permits' })).toBeInTheDocument()
    expect(permits.queryByRole('heading', { name: 'Exemption details' })).not.toBeInTheDocument()
    expect(permits.queryByLabelText('Blanket OIC permit volume totals')).not.toBeInTheDocument()
    expect(permits.queryByText('Approved volume (m³)')).not.toBeInTheDocument()
    expect(permits.queryByText('Sum of completed permits (m³)')).not.toBeInTheDocument()
    expect(permits.queryByText('Balance remaining (m³)')).not.toBeInTheDocument()
    expect(permits.queryByText('Blanket OIC totals unavailable')).not.toBeInTheDocument()
    expect(mockedFetchExemptionBlanketOicTotals).not.toHaveBeenCalled()
  })

  it('keeps application and fee eligibility unavailable when associated applications fail', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN'] }),
        canPerform: () => true,
      }),
    )
    mockedFetchExemptionApplications.mockRejectedValue(new Error('Oracle unavailable'))
    mockedFetchExemptionEditContext.mockResolvedValue({
      rateOverrideEnabled: true,
      fixedFeeRate: '12.50',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    mockedUpdateExemption.mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'EX-777',
      errors: [],
      warnings: [],
    })

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

    await selectDetailTab('Applications')
    expect(
      await screen.findByRole('heading', { name: 'Applications unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No applications found', level: 3 }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Unable to retrieve applications associated with this exemption.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()

    await selectDetailTab('Fees')
    expect(
      await screen.findByRole('heading', { name: 'Fee eligibility unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No fee rate override', level: 3 }),
    ).not.toBeInTheDocument()

    await selectDetailTab('Exemption details')
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mockedUpdateExemption).toHaveBeenCalledTimes(1))
    expect(mockedUpdateExemption).toHaveBeenCalledWith(
      expect.objectContaining({ manageFeeRate: false }),
    )
  })

  it('keeps exemption document lookup failure in the affected tab', async () => {
    mockedFetchExemptionDocuments.mockRejectedValue(new Error('Oracle unavailable'))

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

    expect(await screen.findAllByText('Documents unavailable')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Exemption highlights')).not.toBeInTheDocument()

    await selectDetailTab('Documents')
    const launcher = screen.getByRole('button', { name: 'Add documents' })
    expect(launcher).toBeEnabled()
    await userEvent.click(launcher)
    expect(await screen.findByRole('complementary', { name: 'Add documents' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(
      await screen.findByRole('heading', { name: 'Documents unavailable', level: 2 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No documents for this exemption', level: 2 }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'Documents unavailable', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
  })

  it('opens exemption document from API response', async () => {
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '700',
          name: 'exemption-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const previewTarget = {
      closed: false,
      close: vi.fn(),
      location: { replace: vi.fn() },
      opener: null,
    } as unknown as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(previewTarget)
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:exemption-document')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777?documentsFilter=not-a-match']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('exemption-doc.pdf')
    expect(screen.queryByLabelText('Filter document rows')).not.toBeInTheDocument()
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenExemptionDocument).toHaveBeenCalledWith('700', 'exemption-doc.pdf', 'EX-777')
    })
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() =>
      expect(previewTarget.location.replace).toHaveBeenCalledWith('blob:exemption-document'),
    )
    expect(objectUrlSpy).toHaveBeenCalled()
    expect(previewTarget.close).not.toHaveBeenCalled()
  })

  it('downloads an exemption document without opening a preview tab', async () => {
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [{ id: '701', name: 'download.pdf', description: '', type: 'Attachment' }],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

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

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('download.pdf')).closest('tr') as HTMLElement
    await userEvent.click(within(documentRow).getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(mockedOpenExemptionDocument).toHaveBeenCalledWith('701', 'download.pdf', 'EX-777'),
    )
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    expect(objectUrlSpy).toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes exemption documents and refreshes rows', async () => {
    mockedFetchExemptionDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '700',
            name: 'exemption-doc.pdf',
            description: 'remove me',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })

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

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(confirmation).toHaveTextContent(
      'exemption-doc.pdf will be deleted. This action cannot be undone.',
    )
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedRemoveExemptionDocument).toHaveBeenCalledWith('700', 'EX-777')
      expect(mockedFetchExemptionDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('exemption-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('keeps an exemption delete result after switching sections', async () => {
    mockedFetchExemptionDocuments
      .mockResolvedValueOnce({
        rows: [{ id: '700', name: 'exemption-doc.pdf', description: '', type: 'Attachment' }],
        source: 'api',
      })
      .mockResolvedValueOnce({ rows: [], source: 'api' })

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

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('exemption-doc.pdf')).closest('tr')
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    )
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Document deleted.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel', { name: 'Documents' })).getByText('Document deleted.'),
    ).toBeInTheDocument()

    await selectDetailTab('Exemption details')
    await selectDetailTab('Documents')
    expect(screen.getByText('Document deleted.')).toBeInTheDocument()
  })

  it('keeps linked application documents read-only on the exemption aggregate', async () => {
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '704',
          name: 'application-doc.pdf',
          description: 'linked application copy',
          type: 'Application document',
          source: 'application',
          deletable: false,
        },
      ],
      source: 'api',
    })

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

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('application-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByText('Application')).toBeInTheDocument()
    expect(
      within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
  })

  it('keeps exemption delete available to admins without file upload permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileExemptionUpload',
      }),
    )
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '701',
          name: 'locked-exemption-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

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

    await selectDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Exemption Document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    const documentName = await screen.findByText('locked-exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeEnabled()
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
  })

  it('allows exemption approvers to open documents without upload or delete access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: (action: string) => action === '/exemptionDetails',
      }),
    )
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '702',
          name: 'approver-exemption-doc.pdf',
          description: 'role controlled',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

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

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('approver-exemption-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    await userEvent.click(within(documentRow as HTMLElement).getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(mockedOpenExemptionDocument).toHaveBeenCalledWith(
        '702',
        'approver-exemption-doc.pdf',
        'EX-777',
      )
    })
    expect(
      within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })

  it('allows exemption uploads but denies document delete after expiry', async () => {
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'EXP',
      exemptionStatusDescription: 'Expired',
    })
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '703',
          name: 'expired-exemption-doc.pdf',
          description: 'expired',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

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

    await selectDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    const documentRow = (await screen.findByText('expired-exemption-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })

  it('adds exemption documents in the Figma drawer and saves them without a review step', async () => {
    mockedFetchExemptionDocuments
      .mockResolvedValueOnce({ rows: [], source: 'api' })
      .mockResolvedValue({
        rows: [
          {
            id: '704',
            name: 'permission.pdf',
            description: 'Letter of permission',
            type: 'Attachment',
            source: 'exemption',
          },
        ],
        source: 'api',
      })
    mockedValidateAdminUpload.mockResolvedValue({ status: 'validated' })
    mockedSubmitAdminUpload.mockResolvedValue({ message: 'Exemption upload persisted.' })

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

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this exemption', level: 2 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Documents stay with the record as it moves through the application, exemption and permit stages.',
      ),
    ).toBeInTheDocument()

    await openDocumentUploadModal()
    const panel = screen.getByRole('complementary', { name: 'Add documents' })
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    const file = new File(['test'], 'permission.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.type(screen.getByLabelText(/Document description/), 'Letter of permission')
    expect(screen.queryByRole('button', { name: 'Review upload' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save documents' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save documents' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'exemption',
        expect.objectContaining({
          exemptionNumber: 'EX-777',
          file,
          fileDescription: 'Letter of permission',
        }),
      )
    })
    expect(await screen.findByText('1 document saved.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel', { name: 'Documents' })).getByText('1 document saved.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Exemption upload persisted.')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Add documents' })).not.toBeInTheDocument()
    expect(await screen.findByText('permission.pdf')).toBeInTheDocument()
  }, 15000)

  it('lists exemption documents in the Figma table, typed by where each was added', async () => {
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '705',
          name: 'from-application.pdf',
          description: '',
          type: 'Inspection Files',
          source: 'application',
          deletable: false,
        },
      ],
      source: 'api',
    })

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

    await selectDetailTab('Documents')
    const row = (await screen.findByText('from-application.pdf')).closest('tr') as HTMLElement
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual(
      ['File name', 'Description', 'Type', 'Actions'],
    )
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('—')
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('Application')
    expect(within(row).queryByText('Inspection Files')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument()
    const addDocuments = screen.getByRole('button', { name: 'Add documents' })
    expect(
      addDocuments.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders federal application details with the legacy tab structure', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    for (const tabName of [
      'Applicant',
      'Agent',
      'Application',
      'Items',
      'Offers',
      'Remarks',
      'Documents',
      'Shipping details',
    ]) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }

    const federalHeading = screen.getByRole('heading', {
      name: 'Federal application FED-888',
      level: 1,
    })
    const federalHeader = federalHeading.closest('header')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(federalHeader).toBeTruthy()
    expect(
      within(federalHeader as HTMLElement).getByText('Check and manage this federal application'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to Federal application search' }),
    ).toHaveAttribute('href', '/federal')
    expect(within(federalHeader as HTMLElement).getByText('Submitted')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Federal Search results' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Provincial Application' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
    expect(await screen.findByText('Owner Contact')).toBeInTheDocument()
    expect(screen.getByText('1 Owner Road')).toBeInTheDocument()
    expect(screen.getByText('250-555-0101')).toBeInTheDocument()
    expect(screen.getByText('250-555-0102')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    const ownerTile = screen
      .getByRole('heading', { name: 'Applicant', level: 2 })
      .closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(
      within(ownerTile as HTMLElement).getByText('Owner Company · 00021234'),
    ).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('Client')).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).queryByText('Company name')).not.toBeInTheDocument()
    const ownerApplicantTypeField = within(ownerTile as HTMLElement)
      .getByText('Applicant type')
      .closest('.record-field')
    expect(ownerApplicantTypeField).toBeTruthy()
    expect(within(ownerApplicantTypeField as HTMLElement).getByText('Agent')).toBeInTheDocument()

    await selectDetailTab('Agent')
    expect(await screen.findByText('2 Agent Avenue')).toBeInTheDocument()
    expect(screen.getByText('250-555-0201')).toBeInTheDocument()
    expect(screen.getByText('250-555-0202')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
    const agentTile = screen.getByRole('heading', { name: 'Agent', level: 2 }).closest('.cds--tile')
    expect(agentTile).toBeTruthy()
    expect(
      within(agentTile as HTMLElement).getByText('Agent Company · 00011234'),
    ).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).getByText('Client')).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).queryByText('Company name')).not.toBeInTheDocument()
    const agentApplicantTypeField = within(agentTile as HTMLElement)
      .getByText('Applicant type')
      .closest('.record-field')
    expect(agentApplicantTypeField).toBeTruthy()
    expect(within(agentApplicantTypeField as HTMLElement).getByText('Agent')).toBeInTheDocument()

    await selectDetailTab('Application')
    expect(await screen.findByText('IDIR\\TESTER')).toBeInTheDocument()
    expect(screen.getByText('Exemption term (days)')).toBeInTheDocument()

    await selectDetailTab('Items')
    expect(screen.getByText('Average log volume (m³)')).toBeInTheDocument()
    expect(screen.getByText('Application volume (m³)')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Summary of scale' })).toBeInTheDocument()
    expect(mockedFetchApplicationPackageScales).toHaveBeenCalledWith('PKG-1')
    expect(await screen.findByText('TM-1')).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this application', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit documents' })).not.toBeInTheDocument()
  })

  it('loads independent federal detail sections concurrently', async () => {
    let resolveScales: (() => void) | undefined
    let resolveDocuments: (() => void) | undefined
    let resolveRemarks: (() => void) | undefined

    mockedFetchApplicationPackageScales.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScales = () => resolve([])
        }),
    )
    mockedFetchFederalApplicationDocuments.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDocuments = () => resolve({ rows: [], source: 'api' })
        }),
    )
    mockedFetchFederalApplicationRemarks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemarks = () => resolve([])
        }),
    )

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })
    await waitFor(() => {
      expect(mockedFetchApplicationPackageScales).toHaveBeenCalledWith('PKG-1')
      expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledWith('888')
      expect(mockedFetchFederalApplicationRemarks).toHaveBeenCalledWith('888')
    })
    expect(screen.getByText('Refreshing federal application detail…')).toBeInTheDocument()

    resolveScales?.()
    resolveDocuments?.()
    resolveRemarks?.()

    await waitFor(() => {
      expect(screen.queryByText('Refreshing federal application detail…')).not.toBeInTheDocument()
    })
  })

  it('restores the federal application tab after a conflict refresh', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/federal/888',
            state: { lexisDetailTab: 'remarks' },
          },
        ]}
      >
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Remarks' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByText('Review note')).toBeInTheDocument()
  })

  it('hides residual agent data for owner-filed federal applications', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      ownerApplicantType: 'O',
      agentClientNumber: federalDetail.ownerClientNumber,
      agentClientLocationCode: federalDetail.ownerClientLocationCode,
      agentApplicantType: 'A',
      agentContactName: null,
      agentCompanyName: federalDetail.ownerCompanyName,
      agentClientContext: federalDetail.ownerClientContext,
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    const ownerTile = screen
      .getByRole('heading', { name: 'Applicant', level: 2 })
      .closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(within(ownerTile as HTMLElement).queryByText('O')).not.toBeInTheDocument()

    await selectDetailTab('Application')
    expect(await screen.findByText('FED-888')).toBeInTheDocument()

    await selectDetailTab('Shipping details')
    expect(
      await screen.findByRole('heading', { name: 'Shipping details', level: 2 }),
    ).toBeInTheDocument()
  })

  it('shows the federal lock warning and suppresses every mutation and document control', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'NEW',
      statusDescription: 'New',
      locked: true,
      lockHeldByCurrentUser: false,
      lockedBy: 'Reviewer One',
      lockMessage:
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
    })
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: 'locked-800',
          name: 'locked-federal-doc.pdf',
          description: 'Locked document',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/currently locked for editing by Reviewer One/i),
    ).toBeInTheDocument()

    await selectDetailTab('Application')
    expect(screen.queryByRole('heading', { name: 'Update federal status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()

    await selectDetailTab('Remarks')
    expect(screen.queryByLabelText('New remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('locked-federal-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    expect(
      within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
    expect(within(documentRow as HTMLElement).getByRole('button', { name: 'Open' })).toBeEnabled()

    await selectDetailTab('Shipping details')
    expect(screen.queryByRole('button', { name: 'Edit shipping details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save federal permit' })).not.toBeInTheDocument()
    expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
    expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
  })

  it('releases the held federal application lock when the detail page unmounts', async () => {
    const rendered = render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })

    rendered.unmount()

    await waitFor(() => {
      expect(mockedReleaseApplicationEditLock).toHaveBeenCalledWith('888')
    })
  })

  it.each([
    {
      draft: 'status',
      arrange: () =>
        mockedFetchFederalApplicationDetail.mockResolvedValue({
          ...federalDetail,
          statusCode: 'NEW',
          statusDescription: 'New',
        }),
      edit: async () => {
        await selectDetailTab('Application')
        await enterFederalStatusEditMode()
        await userEvent.type(screen.getByLabelText('Remark'), 'Status draft')
      },
    },
    {
      draft: 'remark',
      arrange: () => undefined,
      edit: async () => {
        await selectDetailTab('Remarks')
        await enterFederalRemarkEditMode()
        await userEvent.type(screen.getByLabelText('New remark'), 'Remark draft')
      },
    },
    {
      draft: 'permit',
      arrange: () => undefined,
      edit: async () => {
        await selectDetailTab('Shipping details')
        await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
        await userEvent.clear(screen.getByLabelText('Transport name'))
        await userEvent.type(screen.getByLabelText('Transport name'), 'Changed transport')
      },
    },
  ])('blocks navigation for an unsaved federal $draft draft', async ({ arrange, edit }) => {
    arrange()
    const router = renderFederalDataRouter()
    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })
    await edit()

    await userEvent.click(screen.getByRole('link', { name: 'Leave federal application' }))

    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(screen.getByText('Your changes will be lost.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/elsewhere')
  })

  it('blocks navigation while a federal document remains queued', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderFederalDataRouter()
    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })
    await selectDetailTab('Documents')
    await user.click(await screen.findByRole('button', { name: 'Add documents' }))
    await user.upload(
      screen.getByLabelText('Document File'),
      new File(['unsupported'], 'evidence.exe'),
    )

    await user.click(screen.getByRole('link', { name: 'Leave federal application' }))

    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
  })

  it.each(['exemption', 'federal'] as const)(
    'asks before a tab switch discards a queued %s document',
    async (record) => {
      mockedValidateAdminUpload.mockResolvedValue({ status: 'validated' })
      if (record === 'federal') renderFederalDataRouter()
      else
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
      const targetTab = record === 'federal' ? 'Application' : 'Exemption details'
      await selectDetailTab('Documents')
      await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
      const panel = await screen.findByRole('complementary', { name: 'Add documents' })
      await userEvent.upload(
        within(panel).getByLabelText('Document File'),
        new File(['test'], 'pending.pdf', { type: 'application/pdf' }),
      )

      await selectDetailTab(targetTab)
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
      expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(within(panel).getByText('pending.pdf')).toBeInTheDocument()

      await selectDetailTab(targetTab)
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
      expect(screen.getByRole('tab', { name: targetTab })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('complementary', { name: 'Add documents' })).not.toBeInTheDocument()
      expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
      const unload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(false)
    },
  )

  it.each(['status', 'permit', 'remark'] as const)(
    'keeps a committed federal %s save distinct from a failed refresh',
    async (section) => {
      if (section === 'status')
        mockedFetchFederalApplicationDetail.mockResolvedValueOnce({
          ...federalDetail,
          statusCode: 'NEW',
          statusDescription: 'New',
        })
      renderFederalDataRouter()
      if (section === 'status') {
        await selectDetailTab('Application')
        await enterFederalStatusEditMode()
        mockedFetchFederalApplicationDetail.mockRejectedValueOnce(new Error('Refresh failed'))
        await userEvent.click(screen.getByRole('button', { name: 'Update status' }))
      } else if (section === 'permit') {
        await selectDetailTab('Shipping details')
        await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
        await userEvent.clear(screen.getByLabelText('Transport name'))
        await userEvent.type(screen.getByLabelText('Transport name'), 'Saved ship')
        mockedFetchFederalApplicationDetail.mockRejectedValueOnce(new Error('Refresh failed'))
        await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))
      } else {
        await selectDetailTab('Remarks')
        await enterFederalRemarkEditMode()
        await userEvent.type(screen.getByLabelText('New remark'), 'Saved remark')
        mockedFetchFederalApplicationRemarks.mockRejectedValueOnce(new Error('Refresh failed'))
        await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
      }
      const message =
        section === 'status'
          ? 'Federal application status updated, but details could not be refreshed. Reload before making more changes.'
          : section === 'permit'
            ? 'Federal permit saved, but details could not be refreshed. Reload before making more changes.'
            : 'Federal application remark saved, but remarks could not be refreshed. Reload before making more changes.'
      expect((await screen.findByText(message)).closest('.cds--inline-notification')).toHaveClass(
        'cds--inline-notification--warning',
      )
      expect(
        screen.queryByText(
          /Unable to (update federal application status|save federal permit|save federal application remark)\./,
        ),
      ).not.toBeInTheDocument()
      const mutation =
        section === 'status'
          ? mockedUpdateFederalApplicationStatus
          : section === 'permit'
            ? mockedSaveFederalPermit
            : mockedSaveFederalApplicationRemark
      expect(mutation).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps federal shipping details read-only until editing is requested', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Shipping details')
    const shippingTile = screen
      .getByRole('heading', { name: 'Shipping details', level: 2 })
      .closest('.cds--tile')
    expect(shippingTile).toHaveClass('federal-shipping-details')
    expect(within(shippingTile as HTMLElement).getByText('Truck')).toBeInTheDocument()
    expect(screen.queryByLabelText('Transport name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save federal permit' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    expect(
      screen.getByRole('heading', { name: 'Edit shipping details', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Transport name')).toHaveValue('Truck')

    await userEvent.clear(screen.getByLabelText('Transport name'))
    await userEvent.type(screen.getByLabelText('Transport name'), 'Rail')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    expect(screen.getByRole('heading', { name: 'Shipping details', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Transport name')).not.toBeInTheDocument()
    expect(screen.getByText('Truck')).toBeInTheDocument()
  })

  it('hides an existing federal permit number while preserving it on shipping save', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Shipping details')
    const shippingTile = screen
      .getByRole('heading', { name: 'Shipping details', level: 2 })
      .closest('.cds--tile')
    expect(shippingTile).toBeTruthy()
    expect(within(shippingTile as HTMLElement).queryByText('Permit number')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    expect(screen.queryByLabelText('Permit number')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Transport name'))
    await userEvent.type(screen.getByLabelText('Transport name'), 'Rail')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    await waitFor(() => {
      expect(mockedSaveFederalPermit).toHaveBeenCalledWith(
        '888',
        expect.objectContaining({ permitNumber: 90001, transportName: 'Rail' }),
        true,
      )
    })
  })

  it('rejects federal shipping text that Oracle cannot store', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Shipping details')
    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    const transportName = screen.getByLabelText('Transport name')
    await userEvent.clear(transportName)
    await userEvent.type(transportName, 'Résumé')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    expect(
      await screen.findByText(
        'Transport name contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(transportName).toHaveAttribute('aria-invalid', 'true')
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()

    await userEvent.clear(transportName)
    await userEvent.type(transportName, 'Truck')
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export'), 'Port d’été')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    expect(
      await screen.findByText(
        'Other port of export contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(transportName).not.toHaveAttribute('aria-invalid', 'true')
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
  })

  it('uses shared shipping selectors, descriptions, and conditional Other Port', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Shipping details')
    expect(await screen.findAllByText('United States (US)')).not.toHaveLength(0)
    expect(screen.getAllByText('Ship (S)')).not.toHaveLength(0)
    expect(screen.getAllByText('Vancouver (VA)')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Other port of export')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export'), 'Boundary Bay')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))

    await waitFor(() => {
      expect(mockedSaveFederalPermit).toHaveBeenCalledWith(
        '888',
        expect.objectContaining({ portOfExport: 'OT', otherPortOfExport: 'Boundary Bay' }),
        true,
      )
    })
  })

  it('disables federal permit save when shipping references fail', async () => {
    mockedFetchShippingReferenceOptions.mockRejectedValueOnce(new Error('Oracle unavailable'))
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Shipping reference options could not be loaded. Federal permit changes are unavailable.',
      ),
    ).toBeInTheDocument()
    await selectDetailTab('Shipping details')
    expect(screen.getByRole('button', { name: 'Edit shipping details' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save federal permit' })).not.toBeInTheDocument()
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
  })

  it('blocks federal permit save when shipping text exceeds the schema width', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValueOnce({
      ...federalDetail,
      federalPermit: {
        ...federalDetail.federalPermit!,
        transportName: 'A'.repeat(27),
      },
    })
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Shipping details')
    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    const save = screen.getByRole('button', { name: 'Save federal permit' })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Permit issue date'), {
      target: { value: '2026-02-11' },
    })
    await userEvent.click(save)

    expect(screen.getByLabelText('Transport name')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(screen.getByLabelText('Transport name')).toHaveFocus())
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
  })

  it('offers only approval from a new federal application', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'NEW',
      statusDescription: 'New',
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    const statusSelect = await screen.findByLabelText('Status')
    expect(within(statusSelect).getByRole('option', { name: 'Approved' })).toBeInTheDocument()
    expect(within(statusSelect).queryByRole('option', { name: 'Rejected' })).not.toBeInTheDocument()
    expect(
      within(statusSelect).queryByRole('option', { name: 'Withdrawn' }),
    ).not.toBeInTheDocument()
  })

  it('updates a new federal application status and refreshes authoritative detail', async () => {
    mockedFetchFederalApplicationDetail
      .mockResolvedValueOnce({
        ...federalDetail,
        statusCode: 'NEW',
        statusDescription: 'New',
      })
      .mockResolvedValue({
        ...federalDetail,
        statusCode: 'APP',
        statusDescription: 'Approved',
      })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    const updateButton = await screen.findByRole('button', { name: 'Update status' })
    expect(
      within(updateButton.closest('.legacy-search-actions') as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Update status'])
    expect(screen.getByLabelText('Status')).toHaveValue('APP')

    await userEvent.click(updateButton)

    await waitFor(() => {
      expect(mockedUpdateFederalApplicationStatus).toHaveBeenCalledWith('888', 'APP', '')
      expect(mockedFetchFederalApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Federal application status updated.')).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
  })

  it('replaces prior action feedback when opening a federal document fails', async () => {
    mockedFetchFederalApplicationDetail
      .mockResolvedValueOnce({
        ...federalDetail,
        statusCode: 'NEW',
        statusDescription: 'New',
      })
      .mockResolvedValue({
        ...federalDetail,
        statusCode: 'APP',
        statusDescription: 'Approved',
      })
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [{ id: '806', name: 'federal-doc.pdf', description: '', type: 'Attachment' }],
      source: 'api',
    })
    mockedOpenFederalApplicationDocument.mockRejectedValueOnce(new Error('Open failed'))

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    await userEvent.click(await screen.findByRole('button', { name: 'Update status' }))
    expect(await screen.findByText('Federal application status updated.')).toBeInTheDocument()

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('federal-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    await userEvent.click(within(documentRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(await screen.findByText('Unable to open the selected document.')).toBeInTheDocument()
    expect(screen.queryByText('Federal application status updated.')).not.toBeInTheDocument()
    expect(screen.getByText('Action failed')).toBeInTheDocument()
    expect(document.querySelectorAll('.app-inline-notification')).toHaveLength(1)
  })

  it('asks before switching tabs away from an unsaved federal status draft', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2999-12-31',
    })
    renderFederalDataRouter()
    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'WDN')
    await userEvent.type(screen.getByLabelText('Remark'), 'Awaiting withdrawal confirmation')

    await userEvent.click(screen.getByRole('tab', { name: 'Shipping details' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Application' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Status')).toHaveValue('WDN')
    expect(screen.getByLabelText('Remark')).toHaveValue('Awaiting withdrawal confirmation')

    await userEvent.click(screen.getByRole('tab', { name: 'Shipping details' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Shipping details' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await selectDetailTab('Application')
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('link', { name: 'Leave federal application' }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it.each([false, true])(
    'leaves a clean shipping edit on a tab switch and shows the refreshed permit (readOnly=%s)',
    async (readOnly) => {
      mockedFetchFederalApplicationDetail.mockResolvedValueOnce({
        ...federalDetail,
        statusCode: 'APP',
        statusDescription: 'Approved',
        listingDate: '2999-12-31',
      })
      mockedFetchFederalApplicationDetail.mockResolvedValue({
        ...federalDetail,
        statusCode: 'WDN',
        statusDescription: 'Withdrawn',
        listingDate: '2999-12-31',
        readOnly,
        federalPermit: { ...federalDetail.federalPermit!, transportName: 'Persisted ship' },
      })
      renderFederalDataRouter()
      await selectDetailTab('Shipping details')
      await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))

      await selectDetailTab('Application')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await enterFederalStatusEditMode()
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'WDN')
      await userEvent.type(screen.getByLabelText('Remark'), 'Withdraw this application')
      await userEvent.click(screen.getByRole('button', { name: 'Update status' }))
      await screen.findByText('Federal application status updated.')
      expect(screen.getAllByText('Withdrawn').length).toBeGreaterThan(0)
      expect(mockedSaveFederalPermit).not.toHaveBeenCalled()

      await selectDetailTab('Shipping details')
      expect(screen.queryByLabelText('Transport name')).not.toBeInTheDocument()
      expect(screen.getByText('Persisted ship')).toBeInTheDocument()
      if (readOnly) {
        expect(
          screen.queryByRole('button', { name: 'Edit shipping details' }),
        ).not.toBeInTheDocument()
      }
      await userEvent.click(screen.getByRole('link', { name: 'Leave federal application' }))
      expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
    },
  )

  it('waits for a shipping refresh before starting a status draft', async () => {
    const refresh = Promise.withResolvers<FederalApplicationDetail>()
    mockedFetchFederalApplicationDetail
      .mockResolvedValueOnce({
        ...federalDetail,
        statusCode: 'APP',
        statusDescription: 'Approved',
        listingDate: '2999-12-31',
      })
      .mockImplementationOnce(() => refresh.promise)
    renderFederalDataRouter()
    await selectDetailTab('Shipping details')
    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    await userEvent.clear(screen.getByLabelText('Transport name'))
    await userEvent.type(screen.getByLabelText('Transport name'), 'Updated ship')
    await userEvent.click(screen.getByRole('button', { name: 'Save federal permit' }))
    await waitFor(() => expect(mockedFetchFederalApplicationDetail).toHaveBeenCalledTimes(2))

    await userEvent.click(screen.getByRole('tab', { name: 'Application' }))
    expect(screen.getByRole('tab', { name: 'Shipping details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()
    refresh.resolve({
      ...federalDetail,
      statusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2999-12-31',
      federalPermit: { ...federalDetail.federalPermit!, transportName: 'Updated ship' },
    })

    await screen.findByText('Federal permit updated.')
    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'WDN')
    await userEvent.type(screen.getByLabelText('Remark'), 'Draft after refresh')
    expect(screen.getByLabelText('Status')).toHaveValue('WDN')
    expect(screen.getByLabelText('Remark')).toHaveValue('Draft after refresh')
    expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('link', { name: 'Leave federal application' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
  })

  it('offers only listing-day outcomes from an approved federal application', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2999-12-31',
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    const statusSelect = await screen.findByLabelText('Status')
    expect(within(statusSelect).queryByRole('option', { name: 'Approved' })).not.toBeInTheDocument()
    expect(within(statusSelect).getByRole('option', { name: 'Rejected' })).toBeInTheDocument()
    expect(within(statusSelect).getByRole('option', { name: 'Withdrawn' })).toBeInTheDocument()
  })

  it('requires a review-outcome remark and preserves the draft when status update fails', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2999-12-31',
    })
    mockedUpdateFederalApplicationStatus.mockResolvedValue({
      success: false,
      message: 'Unable to update.',
      errors: ['The federal application changed before this update.'],
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    await enterFederalStatusEditMode()
    const statusSelect = await screen.findByLabelText('Status')
    const remark = screen.getByLabelText('Remark')
    const updateButton = screen.getByRole('button', { name: 'Update status' })
    expect(statusSelect).toHaveValue('REJ')
    expect(updateButton).toBeEnabled()

    await userEvent.click(updateButton)
    expect(remark).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Remark is required')).toBeInTheDocument()
    await waitFor(() => expect(remark).toHaveFocus())
    expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()

    await userEvent.type(remark, 'Not eligible')
    expect(remark).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(updateButton)

    expect(
      await screen.findByText('The federal application changed before this update.'),
    ).toBeInTheDocument()
    expect(mockedUpdateFederalApplicationStatus).toHaveBeenCalledWith('888', 'REJ', 'Not eligible')
    expect(mockedFetchFederalApplicationDetail).toHaveBeenCalledTimes(1)
    expect(statusSelect).toHaveValue('REJ')
    expect(remark).toHaveValue('Not eligible')
  })

  it('hides the federal status action area after the approved application listing day', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2020-01-01',
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Application')
    expect(screen.queryByRole('heading', { name: 'Federal status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Update federal status' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
  })

  it('renders semantic empty states for empty federal detail collections', async () => {
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      packages: [],
      offers: [],
    })
    mockedFetchFederalApplicationRemarks.mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })

    await selectDetailTab('Items')
    expect(
      await screen.findByText('No package has been recorded for this federal application.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No packages found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Summary of scale' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No scale details found' }),
    ).not.toBeInTheDocument()

    await selectDetailTab('Offers')
    expect(
      await screen.findByRole('heading', { name: 'No offers found', level: 3 }),
    ).toBeInTheDocument()

    await selectDetailTab('Remarks')
    expect(
      await screen.findByRole('heading', { name: 'No remarks found', level: 3 }),
    ).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this application', level: 2 }),
    ).toBeInTheDocument()
  })

  it('renders structured federal offers and opens the selected offer', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/federal/:applicationNumber',
          element: <FederalApplicationDetailsPage />,
        },
        {
          path: '/provincial/offers/:offerNumber',
          element: <h1>Offer detail</h1>,
        },
      ],
      { initialEntries: ['/federal/888'] },
    )
    render(<RouterProvider router={router} />)

    await selectDetailTab('Offers')
    expect(
      await screen.findByRole('region', { name: 'Federal application offers' }),
    ).toBeInTheDocument()
    const offerRow = (await screen.findByText('Federal Buyer')).closest('tr')
    expect(offerRow).toBeTruthy()
    expect(within(offerRow as HTMLElement).getByText('81001')).toBeInTheDocument()
    expect(within(offerRow as HTMLElement).getByText('2026-01-13')).toBeInTheDocument()

    await userEvent.click(within(offerRow as HTMLElement).getByRole('button', { name: 'Open' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/provincial/offers/81001')
    })
  })

  it('does not present federal document or remark lookup failures as empty collections', async () => {
    mockedFetchFederalApplicationDocuments.mockRejectedValue(new Error('Documents unavailable'))
    mockedFetchFederalApplicationRemarks.mockRejectedValue(new Error('Remarks unavailable'))

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findAllByText('Documents unavailable')).not.toHaveLength(0)
    expect(
      screen.getAllByText('Unable to retrieve federal application documents.'),
    ).not.toHaveLength(0)
    expect(screen.getAllByText('Remarks unavailable')).not.toHaveLength(0)
    expect(screen.getAllByText('Unable to retrieve federal application remarks.')).not.toHaveLength(
      0,
    )

    await selectDetailTab('Remarks')
    expect(
      await screen.findByRole('heading', { name: 'Remarks unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No remarks found', level: 3 }),
    ).not.toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'Documents unavailable', level: 2 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No documents for this application', level: 2 }),
    ).not.toBeInTheDocument()
  })

  it('opens federal document from API response', async () => {
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '800',
          name: 'federal-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const previewTarget = {
      closed: false,
      close: vi.fn(),
      location: { replace: vi.fn() },
      opener: null,
    } as unknown as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(previewTarget)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:federal-document')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('federal-doc.pdf')
    expect(screen.getByRole('region', { name: 'Application document rows' })).toContainElement(
      documentName,
    )
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    await userEvent.click(within(documentRow as HTMLElement).getByRole('button', { name: 'Open' }))

    await waitFor(() => {
      expect(mockedOpenFederalApplicationDocument).toHaveBeenCalledWith(
        '800',
        'federal-doc.pdf',
        '888',
      )
    })
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() =>
      expect(previewTarget.location.replace).toHaveBeenCalledWith('blob:federal-document'),
    )

    openSpy.mockClear()
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Download' }),
    )
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('lists, adds, and updates structured federal remarks for approvers', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Remarks')
    expect(await screen.findByText('Review note')).toBeInTheDocument()
    expect(screen.getByText('idir\\reviewer')).toBeInTheDocument()
    expect(screen.getByText('2026-07-17 21:37:21')).toBeInTheDocument()

    await enterFederalRemarkEditMode()
    const newRemarkInput = screen.getByLabelText('New remark')
    expect(newRemarkInput.closest('.legacy-search-actions')).toHaveTextContent('Save remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
    expect(await screen.findByText('Remark is required')).toBeInTheDocument()

    await userEvent.type(newRemarkInput, 'R'.repeat(251))
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
    expect(await screen.findByText('Remark must not exceed 250 characters')).toBeInTheDocument()
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()

    await userEvent.clear(newRemarkInput)
    await userEvent.type(newRemarkInput, 'New note')
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    await waitFor(() => {
      expect(mockedSaveFederalApplicationRemark).toHaveBeenCalledWith('888', 'New note', undefined)
      expect(mockedFetchFederalApplicationRemarks).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const remarkInput = screen.getByLabelText('Edit remark 44')
    await userEvent.clear(remarkInput)
    await userEvent.type(remarkInput, 'Updated note')
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))

    await waitFor(() => {
      expect(mockedSaveFederalApplicationRemark).toHaveBeenCalledWith('888', 'Updated note', 44)
    })
  }, 20_000)

  it('shows federal scale details as unavailable when a package lookup fails', async () => {
    mockedFetchApplicationPackageScales.mockRejectedValue(new Error('Oracle unavailable'))

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Items')
    expect(await screen.findByText('Scale details unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Unable to retrieve federal application scale details.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No scale details found.')).not.toBeInTheDocument()
  })

  it('shows federal remarks read-only without federal management authorization', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
        canPerform: (action: string) =>
          action === '/federalApplicationDetails' || action === 'viewFederalApplication',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Your landing page' })).toHaveAttribute(
      'href',
      '/provincial/review',
    )
    await selectDetailTab('Remarks')
    expect(await screen.findByText('Review note')).toBeInTheDocument()
    expect(screen.getByText('idir\\reviewer')).toBeInTheDocument()
    expect(mockedFetchFederalApplicationRemarks).toHaveBeenCalledWith('888')
    expect(screen.queryByLabelText('New remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'reports federal document deletion with refreshed rows=%s',
    async (refreshSucceeds) => {
      mockedFetchFederalApplicationDocuments.mockResolvedValueOnce({
        rows: [
          {
            id: '800',
            name: 'federal-doc.pdf',
            description: 'remove me',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
      if (refreshSucceeds) {
        mockedFetchFederalApplicationDocuments.mockResolvedValueOnce({
          rows: [],
          source: 'api',
        })
      } else {
        mockedFetchFederalApplicationDocuments.mockRejectedValueOnce(
          new Error('Refresh unavailable'),
        )
      }

      render(
        <MemoryRouter initialEntries={['/federal/888']}>
          <Routes>
            <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await selectDetailTab('Documents')
      await waitForDocumentsSection()
      const documentName = await screen.findByText('federal-doc.pdf')
      const documentRow = documentName.closest('tr')
      expect(documentRow).toBeTruthy()
      const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      })
      await userEvent.click(deleteButton)
      const confirmation = await screen.findByRole('dialog', {
        name: 'Are you sure you want to delete this document?',
      })
      expect(confirmation).toHaveTextContent(
        'federal-doc.pdf will be deleted. This action cannot be undone.',
      )
      expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledWith('800', '888')
        expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(2)
      })
      const feedback = await screen.findByText(
        refreshSucceeds
          ? 'Document deleted.'
          : 'federal-doc.pdf was deleted. Reload before changing documents again.',
      )
      expect(feedback.closest('.cds--inline-notification')).toHaveClass(
        refreshSucceeds ? 'cds--inline-notification--success' : 'cds--inline-notification--warning',
      )
      expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledTimes(1)
      if (refreshSucceeds) expect(screen.queryByText('federal-doc.pdf')).not.toBeInTheDocument()
    },
  )

  it('keeps a federal delete result in the Documents tab until an upload replaces it', async () => {
    const remaining = { id: '801', name: 'kept.pdf', description: '', type: 'Attachment' }
    mockedFetchFederalApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          { id: '800', name: 'federal-doc.pdf', description: '', type: 'Attachment' },
          remaining,
        ],
        source: 'api',
      })
      .mockResolvedValueOnce({ rows: [remaining], source: 'api' })
      .mockResolvedValueOnce({ rows: [remaining], source: 'api' })
    mockedValidateAdminUpload.mockResolvedValue({ status: 'validated' })
    mockedSubmitAdminUpload.mockResolvedValue({ message: 'New federal document uploaded.' })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('federal-doc.pdf')).closest('tr')
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    )
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
    const documentsSection = document.querySelector('#federal-application-documents') as HTMLElement
    expect(await within(documentsSection).findByText('Document deleted.')).toBeInTheDocument()

    await openDocumentUploadModal()
    const file = new File(['new'], 'new.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.type(screen.getByLabelText(/Document description/), 'New document')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save documents' })).toBeEnabled(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save documents' }))

    expect(await within(documentsSection).findByText('1 document saved.')).toBeInTheDocument()
    expect(screen.queryByText('Document deleted.')).not.toBeInTheDocument()
    expect(screen.queryByText('Upload submitted')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.app-inline-notification')).toHaveLength(1)
  })

  it.each(['ADMIN', 'LEXIS_APPLICATION_APPROVER'])(
    'allows %s to add and delete expired federal documents while other edits stay read-only',
    async (role) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles: [role] }),
          canPerform: () => true,
        }),
      )
      mockedFetchFederalApplicationDetail.mockResolvedValue({
        ...federalDetail,
        statusCode: 'EXP',
        statusDescription: 'Expired',
        readOnly: true,
      })
      const document = {
        id: '804',
        name: 'reconciliation.pdf',
        description: 'Received after expiry',
        type: 'Attachment',
        source: 'application' as const,
        deletable: true,
      }
      mockedFetchFederalApplicationDocuments
        .mockResolvedValueOnce({ rows: [], source: 'api' })
        .mockResolvedValueOnce({ rows: [document], source: 'api' })
        .mockResolvedValueOnce({ rows: [], source: 'api' })
      mockedValidateAdminUpload.mockResolvedValue({ status: 'validated' })
      mockedSubmitAdminUpload.mockResolvedValue({ status: 'success' })

      renderFederalDataRouter()
      await selectDetailTab('Documents')
      await openDocumentUploadModal()
      const file = new File(['reconciliation'], 'reconciliation.pdf', {
        type: 'application/pdf',
      })
      await userEvent.upload(screen.getByLabelText('Document File'), file)
      await userEvent.type(screen.getByLabelText(/Document description/), 'Received after expiry')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save documents' })).toBeEnabled(),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save documents' }))

      await waitFor(() => {
        expect(mockedSubmitAdminUpload).toHaveBeenCalledWith('application', {
          applicationNumber: '888',
          file,
          fileDescription: 'Received after expiry',
        })
        expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(2)
        expect(
          screen.queryByRole('complementary', { name: 'Add documents' }),
        ).not.toBeInTheDocument()
      })
      const documentRow = (await screen.findByText('reconciliation.pdf')).closest('tr')
      expect(documentRow).toBeTruthy()
      await userEvent.click(
        within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
      )
      const confirmation = await screen.findByRole('dialog', {
        name: 'Are you sure you want to delete this document?',
      })
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
      await waitFor(() => {
        expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledWith('804', '888')
        expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(3)
        expect(screen.queryByText('reconciliation.pdf')).not.toBeInTheDocument()
      })

      await selectDetailTab('Application')
      expect(screen.queryByRole('button', { name: 'Edit federal status' })).not.toBeInTheDocument()
      await selectDetailTab('Remarks')
      expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      await selectDetailTab('Shipping details')
      expect(
        screen.queryByRole('button', { name: 'Edit shipping details' }),
      ).not.toBeInTheDocument()
      expect(mockedUpdateFederalApplicationStatus).not.toHaveBeenCalled()
      expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
      expect(mockedSaveFederalPermit).not.toHaveBeenCalled()
    },
  )

  it.each([
    { reason: 'read-only role', role: 'LEXIS_READ_ONLY', statusCode: 'EXP', locked: false },
    { reason: 'another editor lock', role: 'ADMIN', statusCode: 'EXP', locked: true },
    { reason: 'non-expiry read-only policy', role: 'ADMIN', statusCode: 'APP', locked: false },
  ])('keeps federal document changes blocked for $reason', async ({ role, statusCode, locked }) => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: [role] }),
        canPerform: () => true,
      }),
    )
    mockedFetchFederalApplicationDetail.mockResolvedValue({
      ...federalDetail,
      statusCode,
      readOnly: true,
      locked,
      lockHeldByCurrentUser: !locked,
    })
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [{ id: '805', name: 'protected.pdf', description: '', type: 'Attachment' }],
      source: 'api',
    })

    renderFederalDataRouter()
    await selectDetailTab('Documents')

    expect(await screen.findByText('protected.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit documents' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
  })

  it('distinguishes the internal LEXIS key from the external federal application number', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 }),
    ).toBeInTheDocument()
    await selectDetailTab('Application')
    expect(screen.getByText('Federal application number')).toBeInTheDocument()
    expect(screen.getByText('FED-888')).toBeInTheDocument()
  })

  it.each([false, true])(
    'does not offer delete for inherited federal documents when expired=%s',
    async (expired) => {
      mockedFetchFederalApplicationDetail.mockResolvedValue({
        ...federalDetail,
        statusCode: expired ? 'EXP' : federalDetail.statusCode,
        readOnly: expired,
      })
      mockedFetchFederalApplicationDocuments.mockResolvedValue({
        rows: [
          {
            id: '803',
            name: 'inherited-permit-doc.pdf',
            description: 'permit context',
            type: 'Permit',
            source: 'permit',
            deletable: false,
          },
        ],
        source: 'api',
      })

      render(
        <MemoryRouter initialEntries={['/federal/888']}>
          <Routes>
            <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await selectDetailTab('Documents')
      await waitForDocumentsSection()
      const documentRow = (await screen.findByText('inherited-permit-doc.pdf')).closest('tr')
      expect(documentRow).toBeTruthy()
      expect(
        within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
      ).not.toBeInTheDocument()
    },
  )

  it.each([false, true])(
    'keeps federal delete available to admins without upload permission when expired=%s',
    async (expired) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          canPerform: (action: string) => action !== '/fileApplicationUpload',
        }),
      )
      mockedFetchFederalApplicationDetail.mockResolvedValue({
        ...federalDetail,
        statusCode: expired ? 'EXP' : federalDetail.statusCode,
        readOnly: expired,
      })
      mockedFetchFederalApplicationDocuments.mockResolvedValue({
        rows: [
          {
            id: '801',
            name: 'locked-federal-doc.pdf',
            description: 'locked',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })

      render(
        <MemoryRouter initialEntries={['/federal/888']}>
          <Routes>
            <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await selectDetailTab('Documents')
      expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
      await waitForDocumentsSection()
      expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
      const documentName = await screen.findByText('locked-federal-doc.pdf')
      const documentRow = documentName.closest('tr')
      expect(documentRow).toBeTruthy()
      const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
        name: 'Delete',
      })
      expect(deleteButton).toBeEnabled()
      expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
    },
  )

  it.each(['LEXIS_READ_ONLY', 'LEXIS_FEDERAL_READ_ONLY'])(
    'denies federal detail changes to %s',
    async (role) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles: [role] }),
          canPerform: (action) =>
            role === 'LEXIS_READ_ONLY' ||
            [
              '/federalApplicationSearch',
              '/federalApplicationDetails',
              'viewFederalApplication',
            ].includes(action),
        }),
      )
      mockedFetchFederalApplicationDetail.mockResolvedValue({ ...federalDetail, readOnly: true })
      mockedFetchFederalApplicationDocuments.mockResolvedValue({
        rows: [
          {
            id: '802',
            name: 'readonly-federal-doc.pdf',
            description: 'read only',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })

      render(
        <MemoryRouter initialEntries={['/federal/888']}>
          <Routes>
            <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await selectDetailTab('Documents')
      const documentRow = (await screen.findByText('readonly-federal-doc.pdf')).closest('tr')
      expect(documentRow).toBeTruthy()
      expect(
        within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()

      await selectDetailTab('Application')
      expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
      await selectDetailTab('Remarks')
      expect(screen.queryByLabelText('New remark')).not.toBeInTheDocument()
      await selectDetailTab('Shipping details')
      expect(
        screen.queryByRole('button', { name: 'Edit shipping details' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save federal permit' })).not.toBeInTheDocument()
    },
  )

  it('shows detail error contract when exemption detail endpoint fails', async () => {
    mockedFetchProvincialExemptionDetail.mockRejectedValue(new Error('backend down'))

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

    expect(
      await screen.findByText('Unable to retrieve provincial exemption detail.', {
        selector: '.app-inline-notification .cds--inline-notification__subtitle',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchExemptionDocuments).not.toHaveBeenCalled()
  })

  it('shows detail error contract when federal detail endpoint fails', async () => {
    mockedFetchFederalApplicationDetail.mockRejectedValue(new Error('backend down'))

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Unable to retrieve federal application detail.', {
        selector: '.app-inline-notification .cds--inline-notification__subtitle',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchFederalApplicationDocuments).not.toHaveBeenCalled()
  })
})
