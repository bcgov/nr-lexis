import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
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
import { submitAdminUpload } from '@/service/admin-upload-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialApplicationDetail: vi.fn(),
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
}))

Element.prototype.scrollIntoView = vi.fn()

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
    .find((element) => element.getAttribute('role') === 'combobox') as HTMLElement

describe('Provincial Application Detail Document Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\reviewer',
        roles: ['APPLICATION_APPROVER'],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
      },
      canPerform: () => true,
    } as any)
    mockedFetchProvincialApplicationDetail.mockResolvedValue(applicationDetail)
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
      applicationStatusCode: 'ACTIVE',
      applicantTypeCode: 'A',
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
    const permitRow = (await screen.findByText('900101')).closest('tr')
    expect(permitRow).toBeTruthy()
    expect(within(permitRow as HTMLElement).getByText('Complete')).toBeInTheDocument()

    await userEvent.click(within(permitRow as HTMLElement).getByRole('button', { name: 'Open' }))

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/permit/900101?packageFilter=PKG-1')
  })

  it('jumps from the header action to the embedded application upload panel', async () => {
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

    const [uploadButton] = await screen.findAllByRole('button', {
      name: 'Upload Application Document',
    })
    expect(uploadButton).toBeEnabled()
    await userEvent.click(uploadButton)

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
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

    const [uploadButton] = await screen.findAllByRole('button', {
      name: 'Upload Application Document',
    })

    expect(uploadButton).toBeDisabled()
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

    const [uploadButton] = screen.getAllByRole('button', {
      name: 'Upload Application Document',
    })
    expect(uploadButton).toBeDisabled()
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
  })

  it('blocks application summary and package edits for exemption approvers', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      exemptionApprover: true,
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

    expect(await screen.findByText('Application summary')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).not.toHaveBeenCalled()
    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

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

    expect(await screen.findByText('Documents')).toBeInTheDocument()
    const file = new File(['test'], 'uploaded-doc.pdf', { type: 'application/pdf' })

    await userEvent.type(screen.getByLabelText('Document description'), 'Uploaded')
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
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
    expect(await screen.findByText('Second status')).toBeInTheDocument()
    expect(screen.getByText('00099988')).toBeInTheDocument()

    await act(async () => {
      resolveFirstDetail?.(applicationDetail)
    })

    expect(screen.getByText('Second status')).toBeInTheDocument()
    expect(screen.getByText('00099988')).toBeInTheDocument()
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

    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenApplicationDocument).toHaveBeenCalledWith('100', 'app-doc.pdf')
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

    const uploadButtons = await screen.findAllByRole('button', {
      name: 'Upload Application Document',
    })
    expect(uploadButtons[0]).toBeDisabled()
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

    expect(await screen.findByRole('button', { name: 'Create Package' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Package number is required.').length).toBeGreaterThan(0)
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

    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    await userEvent.type(createPackageControls.getByLabelText('Package Number'), 'PKG-NEW')
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

  it('hides application remark editing without application remarks action', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\reviewer',
        roles: ['APPLICATION_APPROVER'],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
      },
      canPerform: (action: string) => action !== '/applicationRemarks',
    } as any)

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

    expect(await screen.findByText('Remarks')).toBeInTheDocument()
    const remarksTile = screen.getByText('Remarks').closest('.cds--tile')
    expect(remarksTile).toBeTruthy()

    const remarksControls = within(remarksTile as HTMLElement)
    expect(remarksControls.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(remarksControls.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
    expect(remarksControls.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
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
        '00',
        'owner',
        '321',
      )
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00033344',
        '01',
        'agent',
        '321',
      )
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00')
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01')
    })
    expect(await screen.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Agent Export Services')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    const summaryTile = getApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Exemption reason'), 'Surplus')
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Application status'),
      'Approved',
    )
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Region'), 'Interior')
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Product type'), 'Timber')
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Growth type'), 'Second Growth')
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Jurisdiction'), 'F - Federal')
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Order in Council indicator'),
      'Y - Yes',
    )
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Owner client location'),
      'Owner Alternate Location',
    )
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Owner contact name'),
      'Owner Alternate Contact',
    )
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Listing date'), '2026-01-25')

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

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
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The application was saved successfully.')).toBeInTheDocument()
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

    const summaryTile = await waitFor(() => getApplicationSummaryTile())
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

    const summaryTile = await waitFor(() => getApplicationSummaryTile())
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
      screen.getAllByText('Application volume must be 9999999.9 or less.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Average log volume must be 99.9 or less.').length).toBeGreaterThan(
      0,
    )
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
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

    const summaryTile = await waitFor(() => getApplicationSummaryTile())
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

    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    const reviewTile = getApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
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

    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    const reviewTile = getApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByRole('combobox', { name: /application status/i })).toHaveValue(
        'Expired',
      )
    })
    expect(within(reviewTile).getByLabelText(/review remark/i)).toHaveValue('Expired after review')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue('')
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

    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    const reviewTile = getApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    await chooseComboBoxOption(
      within(reviewTile).getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await userEvent.type(within(reviewTile).getByLabelText(/review remark/i), 'Needs correction')
    await userEvent.click(
      within(reviewTile).getByRole('button', { name: 'Update Status and Send Email' }),
    )

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'agent@example.test',
      })
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'agent@example.test',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByText('Application status updated and email sent.'),
    ).toBeInTheDocument()
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'agent@example.test',
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

    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    const reviewTile = getApplicationReviewTile()
    await clearComboBox(within(reviewTile).getByRole('combobox', { name: /application status/i }))
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update Review Status' }))

    expect(
      screen.getByText('Choose an application status before updating review status.'),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('requires review remark before rejecting from application detail', async () => {
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

    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    const reviewTile = getApplicationReviewTile()
    await chooseComboBoxOption(
      within(reviewTile).getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update Review Status' }))

    expect(within(reviewTile).getByLabelText(/review remark/i)).toBeInvalid()
    expect(
      screen.getByText('Review remark is required when rejecting or withdrawing an application.'),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

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

    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    expect(screen.getByText('Remark is required.')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })

  it('disables upload and delete without file upload permission', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action !== '/fileApplicationUpload',
    } as any)
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

    const uploadButton = await screen.findByRole('button', { name: 'Upload Application Document' })
    expect(uploadButton).toBeDisabled()

    const documentName = await screen.findByText('locked-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
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
