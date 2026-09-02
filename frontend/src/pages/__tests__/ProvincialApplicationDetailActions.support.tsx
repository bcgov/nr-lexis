import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation, useNavigate } from 'react-router-dom'
import { expect, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type {
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
} from '@/interfaces/LexisDetails'
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
  type ApplicationSummarySnapshot,
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
  fireEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const options = await screen.findAllByRole('option', { name: optionName })
  fireEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
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

const applicationSummarySnapshot: ApplicationSummarySnapshot = {
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
  const reviewTitle = screen.getByRole('heading', {
    name: /application review/i,
  })
  const reviewTile = reviewTitle.closest('.cds--tile')
  expect(reviewTile).toBeTruthy()
  return reviewTile as HTMLElement
}

const getApplicationSummaryTile = (): HTMLElement => {
  const summaryTitle = screen.getByRole('heading', {
    name: /application summary/i,
  })
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
    fireEvent.click(tab)
  }
}

const selectApplicationSummaryTile = async (edit = true): Promise<HTMLElement> => {
  await selectApplicationDetailTab('Application')
  const summaryTile = await waitFor(() => getApplicationSummaryTile())
  if (edit) {
    const editButton = within(summaryTile).queryByRole('button', {
      name: 'Edit application summary',
    })
    if (editButton) {
      await userEvent.click(editButton)
    }
  }
  return summaryTile
}

const selectApplicationReviewTile = async (edit = true): Promise<HTMLElement> => {
  await selectApplicationDetailTab('Review')
  const reviewTile = await waitFor(() => getApplicationReviewTile())
  if (edit) {
    const editButton = within(reviewTile).queryByRole('button', {
      name: 'Edit application review',
    })
    if (editButton) {
      await userEvent.click(editButton)
    }
  }
  return reviewTile
}

const selectApplicationItemsForEditing = async (): Promise<void> => {
  await selectApplicationDetailTab('Items')
  const editButton = await screen.findByRole('button', { name: 'Edit items' })
  await userEvent.click(editButton)
}

const selectApplicationDocumentsForEditing = async (): Promise<void> => {
  await selectApplicationDetailTab('Documents')
  const editButton = await screen.findByRole('button', { name: 'Edit documents' })
  await userEvent.click(editButton)
}

const selectApplicationRemarksForEditing = async (): Promise<void> => {
  await selectApplicationDetailTab('Remarks')
  const addButton = await screen.findByRole('button', { name: 'Add remark' })
  await userEvent.click(addButton)
}

export const setupApplicationDetailTests = (): void => {
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
  mockedFetchApplicationClientLocations.mockImplementation((_clientNumber, applicantType) => {
    if (applicantType === 'agent') {
      return Promise.resolve([
        { locationCode: '0', locationName: 'Do not use', selected: false },
        {
          locationCode: '01',
          locationName: 'Agent Main Location',
          selected: true,
        },
        {
          locationCode: '02',
          locationName: 'Agent Alternate Location',
          selected: false,
        },
      ])
    }

    return Promise.resolve([
      { locationCode: '0', locationName: 'Do not use', selected: false },
      {
        locationCode: '00',
        locationName: 'Owner Main Location',
        selected: true,
      },
      {
        locationCode: '02',
        locationName: 'Owner Alternate Location',
        selected: false,
      },
    ])
  })
  mockedFetchApplicationClientContacts.mockImplementation(
    (_clientNumber, _clientLocationCode, applicantType) => {
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
  mockedFetchApplicationSummarySnapshot.mockResolvedValue(applicationSummarySnapshot)
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
}

export {
  LocationProbe,
  NavigateButton,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  clearComboBox,
  getApplicationSummaryTile,
  getSummaryComboBox,
  mockApplicationDetailAuth,
  mockedAddApplicationPackage,
  mockedAddApplicationScaleToPackage,
  mockedApproveApplicationReview,
  mockedCheckApplicationVolumeUsage,
  mockedDeleteApplicationPackage,
  mockedDeleteApplicationScale,
  mockedFetchApplicationClientContacts,
  mockedFetchApplicationClientData,
  mockedFetchApplicationClientLocations,
  mockedFetchApplicationDocuments,
  mockedFetchApplicationGradeCodes,
  mockedFetchApplicationPackageDetails,
  mockedFetchApplicationPackageScales,
  mockedFetchApplicationPackageSpecies,
  mockedFetchApplicationPackageStatusCodes,
  mockedFetchApplicationPermits,
  mockedFetchApplicationRemainingSpecies,
  mockedFetchApplicationScaleDetails,
  mockedFetchApplicationSpecies,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchApplicationUniqueScales,
  mockedFetchProvincialApplicationDetail,
  mockedFetchProvincialApplicationOptions,
  mockedFetchProvincialExemptionDetail,
  mockedOpenApplicationDocument,
  mockedRemoveApplicationDocument,
  mockedSaveApplicationRemark,
  mockedSendApplicationReviewStatusEmail,
  mockedSubmitAdminUpload,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationReviewStatus,
  mockedUpdateApplicationSummary,
  mockedValidateAdminUpload,
  newExemptionDetail,
  selectApplicationDetailTab,
  selectApplicationDocumentsForEditing,
  selectApplicationItemsForEditing,
  selectApplicationRemarksForEditing,
  selectApplicationReviewTile,
  selectApplicationSummaryTile,
}
