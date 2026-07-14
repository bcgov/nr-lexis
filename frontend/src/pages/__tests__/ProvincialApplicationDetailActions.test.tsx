import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type {
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
} from '@/interfaces/LexisDetails'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'
import {
  approveApplicationReview,
  sendApplicationReviewStatusEmail,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
} from '@/service/application-client-lookup-service'
import {
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
} from '@/service/provincial-application-documents-service'
import {
  addApplicationPackage,
  addApplicationScaleToPackage,
  checkApplicationVolumeUsage,
  deleteApplicationPackage,
  deleteApplicationScale,
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationGradeCodes,
  fetchApplicationPackageDetails,
  fetchApplicationPackageScales,
  fetchApplicationPackageStatusCodes,
  fetchApplicationPackageSpecies,
  fetchApplicationPermits,
  fetchApplicationRemainingSpecies,
  fetchApplicationScaleDetails,
  fetchApplicationSpecies,
  fetchApplicationSpeciesCodes,
  fetchApplicationSummarySnapshot,
  fetchApplicationUniqueScales,
  saveApplicationRemark,
  updateApplicationSummary,
  updateApplicationPackage,
} from '@/service/provincial-application-items-service'
import {
  fetchApplicationReviewOptions,
  fetchProvincialApplicationOptions,
} from '@/service/search-options-service'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialApplicationDetail: vi.fn(),
  fetchProvincialExemptionDetail: vi.fn(),
  releaseApplicationEditLock: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  approveApplicationReview: vi.fn(),
  sendApplicationReviewStatusEmail: vi.fn(),
  updateApplicationReviewStatus: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
  fetchApplicationClientContacts: vi.fn(),
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-application-documents-service', () => ({
  fetchApplicationDocuments: vi.fn(),
  openApplicationDocument: vi.fn(),
  removeApplicationDocument: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  addApplicationPackage: vi.fn(),
  addApplicationScaleToPackage: vi.fn(),
  checkApplicationVolumeUsage: vi.fn(),
  deleteApplicationPackage: vi.fn(),
  deleteApplicationScale: vi.fn(),
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
  fetchApplicationGradeCodes: vi.fn(),
  fetchApplicationPackageDetails: vi.fn(),
  fetchApplicationPackageScales: vi.fn(),
  fetchApplicationPackageStatusCodes: vi.fn(),
  fetchApplicationPackageSpecies: vi.fn(),
  fetchApplicationPermits: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
  fetchApplicationScaleDetails: vi.fn(),
  fetchApplicationSpecies: vi.fn(),
  fetchApplicationSpeciesCodes: vi.fn(),
  fetchApplicationSummarySnapshot: vi.fn(),
  fetchApplicationUniqueScales: vi.fn(),
  saveApplicationRemark: vi.fn(),
  updateApplicationSummary: vi.fn(),
  updateApplicationPackage: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchApplicationReviewOptions: vi.fn(),
  fetchProvincialApplicationOptions: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateAdminUpload: vi.fn(),
}))

// This file renders the full provincial application detail page; several tests exercise
// Carbon comboboxes and async child panels, which can exceed Vitest's 5s default in CI.
vi.setConfig({ testTimeout: 20000 })

const chooseComboBoxOption = async (combobox: HTMLElement, optionName: string) => {
  await userEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

const clearComboBox = async (combobox: HTMLElement) => {
  const clearButton = combobox
    .closest('.cds--combo-box')
    ?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear selected item"], button[title="Clear selected item"]',
    )

  expect(clearButton).toBeTruthy()
  await userEvent.click(clearButton as HTMLButtonElement)
}

const mockedUseAuth = vi.mocked(useAuth)
const mockedApproveApplicationReview = vi.mocked(approveApplicationReview)
const mockedSendApplicationReviewStatusEmail = vi.mocked(sendApplicationReviewStatusEmail)
const mockedUpdateApplicationReviewStatus = vi.mocked(updateApplicationReviewStatus)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationClientContacts = vi.mocked(fetchApplicationClientContacts)
const mockedFetchApplicationClientLocations = vi.mocked(fetchApplicationClientLocations)
const mockedFetchProvincialApplicationDetail = vi.mocked(fetchProvincialApplicationDetail)
const mockedFetchProvincialExemptionDetail = vi.mocked(fetchProvincialExemptionDetail)
const mockedReleaseApplicationEditLock = vi.mocked(releaseApplicationEditLock)
const mockedFetchApplicationDocuments = vi.mocked(fetchApplicationDocuments)
const mockedOpenApplicationDocument = vi.mocked(openApplicationDocument)
const mockedRemoveApplicationDocument = vi.mocked(removeApplicationDocument)
const mockedAddApplicationPackage = vi.mocked(addApplicationPackage)
const mockedAddApplicationScaleToPackage = vi.mocked(addApplicationScaleToPackage)
const mockedCheckApplicationVolumeUsage = vi.mocked(checkApplicationVolumeUsage)
const mockedDeleteApplicationPackage = vi.mocked(deleteApplicationPackage)
const mockedDeleteApplicationScale = vi.mocked(deleteApplicationScale)
const mockedFetchApplicationEndUsesForSpeciesRegion = vi.mocked(
  fetchApplicationEndUsesForSpeciesRegion,
)
const mockedFetchApplicationGradeCodes = vi.mocked(fetchApplicationGradeCodes)
const mockedFetchApplicationPackageDetails = vi.mocked(fetchApplicationPackageDetails)
const mockedFetchApplicationPackageScales = vi.mocked(fetchApplicationPackageScales)
const mockedFetchApplicationPackageStatusCodes = vi.mocked(fetchApplicationPackageStatusCodes)
const mockedFetchApplicationPackageSpecies = vi.mocked(fetchApplicationPackageSpecies)
const mockedFetchApplicationPermits = vi.mocked(fetchApplicationPermits)
const mockedFetchApplicationRemainingSpecies = vi.mocked(fetchApplicationRemainingSpecies)
const mockedFetchApplicationScaleDetails = vi.mocked(fetchApplicationScaleDetails)
const mockedFetchApplicationSpecies = vi.mocked(fetchApplicationSpecies)
const mockedFetchApplicationSpeciesCodes = vi.mocked(fetchApplicationSpeciesCodes)
const mockedFetchApplicationSummarySnapshot = vi.mocked(fetchApplicationSummarySnapshot)
const mockedFetchApplicationUniqueScales = vi.mocked(fetchApplicationUniqueScales)
const mockedSaveApplicationRemark = vi.mocked(saveApplicationRemark)
const mockedUpdateApplicationSummary = vi.mocked(updateApplicationSummary)
const mockedUpdateApplicationPackage = vi.mocked(updateApplicationPackage)
const mockedFetchApplicationReviewOptions = vi.mocked(fetchApplicationReviewOptions)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateAdminUpload = vi.mocked(validateAdminUpload)

const mockApplicationDetailAuth = (
  canPerform: (action: string) => boolean = () => true,
  roles: string[] = ['APPLICATION_APPROVER'],
): void => {
  mockedUseAuth.mockReturnValue(
    createTestAuthContext({
      capabilities: createTestCapabilities({
        principal: 'idir\\reviewer',
        roles,
        welcomeTarget: null,
      }),
      canPerform,
    }),
  )
}

const applicationDetail: ProvincialApplicationDetail = {
  applicationNumber: 321,
  exemptionNumber: 'EX-555',
  applicationStatusCode: 'APP',
  statusDescription: 'Approved',
  author: 'idir\\application-author',
  ownerClientNumber: '00011122',
  agentClientNumber: '00033344',
  orgUnitNumber: 12,
  orgUnitName: 'Coast',
  productTypeCode: 'H',
  exemptionReasonCode: 'U',
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
  canEditApplicationDetails: true,
  canEditPackages: true,
  canAddPackages: true,
  canAddScales: true,
  canUpdatePackageNumber: true,
  locked: false,
  packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 5 }],
  remarks: [
    {
      remarkId: 88,
      title: 'Note',
      remark: 'ok',
      user: 'idir\\reviewer',
      date: '2026-01-04',
    },
  ],
  offers: [],
}

const newExemptionDetail: ProvincialExemptionDetail = {
  exemptionNumber: 'EX-555',
  exemptionTypeCode: 'M',
  exemptionTypeDescription: 'Ministerial',
  exemptionStatusCode: 'NEW',
  exemptionStatusDescription: 'New',
  ownerClientNumber: '00011122',
  agentClientNumber: null,
  applicationNumber: 321,
  applicationStatus: 'APP',
  approvalDate: null,
  expiryDate: '2026-12-31',
  approvedVolume: 100,
  usedVolume: 0,
  remainingVolume: 100,
  otherConditions: null,
  blanketOic: false,
  permitNumbers: [],
  remarks: [],
}

const LocationProbe = () => {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

const NavigateButton = ({ to }: { to: string }) => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to)}>
      Navigate application
    </button>
  )
}

const getApplicationReviewTile = (): HTMLElement => {
  const reviewTitle = screen.getByRole('heading', { name: /application review/i })
  const reviewTile = reviewTitle.closest('.cds--tile')
  expect(reviewTile).toBeTruthy()
  return reviewTile as HTMLElement
}

