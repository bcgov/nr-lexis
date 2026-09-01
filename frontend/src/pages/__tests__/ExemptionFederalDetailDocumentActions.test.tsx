import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { FederalApplicationDetail, ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import FederalApplicationDetailsPage from '@/pages/FederalApplicationDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchFederalApplicationDetail,
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
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  releaseExemptionEditLock,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  saveFederalPermit,
  updateFederalApplicationStatus,
} from '@/service/federal-application-mutation-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

const openDocumentUploadModal = async (): Promise<void> => {
  const editButton = screen.queryByRole('button', { name: 'Edit documents' })
  if (editButton) {
    await userEvent.click(editButton)
  }
  await userEvent.click(await screen.findByRole('button', { name: 'Add document' }))
  await screen.findByRole('dialog', { name: 'Add document' })
}

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchFederalApplicationDetail: vi.fn(),
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
  releaseExemptionEditLock: vi.fn(),
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
const mockedReleaseExemptionEditLock = vi.mocked(releaseExemptionEditLock)
const mockedUpdateExemption = vi.mocked(updateExemption)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)

const selectDetailTab = async (name: string) => {
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const enterDocumentEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit documents' }))
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
    mockedReleaseExemptionEditLock.mockResolvedValue(undefined)
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
    expect(
      within(exemptionHeader as HTMLElement).getByText(
        'Check and manage this provincial exemption',
      ),
    ).toBeInTheDocument()
    expect(within(exemptionHeader as HTMLElement).getByText('Active')).toHaveAttribute(
      'data-status-variant',
      'positive',
    )
    expect(screen.queryByLabelText('Exemption highlights')).not.toBeInTheDocument()
    const exemptionSummaryTile = screen
      .getByRole('heading', { name: 'Exemption summary' })
      .closest('.cds--tile')
    expect(exemptionSummaryTile).toBeTruthy()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Exemption number'),
    ).toBeInTheDocument()
    expect(within(exemptionSummaryTile as HTMLElement).getByText('EX-777')).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).queryByText('Application number'),
    ).not.toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).queryByText('Application status'),
    ).not.toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Approved volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Remaining volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Blanket Order in Council'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Exemption Document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Approved Exemption Report' })).toBeNull()

    await selectDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Edit documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'No documents found', level: 3 }),
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
    expect(screen.getByLabelText(/Document description/)).toBeInTheDocument()
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
      await screen.findByRole('heading', { name: 'No permits found', level: 3 }),
    ).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents found', level: 3 }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
  })

  it('explains why adding an associated application is unavailable until a number is entered', async () => {
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

    const applicationInput = await screen.findByLabelText('Application number')
    const addButton = screen.getByRole('button', { name: 'Add application' })
    const tooltipTrigger = addButton.parentElement as HTMLElement

    expect(applicationInput.closest('.exemption-application-add-form')).toBeTruthy()
    expect(addButton).toBeDisabled()

    await userEvent.hover(tooltipTrigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Enter an application number to add it.',
    )

    await userEvent.type(applicationInput, '654')
    expect(screen.getByRole('button', { name: 'Add application' })).toBeEnabled()
  })

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

    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '654x')

    expect(applicationInput).toHaveValue('654x')
    expect(
      screen.getAllByText('Application number must be a positive whole number.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Add application' })).toBeDisabled()
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

    const applicationInput = await screen.findByLabelText('Application number')
    await userEvent.type(applicationInput, '12345678901')

    expect(applicationInput).toHaveValue('12345678901')
    expect(
      screen.getAllByText('Application number must be 10 digits or fewer.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Add application' })).toBeDisabled()
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
    expect(
      await screen.findByRole('region', { name: 'Related exemption permits' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Volume (m³)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Issue date' })).toBeInTheDocument()
    expect(screen.getByText('900101 (Pending)')).toBeInTheDocument()
    expect(screen.getByText('25.5')).toBeInTheDocument()
    expect(screen.getByText('12-Jul-2026')).toBeInTheDocument()
    expect(screen.queryByText('900102')).not.toBeInTheDocument()
    expect(screen.queryByText('10-Jul-2026')).not.toBeInTheDocument()
  })

  it('explains why a visible permit cannot be opened', async () => {
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
    const openPermit = await screen.findByRole('button', { name: 'Open' })
    const tooltipTrigger = openPermit.closest('.disabled-button-tooltip') as HTMLElement
    expect(openPermit).toBeDisabled()
    expect(tooltipTrigger).toHaveAttribute('aria-disabled', 'true')

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'You do not have permission to open this permit.',
    )
  })

  it('shows Blanket OIC requested and completed permit volume totals', async () => {
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
    const totals = await screen.findByLabelText('Blanket OIC permit volume totals')
    expect(within(totals).getByText('Requested permit volume (m³)')).toBeInTheDocument()
    expect(within(totals).getByText('500.0')).toBeInTheDocument()
    expect(within(totals).getByText('Completed permit volume (m³)')).toBeInTheDocument()
    expect(within(totals).getByText('125.5')).toBeInTheDocument()
    expect(mockedFetchExemptionBlanketOicTotals).toHaveBeenCalledWith('EX-777')
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

    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
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
    expect(
      await screen.findByRole('heading', { name: 'Documents unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No documents found', level: 3 }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'Documents unavailable', level: 3 }),
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
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

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
    await enterDocumentEditMode()
    const documentName = await screen.findByText('exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenExemptionDocument).toHaveBeenCalledWith('700', 'exemption-doc.pdf', 'EX-777')
    })
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
    await enterDocumentEditMode()
    const documentName = await screen.findByText('exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)
    const confirmation = await screen.findByRole('dialog', { name: 'Delete document' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete exemption-doc.pdf? This cannot be undone.',
    )
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedRemoveExemptionDocument).toHaveBeenCalledWith('700', 'EX-777')
      expect(mockedFetchExemptionDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('exemption-doc.pdf')).not.toBeInTheDocument()
    })
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
    await enterDocumentEditMode()
    const documentRow = (await screen.findByText('application-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByText('Application')).toBeInTheDocument()
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
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
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterDocumentEditMode()
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
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
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
    await enterDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    const documentRow = (await screen.findByText('expired-exemption-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
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
      'Owner',
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
    const ownerTile = screen.getByRole('heading', { name: 'Owner', level: 2 }).closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    const ownerApplicantTypeField = within(ownerTile as HTMLElement)
      .getByText('Applicant type')
      .closest('.detail-field-item')
    expect(ownerApplicantTypeField).toBeTruthy()
    expect(within(ownerApplicantTypeField as HTMLElement).getByText('Agent')).toBeInTheDocument()

    await selectDetailTab('Agent')
    expect(await screen.findByText('2 Agent Avenue')).toBeInTheDocument()
    expect(screen.getByText('250-555-0201')).toBeInTheDocument()
    expect(screen.getByText('250-555-0202')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
    const agentTile = screen.getByRole('heading', { name: 'Agent', level: 2 }).closest('.cds--tile')
    expect(agentTile).toBeTruthy()
    const agentApplicantTypeField = within(agentTile as HTMLElement)
      .getByText('Applicant type')
      .closest('.detail-field-item')
    expect(agentApplicantTypeField).toBeTruthy()
    expect(within(agentApplicantTypeField as HTMLElement).getByText('Agent')).toBeInTheDocument()

    await selectDetailTab('Application')
    expect(await screen.findByText('IDIR\\TESTER')).toBeInTheDocument()
    expect(screen.getByText('Exemption term (days)')).toBeInTheDocument()

    await selectDetailTab('Items')
    expect(screen.getByText('Average log volume (m³)')).toBeInTheDocument()
    expect(screen.getByText('Application volume (m³)')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Summary of Scale' })).toBeInTheDocument()
    expect(mockedFetchApplicationPackageScales).toHaveBeenCalledWith('PKG-1')
    expect(await screen.findByText('TM-1')).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Edit documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'No documents found', level: 3 }),
    ).toBeInTheDocument()
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

    expect(await screen.findByRole('tab', { name: 'Owner' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    const ownerTile = screen.getByRole('heading', { name: 'Owner', level: 2 }).closest('.cds--tile')
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
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()

    await selectDetailTab('Documents')
    const documentRow = (await screen.findByText('locked-federal-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
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
        await userEvent.type(screen.getByLabelText('New Remark'), 'Remark draft')
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

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
    expect(screen.getByText(/unsaved changes to this federal application/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/elsewhere')
  })

  it('blocks navigation while a federal document remains queued', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderFederalDataRouter()
    await screen.findByRole('heading', { name: 'Federal application FED-888', level: 1 })
    await selectDetailTab('Documents')
    await enterDocumentEditMode()
    await user.click(screen.getByRole('button', { name: 'Add document' }))
    await user.upload(
      screen.getByLabelText('Document File'),
      new File(['unsupported'], 'evidence.exe'),
    )

    await user.click(screen.getByRole('link', { name: 'Leave federal application' }))

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
    expect(
      screen.getByText(/Finish or reset the queued document uploads before leaving/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
  })

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

    expect(screen.getByRole('heading', { name: 'Shipping details', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Transport name')).not.toBeInTheDocument()
    expect(screen.getByText('Truck')).toBeInTheDocument()
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

    expect(
      await screen.findByText(
        'Transport name contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save federal permit' })).toBeDisabled()
    expect(mockedSaveFederalPermit).not.toHaveBeenCalled()

    await userEvent.clear(transportName)
    await userEvent.type(transportName, 'Truck')
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export'), 'Port d’été')

    expect(
      await screen.findByText(
        'Other port of export contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save federal permit' })).toBeDisabled()
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

  it('disables federal permit save when shipping text exceeds the schema width', async () => {
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
    expect(screen.getByRole('button', { name: 'Save federal permit' })).toBeDisabled()
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
    expect(screen.getByLabelText('Status')).toHaveValue('APP')

    await userEvent.click(updateButton)

    await waitFor(() => {
      expect(mockedUpdateFederalApplicationStatus).toHaveBeenCalledWith('888', 'APP', '')
      expect(mockedFetchFederalApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Federal application status updated.')).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
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
    expect(updateButton).toBeDisabled()

    await userEvent.type(remark, 'Not eligible')
    expect(updateButton).toBeEnabled()
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
    expect(screen.queryByRole('heading', { name: 'Summary of Scale' })).not.toBeInTheDocument()
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
      await screen.findByRole('heading', { name: 'No documents found', level: 3 }),
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
      await screen.findByRole('heading', { name: 'Documents unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No documents found', level: 3 }),
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
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenFederalApplicationDocument).toHaveBeenCalledWith(
        '800',
        'federal-doc.pdf',
        '888',
      )
    })
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
    const newRemarkInput = screen.getByLabelText('New Remark')
    expect(newRemarkInput.closest('.legacy-search-actions')).toHaveTextContent('Save Remark')

    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))
    expect(await screen.findByText('Remark is required.')).toBeInTheDocument()

    await userEvent.type(newRemarkInput, 'R'.repeat(251))
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))
    expect(await screen.findByText('Remark must not exceed 250 characters.')).toBeInTheDocument()
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()

    await userEvent.clear(newRemarkInput)
    await userEvent.type(newRemarkInput, 'New note')
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    await waitFor(() => {
      expect(mockedSaveFederalApplicationRemark).toHaveBeenCalledWith('888', 'New note', undefined)
      expect(mockedFetchFederalApplicationRemarks).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const remarkInput = screen.getByLabelText('Edit Remark 44')
    await userEvent.clear(remarkInput)
    await userEvent.type(remarkInput, 'Updated note')
    await userEvent.click(screen.getByRole('button', { name: 'Update Remark' }))

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

    expect(await screen.findByRole('tab', { name: 'Owner' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Your landing page' })).toHaveAttribute(
      'href',
      '/provincial/review',
    )
    await selectDetailTab('Remarks')
    expect(await screen.findByText('Review note')).toBeInTheDocument()
    expect(screen.getByText('idir\\reviewer')).toBeInTheDocument()
    expect(mockedFetchFederalApplicationRemarks).toHaveBeenCalledWith('888')
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(mockedSaveFederalApplicationRemark).not.toHaveBeenCalled()
  })

  it('removes federal documents and refreshes rows', async () => {
    mockedFetchFederalApplicationDocuments
      .mockResolvedValueOnce({
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
      .mockResolvedValueOnce({
        rows: [],
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
    await enterDocumentEditMode()
    const documentName = await screen.findByText('federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)
    const confirmation = await screen.findByRole('dialog', { name: 'Delete document' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete federal-doc.pdf? This cannot be undone.',
    )
    expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledWith('800', '888')
      expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('federal-doc.pdf')).not.toBeInTheDocument()
    })
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

  it('does not offer delete for inherited read-only federal documents', async () => {
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
    const documentRow = (await screen.findByText('inherited-permit-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })

  it('keeps federal delete available to admins without file upload permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileApplicationUpload',
      }),
    )
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
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterDocumentEditMode()
    const documentName = await screen.findByText('locked-federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeEnabled()
    expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
  })

  it('denies federal application document delete to read-only users', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
        canPerform: () => true,
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
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()

    await selectDetailTab('Application')
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    await selectDetailTab('Remarks')
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    await selectDetailTab('Shipping details')
    expect(screen.queryByRole('button', { name: 'Edit shipping details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save federal permit' })).not.toBeInTheDocument()
  })

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
        selector: '.detail-page-inline-error',
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
        selector: '.detail-page-inline-error',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchFederalApplicationDocuments).not.toHaveBeenCalled()
  })
})