const getApplicationSummaryTile = (): HTMLElement => {
  const summaryTitle = screen.getByRole('heading', { name: /application summary/i })
  const summaryTile = summaryTitle.closest('.cds--tile')
  expect(summaryTile).toBeTruthy()
  return summaryTile as HTMLElement
}

const getSummaryComboBox = (
  summaryControls: ReturnType<typeof within>,
  labelText: string,
): HTMLElement =>
  summaryControls
    .getAllByLabelText(labelText)
    .find((element: HTMLElement) => element.getAttribute('role') === 'combobox') as HTMLElement

const selectApplicationDetailTab = async (name: string): Promise<void> => {
  const tab = await screen.findByRole('tab', { name })

  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const selectApplicationSummaryTile = async (): Promise<HTMLElement> => {
  await selectApplicationDetailTab('Application')
  return waitFor(() => getApplicationSummaryTile())
}

const selectApplicationReviewTile = async (): Promise<HTMLElement> => {
  await selectApplicationDetailTab('Review')
  return waitFor(() => getApplicationReviewTile())
}

describe('Provincial Application Detail Document Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApplicationDetailAuth()
    mockedFetchProvincialApplicationDetail.mockResolvedValue(applicationDetail)
    mockedFetchProvincialExemptionDetail.mockResolvedValue(null)
    mockedReleaseApplicationEditLock.mockResolvedValue()
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchApplicationPermits.mockResolvedValue([])
    mockedOpenApplicationDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'app-doc.pdf',
    })
    mockedRemoveApplicationDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedSubmitAdminUpload.mockResolvedValue({
      status: 'success',
      message: 'Application document upload submitted.',
    })
    mockedValidateAdminUpload.mockResolvedValue({
      status: 'validated',
      message: 'File passed validation and virus scanning.',
    })
    mockedFetchApplicationReviewOptions.mockResolvedValue({
      productTypes: [],
      regions: [],
      reviewStatuses: [
        { value: 'APP', label: 'Approved' },
        { value: 'REJ', label: 'Rejected' },
        { value: 'WDN', label: 'Withdrawn' },
        { value: 'EXP', label: 'Expired' },
      ],
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [
        { value: 'E', label: 'Economic' },
        { value: 'S', label: 'Surplus' },
        { value: 'U', label: 'Utilization' },
      ],
      applicationStatuses: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'APP', label: 'Approved' },
        { value: 'REJ', label: 'Rejected' },
        { value: 'EXP', label: 'Expired' },
      ],
      productTypes: [
        { value: 'LOG', label: 'Logs' },
        { value: 'H', label: 'Harvested Timber' },
        { value: 'S', label: 'Standing Timber' },
        { value: 'T', label: 'Timber' },
        { value: 'TIMBER', label: 'Timber' },
      ],
      growthTypes: [
        { value: 'O', label: 'Old Growth' },
        { value: 'S', label: 'Second Growth' },
      ],
      regions: [
        { value: '12', label: 'Coast' },
        { value: '13', label: 'Interior' },
      ],
      currentSchedules: [
        { value: '987', label: '2026-01-11' },
        { value: '988', label: '2026-01-25' },
      ],
    })
    mockedApproveApplicationReview.mockResolvedValue({
      updated: true,
      valid: true,
      statusCode: 'APP',
      clientEmail: '',
      remark: '',
      message: 'Application approved.',
    })
    mockedUpdateApplicationReviewStatus.mockResolvedValue({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'agent@example.test',
      remark: 'Needs correction',
      remarkId: 99,
      remarkUser: 'idir\\reviewer',
      remarkDate: '2026-01-05T10:15:00Z',
      message: 'Application status updated.',
    })
    mockedFetchApplicationClientLocations.mockImplementation((clientNumber, applicantType) => {
      if (applicantType === 'agent') {
        return Promise.resolve([
          { locationCode: '0', locationName: 'Do not use', selected: false },
          { locationCode: '01', locationName: 'Agent Main Location', selected: true },
          { locationCode: '02', locationName: 'Agent Alternate Location', selected: false },
        ])
      }

      return Promise.resolve([
        { locationCode: '0', locationName: 'Do not use', selected: false },
        { locationCode: '00', locationName: 'Owner Main Location', selected: true },
        { locationCode: '02', locationName: 'Owner Alternate Location', selected: false },
      ])
    })
    mockedFetchApplicationClientContacts.mockImplementation(
      (clientNumber, clientLocationCode, applicantType) => {
        if (applicantType === 'agent') {
          return Promise.resolve([
            { contactName: 'Agent Contact', contactId: '-1' },
            { contactName: 'Agent Alternate Contact', contactId: '22' },
          ])
        }

        return Promise.resolve([
          { contactName: 'Owner Contact', contactId: '-1' },
          { contactName: 'Owner Alternate Contact', contactId: '11' },
        ])
      },
    )
    mockedFetchApplicationClientData.mockImplementation((clientNumber) => {
      if (clientNumber === '00033344') {
        return Promise.resolve({
          clientNumber,
          companyName: 'Agent Export Services',
          address: '44 Agent Road',
          city: 'Nanaimo',
          province: 'BC',
          postalCode: 'V9R 1A1',
          country: 'Canada',
          phone: '250-555-0102',
          fax: '',
          email: 'agent@example.test',
          notfound: '',
        })
      }

      return Promise.resolve({
        clientNumber,
        companyName: 'Owner Forestry Ltd.',
        address: '22 Owner Road',
        city: 'Victoria',
        province: 'BC',
        postalCode: 'V8V 1A1',
        country: 'Canada',
        phone: '250-555-0101',
        fax: '',
        email: 'owner@example.test',
        notfound: '',
      })
    })
    mockedSendApplicationReviewStatusEmail.mockResolvedValue({
      success: true,
      message: 'Email sent.',
    })
    mockedFetchApplicationPackageDetails.mockResolvedValue({
      success: true,
      packageNumber: 'PKG-1',
      volume: '100.0',
      scaledVolume: 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: 'Ready',
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'LOG',
      productTypeDescription: 'Logs',
    })
    mockedFetchApplicationPackageSpecies.mockResolvedValue([
      {
        species: 'FI',
        endUse: 'LU',
        endUseDescription: 'Lumber',
      },
    ])
    mockedFetchApplicationSpecies.mockResolvedValue([
      {
        species: 'FI',
        endUse: 'LU',
        endUseDescription: 'Lumber',
      },
    ])
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 5,
        volume: '20.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
    ])
    mockedFetchApplicationUniqueScales.mockResolvedValue([])
    mockedFetchApplicationSpeciesCodes.mockResolvedValue([
      { code: 'FI', description: 'Douglas-fir' },
      { code: 'CE', description: 'Cedar' },
    ])
    mockedFetchApplicationPackageStatusCodes.mockResolvedValue([
      { code: 'ACT', description: 'Active' },
      { code: 'SHT', description: 'Shutout' },
    ])
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([{ code: 'CE', description: 'Cedar' }])
    mockedFetchApplicationEndUsesForSpeciesRegion.mockResolvedValue([
      { code: 'LU', description: 'Lumber' },
    ])
    mockedFetchApplicationGradeCodes.mockResolvedValue([{ code: '1', description: 'Sawlog' }])
    mockedFetchApplicationScaleDetails.mockResolvedValue({
      success: true,
      timberMark: 'TM001',
      species: 'FI',
      pieces: '5',
      grade: '1',
      volume: '20.0',
      id: '55',
    })
    mockedUpdateApplicationPackage.mockResolvedValue({
      valid: true,
      packageNumber: 'PKG-1',
      errors: [],
      warnings: [],
    })
    mockedAddApplicationPackage.mockResolvedValue({
      valid: true,
      packageNumber: 'PKG-NEW',
      errors: [],
      warnings: [],
    })
    mockedAddApplicationScaleToPackage.mockResolvedValue({
      valid: true,
      result: {
        permitted: false,
        timberMark: 'TM002',
        species: 'Cedar',
        grade: 'Sawlog',
        pieces: 2,
        volume: '8.0',
        id: '56',
        cascadeSplitCode: 'S',
      },
      errors: [],
      warnings: [],
    })
    mockedDeleteApplicationPackage.mockResolvedValue({ success: true })
    mockedDeleteApplicationScale.mockResolvedValue({ success: true })
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: true })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '12',
      productTypeCode: 'H',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
    })
    mockedUpdateApplicationSummary.mockResolvedValue({
      valid: true,
      message: 'The application was saved successfully.',
      applicationNumber: '321',
      errors: [],
      warnings: [],
    })
    mockedSaveApplicationRemark.mockResolvedValue({
      success: true,
      remarkId: '88',
      remark: 'New application note',
      title: 'New application note',
      user: 'idir\\jsmith',
      status: 'ok',
    })
  })

  it('shows the legacy application author in the high-level identity', async () => {
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

    const highlights = await screen.findByRole('group', { name: 'Application highlights' })
    expect(within(highlights).getByText('Author')).toBeInTheDocument()
    expect(within(highlights).getByText('idir\\application-author')).toBeInTheDocument()
  })

  it('does not display a historical Cognito subject as the application author', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      author: '8c5df5b8-c041-7016-0f61-92b0d0000000',
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

    const highlights = await screen.findByRole('group', { name: 'Application highlights' })
    expect(within(highlights).getByText('Not available')).toBeInTheDocument()
    expect(within(highlights).queryByText(/8c5df5b8/i)).not.toBeInTheDocument()
  })

  it('uses the legacy application detail tab order', async () => {
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

    const tabs = await screen.findAllByRole('tab')
    const pageHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Application 321',
    })
    const pageHeader = pageHeading.closest('.lexis-page-header')
    expect(pageHeader).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      within(pageHeader as HTMLElement).getByText('Check and manage this provincial application'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Provincial application search' })).toHaveAttribute(
      'href',
      '/provincial/application',
    )
    const status = within(pageHeader as HTMLElement).getByText('Approved')
    expect(status).toHaveClass('lexis-status-tag')
    expect(status).toHaveAttribute('data-status-variant', 'positive')
    expect(
      within(pageHeader as HTMLElement).queryByRole('group', { name: 'Page actions' }),
    ).not.toBeInTheDocument()
    const applicationHighlights = screen.getByRole('group', { name: 'Application highlights' })
    expect(within(applicationHighlights).getByText('Package count')).toBeInTheDocument()
    expect(within(applicationHighlights).getByText('File count')).toBeInTheDocument()
    expect(within(applicationHighlights).getByText('1')).toBeInTheDocument()
    expect(within(applicationHighlights).getByText('0')).toBeInTheDocument()
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('shows missing summary options only on the editable Application tab', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'APP', label: 'Approved' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    await waitFor(() => expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled())
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Missing required options: exemption reason. Summary changes cannot be saved.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Summary' })).toBeDisabled()

    await selectApplicationDetailTab('Owner')
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()
  })

  it('uses semantic empty states for unavailable clients and truly empty tab data', async () => {
    mockedFetchApplicationClientData.mockResolvedValue(null)
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [],
      remarks: [],
      offers: [],
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

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Owner details unavailable' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No agent assigned' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No permits found' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No packages found' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No documents found' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No remarks found' }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Offers')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'No offers found' }),
    ).toBeInTheDocument()
  })

  it('loads complete application context without enabling edits for read-only viewers', async () => {
    mockApplicationDetailAuth((action) => action === '/applicationDetails', ['LEXIS_READ_ONLY'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      readOnly: true,
      canEditApplicationDetails: false,
      canEditPackages: false,
      canAddPackages: false,
      canAddScales: false,
      canUpdatePackageNumber: false,
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

    expect(await screen.findByText('Owner Contact')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00')

    await selectApplicationDetailTab('Application')
    const summaryTile = getApplicationSummaryTile()
    const expectSummaryField = (label: string, value: string) => {
      const field = within(summaryTile).getByText(label).closest('.detail-field-item')
      expect(field).toBeTruthy()
      expect(within(field as HTMLElement).getByText(value)).toBeInTheDocument()
    }
    expectSummaryField('Applicant type', 'A - Agent')
    expectSummaryField('Owner client location', '00')
    expectSummaryField('Owner contact name', 'Owner Contact')
    expectSummaryField('Growth type', 'O')
    expectSummaryField('Location of logs', 'BC')
    expectSummaryField('Application species', 'FI')
    expectSummaryField('Application end use', 'LU')
    expect(within(summaryTile).queryByRole('button', { name: 'Save Summary' })).toBeNull()
  })

  it('shows permit lookup failures as unavailable and fails closed for industry uploads', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchApplicationPermits.mockRejectedValue(new Error('permit lookup failed'))

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

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Permits unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Permit information could not be retrieved for this application.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 3, name: 'No permits found' }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByText(
        'Application document upload is unavailable while permit information cannot be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
  })

  it('shows document lookup failures as unavailable instead of truly empty', async () => {
    mockedFetchApplicationDocuments.mockRejectedValue(new Error('document lookup failed'))

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

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Documents unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Document information could not be retrieved for this application.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 3, name: 'No documents found' }),
    ).not.toBeInTheDocument()
  })

  it('labels the header file count unavailable without presenting a failed lookup as zero', async () => {
    mockedFetchApplicationDocuments.mockRejectedValue(new Error('document lookup failed'))

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

    const applicationHighlights = await screen.findByRole('group', {
      name: 'Application highlights',
    })
    await waitFor(() => {
      expect(within(applicationHighlights).getByText('Unavailable')).toBeInTheDocument()
    })
    expect(within(applicationHighlights).getByText('File count')).toBeInTheDocument()
    expect(within(applicationHighlights).queryByText('0')).not.toBeInTheDocument()
  })

  it('hides remarks and review tabs without legacy remarks/review access', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/applicationRemarks')

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

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Offers',
    ])
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('shows offer company and received date from application detail', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      offers: [
        {
          offerNumber: 'OFF-77',
          companyName: 'Example Lumber',
          receivedDate: '2026-04-05',
          validOffer: true,
          withdrawalDate: null,
        },
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

    await selectApplicationDetailTab('Offers')

    expect(await screen.findByRole('region', { name: 'Application offers' })).toBeInTheDocument()
    expect(await screen.findByText('Example Lumber')).toBeInTheDocument()
    expect(screen.getByText('2026-04-05')).toBeInTheDocument()
    expect(screen.getByText('OFF-77')).toBeInTheDocument()
  })

  it('renders application permits and opens permit details', async () => {
    mockedFetchApplicationPermits.mockResolvedValue([
      { permitNumber: '900100', permitStatusDescription: 'Active' },
      { permitNumber: '900101', permitStatusDescription: 'Complete' },
    ])

    render(
      <MemoryRouter initialEntries={['/provincial/application/321?packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/provincial/permit/:permitNumber" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchApplicationPermits).toHaveBeenCalledWith('321')
    })
    await selectApplicationDetailTab('Application')
    const permitRow = (await screen.findByText('900101')).closest('tr')
    expect(permitRow).toBeTruthy()
    const permitStatus = within(permitRow as HTMLElement).getByText('Complete')
    expect(permitStatus).toHaveClass('lexis-status-tag')
    expect(permitStatus).toHaveAttribute('data-status-variant', 'positive')

    await userEvent.click(within(permitRow as HTMLElement).getByRole('button', { name: 'Open' }))

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/permit/900101?packageFilter=PKG-1')
  })

  it('links to the contextual exemption and preserves current query parameters', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/provincial/exemption/:exemptionNumber" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const summaryTile = await selectApplicationSummaryTile()
    const exemptionLink = within(summaryTile).getByRole('link', { name: 'EX-555' })
    await userEvent.click(exemptionLink)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/exemption/EX-555?packageFilter=PKG-1')
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('renders the exemption number as plain text without exemption route capabilities', async () => {
    mockApplicationDetailAuth(
      (action: string) => action !== '/exemptionSearch' && action !== '/exemptionDetails',
    )

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

    const summaryTile = await selectApplicationSummaryTile()
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('keeps an industry-linked NEW exemption as plain text', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue(newExemptionDetail)

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

    const summaryTile = await selectApplicationSummaryTile()
    await waitFor(() => {
      expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
    })
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
  })

  it('links an industry application after non-NEW exemption access is verified', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...newExemptionDetail,
      exemptionStatusCode: 'ACT',
      exemptionStatusDescription: 'Active',
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

    const summaryTile = await selectApplicationSummaryTile()
    expect(await within(summaryTile).findByRole('link', { name: 'EX-555' })).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-555',
    )
    expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
  })

  it('shows the embedded application upload panel on the documents tab without header actions', async () => {
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

    await selectApplicationDetailTab('Documents')

    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
  })

  it('shows inline application upload to a scoped Provincial Submitter', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === '/fileApplicationUpload',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
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

    await selectApplicationDetailTab('Documents')

    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
    expect(screen.getByLabelText('Document description')).toBeInTheDocument()
  })

  it('shows only the upload panel when an application has no documents', async () => {
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

    await selectApplicationDetailTab('Documents')

    expect(
      await screen.findByRole('heading', { level: 3, name: 'No documents found' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('No documents are on file for this application yet.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
    expect(screen.getByLabelText('Document description')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter document rows')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No document rows matched the current filter.'),
    ).not.toBeInTheDocument()
  })

  it('shows existing application documents before the upload accordion', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '900',
          name: 'existing-doc.pdf',
          description: 'Existing document',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('existing-doc.pdf')
    const uploadToggle = screen.getByRole('button', { name: 'Upload new documents' })

    expect(screen.getByRole('region', { name: 'Application document rows' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter document rows')).toBeInTheDocument()
    expect(
      documentName.compareDocumentPosition(uploadToggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await userEvent.click(uploadToggle)
    expect(screen.getByLabelText('Document description')).toBeVisible()
  })

  it('disables application upload for expired applications', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
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

    await selectApplicationDetailTab('Documents')

    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(
      await screen.findByText(
        'Application document upload is unavailable for expired applications.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
  })

  it('disables application upload for industry users when a permit is complete', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchApplicationPermits.mockResolvedValue([
      { permitNumber: '900101', permitStatusDescription: 'Complete' },
    ])

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

    expect(
      await screen.findByText(
        'Application document upload is unavailable for industry users when the application has a complete permit.',
      ),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
  })

  it('blocks application summary and package edits for exemption approvers', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      exemptionApprover: true,
      canEditApplicationDetails: false,
      canEditPackages: false,
      canAddPackages: false,
      canAddScales: false,
      canUpdatePackageNumber: false,
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it.each([
    ['EXE', 'Exempted - New'],
    ['PMT', 'Permitted'],
    ['EXP', 'Expired'],
    ['PND', 'Pending'],
    ['REJ', 'Rejected'],
    ['WDN', 'Withdrawn'],
  ])(
    'blocks application summary and package edits for %s applications',
    async (applicationStatusCode, statusDescription) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        applicationStatusCode,
        statusDescription,
        canEditApplicationDetails: false,
        canEditPackages: false,
        canAddPackages: false,
        canAddScales: false,
        canUpdatePackageNumber: false,
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

      await selectApplicationDetailTab('Application')
      expect(await screen.findByText('Application summary')).toBeInTheDocument()
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
      const summaryTile = getApplicationSummaryTile()
      expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

      await selectApplicationDetailTab('Items')
      expect(await screen.findByText('Package Details')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
      expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
      expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
      expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
      expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
    },
  )

  it('keeps item mutations available when the server denies only summary editing', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      canEditApplicationDetails: false,
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'APP', label: 'Approved' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [],
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

    await selectApplicationDetailTab('Application')
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(within(getApplicationSummaryTile()).queryByLabelText('Exemption reason')).toBeNull()
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
      expect(screen.queryByText('Loading authoritative item options...')).not.toBeInTheDocument()
      expect(screen.queryByText('Item options unavailable')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save Package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Create Package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Add Scale' })).toBeEnabled()
    })
  })

  it('keeps summary editing available when the server denies item mutations', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      canEditApplicationDetails: true,
      canEditPackages: false,
      canAddPackages: false,
      canAddScales: false,
      canUpdatePackageNumber: false,
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

    await selectApplicationDetailTab('Application')
    expect(
      await within(getApplicationSummaryTile()).findByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeEnabled()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
  })

  it('uses server edit policy instead of inferring permissions from application status', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      canEditApplicationDetails: true,
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
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

    await selectApplicationDetailTab('Application')
    expect(
      await within(getApplicationSummaryTile()).findByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeEnabled()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByRole('button', { name: 'Save Package' })).toBeEnabled()
  })

  it('blocks application edits when another user holds the edit lock', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      locked: true,
      lockedBy: 'Reviewer One',
      lockMessage:
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '900',
          name: 'locked-doc.pdf',
          description: 'Locked document',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application locked')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')

    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
    await selectApplicationDetailTab('Documents')
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
    expect(await screen.findByText('locked-doc.pdf')).toBeInTheDocument()
    screen
      .getAllByRole('button', { name: 'Delete' })
      .forEach((button) => expect(button).toBeDisabled())
    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
  })

  it('uploads application documents inline and refreshes document rows', async () => {
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '900',
            name: 'uploaded-doc.pdf',
            description: 'Uploaded',
            type: 'Attachment',
          },
        ],
        source: 'api',
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

    await selectApplicationDetailTab('Documents')
    const file = new File(['test'], 'uploaded-doc.pdf', { type: 'application/pdf' })

    await userEvent.type(screen.getByLabelText('Document description'), 'Uploaded')
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedValidateAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
          fileDescription: 'Uploaded',
        }),
      )
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
          fileDescription: 'Uploaded',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getAllByText('uploaded-doc.pdf').length).toBeGreaterThanOrEqual(1)
    })
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
  })

  it('keeps a partial upload queue mounted while the document list refreshes', async () => {
    let resolveDocumentRefresh:
      | ((value: Awaited<ReturnType<typeof fetchApplicationDocuments>>) => void)
      | undefined
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({ rows: [], source: 'api' })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDocumentRefresh = resolve
        }),
      )
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({ status: 'success', message: 'First document uploaded.' })
      .mockRejectedValueOnce(new Error('Second upload failed'))

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

    await selectApplicationDetailTab('Documents')
    await userEvent.type(await screen.findByLabelText('Document description'), 'Mixed batch')
    await userEvent.upload(screen.getByLabelText('Document File'), [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('second.pdf').length).toBeGreaterThan(0)

    await act(async () => {
      resolveDocumentRefresh?.({
        rows: [
          {
            id: '901',
            name: 'first.pdf',
            description: 'Mixed batch',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
    })

    expect(await screen.findByText(/1 file failed/)).toBeInTheDocument()
    expect(screen.getAllByText('second.pdf').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Upload new documents' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('includes queued document uploads in application dirty-state protection', async () => {
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

    await selectApplicationDetailTab('Documents')
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)

    await userEvent.upload(
      screen.getByLabelText('Document File'),
      new File(['queued'], 'queued-doc.pdf', { type: 'application/pdf' }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled())
    const queuedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(queuedUnload)
    expect(queuedUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const clearedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clearedUnload)
    expect(clearedUnload.defaultPrevented).toBe(false)
  })

  it('ignores stale detail responses after navigating to another application', async () => {
    const secondApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationNumber: 654,
      exemptionNumber: 'EX-654',
      statusDescription: 'Second status',
      ownerClientNumber: '00099988',
      agentClientNumber: '00077766',
    }
    let resolveFirstDetail: ((value: ProvincialApplicationDetail) => void) | undefined
    mockedFetchProvincialApplicationDetail
      .mockImplementationOnce(
        () =>
          new Promise<ProvincialApplicationDetail>((resolve) => {
            resolveFirstDetail = resolve
          }),
      )
      .mockResolvedValueOnce(secondApplicationDetail)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={
              <>
                <NavigateButton to="/provincial/application/654" />
                <ProvincialApplicationDetailsPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('321')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Navigate application' }))

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('654')
    })
    expect(
      await screen.findByText('Second status', { selector: '.lexis-status-tag' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)

    await act(async () => {
      resolveFirstDetail?.(applicationDetail)
    })

    expect(screen.getByText('Second status', { selector: '.lexis-status-tag' })).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)
    expect(screen.queryByText('00011122')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(1)
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('opens application document from API response', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '100',
          name: 'app-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

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

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenApplicationDocument).toHaveBeenCalledWith('100', 'app-doc.pdf', '321')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes application documents and refreshes rows', async () => {
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '100',
            name: 'app-doc.pdf',
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
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveApplicationDocument).toHaveBeenCalledWith('100', '321')
      expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('app-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('keeps linked permit documents read-only on the application aggregate', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '101',
          name: 'permit-doc.pdf',
          description: 'linked permit copy',
          type: 'Permit document',
          source: 'permit',
          deletable: false,
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    const documentRow = (await screen.findByText('permit-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByText('Permit')).toBeInTheDocument()
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps application document delete disabled for approvers when the application is expired', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '100',
          name: 'expired-doc.pdf',
          description: 'expired application',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(
      await screen.findByText(
        'Application document upload is unavailable for expired applications.',
      ),
    ).toBeInTheDocument()

    const documentName = await screen.findByText('expired-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps expired application document delete available to scoped industry users', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === '/applicationDetails',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      industryUser: true,
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '104',
          name: 'industry-expired-doc.pdf',
          description: 'legacy industry cleanup',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentRow = (await screen.findByText('industry-expired-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('ignores stale document refreshes after navigating to another application', async () => {
    const secondApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationNumber: 654,
      ownerClientNumber: '00099988',
    }
    let resolveStaleDocuments:
      | ((value: Awaited<ReturnType<typeof fetchApplicationDocuments>>) => void)
      | undefined
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(secondApplicationDetail)
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '100',
            name: 'old-doc.pdf',
            description: 'old application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleDocuments = resolve
          }),
      )
      .mockResolvedValueOnce({
        rows: [
          {
            id: '200',
            name: 'new-doc.pdf',
            description: 'new application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={
              <>
                <NavigateButton to="/provincial/application/654" />
                <ProvincialApplicationDetailsPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('old-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => {
      expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Navigate application' }))

    expect(await screen.findByText('new-doc.pdf')).toBeInTheDocument()

    await act(async () => {
      resolveStaleDocuments?.({
        rows: [
          {
            id: '999',
            name: 'stale-doc.pdf',
            description: 'stale application',
            type: 'Attachment',
          },
        ],
        source: 'api',
      })
    })

    expect(screen.getByText('new-doc.pdf')).toBeInTheDocument()
    expect(screen.queryByText('old-doc.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('stale-doc.pdf')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('edits package species and saves application item details', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })
    const applicationItemSummary = screen.getByLabelText('Application item summary')
    expect(
      within(applicationItemSummary as HTMLElement).getByText('Application Total Pieces'),
    ).toBeInTheDocument()
    expect(within(applicationItemSummary as HTMLElement).getByText('5')).toBeInTheDocument()
    const packageDetailsSection = screen.getByText('Package Details').closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total Scale Volume'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('20')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total Pieces'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('5')).toBeInTheDocument()

    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[0],
      'CE - Cedar',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add Species' }))
    await waitFor(() => {
      expect(screen.getAllByText('CE - Cedar').some((element) => element.tagName === 'TD')).toBe(
        true,
      )
    })

    await userEvent.clear(screen.getByLabelText('Package Comments'))
    await userEvent.type(screen.getByLabelText('Package Comments'), 'Updated package')
    await userEvent.click(screen.getByRole('button', { name: 'Save Package' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          comments: 'Updated package',
          endUseCode: 'LU',
          speciesCodes: ['FI', 'CE'],
        }),
      )
    })
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()
  })

  it('guards package drafts and provides an explicit local reset', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: (
            <>
              <ProvincialApplicationDetailsPage />
              <Link to="/next">Leave application</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/application/321'] },
    )
    render(<RouterProvider router={router} />)

    await selectApplicationDetailTab('Items')
    const comments = await screen.findByLabelText('Package Comments')
    await userEvent.clear(comments)
    await userEvent.type(comments, 'Unsaved package draft')
    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))

    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    expect(dialog).toHaveAccessibleDescription(/Use the Items tab to save or reset/)
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset package drafts' }))

    expect(screen.getByLabelText('Package Comments')).toHaveValue('Ready')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('preserves summary, remark, and review drafts when a package refreshes detail', async () => {
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

    await selectApplicationDetailTab('Application')
    fireEvent.change(await screen.findByLabelText('Location of logs'), {
      target: { value: 'AB' },
    })
    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Preserve remark draft' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await chooseComboBoxOption(
      reviewTile.getByRole('combobox', { name: 'Application status' }),
      'Rejected',
    )
    fireEvent.change(reviewTile.getByLabelText('Review remark'), {
      target: { value: 'Preserve review draft' },
    })
    await selectApplicationDetailTab('Items')
    fireEvent.change(await screen.findByLabelText('Package Comments'), {
      target: { value: 'Saved package change' },
    })
    const detailFetchCountBeforeSave = mockedFetchProvincialApplicationDetail.mock.calls.length
    const savePackageButton = screen.getByRole('button', { name: 'Save Package' })
    await userEvent.click(savePackageButton)
    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledTimes(1)
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
        detailFetchCountBeforeSave + 1,
      )
      expect(savePackageButton).toBeEnabled()
    })
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(screen.getByLabelText('Location of logs')).toHaveValue('AB')
    await selectApplicationDetailTab('Remarks')
    expect(screen.getByLabelText('New Remark')).toHaveValue('Preserve remark draft')
    const preservedReviewTile = within(await selectApplicationReviewTile())
    expect(preservedReviewTile.getByRole('combobox', { name: 'Application status' })).toHaveValue(
      'Rejected',
    )
    expect(preservedReviewTile.getByLabelText('Review remark')).toHaveValue('Preserve review draft')
  })

  it('fails closed when selected package data cannot be loaded', async () => {
    mockedFetchApplicationPackageSpecies.mockRejectedValue(
      new Error('Oracle package species lookup failed'),
    )

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

    await selectApplicationDetailTab('Items')

    expect(
      await screen.findByText('Unable to retrieve application item details.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Save Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedDeleteApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('disables package and scale mutations when authoritative item options fail', async () => {
    mockedFetchApplicationPackageStatusCodes.mockRejectedValue(
      new Error('Oracle package status lookup failed'),
    )

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

    await selectApplicationDetailTab('Items')

    expect(await screen.findByText('Item options unavailable')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows field validation before creating an empty package', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByRole('button', { name: 'Create Package' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Package number is required.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('blocks duplicate package numbers before creating a package', async () => {
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

    await selectApplicationDetailTab('Items')
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)
    const packageNumberInput = createPackageControls.getByLabelText(
      'Package Number',
    ) as HTMLInputElement

    await userEvent.type(packageNumberInput, 'pkg-1')
    expect(packageNumberInput.value).toBe('PKG-1')
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Package PKG-1 already exists.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('shows legacy package validation before creating an invalid package', async () => {
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

    await selectApplicationDetailTab('Items')
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    await userEvent.type(createPackageControls.getByLabelText('Package Number'), 'pkg-new')
    await userEvent.type(createPackageControls.getByLabelText('Package Volume'), '25.55')
    await userEvent.type(createPackageControls.getByLabelText('Average Length'), '100')
    await userEvent.type(createPackageControls.getByLabelText('Average Diameter'), '100')
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(
      screen.getAllByText('Package volume must have no more than one decimal place.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Average length must be 99 or less.')).toBeInTheDocument()
    expect(screen.getByText('Average diameter must be 99.99 or less.')).toBeInTheDocument()
    expect(screen.getByText('Package status code is required.')).toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('requires age class before creating a harvested product package', async () => {
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

    await selectApplicationDetailTab('Items')
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    await userEvent.type(createPackageControls.getByLabelText('Package Number'), 'PKG-NEW')
    await userEvent.type(createPackageControls.getByLabelText('Package Volume'), '25.0')
    await userEvent.type(createPackageControls.getByLabelText('Average Length'), '12.0')
    await userEvent.type(createPackageControls.getByLabelText('Average Diameter'), '24.0')
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Status Code' }),
      'ACT - Active',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Product Type' }),
      'H - Harvested Timber',
    )
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Age class is required.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('creates application packages with selected species and end use', async () => {
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

    await selectApplicationDetailTab('Items')
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Create Package Species' }),
      'CE - Cedar',
    )
    await userEvent.click(
      createPackageControls.getByRole('button', { name: 'Add species to new package' }),
    )
    await waitFor(() => {
      expect(createPackageControls.getByText('CE - Cedar')).toBeInTheDocument()
    })

    await userEvent.type(createPackageControls.getByLabelText('Package Number'), 'PKG-NEW')
    await userEvent.type(createPackageControls.getByLabelText('Package Volume'), '25.0')
    await userEvent.type(createPackageControls.getByLabelText('Average Length'), '12.0')
    await userEvent.type(createPackageControls.getByLabelText('Average Diameter'), '24.0')
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Status Code' }),
      'ACT - Active',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Product Type' }),
      'H - Harvested Timber',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Age Class' }),
      'S - Second Growth',
    )
    await waitFor(() => {
      expect(createPackageControls.getByRole('combobox', { name: 'End Use Options' })).toHaveValue(
        'LU - Lumber',
      )
    })

    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    await waitFor(() => {
      expect(mockedAddApplicationPackage).toHaveBeenCalledWith({
        packageNumber: 'PKG-NEW',
        applicationNumber: '321',
        volume: '25.0',
        averageLength: '12.0',
        averageDiameter: '24.0',
        status: 'ACT',
        comments: '',
        reprocessed: 'N',
        ageClass: 'S',
        productType: 'H',
        endUseCode: 'LU',
        speciesCodes: ['CE'],
      })
    })
    expect(await screen.findByText('Package PKG-NEW created.')).toBeInTheDocument()
  })

  it('deletes the selected application package', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 0,
        volume: '0.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
    ])

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

    await selectApplicationDetailTab('Items')
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: 'Package Details' })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(
      within(packageDetailsSection as HTMLElement).getAllByText('Package Number').length,
    ).toBeGreaterThan(1)
    expect(within(packageDetailsSection as HTMLElement).getByText('PKG-1')).toBeInTheDocument()

    await userEvent.click(
      within(packageDetailsSection as HTMLElement).getByRole('button', {
        name: 'Delete Package',
      }),
    )

    await waitFor(() => {
      expect(mockedDeleteApplicationPackage).toHaveBeenCalledWith('PKG-1', '321')
    })
    expect(await screen.findByText('Package PKG-1 deleted.')).toBeInTheDocument()
  })

  it('prevents package save and delete when package scales are permitted', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: true,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 5,
        volume: '20.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
    ])

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

    await selectApplicationDetailTab('Items')
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: 'Package Details' })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByLabelText('Package Comments')).toBeDisabled()
      expect(
        within(packageDetailsSection as HTMLElement).getByRole('button', {
          name: 'Save Package',
        }),
      ).toBeDisabled()
      expect(
        within(packageDetailsSection as HTMLElement).getByRole('button', {
          name: 'Delete Package',
        }),
      ).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'Add Species' })).toBeDisabled()
    const packageSpeciesSection = screen.getByText('Package Species').closest('section')
    expect(packageSpeciesSection).toBeTruthy()
    expect(
      within(packageSpeciesSection as HTMLElement).getByRole('button', { name: 'Remove' }),
    ).toBeDisabled()
  })

  it('ignores stale package item responses after selecting another package', async () => {
    const detailWithTwoPackages: ProvincialApplicationDetail = {
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 200, pieceCount: 8 },
      ],
    }
    let resolveFirstPackageDetails:
      | ((value: Awaited<ReturnType<typeof fetchApplicationPackageDetails>>) => void)
      | undefined
    mockedFetchProvincialApplicationDetail.mockResolvedValue(detailWithTwoPackages)
    mockedFetchApplicationPackageDetails
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstPackageDetails = resolve
          }),
      )
      .mockResolvedValueOnce({
        success: true,
        packageNumber: 'PKG-2',
        volume: '200.0',
        scaledVolume: 40,
        length: '14.0',
        diameter: '26.0',
        status: 'ACT',
        comments: 'Second package',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: 'O',
        ageClassDescription: 'Old',
        productType: 'LOG',
        productTypeDescription: 'Logs',
      })
    mockedFetchApplicationPackageSpecies.mockResolvedValue([
      {
        species: 'CE',
        endUse: 'LU',
        endUseDescription: 'Lumber',
      },
    ])
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM002',
        species: 'Cedar',
        grade: 'Sawlog',
        pieces: 8,
        volume: '40.0',
        id: '56',
        cascadeSplitCode: 'S',
      },
    ])

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

    await selectApplicationDetailTab('Items')
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })

    const packagesSection = (await screen.findByRole('heading', { name: 'Packages' })).closest(
      '.cds--tile',
    )
    expect(packagesSection).toBeTruthy()
    const secondPackageRow = within(packagesSection as HTMLElement)
      .getByText('PKG-2')
      .closest('tr')
    expect(secondPackageRow).toBeTruthy()
    expect(within(secondPackageRow as HTMLElement).getByText('200')).toBeInTheDocument()
    expect(within(secondPackageRow as HTMLElement).getByText('8')).toBeInTheDocument()

    fireEvent.click(
      within(secondPackageRow as HTMLElement).getByRole('button', {
        name: 'Edit package PKG-2 items',
      }),
    )

    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
      expect(screen.getByLabelText('Package Comments')).toHaveValue('Second package')
    })

    await act(async () => {
      resolveFirstPackageDetails?.({
        success: true,
        packageNumber: 'PKG-1',
        volume: '100.0',
        scaledVolume: 20,
        length: '12.0',
        diameter: '24.0',
        status: 'ACT',
        comments: 'First package stale',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: 'O',
        ageClassDescription: 'Old',
        productType: 'LOG',
        productTypeDescription: 'Logs',
      })
    })

    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-2')
    expect(screen.getByLabelText('Package Comments')).toHaveValue('Second package')
    expect(screen.queryByDisplayValue('First package stale')).not.toBeInTheDocument()
    expect(screen.getByText('TM002')).toBeInTheDocument()
    expect(screen.queryByText('TM001')).not.toBeInTheDocument()
    expect(mockedFetchApplicationPackageSpecies).not.toHaveBeenCalledWith('PKG-1')
    expect(mockedFetchApplicationPackageScales).not.toHaveBeenCalledWith('PKG-1')
  })

  it('confirms and clears package-specific drafts before switching packages', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 200, pieceCount: 8 },
      ],
    })
    mockedFetchApplicationPackageDetails.mockImplementation(async (packageNumber) => ({
      success: true,
      packageNumber,
      volume: packageNumber === 'PKG-2' ? '200.0' : '100.0',
      scaledVolume: packageNumber === 'PKG-2' ? 40 : 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: `${packageNumber} comments`,
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'LOG',
      productTypeDescription: 'Logs',
    }))

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

    await selectApplicationDetailTab('Items')
    await waitFor(() =>
      expect(screen.getByLabelText('Package Comments')).toHaveValue('PKG-1 comments'),
    )
    await userEvent.type(screen.getByLabelText('Timber Mark'), 'DRAFT-A')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Selected Package' }), 'PKG-2')

    const confirmation = await screen.findByRole('dialog', { name: 'Discard package drafts?' })
    expect(confirmation).toHaveAccessibleDescription(/discard unsaved package, species, and scale/)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-1')
    expect(screen.getByLabelText('Timber Mark')).toHaveValue('DRAFT-A')

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Selected Package' }), 'PKG-2')
    await userEvent.click(screen.getByRole('button', { name: 'Discard and switch' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-2')
      expect(screen.getByLabelText('Timber Mark')).toHaveValue('')
    })
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows legacy timber mark summaries for application scales', async () => {
    mockedFetchApplicationUniqueScales.mockResolvedValue([{ timberMark: 'TM-SUMMARY' }])

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

    await selectApplicationDetailTab('Items')
    const timberMarksSection = (
      await screen.findByRole('heading', { name: 'Timber Marks' })
    ).closest('div')
    expect(timberMarksSection).toBeTruthy()
    expect(
      await within(timberMarksSection as HTMLElement).findByText('TM-SUMMARY'),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationUniqueScales).toHaveBeenCalledWith('321')
  })

  it('adds and deletes package scales', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    const detailFetchCountAfterInitialLoad =
      mockedFetchProvincialApplicationDetail.mock.calls.length
    fireEvent.change(screen.getByLabelText('Timber Mark'), { target: { value: 'TM002' } })
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('12', 'FI')
    })
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Scale Volume'), { target: { value: '8.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    await waitFor(() => {
      expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          timberMark: 'TM002',
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          pieces: '2',
          volume: '8.0',
        }),
      )
    })
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
      detailFetchCountAfterInitialLoad,
    )
    expect(await screen.findByText('Scale 56 added.')).toBeInTheDocument()

    const scaleRow = screen.getByText('TM001').closest('tr')
    expect(scaleRow).toBeTruthy()
    expect(within(scaleRow as HTMLElement).getByText('S')).toBeInTheDocument()
    fireEvent.click(within(scaleRow as HTMLElement).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockedDeleteApplicationScale).toHaveBeenCalledWith('55', '321')
    })
  })

  it('looks up package scales by timber mark and scale id', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('TM001')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Scale ID or timber mark'), {
      target: { value: 'TM001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lookup Scale' }))
    expect(
      await screen.findByText(
        'Found 1 scale row for timber mark TM001: TM001 Douglas-fir/Sawlog 5 pcs 20.0 m3',
      ),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationScaleDetails).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Scale ID or timber mark'), { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lookup Scale' }))
    expect(await screen.findByText('TM001 FI/1 5 pcs 20.0 m3')).toBeInTheDocument()
    expect(mockedFetchApplicationScaleDetails).toHaveBeenCalledWith('55')
  })

  it('shows field validation before adding an empty scale', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Timber mark is required.').length).toBeGreaterThan(0)
    expect(screen.getByText('Species is required.')).toBeInTheDocument()
    expect(screen.getByText('Grade is required.')).toBeInTheDocument()
    expect(screen.getByText('Pieces is required.')).toBeInTheDocument()
    expect(screen.getByText('Scale volume is required.')).toBeInTheDocument()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows legacy scale validation before adding invalid scale values', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Timber Mark'), { target: { value: 'TM002' } })
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Scale Volume'), { target: { value: '100000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Pieces must be a whole number.').length).toBeGreaterThan(0)
    expect(screen.getByText('Scale volume must be 99999.9 or less.')).toBeInTheDocument()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('blocks scale volume that exceeds the selected package remaining volume', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Timber Mark'), { target: { value: 'TM002' } })
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Scale Volume'), { target: { value: '80.1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Scale volume must be 80.0 or less.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('saves application remarks and refreshes detail', async () => {
    const detailAfterRemark: ProvincialApplicationDetail = {
      ...applicationDetail,
      remarks: [
        ...applicationDetail.remarks,
        { remarkId: 89, title: 'New application note', remark: 'New application note' },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterRemark)

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

    await selectApplicationDetailTab('Remarks')
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New Remark'), {
      target: { value: 'New application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    await waitFor(() => {
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: 'New application note',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Application remark saved.')).toBeInTheDocument()
    expect(screen.getAllByText('New application note').length).toBeGreaterThan(0)
  })

  it('does not treat a normal remark as a new review-status draft', async () => {
    const rejectedDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
      remarks: [
        {
          remarkId: 90,
          title: 'Review decision',
          remark: 'Review decision',
          user: 'idir\\reviewer',
          date: '2026-01-06',
        },
      ],
    }
    const detailAfterNormalRemark: ProvincialApplicationDetail = {
      ...rejectedDetail,
      remarks: [
        {
          remarkId: 91,
          title: 'Operational note',
          remark: 'Operational note',
          user: 'idir\\reviewer',
          date: '2026-01-07',
        },
        ...rejectedDetail.remarks,
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(rejectedDetail)
      .mockResolvedValueOnce(detailAfterNormalRemark)
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: true,
      remarkId: '91',
      remark: 'Operational note',
      title: 'Operational note',
      user: 'idir\\reviewer',
      status: 'ok',
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

    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Operational note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))
    await waitFor(() => expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2))

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('hides application remarks tab without application remarks action', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/applicationRemarks')

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

    expect(await screen.findByRole('tab', { name: 'Owner' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('updates existing application remarks and refreshes detail', async () => {
    const detailAfterRemarkUpdate: ProvincialApplicationDetail = {
      ...applicationDetail,
      remarks: [
        { remarkId: 88, title: 'Updated application note', remark: 'Updated application note' },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterRemarkUpdate)

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

    await selectApplicationDetailTab('Remarks')
    const remarkRow = (await screen.findByText('ok')).closest('tr')
    expect(remarkRow).toBeTruthy()
    expect(within(remarkRow as HTMLElement).getByText('2026-01-04')).toBeInTheDocument()
    expect(within(remarkRow as HTMLElement).getByText('idir\\reviewer')).toBeInTheDocument()
    await userEvent.click(within(remarkRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    const remarkInput = screen.getByLabelText('Edit Remark 88')
    fireEvent.change(remarkInput, { target: { value: 'Updated application note' } })
    await userEvent.click(screen.getByRole('button', { name: 'Update Remark' }))

    await waitFor(() => {
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: 'Updated application note',
        remarkId: '88',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Application remark updated.')).toBeInTheDocument()
    expect(screen.getAllByText('Updated application note').length).toBeGreaterThan(0)
  })

  it('saves application summary edits and refreshes detail', async () => {
    const detailAfterSummarySave: ProvincialApplicationDetail = {
      ...applicationDetail,
      termDays: 430,
      applicationVolume: 125.5,
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterSummarySave)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'S',
      productLocation: 'BC',
      exportScheduleId: '988',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '02',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '13',
      productTypeCode: 'TIMBER',
      jurisdictionCode: 'F',
      growthTypeCode: 'S',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Alternate Contact',
      oicIndicator: 'Y',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    await selectApplicationDetailTab('Application')
    const summaryControls = within(await waitFor(() => getApplicationSummaryTile()))
    expect(summaryControls.getByLabelText('Application status')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveValue('F - Federal')
    expect(getSummaryComboBox(summaryControls, 'Applicant type')).toBeInTheDocument()
    const termInput = await screen.findByLabelText('Term (days)')
    fireEvent.change(termInput, { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Term (months)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Term (years)'), { target: { value: '1' } })

    const volumeInput = screen.getByLabelText('Application volume (m³)')
    fireEvent.change(volumeInput, { target: { value: '125.5' } })

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner')
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00011122',
        '02',
        'owner',
        '321',
      )
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00033344',
        '01',
        'agent',
        '321',
      )
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '02')
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01')
    })
    await selectApplicationDetailTab('Owner')
    expect(await screen.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(screen.getByText('Agent Export Services')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm application accuracy' })).toBeNull()

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith({
        applicationNumber: '321',
        applicationDate: '2026-01-01',
        receivedDate: '2026-01-02',
        termDays: '430',
        applicationVolume: '125.5',
        averageLogVolume: '2',
        exemptionReasonCode: 'S',
        productLocation: 'BC',
        exportScheduleId: '988',
        agentClientNumber: '00033344',
        agentClientLocationCode: '01',
        ownerClientNumber: '00011122',
        ownerClientLocationCode: '02',
        applicantTypeCode: 'A',
        orgUnitNumber: '13',
        productTypeCode: 'TIMBER',
        growthTypeCode: 'S',
        agentContactName: 'Agent Contact',
        ownerContactName: 'Owner Alternate Contact',
        oicIndicator: 'Y',
        endUseCode: 'LU',
        speciesCodes: ['FI'],
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The application was saved successfully.')).toBeInTheDocument()
  }, 30000)

  it('hides and clears stale agent fields when editing an owner application summary', async () => {
    const ownerApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      agentClientNumber: null,
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(ownerApplicationDetail)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'O',
      orgUnitNumber: '12',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)

    await waitFor(() => {
      expect(summaryControls.queryByLabelText('Agent client number')).not.toBeInTheDocument()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner')
    })
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith('00033344', 'agent')

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantTypeCode: 'O',
          agentClientNumber: '',
          agentClientLocationCode: '',
          agentContactName: '',
        }),
      )
    })
  })

  it('keeps applicant type and workflow fields read-only for scoped submitters', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )

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

    const summaryControls = within(await selectApplicationSummaryTile())
    const applicantType = await summaryControls.findByLabelText('Applicant type')
    expect(applicantType).toHaveAttribute('readonly')
    expect(applicantType).toHaveValue('A - Agent')
    expect(summaryControls.getByLabelText('Application status')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(getSummaryComboBox(summaryControls, 'Applicant type')).toBeUndefined()

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const accuracyDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(accuracyDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(accuracyDialog).getByRole('button', { name: 'Save summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicantTypeCode: undefined }),
      )
    })
  })

  it('validates application summary edits before saving', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    await userEvent.clear(productLocationInput)
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(screen.getAllByText('Location of logs is required.').length).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('uses natural resource region names in application summary edits', async () => {
    const detailWithNaturalResourceRegion: ProvincialApplicationDetail = {
      ...applicationDetail,
      orgUnitNumber: 1903,
      orgUnitName: 'Cariboo Natural Resource Region',
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(detailWithNaturalResourceRegion)
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '1903',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const regionComboBox = getSummaryComboBox(summaryControls, 'Region')

    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'Skeena Natural Resource Region')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          orgUnitNumber: '1908',
        }),
      )
    })
  })

  it('can clear application summary listing date with the blank schedule option', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [
        { value: '987', label: '2026-01-11' },
        { value: '988', label: '2026-01-25' },
        { value: '989', label: '2026-02-08' },
        { value: '', label: 'Blank' },
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const listingDateComboBox = getSummaryComboBox(summaryControls, 'Listing date')

    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-01-11')
    })

    await chooseComboBoxOption(listingDateComboBox, '2026-02-08')
    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-02-08')
    })
    await chooseComboBoxOption(listingDateComboBox, 'Blank')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '',
        }),
      )
    })
  })

  it('validates application summary volume ranges before saving', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const applicationVolumeInput = await summaryControls.findByLabelText('Application volume (m³)')
    const averageLogVolumeInput = await summaryControls.findByLabelText('Average log volume')

    await waitFor(() => {
      expect(applicationVolumeInput).toHaveValue(100)
    })

    await userEvent.clear(applicationVolumeInput)
    await userEvent.type(applicationVolumeInput, '10000000')
    await userEvent.clear(averageLogVolumeInput)
    await userEvent.type(averageLogVolumeInput, '100')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Average log volume must be 99.9 or less.').length).toBeGreaterThan(
      0,
    )
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('rejects three application-volume decimals and accepts the exact Oracle maximum', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const applicationVolume = await summaryControls.findByLabelText('Application volume (m³)')
    const saveSummary = summaryControls.getByRole('button', { name: 'Save Summary' })

    await userEvent.clear(applicationVolume)
    await userEvent.type(applicationVolume, '250.999')
    await userEvent.click(saveSummary)

    expect(
      screen.getAllByText('Application volume must have no more than two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.clear(applicationVolume)
    await userEvent.type(applicationVolume, '9999999.99')
    await userEvent.click(saveSummary)

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  })

  it('applies H, S, and T summary fields without hidden stale-value validation', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const productType = getSummaryComboBox(summaryControls, 'Product type')
    const averageLogVolume = await summaryControls.findByLabelText('Average log volume')
    const productLocation = summaryControls.getByLabelText('Location of logs')

    expect(getSummaryComboBox(summaryControls, 'Growth type')).toBeInTheDocument()
    await userEvent.clear(averageLogVolume)
    await userEvent.type(averageLogVolume, '-0.1')
    await userEvent.clear(productLocation)

    await chooseComboBoxOption(productType, 'Standing Timber')
    expect(getSummaryComboBox(summaryControls, 'Growth type')).toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Average log volume')).not.toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Location of logs')).not.toBeInTheDocument()

    await clearComboBox(getSummaryComboBox(summaryControls, 'Growth type'))
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))
    expect(screen.getAllByText('Growth type is required.').length).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await chooseComboBoxOption(productType, 'Timber')
    expect(summaryControls.queryByRole('combobox', { name: 'Growth type' })).not.toBeInTheDocument()
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeCode: 'T',
          growthTypeCode: '',
          productLocation: '',
          averageLogVolume: '-0.1',
        }),
      )
    })
  })

  it('warns once before saving summary when package volumes do not consume application volume', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })

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

    await selectApplicationDetailTab('Application')
    await screen.findByLabelText('Application volume (m³)')

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    })
  })

  it('requires submitter accuracy confirmation while preserving the volume warning', async () => {
    mockApplicationDetailAuth(() => true, ['PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })

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

    await selectApplicationDetailTab('Application')
    await screen.findByLabelText('Application volume (m³)')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const firstDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    const firstAcknowledgement = within(firstDialog).getByRole('checkbox', { name: 'I Agree' })
    const firstConfirm = within(firstDialog).getByRole('button', { name: 'Save summary' })
    expect(firstAcknowledgement).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    await userEvent.click(firstConfirm)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(firstAcknowledgement)
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const reopenedDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    const reopenedAcknowledgement = within(reopenedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(reopenedAcknowledgement).not.toBeChecked()
    await userEvent.click(reopenedAcknowledgement)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Save summary' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    const warningAcceptedDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const warningAcceptedAcknowledgement = within(warningAcceptedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(warningAcceptedAcknowledgement).not.toBeChecked()
    await userEvent.click(warningAcceptedAcknowledgement)
    await userEvent.click(
      within(warningAcceptedDialog).getByRole('button', { name: 'Save summary' }),
    )

    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))
  })

  it('resets application summary edits from the editable snapshot', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
      expect(getSummaryComboBox(summaryControls, 'Owner client location')).toHaveValue(
        'Owner Main Location',
      )
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue('Coast')
    })

    await userEvent.clear(productLocationInput)
    await userEvent.type(productLocationInput, 'Changed location')
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Owner client location'),
      'Owner Alternate Location',
    )
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Region'), 'Interior')
    await userEvent.click(summaryControls.getByRole('button', { name: 'Reset Summary' }))

    await waitFor(() => {
      expect(summaryControls.getByLabelText('Location of logs')).toHaveValue('BC')
      expect(getSummaryComboBox(summaryControls, 'Owner client location')).toHaveValue(
        'Owner Main Location',
      )
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue('Coast')
    })
  })

  it('guards unload only after an application summary differs from its persisted baseline', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')
    await waitFor(() => expect(productLocationInput).toHaveValue('BC'))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    await userEvent.clear(productLocationInput)
    await userEvent.type(productLocationInput, 'Changed location')
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(summaryControls.getByRole('button', { name: 'Reset Summary' }))
    const resetUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(resetUnload)
    expect(resetUnload.defaultPrevented).toBe(false)
  })

  it('preserves an unrelated remark draft when the summary is saved normally', async () => {
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

    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Keep this unsaved remark' },
    })
    await selectApplicationDetailTab('Application')
    fireEvent.change(await screen.findByLabelText('Location of logs'), {
      target: { value: 'AB' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))

    await selectApplicationDetailTab('Remarks')
    expect(screen.getByLabelText('New Remark')).toHaveValue('Keep this unsaved remark')
  })

  it('saves all dirty application sections sequentially before leaving', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: (
            <>
              <ProvincialApplicationDetailsPage />
              <Link to="/next">Leave application</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/application/321'] },
    )
    render(<RouterProvider router={router} />)

    await selectApplicationDetailTab('Application')
    fireEvent.change(await screen.findByLabelText('Location of logs'), {
      target: { value: 'AB' },
    })
    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Sequential remark' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await chooseComboBoxOption(
      reviewTile.getByRole('combobox', { name: 'Application status' }),
      'Rejected',
    )
    fireEvent.change(reviewTile.getByLabelText('Review remark'), {
      target: { value: 'Needs correction' },
    })

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationSummary.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSaveApplicationRemark.mock.invocationCallOrder[0],
    )
    expect(mockedSaveApplicationRemark.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdateApplicationReviewStatus.mock.invocationCallOrder[0],
    )
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
  })

  it('allows manual summary contact entry when lookup has no contacts', async () => {
    mockedFetchApplicationClientContacts.mockResolvedValue([])

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

    await selectApplicationDetailTab('Application')
    const ownerContactInput = await screen.findByLabelText('Owner contact name')
    await userEvent.clear(ownerContactInput)
    await userEvent.type(ownerContactInput, 'Typed Owner')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'Typed Owner',
        }),
      )
    })
  })

  it('approves an application from the detail review section and refreshes detail', async () => {
    const detailAfterApproval: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterApproval)

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

    await selectApplicationDetailTab('Review')
    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve Application' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith('321')
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Application approved.')).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
  })

  it('prefills application review email from the applicant client data', async () => {
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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    expect(within(reviewTile).getByLabelText(/client email address/i)).not.toHaveAttribute(
      'readonly',
    )
    expect(
      within(reviewTile).getByText(
        'Defaults from client data. Changes apply only to this notification.',
      ),
    ).toBeInTheDocument()
  })

  it('does not substitute the owner email when an agent applicant has no email', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: clientNumber === '00033344' ? 'Agent without email' : 'Owner Forestry Ltd.',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: clientNumber === '00033344' ? '' : 'owner@example.test',
      notfound: '',
    }))

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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() =>
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(''),
    )
  })

  it('updates a single rejection with the loaded client email without sending email', async () => {
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'agent@example.test',
      remark: 'Cannot approve this application',
      remarkId: 99,
      remarkUser: 'idir\\reviewer',
      remarkDate: '2026-01-05T10:15:00Z',
      message: 'Application status updated.',
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

    const reviewTile = await selectApplicationReviewTile()
    const reviewControls = within(reviewTile)
    await chooseComboBoxOption(
      reviewControls.getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await waitFor(() => {
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    fireEvent.change(reviewControls.getByLabelText(/review remark/i), {
      target: { value: 'Cannot approve this application' },
    })
    await userEvent.click(reviewControls.getByRole('button', { name: 'Update Review Status' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Cannot approve this application',
        clientEmailAddress: 'agent@example.test',
      })
    })
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await screen.findByText('Application status updated.')).toBeInTheDocument()
  })

  it('loads persisted review status remark without treating placeholder email as persisted', async () => {
    const expiredDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      remarks: [
        {
          remarkId: 99,
          title: 'Expired after review',
          remark: 'Expired after review',
          user: 'idir\\reviewer',
          date: '2026-01-06',
        },
        ...applicationDetail.remarks,
      ],
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(expiredDetail)
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'Agent Export Services',
      address: '44 Agent Road',
      city: 'Nanaimo',
      province: 'BC',
      postalCode: 'V9R 1A1',
      country: 'Canada',
      phone: '250-555-0102',
      fax: '',
      email: 'Not on file',
      notfound: '',
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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByRole('combobox', { name: /application status/i })).toHaveValue(
        'Expired',
      )
    })
    expect(within(reviewTile).getByLabelText(/review remark/i)).toHaveValue('Expired after review')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue('')
  })

  it('blocks status email when the authoritative client account has no valid address', async () => {
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'Applicant without email',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: '',
      notfound: '',
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

    const reviewTile = await selectApplicationReviewTile()
    const reviewControls = within(reviewTile)
    await waitFor(() =>
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(''),
    )
    await chooseComboBoxOption(
      reviewControls.getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await userEvent.type(reviewControls.getByLabelText(/review remark/i), 'Missing recipient')
    await userEvent.click(
      reviewControls.getByRole('button', { name: 'Update Status and Send Email' }),
    )

    expect(
      (await screen.findAllByText('Enter one valid client email address.')).length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('updates application review status and can send status email from detail', async () => {
    const detailAfterStatusUpdate: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterStatusUpdate)
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'edited.client@example.test',
      remark: 'Needs correction',
      remarkId: 99,
      remarkUser: 'idir\\reviewer',
      remarkDate: '2026-01-05T10:15:00Z',
      message: 'Application status updated.',
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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    await chooseComboBoxOption(
      within(reviewTile).getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    fireEvent.change(within(reviewTile).getByLabelText(/client email address/i), {
      target: { value: 'edited.client@example.test' },
    })
    await userEvent.type(within(reviewTile).getByLabelText(/review remark/i), 'Needs correction')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'edited.client@example.test',
    )
    mockedSendApplicationReviewStatusEmail.mockResolvedValueOnce({
      success: false,
      message: 'Application status email is not configured yet. No email was sent.',
    })
    await userEvent.click(
      within(reviewTile).getByRole('button', { name: 'Update Status and Send Email' }),
    )

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'edited.client@example.test',
      })
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'edited.client@example.test',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByText(
        'Application status email is not configured yet. The application status was updated, but no email was sent.',
      ),
    ).toBeInTheDocument()
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'edited.client@example.test',
    )
    expect(within(reviewTile).getByLabelText(/review remark/i)).toHaveValue('Needs correction')
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs correction').length).toBeGreaterThan(0)
  })

  it('validates application review status before updating from detail', async () => {
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

    const reviewTile = await selectApplicationReviewTile()
    await clearComboBox(within(reviewTile).getByRole('combobox', { name: /application status/i }))
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update Review Status' }))

    expect(
      screen.getByText('Choose an application status before updating review status.'),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it.each(['Rejected', 'Withdrawn', 'Expired'])(
    'requires review remark before setting application status to %s',
    async (statusLabel) => {
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

      const reviewTile = await selectApplicationReviewTile()
      await chooseComboBoxOption(
        within(reviewTile).getByRole('combobox', { name: /application status/i }),
        statusLabel,
      )
      await userEvent.click(
        within(reviewTile).getByRole('button', { name: 'Update Review Status' }),
      )

      expect(within(reviewTile).getByLabelText(/review remark/i)).toBeInvalid()
      expect(
        screen.getByText(
          'Review remark is required when rejecting, withdrawing, or expiring an application.',
        ),
      ).toBeInTheDocument()
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    },
  )

  it('validates application remark before saving', async () => {
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

    await selectApplicationDetailTab('Remarks')
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    expect(screen.getByText('Remark is required.')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })

  it('disables upload and delete without file upload permission or a delete role', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/fileApplicationUpload', [])
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '101',
          name: 'locked-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentName = await screen.findByText('locked-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('keeps application delete available to approvers without file upload permission', async () => {
    mockApplicationDetailAuth(
      (action: string) => action !== '/fileApplicationUpload',
      ['LEXIS_APPLICATION_APPROVER'],
    )
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '103',
          name: 'approver-doc.pdf',
          description: 'delete without upload',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentRow = (await screen.findByText('approver-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('disables application document delete when status is unavailable', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: null,
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '102',
          name: 'unknown-status-doc.pdf',
          description: 'unknown status',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Documents')
    const documentName = await screen.findByText('unknown-status-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('shows detail error contract when application detail endpoint fails', async () => {
    mockedFetchProvincialApplicationDetail.mockRejectedValue(new Error('backend down'))

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

    expect(
      await screen.findByText('Unable to retrieve provincial application detail.'),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).not.toHaveBeenCalled()
  })
})
