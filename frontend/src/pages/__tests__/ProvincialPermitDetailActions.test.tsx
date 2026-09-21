import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import ProvincialPermitDetailsPage from '@/pages/ProvincialPermitDetails'
import {
  fetchProvincialPermitDetail,
  fetchProvincialPermitExemptionContext,
} from '@/service/lexis-detail-service'
import {
  addApplicationsToPermit,
  addBlanketOicPackage,
  addBlanketOicScale,
  deleteBlanketOicPackage,
  deleteBlanketOicScale,
  fetchBlanketOicPackageEditContext,
  fetchAvailablePermitApplications,
  fetchProvincialPermitGbmsEvents,
  fetchProvincialPermitDetailCoreTabs,
  fetchProvincialPermitFees,
  removeApplicationFromPermit,
  updateBlanketOicPackage,
  updatePermitScaleAttachment,
  type ProvincialPermitDetailTabsData,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  fetchPermitApprovalEmailDefault,
  fetchPermitFeeOverrideContext,
  fetchPermitDocuments,
  fetchPermitInvoices,
  openPermitDocument,
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
  sendPermitApprovalEmail,
  sendPermitReviewRequestEmail,
  updatePermitDetail,
  updatePermitShipping,
} from '@/service/provincial-permit-documents-invoices-service'
import {
  fetchApplicationClientData,
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'
import { fetchExemptionRegionContext } from '@/service/provincial-exemption-detail-service'
import { runReport } from '@/service/report-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialPermitOptions,
} from '@/service/search-options-service'
import {
  fetchApplicationGradeCodes,
  fetchApplicationRemainingSpecies,
  fetchApplicationSpeciesCodes,
  fetchApplicationEndUsesForSpeciesRegion,
} from '@/service/provincial-application-items-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import { triggerBrowserDownload } from '@/utils/download'
import { openDocumentPreview } from '@/utils/document-preview'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialPermitDetail: vi.fn(),
  fetchProvincialPermitExemptionContext: vi.fn(),
}))

vi.mock('@/service/provincial-permit-detail-tabs-service', () => ({
  EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS: {
    applications: [],
    packages: [],
    items: [],
    fees: [],
    packageFeeSummaries: [],
    totalFeeVolume: null,
    gbmsEvents: [],
    oicItems: [],
    boicItems: [],
  },
  addApplicationsToPermit: vi.fn(),
  addBlanketOicPackage: vi.fn(),
  addBlanketOicScale: vi.fn(),
  deleteBlanketOicPackage: vi.fn(),
  deleteBlanketOicScale: vi.fn(),
  fetchBlanketOicPackageEditContext: vi.fn(),
  fetchAvailablePermitApplications: vi.fn(),
  fetchProvincialPermitGbmsEvents: vi.fn(),
  fetchProvincialPermitDetailCoreTabs: vi.fn(),
  fetchProvincialPermitFees: vi.fn(),
  removeApplicationFromPermit: vi.fn(),
  updateBlanketOicPackage: vi.fn(),
  updatePermitScaleAttachment: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  fetchPermitApprovalEmailDefault: vi.fn(),
  fetchPermitFeeOverrideContext: vi.fn(),
  fetchPermitDocuments: vi.fn(),
  fetchPermitInvoices: vi.fn(),
  openPermitDocument: vi.fn(),
  releasePermitEditLock: vi.fn(),
  removePermitApplicationDocument: vi.fn(),
  removePermitDocument: vi.fn(),
  removePermitInvoiceDocument: vi.fn(),
  sendPermitApprovalEmail: vi.fn(),
  sendPermitReviewRequestEmail: vi.fn(),
  updatePermitDetail: vi.fn(),
  updatePermitShipping: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
  fetchExemptionClientData: vi.fn(),
  fetchExemptionClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-detail-service', () => ({
  fetchExemptionRegionContext: vi.fn(),
}))

vi.mock('@/service/report-service', () => ({
  ReportRequestError: class ReportRequestError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ReportRequestError'
    }
  },
  runReport: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialPermitOptions: vi.fn(),
  fetchProvincialApplicationOptions: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationGradeCodes: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
  fetchApplicationSpeciesCodes: vi.fn(),
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
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

vi.mock('@/utils/download', () => ({
  triggerBrowserDownload: vi.fn(),
}))

vi.mock('@/utils/document-preview', () => ({ openDocumentPreview: vi.fn() }))
vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateAdminUpload: vi.fn(),
}))

vi.mock('@/components/ForestClientComboBox', () => ({
  default: ({
    id,
    labelText,
    value,
    onChange,
    onBlur,
    disabled,
    invalid,
    invalidText,
    counterpartyClientNumber,
  }: {
    id: string
    labelText: string
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
    disabled?: boolean
    invalid?: boolean
    invalidText?: string
    counterpartyClientNumber?: string
  }) => (
    <div>
      <label htmlFor={id}>{labelText}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-counterparty-client-number={counterpartyClientNumber ?? ''}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && invalidText ? <div>{invalidText}</div> : null}
    </div>
  ),
}))

// This file renders the full provincial permit detail page; several tests exercise
// Carbon inputs and async child panels, which can exceed Vitest's 5s default in CI.
vi.setConfig({ testTimeout: 20000 })

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialPermitDetail = vi.mocked(fetchProvincialPermitDetail)
const mockedFetchProvincialPermitExemptionContext = vi.mocked(fetchProvincialPermitExemptionContext)
const mockedFetchProvincialPermitDetailTabs = vi.mocked(fetchProvincialPermitDetailCoreTabs)
const mockedFetchProvincialPermitGbmsEvents = vi.mocked(fetchProvincialPermitGbmsEvents)
const mockedFetchProvincialPermitFees = vi.mocked(fetchProvincialPermitFees)
const mockedUpdatePermitScaleAttachment = vi.mocked(updatePermitScaleAttachment)
const mockedFetchAvailablePermitApplications = vi.mocked(fetchAvailablePermitApplications)
const mockedAddApplicationsToPermit = vi.mocked(addApplicationsToPermit)
const mockedRemoveApplicationFromPermit = vi.mocked(removeApplicationFromPermit)
const mockedAddBlanketOicPackage = vi.mocked(addBlanketOicPackage)
const mockedUpdateBlanketOicPackage = vi.mocked(updateBlanketOicPackage)
const mockedDeleteBlanketOicPackage = vi.mocked(deleteBlanketOicPackage)
const mockedFetchBlanketOicPackageEditContext = vi.mocked(fetchBlanketOicPackageEditContext)
const mockedAddBlanketOicScale = vi.mocked(addBlanketOicScale)
const mockedDeleteBlanketOicScale = vi.mocked(deleteBlanketOicScale)
const mockedFetchPermitApprovalEmailDefault = vi.mocked(fetchPermitApprovalEmailDefault)
const mockedFetchPermitFeeOverrideContext = vi.mocked(fetchPermitFeeOverrideContext)
const mockedFetchPermitDocuments = vi.mocked(fetchPermitDocuments)
const mockedFetchPermitInvoices = vi.mocked(fetchPermitInvoices)
const mockedOpenPermitDocument = vi.mocked(openPermitDocument)
const mockedRemovePermitApplicationDocument = vi.mocked(removePermitApplicationDocument)
const mockedRemovePermitDocument = vi.mocked(removePermitDocument)
const mockedRemovePermitInvoiceDocument = vi.mocked(removePermitInvoiceDocument)
const mockedSendPermitApprovalEmail = vi.mocked(sendPermitApprovalEmail)
const mockedSendPermitReviewRequestEmail = vi.mocked(sendPermitReviewRequestEmail)
const mockedUpdatePermitDetail = vi.mocked(updatePermitDetail)
const mockedUpdatePermitShipping = vi.mocked(updatePermitShipping)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchExemptionClientData = vi.mocked(fetchExemptionClientData)
const mockedFetchExemptionClientLocations = vi.mocked(fetchExemptionClientLocations)
const mockedFetchExemptionRegionContext = vi.mocked(fetchExemptionRegionContext)
const mockedFetchApplicationGradeCodes = vi.mocked(fetchApplicationGradeCodes)
const mockedFetchApplicationSpeciesCodes = vi.mocked(fetchApplicationSpeciesCodes)
const mockedRunReport = vi.mocked(runReport)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)
const mockedFetchShippingReferenceOptions = vi.mocked(fetchShippingReferenceOptions)
const mockedTriggerBrowserDownload = vi.mocked(triggerBrowserDownload)

const permitDetail: ProvincialPermitDetail = {
  permitNumber: 777,
  applicationNumber: 111,
  packageNumber: 'PKG-9',
  exemptionNumber: 'EX-9',
  permitStatusCode: 'COM',
  permitStatusDescription: 'Completed',
  author: 'idir\\permit-author',
  applicantClientNumber: '00012345',
  agentClientLocationCode: '01',
  ownerClientNumber: '00067890',
  ownerClientLocationCode: '03',
  destinationCompanyName: 'Acme',
  destinationCountryCode: 'CA',
  transportTypeCode: 'S',
  transportName: 'Truck',
  portOfExportCode: 'VA',
  otherPortOfExport: null,
  applicationDate: '2026-04-10',
  issueDate: '2026-05-01',
  expiryDate: '2026-06-01',
  receivedDate: '2026-04-15',
  estimatedShippingDate: '2026-05-20',
  permitVolume: 120,
  approvedExemptionVolume: 250,
  exemptionVolumeRemaining: 130,
  exemptionTypeDescription: 'Standard exemption',
  blanketOic: false,
  numberOfPieces: 10,
  receiptNumber: 'R-1',
  federalPermitNumber: null,
  invoiceNumber: 'INV-1',
  remarks: 'ok',
  oicApplicationNumber: null,
  oicRequestPieces: null,
  oicRequestVolume: null,
  orgUnitNumber: 1903,
  region: 'Cariboo Natural Resource Region',
}

const tabsResult: ProvincialPermitDetailTabsData = {
  applications: [],
  packages: [],
  items: [],
  fees: [],
  packageFeeSummaries: [],
  totalFeeVolume: null,
  gbmsEvents: [],
  oicItems: [],
  boicItems: [],
}

const calculatedPermitFees = {
  totalFeeVolume: 10,
  packageFeeSummaries: [
    { packageNumber: 'PKG-9', growthType: 'Second growth', totalFeeForPackage: '$37.50' },
  ],
  fees: [
    {
      id: 'FEE-1',
      packageNumber: 'PKG-9',
      timberMark: 'TEST-FEE',
      species: 'Fir',
      grade: 'A',
      amv: '$25.00',
      volume: 10,
      ministryUser: true,
      ewb: '3.75',
      filPercent: '20',
      mfPercent: '1.5',
      amount: 37.5,
      amountDisplay: '$37.50',
    },
  ],
}

const maskedPermitFees = {
  ...calculatedPermitFees,
  packageFeeSummaries: calculatedPermitFees.packageFeeSummaries.map((summary) => ({
    ...summary,
    totalFeeForPackage: '$',
  })),
  fees: calculatedPermitFees.fees.map((row) => ({
    ...row,
    ewb: '',
    filPercent: '',
    mfPercent: '',
    amount: 0,
    amountDisplay: '$',
  })),
}

const gbmsHistoryRow = {
  id: 'GBMS-1',
  gbmsInvoiceNumber: 'A006654',
  cancelledByInvoice: 'A007321',
  replacedByInvoice: 'A007322',
  invoiceAmount: '1939.50',
  printedDate: '2020-05-06',
  entryDate: '2020-05-06',
  updateDate: '2022-02-15',
}

const selectPermitDetailTab = async (name: string) => {
  await screen.findByRole('tab', { name: 'Permit' })
  const reviewedFlowTabName =
    name === 'Owner' && !screen.queryByRole('tab', { name: 'Owner' })
      ? 'Applicant'
      : name === 'Items' && !screen.queryByRole('tab', { name: 'Items' })
        ? 'Scale'
        : name
  const tab = screen.getByRole('tab', { name: reviewedFlowTabName })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const enterPermitDocumentEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit permit documents' }))
}

const chooseComboBoxOption = async (combobox: HTMLElement, optionName: string) => {
  await userEvent.click(combobox)
  await userEvent.clear(combobox)
  await userEvent.type(combobox, optionName)
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

const editableBlanketOicPackage = {
  packageNumber: 'BOIC-9',
  region: 'Coast',
  speciesEndUseSort: 'HE/PL',
  ageClass: 'Old growth',
  packageVolume: '120.5',
  averageLength: '7.1',
  averageTopDiameter: '16.2',
  productType: 'Unmanufactured',
  currentPackageVolume: '118.5',
  status: 'APP - Approved',
  reprocessed: 'N',
  comments: 'Current OIC package',
}

const configureEditableBlanketOicPackage = () => {
  mockedFetchProvincialPermitDetail.mockResolvedValue({
    ...permitDetail,
    permitStatusCode: 'ACT',
    permitStatusDescription: 'Active',
    exemptionTypeDescription: 'Blanket OIC',
    blanketOic: true,
    oicApplicationNumber: 1000999,
    oicRequestPieces: 200,
    oicRequestVolume: 120.5,
  })
  mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
    ...tabsResult,
    packages: [editableBlanketOicPackage],
  })
  mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
    approvedExemptionVolume: 250,
    exemptionVolumeRemaining: 130,
    exemptionTypeDescription: 'Blanket OIC',
    blanketOic: true,
  })
}

const configureBlanketOicSubmitter = (clientNumber: string) => {
  mockedUseAuth.mockReturnValue(
    createTestAuthContext({
      capabilities: createTestCapabilities({
        principal: 'bceid\\scoped-submitter',
        roles: [`LEXIS_PROVINCIAL_SUBMITTER_${clientNumber}`],
        forestClientNumber: clientNumber,
      }),
      canPerform: (action: string) => action === 'savePermit' || action === '/permitDetails',
    }),
  )
}

const configureBlanketOicDocument = () => {
  configureEditableBlanketOicPackage()
  mockedFetchPermitDocuments.mockResolvedValue({
    source: 'api',
    rows: [
      {
        id: 'BOIC-DOC-1',
        name: 'permit-document.pdf',
        description: 'Synthetic permit document',
        type: 'Permit',
        typeCode: 'PMT',
        source: 'permit',
        deletable: true,
      },
    ],
  })
}

const renderPermitDetails = (initialEntry = '/provincial/permit/777') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/provincial/permit/:permitNumber" element={<ProvincialPermitDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )

const PermitRouteSwitcher = () => {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/provincial/permit/888')}>Switch permit</button>
}

const configureActivePermit = () => {
  mockedFetchProvincialPermitDetail.mockResolvedValue({
    ...permitDetail,
    permitStatusCode: 'ACT',
    permitStatusDescription: 'Active',
  })
}

const configureMinisterialActivePermit = (overrides: Partial<ProvincialPermitDetail> = {}) => {
  const ministerialPermitDetail: ProvincialPermitDetail = {
    ...permitDetail,
    permitStatusCode: 'ACT',
    permitStatusDescription: 'Active',
    exemptionTypeDescription: 'Ministerial',
    blanketOic: false,
    applicationNumber: null,
    packageNumber: null,
    ...overrides,
  }
  mockedFetchProvincialPermitDetail.mockResolvedValue(ministerialPermitDetail)
  mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
  mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
    approvedExemptionVolume: ministerialPermitDetail.approvedExemptionVolume,
    exemptionVolumeRemaining: ministerialPermitDetail.exemptionVolumeRemaining,
    exemptionTypeDescription: 'Ministerial',
    blanketOic: false,
  })
  return ministerialPermitDetail
}

const openBlanketOicPackageDeleteConfirmation = async () => {
  await selectPermitDetailTab('Items')
  const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')
  expect(packageRow).toBeTruthy()
  const deleteButton = within(packageRow as HTMLElement).getByRole('button', { name: 'Delete' })
  await waitFor(() => expect(deleteButton).toBeEnabled())
  await userEvent.click(deleteButton)
  return screen.findByRole('dialog', { name: 'Delete Blanket OIC package BOIC-9?' })
}

describe('Provincial Permit Detail Action Smoke', () => {
  let previewWindow: Window
  beforeEach(() => {
    vi.clearAllMocks()
    previewWindow = {
      opener: window,
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(previewWindow)
    vi.mocked(validateAdminUpload).mockResolvedValue({ status: 'validated' })
    vi.mocked(submitAdminUpload).mockResolvedValue({ message: 'Document uploaded.' })
    vi.mocked(fetchProvincialApplicationOptions).mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [{ value: 'O', label: 'Old growth' }],
      regions: [],
      currentSchedules: [],
    })
    vi.mocked(fetchApplicationRemainingSpecies).mockImplementation(
      async (_region, _productType, selectedSpecies) =>
        [
          { code: 'FI', description: 'Fir' },
          { code: 'HE', description: 'Hemlock' },
        ].filter((option) => !selectedSpecies.includes(option.code)),
    )
    vi.mocked(fetchApplicationEndUsesForSpeciesRegion).mockResolvedValue([
      { code: 'LU', description: 'Lumber' },
    ])
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialPermitDetail.mockResolvedValue(permitDetail)
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: permitDetail.approvedExemptionVolume,
      exemptionVolumeRemaining: permitDetail.exemptionVolumeRemaining,
      exemptionTypeDescription: permitDetail.exemptionTypeDescription,
      blanketOic: permitDetail.blanketOic,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([])
    mockedFetchProvincialPermitFees.mockResolvedValue({
      fees: [],
      packageFeeSummaries: [],
      totalFeeVolume: 0,
    })
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [
        { value: 'ACT', label: 'Active' },
        { value: 'COM', label: 'Completed' },
        { value: 'PPD', label: 'Payment pending' },
        { value: 'CAN', label: 'Cancelled' },
        { value: 'EXP', label: 'Expired' },
      ],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
        { value: '1907', label: 'Thompson-Okanagan Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })
    mockedFetchExemptionRegionContext.mockResolvedValue({
      exemptionNumber: 'EX-9',
      regionNumbers: ['1903'],
    })
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: [],
      errorMessage: '',
    })
    mockedUpdatePermitScaleAttachment.mockResolvedValue({
      success: true,
      message: 'Scale detail was added to the permit.',
      errors: [],
      warnings: [],
    })
    mockedAddApplicationsToPermit.mockResolvedValue({
      success: true,
      message: 'Application was added to the permit.',
      errors: [],
      warnings: [],
    })
    mockedRemoveApplicationFromPermit.mockResolvedValue({
      success: true,
      message: 'Application was removed from the permit.',
      errors: [],
      warnings: [],
    })
    mockedAddBlanketOicPackage.mockResolvedValue({
      success: true,
      message: 'Blanket OIC package was created.',
      errors: [],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'BOIC-NEW',
    })
    mockedUpdateBlanketOicPackage.mockResolvedValue({
      success: true,
      message: 'Blanket OIC package was updated.',
      errors: [],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'BOIC-NEW',
    })
    mockedDeleteBlanketOicPackage.mockResolvedValue({
      success: true,
      message: 'Blanket OIC package was deleted.',
      errors: [],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'BOIC-9',
    })
    mockedFetchBlanketOicPackageEditContext.mockResolvedValue({
      packageNumber: 'BOIC-9',
      volume: '120.5',
      averageLength: '7.1',
      averageDiameter: '16.2',
      status: 'ACT',
      comments: 'Current OIC package',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['HE'],
    })
    mockedAddBlanketOicScale.mockResolvedValue({
      success: true,
      message: 'Blanket OIC scale detail was added.',
      errors: [],
      warnings: [],
    })
    mockedDeleteBlanketOicScale.mockResolvedValue({
      success: true,
      message: 'Blanket OIC scale detail was removed.',
      errors: [],
      warnings: [],
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchPermitInvoices.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchApplicationClientData.mockImplementation(
      async (clientNumber, clientLocationCode) => {
        if (clientNumber === '00067890' && clientLocationCode === '03') {
          return {
            clientNumber,
            companyName: 'Owner Co',
            address: '1 Owner St',
            city: 'Victoria',
            province: 'BC',
            postalCode: 'V8V 1A1',
            country: 'Canada',
            phone: '2505551111',
            fax: '2505552222',
            email: 'owner@example.test',
            notfound: '',
          }
        }

        return {
          clientNumber,
          companyName: 'Agent Co',
          address: '2 Agent St',
          city: 'Nanaimo',
          province: 'BC',
          postalCode: 'V9R 1A1',
          country: 'Canada',
          phone: '2505553333',
          fax: '2505554444',
          email: 'agent@example.test',
          notfound: '',
        }
      },
    )
    mockedFetchExemptionClientLocations.mockImplementation(async (clientNumber) =>
      clientNumber === '00012345'
        ? [
            { locationCode: '01', locationName: 'Agent office', selected: true },
            { locationCode: '02', locationName: 'Agent mill', selected: false },
          ]
        : [
            { locationCode: '03', locationName: 'Owner office', selected: true },
            { locationCode: '04', locationName: 'Owner mill', selected: false },
          ],
    )
    mockedFetchExemptionClientData.mockImplementation(async (clientNumber, clientLocationCode) => ({
      clientNumber: clientNumber === '67890' ? '00067890' : clientNumber,
      companyName:
        clientLocationCode === '01' || clientLocationCode === '02' ? 'Agent Co' : 'Owner Co',
      address:
        clientLocationCode === '01' || clientLocationCode === '02' ? '2 Agent St' : '1 Owner St',
      city: clientLocationCode === '01' || clientLocationCode === '02' ? 'Nanaimo' : 'Victoria',
      province: 'BC',
      postalCode:
        clientLocationCode === '01' || clientLocationCode === '02' ? 'V9R 1A1' : 'V8V 1A1',
      country: 'Canada',
      phone:
        clientLocationCode === '01' || clientLocationCode === '02' ? '2505553333' : '2505551111',
      fax: '',
      email:
        clientLocationCode === '01' || clientLocationCode === '02'
          ? 'agent@example.test'
          : 'owner@example.test',
      notfound: '',
    }))
    mockedFetchApplicationSpeciesCodes.mockResolvedValue([
      { code: 'AL', description: 'Alder' },
      { code: 'FI', description: 'Fir' },
      { code: 'HE', description: 'Hemlock' },
    ])
    mockedFetchApplicationGradeCodes.mockImplementation(async (_region, speciesCode) =>
      speciesCode === 'AL'
        ? [{ code: 'W', description: 'Utility' }]
        : speciesCode === 'HE'
          ? [{ code: 'A', description: 'Sawlog' }]
          : [{ code: 'B', description: 'Pulp' }],
    )
    mockedOpenPermitDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'test.pdf',
    })
    mockedRemovePermitDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedRemovePermitApplicationDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedRemovePermitInvoiceDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: true,
      message: 'Permit review request email sent.',
      permitRequestDate: '',
    })
    mockedSendPermitApprovalEmail.mockResolvedValue({
      success: true,
      message: 'Permit approval email sent.',
      permitRequestDate: '',
    })
    mockedFetchPermitApprovalEmailDefault.mockResolvedValue('agent@example.test')
    mockedUpdatePermitDetail.mockResolvedValue({
      success: true,
      message: 'The permit was updated successfully.',
      errors: [],
      warnings: [],
      source: 'api',
    })
    mockedUpdatePermitShipping.mockResolvedValue({
      success: true,
      message: 'The permit was saved successfully.',
      errors: [],
      warnings: [],
      source: 'api',
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
    mockedRunReport.mockResolvedValue({
      source: 'api',
      blob: new Blob(['permit report']),
      filename: 'permit-report.pdf',
      contentType: 'application/pdf',
    })
  })

  it('renders permit details, client contacts, and GBMS history', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([gbmsHistoryRow])

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    for (const tabName of [
      'Permit',
      'Applicant',
      'Agent',
      'Shipping',
      'Items',
      'Documents',
      'Fees',
      'GBMS',
    ]) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Permit',
      'Applicant',
      'Agent',
      'Shipping',
      'Items',
      'Documents',
      'Fees',
      'GBMS',
    ])
    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter item rows')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter fee rows')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter document rows')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter invoice rows')).not.toBeInTheDocument()
    const pageHeading = screen.getByRole('heading', {
      name: 'Permit 777 (Pending)',
      level: 1,
    })
    const pageHeader = pageHeading.closest('header')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(pageHeader).toBeTruthy()
    expect(
      within(pageHeader as HTMLElement).getByText('Check and manage this provincial permit'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Provincial permit search' })).toHaveAttribute(
      'href',
      '/provincial/permit',
    )
    expect(within(pageHeader as HTMLElement).getByText('Active')).toBeInTheDocument()
    expect(
      within(pageHeader as HTMLElement).queryByRole('button', { name: 'Email approval' }),
    ).not.toBeInTheDocument()
    expect(
      within(pageHeader as HTMLElement).queryByRole('button', { name: 'Print permit' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Permit highlights')).not.toBeInTheDocument()
    const permitSummaryTile = screen
      .getByRole('heading', { name: 'Permit summary' })
      .closest('.cds--tile')
    expect(permitSummaryTile).toBeTruthy()
    expect(within(permitSummaryTile as HTMLElement).getByText('Permit number')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('777 (Pending)')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByText('Application number(s)'),
    ).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByText('Package number(s)'),
    ).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('PKG-9')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByRole('link', { name: 'EX-9' }),
    ).toHaveAttribute('href', '/provincial/exemption/EX-9')
    expect(within(permitSummaryTile as HTMLElement).getByText('Submit date')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('Received date')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getAllByText('2026-04-10')).toHaveLength(2)
    expect(within(permitSummaryTile as HTMLElement).queryByText('Author')).not.toBeInTheDocument()
    expect(screen.getByText(/Author:/)).toBeInTheDocument()
    expect(screen.getByText(/idir\\permit-author/)).toBeInTheDocument()
    const permitFinancialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile')
    expect(permitFinancialTile).toBeTruthy()
    expect(
      within(permitFinancialTile as HTMLElement).getByText('Current permit volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).getByText('Total exemption volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).getByText('Total volume remaining (m³)'),
    ).toBeInTheDocument()
    expect(within(permitFinancialTile as HTMLElement).getByText('250')).toBeInTheDocument()
    expect(within(permitFinancialTile as HTMLElement).getByText('130')).toBeInTheDocument()
    expect(within(permitFinancialTile as HTMLElement).getByText('120')).toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Permit Request Pieces'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Permit Request Volume (m³)'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Agent client number'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Federal permit number'),
    ).not.toBeInTheDocument()
    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('Agent Co')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'false')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00067890', '03', {
      permitNumber: '777',
    })
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00012345', '01', {
      permitNumber: '777',
    })
    await selectPermitDetailTab('GBMS')
    expect(
      await screen.findByRole('heading', {
        name: 'GBMS invoice history',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A006654' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A007321' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A007322' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '1939.50' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '2020-05-06' })).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '2022-02-15' })).toBeInTheDocument()
    expect(mockedFetchPermitInvoices).not.toHaveBeenCalled()
  }, 15000)

  it('shows a one-time success on the saved Blanket OIC permit without losing navigation state', async () => {
    configureEditableBlanketOicPackage()
    const retainedState = {
      source: 'permit-create',
      lexisDetailTab: 'permit',
      returnTo: {
        label: 'Provincial exemption detail',
        to: '/provincial/exemption/EX-9?filter=active',
        state: { source: 'search' },
      },
    }
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      {
        initialEntries: [
          {
            pathname: '/provincial/permit/777',
            search: '?from=create',
            hash: '#permit',
            state: { ...retainedState, blanketOicPermitCreated: '777' },
          },
        ],
      },
    )
    const view = render(<RouterProvider router={router} />)

    const success = await screen.findByText('Permit created')
    expect(success.closest('.cds--toast-notification')).toHaveClass(
      'cds--toast-notification--success',
    )
    expect(screen.getByText('The permit was saved.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Permit 777 (Pending)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Edit permit details' })).toBeInTheDocument()
    for (const name of ['Scale', 'Documents', 'Fees']) {
      expect(screen.getByRole('tab', { name })).toBeEnabled()
    }
    await waitFor(() => expect(router.state.location.state).toEqual(retainedState))
    expect(router.state.location.search).toBe('?from=create')
    expect(router.state.location.hash).toBe('#permit')

    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    await waitFor(() => expect(screen.queryByText('Permit created')).not.toBeInTheDocument())
    view.rerender(<RouterProvider router={router} />)
    expect(screen.queryByText('Permit created')).not.toBeInTheDocument()
    await selectPermitDetailTab('Applicant')
    const applicantTile = (
      await screen.findByRole('heading', { name: 'Applicant details', level: 2 })
    ).closest('.detail-section-card')
    expect(applicantTile).toBeTruthy()
    expect(
      within(applicantTile as HTMLElement).getByRole('button', { name: 'Edit applicant details' }),
    ).toBeInTheDocument()
    await selectPermitDetailTab('Shipping')
    expect(await screen.findByRole('button', { name: 'Edit shipping details' })).toBeInTheDocument()
    expect(screen.queryByText('Permit created')).not.toBeInTheDocument()
  })

  it('does not carry Blanket OIC creation success to another record or a return visit', async () => {
    configureEditableBlanketOicPackage()
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      {
        initialEntries: [
          { pathname: '/provincial/permit/777', state: { blanketOicPermitCreated: '777' } },
        ],
      },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Permit created')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toEqual({}))

    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitNumber: 888,
      blanketOic: true,
      exemptionTypeDescription: 'Blanket OIC',
    })
    await act(() => router.navigate('/provincial/permit/888'))
    expect(await screen.findByRole('heading', { name: 'Permit 888' })).toBeInTheDocument()
    expect(screen.queryByText('Permit created')).not.toBeInTheDocument()

    configureEditableBlanketOicPackage()
    await act(() => router.navigate(-1))
    expect(
      await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Permit 777 (Pending)' })).toBeInTheDocument()
    expect(screen.queryByText('Permit created')).not.toBeInTheDocument()
  })

  it('ignores a Blanket OIC creation signal for a different permit', async () => {
    configureEditableBlanketOicPackage()
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      {
        initialEntries: [
          { pathname: '/provincial/permit/777', state: { blanketOicPermitCreated: '888' } },
        ],
      },
    )
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
    ).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toEqual({}))
    expect(screen.queryByText('Permit created')).not.toBeInTheDocument()
  })

  it('opens a newly created Ministerial permit in editable tabs and consumes the route signal', async () => {
    configureMinisterialActivePermit({ remarks: '' })
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/permit/:permitNumber',
          element: <ProvincialPermitDetailsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: '/provincial/permit/777',
            search: '?from=create',
            hash: '#permit',
            state: { permitCreated: true, source: 'permit-create' },
          },
        ],
      },
    )
    render(<RouterProvider router={router} />)

    const remarks = await screen.findByLabelText('Remarks')
    expect(remarks).toBeEnabled()
    expect(remarks).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('permit-permitRemarks-counter-desc'),
    )
    expect(screen.getByText('0/250')).toBeVisible()
    await waitFor(() => {
      expect(router.state.location.state).toEqual({ source: 'permit-create' })
      expect(router.state.location.search).toBe('?from=create')
      expect(router.state.location.hash).toBe('#permit')
    })

    expect(screen.getByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Scale' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Applicant')
    expect(await screen.findByRole('heading', { name: 'Applicant details' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.getByRole('heading', { name: 'Agent information' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(await screen.findByLabelText('Purchaser')).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()
  })

  it('saves Ministerial client location changes without changing authoritative client numbers', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Applicant')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )

    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()

    const applicantLocation = screen.getByLabelText('Applicant location')
    const agentLocation = screen.getByLabelText('Agent location')
    await waitFor(() => {
      expect(applicantLocation).toBeEnabled()
      expect(agentLocation).toBeEnabled()
    })
    await userEvent.selectOptions(applicantLocation, '04')
    await userEvent.selectOptions(agentLocation, '02')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          ownerClientLocation: '04',
          agentClientNumber: '00012345',
          agentClientLocation: '02',
        }),
      )
    })
    expect(await screen.findByText('Applicant details saved')).toBeInTheDocument()
  })

  it('adds eligible Ministerial applications and explains empty scale, documents, and fees', async () => {
    configureMinisterialActivePermit({ receiptNumber: null })
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: ['APP-ELIGIBLE'],
      applicationItems: [
        {
          applicationNumber: 'APP-ELIGIBLE',
          disabled: false,
          disabledReason: '',
          unassignedPieces: 8,
          unassignedVolume: 12.5,
        },
        {
          applicationNumber: 'APP-BLOCKED',
          disabled: true,
          disabledReason: 'This application is already attached to another permit.',
          unassignedPieces: 3,
          unassignedVolume: 4.5,
        },
      ],
      errorMessage: '',
    })
    renderPermitDetails()

    expect(
      await screen.findByRole('columnheader', { name: 'Include in permit' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Application number' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pieces' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Volume (m³)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '8' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12.5' })).toBeInTheDocument()

    const blockedCheckbox = screen.getByRole('checkbox', {
      name: 'Include application APP-BLOCKED in permit',
    })
    expect(blockedCheckbox).toBeDisabled()
    const blockedTooltip = blockedCheckbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(blockedTooltip).toBeTruthy()
    await userEvent.hover(blockedTooltip)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This application is already attached to another permit.',
    )

    const applicationsFrame = screen.getByRole('region', {
      name: 'Applications available for this permit',
    })
    const applicationsTile = applicationsFrame.closest('.cds--tile') as HTMLElement
    expect(applicationsTile).toBeTruthy()
    const addApplicationButton = within(applicationsTile).getByRole('button', {
      name: 'Add application',
    })
    expect(addApplicationButton).toBeDisabled()
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Include application APP-ELIGIBLE in permit' }),
    )
    await waitFor(() => {
      expect(
        within(applicationsTile).getByRole('button', { name: 'Add application' }),
      ).toBeEnabled()
    })
    await userEvent.click(within(applicationsTile).getByRole('button', { name: 'Add application' }))
    await waitFor(() => {
      expect(mockedAddApplicationsToPermit).toHaveBeenCalledWith({
        permitNumber: '777',
        selectedApplications: ['APP-ELIGIBLE'],
      })
    })

    await selectPermitDetailTab('Scale')
    const scaleEmptyState = (await screen.findByRole('heading', { name: 'No scale yet' })).closest(
      '.lexis-empty-state',
    )
    expect(scaleEmptyState).toHaveTextContent(
      'Scale comes from the applications selected for this permit. Select an application on the Permit tab.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Permit tab' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')

    await selectPermitDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this permit' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Documents stay with the record as it moves through the application, exemption and permit stages.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add document' })).toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    const feesEmptyState = (await screen.findByRole('heading', { name: 'No fees yet' })).closest(
      '.lexis-empty-state',
    )
    expect(feesEmptyState).toHaveTextContent(
      "Fees are calculated from the permit's Summary of Scale. They appear once an application is selected on the Permit tab.",
    )
    expect(screen.queryByLabelText('Receipt number')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Permit fees' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Package fees' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Permit tab' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a failed Ministerial application lookup once and retries only when requested', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications
      .mockRejectedValueOnce(new Error('available applications unavailable'))
      .mockResolvedValueOnce({
        applicationList: ['APP-RETRY'],
        applicationItems: [
          {
            applicationNumber: 'APP-RETRY',
            disabled: false,
            disabledReason: '',
            unassignedPieces: 2,
            unassignedVolume: 3.5,
          },
        ],
        errorMessage: '',
      })
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/provincial/permit/777', state: { permitCreated: true } }]}
      >
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const unavailableState = (
      await screen.findByRole('heading', { name: 'Applications unavailable' })
    ).closest('.lexis-empty-state')
    expect(unavailableState).toBeTruthy()
    expect(unavailableState).toHaveTextContent('Applications unavailable')
    expect(unavailableState).toHaveTextContent('Applications could not be loaded. Try again.')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('link', { name: 'APP-RETRY' })).toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('prevents duplicate Ministerial application mutations while an add is in progress', async () => {
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: ['APP-ONCE'],
      applicationItems: [
        {
          applicationNumber: 'APP-ONCE',
          disabled: false,
          disabledReason: '',
          unassignedPieces: 2,
          unassignedVolume: 3.5,
        },
      ],
      errorMessage: '',
    })
    let resolveAdd:
      | ((result: {
          success: boolean
          message: string
          errors: string[]
          warnings: string[]
        }) => void)
      | undefined
    mockedAddApplicationsToPermit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve
        }),
    )
    renderPermitDetails()

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application APP-ONCE in permit' }),
    )
    const addApplicationButton = screen.getByRole('button', { name: 'Add application' })
    act(() => {
      fireEvent.click(addApplicationButton)
      fireEvent.click(addApplicationButton)
    })
    expect(mockedAddApplicationsToPermit).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAdd?.({
        success: true,
        message: 'Application was added to the permit.',
        errors: [],
        warnings: [],
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Application was added to the permit.')).toBeInTheDocument()
    })
  })

  it('refreshes Ministerial totals and available applications after adding without discarding permit edits', async () => {
    const initialDetail = configureMinisterialActivePermit({ receiptNumber: null, remarks: '' })
    const refreshedDetail = {
      ...initialDetail,
      numberOfPieces: 18,
      permitVolume: 132.5,
    }
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 117.5,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(refreshedDetail)
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce(tabsResult)
      .mockResolvedValue({ ...tabsResult, applications: ['APP-REFRESH'] })
    mockedFetchAvailablePermitApplications
      .mockResolvedValueOnce({
        applicationList: ['APP-REFRESH'],
        applicationItems: [
          {
            applicationNumber: 'APP-REFRESH',
            disabled: false,
            disabledReason: '',
            unassignedPieces: 8,
            unassignedVolume: 12.5,
          },
        ],
        errorMessage: '',
      })
      .mockResolvedValue({
        applicationList: [],
        applicationItems: [
          {
            applicationNumber: 'APP-REFRESH',
            disabled: true,
            disabledReason: 'Already associated with this permit.',
            unassignedPieces: 8,
            unassignedVolume: 12.5,
          },
        ],
        errorMessage: '',
      })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const remarks = screen.getByLabelText('Remarks')
    await userEvent.type(remarks, 'Keep this draft remark')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() => {
      const pieces = screen.getByText('Current permit pieces').parentElement?.querySelector('dd')
      const volume = screen
        .getByText('Current permit volume (m³)')
        .parentElement?.querySelector('dd')
      const remaining = screen
        .getByText('Total volume remaining (m³)')
        .parentElement?.querySelector('dd')
      expect(pieces).toHaveTextContent('18')
      expect(volume).toHaveTextContent('132.5')
      expect(remaining).toHaveTextContent('117.5')
    })
    await waitFor(() => {
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', [
        'APP-REFRESH',
      ])
    })
    expect(
      screen.getByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Remarks')).toHaveValue('Keep this draft remark')
  })

  it('keeps a saved Ministerial application addition when exemption totals cannot refresh', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const initialDetail = configureMinisterialActivePermit({ receiptNumber: null, remarks: '' })
    const refreshedDetail = {
      ...initialDetail,
      numberOfPieces: 18,
      permitVolume: 132.5,
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(refreshedDetail)
    mockedFetchProvincialPermitExemptionContext.mockRejectedValueOnce(
      new Error('exemption totals unavailable'),
    )
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: ['APP-REFRESH'],
      applicationItems: [
        {
          applicationNumber: 'APP-REFRESH',
          disabled: false,
          disabledReason: '',
          unassignedPieces: 8,
          unassignedVolume: 12.5,
        },
      ],
      errorMessage: '',
    })

    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Keep this draft remark')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Application was added to the permit. Reload before changing application links again.',
        ),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Remarks')).toHaveValue('Keep this draft remark')
    consoleError.mockRestore()
  })

  it('refreshes Ministerial remaining volume and available applications after removing an application', async () => {
    const initialDetail = configureMinisterialActivePermit({ receiptNumber: null })
    const refreshedDetail = {
      ...initialDetail,
      numberOfPieces: 0,
      permitVolume: 0,
    }
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 372.6,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(refreshedDetail)
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({ ...tabsResult, applications: ['APP-REFRESH'] })
      .mockResolvedValue(tabsResult)
    mockedFetchAvailablePermitApplications
      .mockResolvedValueOnce({
        applicationList: [],
        applicationItems: [
          {
            applicationNumber: 'APP-REFRESH',
            disabled: true,
            disabledReason: 'Already associated with this permit.',
            unassignedPieces: 8,
            unassignedVolume: 28.4,
          },
        ],
        errorMessage: '',
      })
      .mockResolvedValue({
        applicationList: ['APP-REFRESH'],
        applicationItems: [
          {
            applicationNumber: 'APP-REFRESH',
            disabled: false,
            disabledReason: '',
            unassignedPieces: 8,
            unassignedVolume: 28.4,
          },
        ],
        errorMessage: '',
      })

    renderPermitDetails()

    const includedApplications = await screen.findByRole('region', {
      name: 'Included permit applications',
    })
    const applicationRow = within(includedApplications)
      .getByRole('link', { name: 'APP-REFRESH' })
      .closest('tr')
    expect(applicationRow).toBeTruthy()
    await userEvent.click(
      within(applicationRow as HTMLElement).getByRole('button', { name: 'Remove' }),
    )
    const removalConfirmation = await screen.findByRole('dialog', {
      name: 'Remove associated application?',
    })
    await userEvent.click(within(removalConfirmation).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      const pieces = screen.getByText('Current permit pieces').parentElement?.querySelector('dd')
      const volume = screen
        .getByText('Current permit volume (m³)')
        .parentElement?.querySelector('dd')
      const remaining = screen
        .getByText('Total volume remaining (m³)')
        .parentElement?.querySelector('dd')
      expect(pieces).toHaveTextContent('0')
      expect(volume).toHaveTextContent('0')
      expect(remaining).toHaveTextContent('372.6')
    })
    await waitFor(() => {
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', [])
    })
    expect(
      screen.getByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    ).toBeEnabled()
  })

  it('shows saved permit client values when client enrichment is unavailable', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      applicantClientNumber: null,
      agentClientLocationCode: null,
    })
    mockedFetchApplicationClientData.mockRejectedValue(new Error('client endpoint unavailable'))
    renderPermitDetails()

    await selectPermitDetailTab('Owner')

    expect(
      await screen.findByText(
        'Client details could not be retrieved. The saved permit values are still shown.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    const ownerTile = screen
      .getByRole('heading', { level: 2, name: 'Applicant details' })
      .closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(within(ownerTile as HTMLElement).getByText('00067890')).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('03')).toBeInTheDocument()

    consoleWarn.mockRestore()
  })

  it('shows all associated application and package numbers in the permit summary', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      applicationNumber: null,
      packageNumber: null,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      applications: ['1000456', '1000457'],
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'PKG-9' },
        { ...editableBlanketOicPackage, packageNumber: 'PKG-10' },
      ],
    })

    renderPermitDetails()

    const permitSummaryTile = (
      await screen.findByRole('heading', { name: 'Permit summary' })
    ).closest('.cds--tile') as HTMLElement
    expect(within(permitSummaryTile).getByText('1000456, 1000457')).toBeInTheDocument()
    expect(within(permitSummaryTile).getByText('PKG-9, PKG-10')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Application number(s)')).toHaveValue('1000456, 1000457')
    expect(screen.getByLabelText('Package number(s)')).toHaveValue('PKG-9, PKG-10')
  })

  it('restores the permit tab and loads deferred data after a conflict refresh', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/permit/777',
            state: { lexisDetailTab: 'documents' },
          },
        ]}
      >
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      await screen.findByRole('heading', { name: 'No permit documents available', level: 3 }),
    ).toBeInTheDocument()
    expect(mockedFetchPermitDocuments).toHaveBeenCalledWith('777')
  })

  it('uses the authoritative volume total instead of summing rounded fee rows', async () => {
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 2.1,
      packageFeeSummaries: [
        { packageNumber: 'BOIC-1', growthType: 'Old growth', totalFeeForPackage: '$2.08' },
      ],
      fees: ['SCALE-1', 'SCALE-2'].map((id) => ({
        id,
        packageNumber: 'BOIC-1',
        timberMark: id,
        species: 'Fir',
        grade: 'A',
        amv: '$1.00',
        volume: 1,
        ministryUser: false,
        ewb: '',
        filPercent: '',
        mfPercent: '',
        amount: 1.04,
        amountDisplay: '$1.04',
      })),
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')

    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('2.1')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$2.08')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$2.08')
  })

  it('shows package fee summaries, exemption links, and all fee rows', async () => {
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 5.1,
      packageFeeSummaries: [
        { packageNumber: 'PKG-A', growthType: 'Second growth', totalFeeForPackage: '$2.08' },
        { packageNumber: 'PKG-B', growthType: 'Old growth', totalFeeForPackage: '$6.04' },
        { packageNumber: 'PKG-EMPTY', growthType: 'Old growth', totalFeeForPackage: '$0.00' },
      ],
      fees: [
        ...['SCALE-1', 'SCALE-2'].map((id) => ({
          ...calculatedPermitFees.fees[0],
          id,
          packageNumber: 'PKG-A',
          volume: 1,
          amount: 1.04,
          amountDisplay: '$1.04',
        })),
        {
          ...calculatedPermitFees.fees[0],
          id: 'SCALE-3',
          packageNumber: 'PKG-B',
          volume: 3,
          amount: 6.04,
          amountDisplay: '$6.04',
        },
      ],
    })
    renderPermitDetails(
      '/provincial/permit/777?itemsFilter=none&feesFilter=PKG-EMPTY&documentsFilter=none&invoicesFilter=none',
    )

    await selectPermitDetailTab('Fees')

    const summaries = screen.getByRole('region', { name: 'Permit package fee summaries' })
    expect(
      within(summaries).getByRole('row', { name: /PKG-A Second growth.*\$2\.08/ }),
    ).toBeVisible()
    expect(within(summaries).getByRole('row', { name: /PKG-B Old growth.*\$6\.04/ })).toBeVisible()
    const emptyPackage = within(summaries).getByRole('row', {
      name: /PKG-EMPTY Old growth.*\$0\.00/,
    })
    expect(emptyPackage).toBeVisible()
    expect(within(emptyPackage).getByRole('link', { name: 'EX-9' })).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-9',
    )
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('5.1')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$8.12')
    const feeRows = screen.getByRole('region', { name: 'Permit fee rows' })
    expect(within(feeRows).getAllByRole('row')).toHaveLength(4)
    expect(within(feeRows).getAllByRole('cell', { name: 'PKG-A' })).toHaveLength(2)
    expect(within(feeRows).getByRole('cell', { name: 'PKG-B' })).toBeVisible()
    expect(within(feeRows).getByRole('cell', { name: '$6.04' })).toBeVisible()
    expect(screen.queryByLabelText('Filter fee rows')).not.toBeInTheDocument()
    expect(emptyPackage).toBeVisible()
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('5.1')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$8.12')
  })

  it('displays an authoritative masked package subtotal without masking numeric permit fees', async () => {
    mockedFetchProvincialPermitFees.mockResolvedValue({
      ...calculatedPermitFees,
      packageFeeSummaries: [
        { packageNumber: 'PKG-9', growthType: 'Old growth', totalFeeForPackage: '$' },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')

    const summaries = screen.getByRole('region', { name: 'Permit package fee summaries' })
    expect(within(summaries).getByRole('cell', { name: '$' })).toBeVisible()
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
  })

  it('separates BOIC permit fees from all package fees without changing authoritative totals', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        editableBlanketOicPackage,
        { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
      ],
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 5.1,
      packageFeeSummaries: [
        { packageNumber: 'BOIC-9', growthType: 'Old growth', totalFeeForPackage: '$' },
        { packageNumber: 'BOIC-10', growthType: 'Second growth', totalFeeForPackage: '$6.04' },
      ],
      fees: [
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-9',
          packageNumber: 'BOIC-9',
          volume: 1,
          amount: 2.08,
          amountDisplay: '$2.08',
        },
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-10',
          packageNumber: 'BOIC-10',
          volume: 3,
          amount: 6.04,
          amountDisplay: '$6.04',
        },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Scale')
    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Package number' }),
      'BOIC-10',
    )
    await selectPermitDetailTab('Fees')

    const permitFeesTile = (await screen.findByRole('heading', { name: 'Permit fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    const packageFeesTile = screen
      .getByRole('heading', { name: 'Package fees' })
      .closest('.cds--tile') as HTMLElement
    expect(permitFeesTile).not.toBe(packageFeesTile)
    for (const [label, value] of [
      ['Receipt number', 'R-1'],
      ['Total volume (m³)', '5.1'],
      ['Calculated fee (CAD)', '$8.12'],
      ['Effective fee (CAD)', '$8.12'],
    ]) {
      const field = within(permitFeesTile)
        .getByText(label)
        .closest('.detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    expect(within(permitFeesTile).getByRole('button', { name: 'Edit fee details' })).toBeEnabled()
    expect(within(permitFeesTile).getByRole('button', { name: 'Edit fee override' })).toBeEnabled()
    expect(within(packageFeesTile).queryByLabelText('Receipt number')).not.toBeInTheDocument()

    const summaries = within(packageFeesTile).getByRole('region', {
      name: 'Permit package fee summaries',
    })
    const maskedPackage = within(summaries).getByRole('row', { name: /BOIC-9 Old growth/ })
    expect(within(maskedPackage).getByRole('cell', { name: '$' })).toBeVisible()
    expect(within(maskedPackage).getByRole('link', { name: 'EX-9' })).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-9',
    )
    expect(
      within(summaries).getByRole('row', { name: /BOIC-10 Second growth.*\$6\.04/ }),
    ).toBeVisible()
    const feeRows = within(packageFeesTile).getByRole('region', { name: 'Permit fee rows' })
    expect(within(feeRows).getAllByRole('row')).toHaveLength(3)
    expect(within(feeRows).getByRole('cell', { name: 'BOIC-9' })).toBeVisible()
    expect(within(feeRows).getByRole('cell', { name: 'BOIC-10' })).toBeVisible()
    expect(within(feeRows).getByRole('cell', { name: '$2.08' })).toBeVisible()
    expect(within(feeRows).getByRole('cell', { name: '$6.04' })).toBeVisible()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('filters Ministerial scale and fees by the shared exact package selection', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          ...editableBlanketOicPackage,
          packageNumber: 'MIN-1',
          ageClass: 'Old growth',
          packageVolume: '999',
        },
        {
          ...editableBlanketOicPackage,
          packageNumber: 'MIN-1 ',
          ageClass: 'Second growth',
          packageVolume: '555',
        },
      ],
      items: [
        {
          id: 'SCALE-PLAIN',
          timberMark: 'TM-PLAIN',
          scaleType: 'C',
          species: 'Fir',
          grade: 'A',
          pieces: 2,
          volume: 3,
          packageNumber: 'MIN-1',
          permitNumber: '777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-PADDED',
          timberMark: 'TM-PADDED',
          scaleType: 'C',
          species: 'Hemlock',
          grade: 'B',
          pieces: 7,
          volume: 9,
          packageNumber: 'MIN-1 ',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 12,
      packageFeeSummaries: [
        {
          packageNumber: 'MIN-1',
          growthType: 'Incorrect fee age class',
          totalFeeForPackage: '$3.00',
        },
        {
          packageNumber: 'MIN-1 ',
          growthType: 'Incorrect fee age class',
          totalFeeForPackage: '$9.00',
        },
      ],
      fees: [
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-PLAIN',
          packageNumber: 'MIN-1',
          timberMark: 'TM-PLAIN',
          volume: 3,
          amount: 3,
          amountDisplay: '$3.00',
        },
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-PADDED',
          packageNumber: 'MIN-1 ',
          timberMark: 'TM-PADDED',
          volume: 9,
          amount: 9,
          amountDisplay: '$9.00',
        },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Scale')
    const scalePackage = await screen.findByRole('combobox', { name: 'Package number' })
    const scaleDetails = screen.getByRole('group', { name: 'Package details' })
    expect(scalePackage).toHaveValue('MIN-1')
    expect(within(scaleDetails).getByText('Old growth')).toBeVisible()
    expect(within(scaleDetails).getByText('3')).toBeVisible()
    const scaleRows = screen.getByRole('region', { name: 'Scale rows' })
    expect(within(scaleRows).getByText('TM-PLAIN')).toBeVisible()
    expect(within(scaleRows).queryByText('TM-PADDED')).not.toBeInTheDocument()
    expect(
      within(scaleRows).queryByRole('columnheader', { name: 'Package' }),
    ).not.toBeInTheDocument()

    await chooseComboBoxOption(scalePackage, 'MIN-1 (1 trailing space)')
    expect(scalePackage).toHaveValue('MIN-1 (1 trailing space)')
    expect(within(scaleDetails).getByText('Second growth')).toBeVisible()
    expect(within(scaleDetails).getByText('9')).toBeVisible()
    expect(within(scaleRows).getByText('TM-PADDED')).toBeVisible()
    expect(within(scaleRows).queryByText('TM-PLAIN')).not.toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    const feesPackage = await screen.findByRole('combobox', { name: 'Package number' })
    const packageFeesTile = screen
      .getByRole('heading', { name: 'Package fees' })
      .closest('.cds--tile') as HTMLElement
    expect(feesPackage).toHaveValue('MIN-1 (1 trailing space)')
    expect(within(packageFeesTile).getByText('Second growth')).toBeVisible()
    expect(
      within(
        within(packageFeesTile).getByText('Package fee (CAD)').parentElement as HTMLElement,
      ).getByText('$9.00'),
    ).toBeVisible()
    const feeRows = within(packageFeesTile).getByRole('region', { name: 'Permit fee rows' })
    expect(within(feeRows).getByText('TM-PADDED')).toBeVisible()
    expect(within(feeRows).queryByText('TM-PLAIN')).not.toBeInTheDocument()
    expect(within(feeRows).queryByRole('columnheader', { name: 'Package' })).not.toBeInTheDocument()
  })

  it('keeps the Ministerial package selector available when its fee summary is absent', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-NO-FEE' }],
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 0,
      packageFeeSummaries: [],
      fees: [],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(await screen.findByRole('combobox', { name: 'Package number' })).toHaveValue(
      'MIN-NO-FEE',
    )
    expect(screen.getByText('Unavailable')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No fee details available' })).toBeVisible()
  })

  it('refreshes loaded fees after saving the permit submit date and preserves the current tab', async () => {
    configureActivePermit()
    let resolveRefreshedFees:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitFees>>) => void)
      | undefined
    mockedFetchProvincialPermitFees
      .mockReset()
      .mockResolvedValueOnce(calculatedPermitFees)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefreshedFees = resolve
          }),
      )
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
    expect(screen.queryByLabelText('Filter fee rows')).not.toBeInTheDocument()
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText('The permit was updated successfully.')).toBeInTheDocument()
    expect(screen.getByText('Permit details saved')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({ permitSubmitDate: '2026-04-11', permitStatus: 'ACT' }),
    )
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Loading…')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Permit package fee summaries' }),
    ).not.toBeInTheDocument()

    await act(async () =>
      resolveRefreshedFees?.({
        ...calculatedPermitFees,
        packageFeeSummaries: [
          { packageNumber: 'PKG-9', growthType: 'Second growth', totalFeeForPackage: '$75.00' },
        ],
        fees: calculatedPermitFees.fees.map((row) => ({
          ...row,
          amount: 75,
          amountDisplay: '$75.00',
        })),
      }),
    )
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$75.00')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$75.00')
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('$75.00')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Permit package fee summaries' })).getByRole(
        'cell',
        { name: '$75.00' },
      ),
    ).toBeVisible()
  })

  it('retains loaded fees when saving the permit submit date fails', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitFees.mockReset().mockResolvedValue(calculatedPermitFees)
    mockedUpdatePermitDetail.mockResolvedValue({
      success: false,
      message: 'The permit was not updated.',
      errors: ['The permit submit date could not be saved.'],
      warnings: [],
      source: 'api',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      await screen.findByText('The permit submit date could not be saved.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Submit date')).toHaveValue('2026-04-11')
    await selectPermitDetailTab('Fees')
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$37.50')
    expect(within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('$37.50')).toBeVisible()
  })

  it('refreshes loaded fees after shipping changes without displaying the previous calculation', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      destinationCountryCode: 'US',
    })
    let resolveRefreshedFees:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitFees>>) => void)
      | undefined
    mockedFetchProvincialPermitFees
      .mockResolvedValueOnce(calculatedPermitFees)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefreshedFees = resolve
          }),
      )
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.selectOptions(screen.getByLabelText('Final destination country'), 'CA')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    expect(await screen.findByText('The permit was saved successfully.')).toBeInTheDocument()
    expect(screen.getByText('Shipping details saved')).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Loading…')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    await act(async () => resolveRefreshedFees?.(maskedPermitFees))

    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$')
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('10.0')
    const feeRow = screen.getByRole('row', { name: /TEST-FEE/ })
    expect(within(feeRow).getByText('$')).toBeInTheDocument()
    expect(within(feeRow).queryByText('3.75')).not.toBeInTheDocument()
  })

  it('refreshes fee rows when a fee override is enabled and disabled', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitFees
      .mockResolvedValueOnce(calculatedPermitFees)
      .mockResolvedValueOnce(maskedPermitFees)
      .mockResolvedValueOnce(calculatedPermitFees)
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$'))
    expect(screen.getByText('Fee override saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$45.25')
    expect(within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('$')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$37.50'))
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$37.50')
    expect(
      within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('$37.50'),
    ).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(3)
  })

  it('discards a fee response started before a successful fee override save', async () => {
    configureActivePermit()
    let resolveOriginalFees:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitFees>>) => void)
      | undefined
    mockedFetchProvincialPermitFees
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOriginalFees = resolve
          }),
      )
      .mockResolvedValueOnce(maskedPermitFees)
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$'))
    await act(async () => resolveOriginalFees?.(calculatedPermitFees))
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$45.25')
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
  })

  it.each(['resolves after scale refresh', 'rejects during core reload'])(
    'supersedes a pending post-save fee refresh when scale membership changes and it %s',
    async (pendingOutcome) => {
      configureActivePermit()
      const scale = {
        id: 'SCALE-2',
        timberMark: 'TM-2',
        scaleType: '',
        species: 'Fir',
        grade: 'A',
        pieces: 4,
        volume: 10,
        packageNumber: 'PKG-9',
        permitNumber: '',
        includedInPermit: false,
      }
      const refreshedTabs = {
        ...tabsResult,
        packages: [{ ...editableBlanketOicPackage, packageNumber: 'PKG-10' }],
        items: [{ ...scale, includedInPermit: true, permitNumber: '777' }],
      }
      let resolveRefreshedTabs: ((value: ProvincialPermitDetailTabsData) => void) | undefined
      mockedFetchProvincialPermitDetailTabs
        .mockResolvedValueOnce({
          ...tabsResult,
          packages: [{ ...editableBlanketOicPackage, packageNumber: 'PKG-9' }],
          items: [scale],
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRefreshedTabs = resolve
            }),
        )
      let resolvePostSaveFees:
        | ((value: Awaited<ReturnType<typeof fetchProvincialPermitFees>>) => void)
        | undefined
      let rejectPostSaveFees: ((error: Error) => void) | undefined
      mockedFetchProvincialPermitFees
        .mockResolvedValueOnce(calculatedPermitFees)
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolvePostSaveFees = resolve
              rejectPostSaveFees = reject
            }),
        )
        .mockResolvedValueOnce({
          totalFeeVolume: 20,
          packageFeeSummaries: [
            { packageNumber: 'PKG-10', growthType: 'Second growth', totalFeeForPackage: '$' },
          ],
          fees: maskedPermitFees.fees.map((row) => ({
            ...row,
            packageNumber: 'PKG-10',
            volume: 20,
          })),
        })
      renderPermitDetails()

      await selectPermitDetailTab('Fees')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
      await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
      await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
      await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))
      expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)

      await selectPermitDetailTab('Items')
      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Include scale SCALE-2 in permit' }),
      )
      await waitFor(() => expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2))
      if (pendingOutcome === 'rejects during core reload') {
        await act(async () => rejectPostSaveFees?.(new Error('Prior fee request failed')))
      }
      await act(async () => resolveRefreshedTabs?.(refreshedTabs))
      await waitFor(() => expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(3))
      expect(mockedFetchProvincialPermitFees).toHaveBeenLastCalledWith({
        permitNumber: '777',
        blanketOic: false,
        packageNumbers: ['PKG-10'],
      })
      await selectPermitDetailTab('Fees')
      expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('20.0')

      if (pendingOutcome === 'resolves after scale refresh') {
        await act(async () => resolvePostSaveFees?.(maskedPermitFees))
      }
      expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('20.0')
      expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$45.25')
      expect(
        within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('PKG-10'),
      ).toBeInTheDocument()
    },
  )

  it('keeps a successful fee override save while a failed fee refresh can be retried', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitFees
      .mockResolvedValueOnce(calculatedPermitFees)
      .mockRejectedValueOnce(new Error('Fee calculation unavailable'))
      .mockResolvedValueOnce(maskedPermitFees)
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    expect(await screen.findByText('The permit was updated successfully.')).toBeInTheDocument()
    expect(await screen.findByText('Unable to retrieve permit fee details.')).toBeInTheDocument()
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Unavailable')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    await selectPermitDetailTab('Items')
    await selectPermitDetailTab('Fees')

    await waitFor(() => expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('$'))
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('$45.25')
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(3)
  })

  it('defers fee and document data until their tabs are opened', async () => {
    let resolveFees:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitFees>>) => void)
      | undefined
    mockedFetchProvincialPermitFees.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitFees>>>((resolve) => {
          resolveFees = resolve
        }),
    )
    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).not.toHaveBeenCalled()
    expect(mockedFetchPermitDocuments).not.toHaveBeenCalled()
    expect(mockedFetchPermitInvoices).not.toHaveBeenCalled()

    await selectPermitDetailTab('Fees')
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)
    expect(mockedFetchProvincialPermitGbmsEvents).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: false,
    })
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Loading…')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Loading…')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('Loading…')
    await act(async () => {
      resolveFees?.({ fees: [], packageFeeSummaries: [], totalFeeVolume: 0 })
    })
    expect(
      await screen.findByRole('heading', { name: 'No fee details available', level: 3 }),
    ).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)

    await selectPermitDetailTab('Items')
    await selectPermitDetailTab('Fees')
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)

    await selectPermitDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No permit documents available', level: 3 }),
    ).toBeInTheDocument()
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(1)
    await selectPermitDetailTab('Permit')
    await selectPermitDetailTab('Documents')
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(1)

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
    expect(mockedFetchPermitInvoices).not.toHaveBeenCalled()
  })

  it('shows the permit detail while core tables continue loading', async () => {
    configureActivePermit()
    let resolveFeeContext:
      | ((value: Awaited<ReturnType<typeof fetchPermitFeeOverrideContext>>) => void)
      | undefined
    let resolveTabs:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>) => void)
      | undefined
    let resolveGbms:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitGbmsEvents>>) => void)
      | undefined
    mockedFetchPermitFeeOverrideContext.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchPermitFeeOverrideContext>>>((resolve) => {
          resolveFeeContext = resolve
        }),
    )
    mockedFetchProvincialPermitDetailTabs.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>>((resolve) => {
          resolveTabs = resolve
        }),
    )
    mockedFetchProvincialPermitGbmsEvents.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitGbmsEvents>>>((resolve) => {
          resolveGbms = resolve
        }),
    )

    renderPermitDetails()

    await waitFor(() => {
      expect(mockedFetchPermitFeeOverrideContext).toHaveBeenCalledWith('777')
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
        permitNumber: '777',
        receiptNumber: 'R-1',
        blanketOic: false,
      })
    })

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByText('Loading provincial permit detail…')).not.toBeInTheDocument()
    expect(screen.getByText('Loading associated permit applications…')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Permit edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveTabs?.(tabsResult)
    })

    await waitFor(() => expect(mockedFetchProvincialPermitGbmsEvents).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('tab', { name: 'GBMS' })).not.toBeInTheDocument()

    await act(async () => {
      resolveGbms?.([gbmsHistoryRow])
    })
    expect(await screen.findByRole('tab', { name: 'GBMS' })).toBeInTheDocument()

    await act(async () => {
      resolveFeeContext?.({
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
        locked: false,
        lockMessage: '',
      })
    })
  })

  it('reports an unavailable GBMS history instead of showing an empty result', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitGbmsEvents.mockRejectedValueOnce(new Error('gbms unavailable'))

    renderPermitDetails()

    expect(
      await screen.findByText('GBMS invoice history could not be loaded. Please try again later.'),
    ).toBeInTheDocument()
    await selectPermitDetailTab('GBMS')
    expect(
      screen.getByRole('heading', { name: 'GBMS history unavailable', level: 3 }),
    ).toBeInTheDocument()
  })

  it('loads GBMS history when the permit has no receipt number', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({ ...permitDetail, receiptNumber: null })
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([gbmsHistoryRow])

    renderPermitDetails()

    await waitFor(() =>
      expect(mockedFetchProvincialPermitGbmsEvents).toHaveBeenCalledWith({
        permitNumber: '777',
        receiptNumber: null,
        blanketOic: false,
      }),
    )
    await selectPermitDetailTab('GBMS')
    expect(await screen.findByRole('cell', { name: 'A006654' })).toBeInTheDocument()
  })

  it('shows the base permit detail while exemption context continues loading', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      approvedExemptionVolume: null,
      exemptionVolumeRemaining: null,
      exemptionTypeDescription: null,
      blanketOic: false,
    })
    let resolveExemptionContext:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitExemptionContext>>) => void)
      | undefined
    mockedFetchProvincialPermitExemptionContext.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitExemptionContext>>>(
          (resolve) => {
            resolveExemptionContext = resolve
          },
        ),
    )

    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByText('Loading provincial permit detail…')).not.toBeInTheDocument()
    expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalledWith('EX-9')
    expect(mockedFetchProvincialPermitDetailTabs).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveExemptionContext?.({
        approvedExemptionVolume: 250,
        exemptionVolumeRemaining: 130,
        exemptionTypeDescription: 'Standard exemption',
        blanketOic: false,
      })
    })

    await waitFor(() =>
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
        permitNumber: '777',
        receiptNumber: 'R-1',
        blanketOic: false,
      }),
    )
  })

  it('loads a missing exemption type when permit volumes are already available', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: null,
    })
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 130,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })

    renderPermitDetails()

    expect(await screen.findByText('Ministerial')).toBeVisible()
    expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalledWith('EX-9')
  })

  it.each([false, true])(
    'shows unavailable fee summaries when the deferred fee request fails (BOIC: %s)',
    async (blanketOic) => {
      if (blanketOic) configureEditableBlanketOicPackage()
      mockedFetchProvincialPermitFees.mockRejectedValue(new Error('fees unavailable'))
      renderPermitDetails()

      await selectPermitDetailTab('Fees')

      const errorHeading = await screen.findByRole('heading', {
        name: 'Fee details unavailable',
      })
      expect(errorHeading).toBeInTheDocument()
      if (blanketOic) {
        const permitFeesTile = screen
          .getByRole('heading', { name: 'Permit fees' })
          .closest('.cds--tile') as HTMLElement
        for (const label of ['Total volume (m³)', 'Calculated fee (CAD)', 'Effective fee (CAD)']) {
          const field = within(permitFeesTile)
            .getByText(label)
            .closest('.detail-field-item') as HTMLElement
          expect(within(field).getByText('Unavailable')).toBeInTheDocument()
        }
        const packageFeesTile = screen
          .getByRole('heading', { name: 'Package fees' })
          .closest('.cds--tile') as HTMLElement
        expect(packageFeesTile).toContainElement(errorHeading)
        expect(
          within(packageFeesTile).queryByRole('region', { name: 'Permit package fee summaries' }),
        ).not.toBeInTheDocument()
        expect(
          within(packageFeesTile).queryByRole('region', { name: 'Permit fee rows' }),
        ).not.toBeInTheDocument()
      } else {
        expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Unavailable')
        expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Unavailable')
        expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('Unavailable')
      }
    },
  )

  it('shows legacy package metadata on the items tab', async () => {
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          packageNumber: 'PKG-9',
          region: 'Coast',
          speciesEndUseSort: 'HE/PL',
          ageClass: 'Second growth',
          packageVolume: '120.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '',
          status: '',
          reprocessed: '',
          comments: '',
        },
        {
          packageNumber: 'PKG-10',
          region: 'Coast',
          speciesEndUseSort: 'FI/LU',
          ageClass: 'Second growth',
          packageVolume: '22.5',
          averageLength: '6.1',
          averageTopDiameter: '14.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '',
          status: '',
          reprocessed: '',
          comments: '',
        },
      ],
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          scaleType: 'C',
          species: 'Fir',
          grade: 'A',
          pieces: 12,
          volume: 34.5,
          packageNumber: 'PKG-9',
          permitNumber: '777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-2',
          timberMark: 'TM-2',
          scaleType: 'C',
          species: 'Hemlock',
          grade: 'B',
          pieces: 8,
          volume: 12.5,
          packageNumber: 'PKG-10',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Items')

    expect(await screen.findByRole('region', { name: 'Permit packages' })).toBeInTheDocument()
    expect(
      await screen.findByRole('columnheader', { name: 'Species and end use sort' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'Coast' })).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'HE/PL' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'Second growth' })).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '120.5' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'Unmanufactured' })).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Scale type' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Permit' })).toBeInTheDocument()
    expect(
      within(await screen.findByRole('region', { name: 'Permit item rows' }))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Include in permit',
      'Timber mark',
      'Scale type',
      'Permit',
      'Package',
      'Pieces',
      'Species',
      'Grade',
      'Volume (m³)',
    ])
    const itemRows = await screen.findByRole('region', { name: 'Permit item rows' })
    expect(within(itemRows).getAllByRole('cell', { name: 'C' })).toHaveLength(2)
    expect(within(itemRows).getAllByRole('cell', { name: '777' })).toHaveLength(2)
    expect(within(itemRows).getByRole('cell', { name: 'PKG-9' })).toBeInTheDocument()
    expect(within(itemRows).getByRole('cell', { name: 'PKG-10' })).toBeInTheDocument()
  })

  it('updates normal permit scale membership from the items tab', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        items: [
          {
            id: 'SCALE-1',
            timberMark: 'TM-1',
            scaleType: '',
            species: 'Fir',
            grade: 'A',
            pieces: 12,
            volume: 34.5,
            packageNumber: 'PKG-9',
            permitNumber: '777',
            includedInPermit: true,
          },
          {
            id: 'SCALE-2',
            timberMark: 'TM-2',
            scaleType: '',
            species: 'Cedar',
            grade: 'B',
            pieces: 4,
            volume: 8.5,
            packageNumber: 'PKG-9',
            permitNumber: '',
            includedInPermit: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...tabsResult,
        items: [
          {
            id: 'SCALE-1',
            timberMark: 'TM-1',
            scaleType: '',
            species: 'Fir',
            grade: 'A',
            pieces: 12,
            volume: 34.5,
            packageNumber: 'PKG-9',
            permitNumber: '777',
            includedInPermit: true,
          },
          {
            id: 'SCALE-2',
            timberMark: 'TM-2',
            scaleType: '',
            species: 'Cedar',
            grade: 'B',
            pieces: 4,
            volume: 8.5,
            packageNumber: 'PKG-9',
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Fees')
    expect(
      await screen.findByRole('heading', { name: 'No fee details available', level: 3 }),
    ).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)

    await selectPermitDetailTab('Items')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-2 in permit',
    })
    expect(includeScale).not.toBeChecked()
    await userEvent.click(includeScale)

    await waitFor(() => {
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-2',
        permitNumber: '777',
        attachInd: true,
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Scale detail was added to the permit.')).toBeInTheDocument()
  })

  it('removes normal permit scale membership from the items tab', async () => {
    mockedUpdatePermitScaleAttachment.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        items: [
          {
            id: 'SCALE-1',
            timberMark: 'TM-1',
            scaleType: '',
            species: 'Fir',
            grade: 'A',
            pieces: 12,
            volume: 34.5,
            packageNumber: 'PKG-9',
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        ...tabsResult,
        items: [
          {
            id: 'SCALE-1',
            timberMark: 'TM-1',
            scaleType: '',
            species: 'Fir',
            grade: 'A',
            pieces: 12,
            volume: 34.5,
            packageNumber: 'PKG-9',
            permitNumber: '',
            includedInPermit: false,
          },
        ],
      })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Items')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(includeScale).toBeChecked()
    await userEvent.click(includeScale)

    await waitFor(() => {
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: false,
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Scale detail was removed from the permit.')).toBeInTheDocument()
  })

  it('disables every normal scale toggle until the current scale update has reloaded', async () => {
    configureActivePermit()
    let resolveUpdate!: (value: {
      success: true
      message: string
      errors: string[]
      warnings: string[]
    }) => void
    mockedUpdatePermitScaleAttachment.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          scaleType: '',
          species: 'Fir',
          grade: 'A',
          pieces: 12,
          volume: 34.5,
          packageNumber: 'PKG-9',
          permitNumber: '777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-2',
          timberMark: 'TM-2',
          scaleType: '',
          species: 'Cedar',
          grade: 'B',
          pieces: 4,
          volume: 8.5,
          packageNumber: 'PKG-9',
          permitNumber: '',
          includedInPermit: false,
        },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Items')
    const includeFirst = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    const includeSecond = screen.getByRole('checkbox', {
      name: 'Include scale SCALE-2 in permit',
    })
    await userEvent.click(includeSecond)

    await waitFor(() => expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledOnce())
    expect(includeFirst).toBeDisabled()
    expect(includeSecond).toBeDisabled()

    await userEvent.click(includeFirst)
    expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledOnce()

    await act(async () =>
      resolveUpdate({
        success: true,
        message: 'Scale detail was added to the permit.',
        errors: [],
        warnings: [],
      }),
    )
    await waitFor(() => expect(includeFirst).toBeEnabled())
  })

  it('restores a Ministerial application after its last scale is removed', async () => {
    const initialDetail = configureMinisterialActivePermit({
      receiptNumber: null,
      numberOfPieces: 9,
      permitVolume: 28.4,
      exemptionVolumeRemaining: 344.2,
    })
    const refreshedDetail = {
      ...initialDetail,
      numberOfPieces: 0,
      permitVolume: 0,
    }
    const attachedScale = {
      id: 'SCALE-1',
      timberMark: 'TM-1',
      scaleType: '',
      species: 'Fir',
      grade: 'A',
      pieces: 9,
      volume: 28.4,
      packageNumber: 'PKG-9',
      permitNumber: '777',
      includedInPermit: true,
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(refreshedDetail)
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 400,
      exemptionVolumeRemaining: 372.6,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['APP-SCALE'],
        items: [attachedScale],
      })
      .mockResolvedValue({
        ...tabsResult,
        applications: [],
        items: [{ ...attachedScale, permitNumber: '', includedInPermit: false }],
      })
    mockedFetchAvailablePermitApplications
      .mockResolvedValueOnce({
        applicationList: [],
        applicationItems: [
          {
            applicationNumber: 'APP-SCALE',
            disabled: true,
            disabledReason: 'Already associated with this permit.',
            unassignedPieces: null,
            unassignedVolume: null,
          },
        ],
        errorMessage: '',
      })
      .mockResolvedValue({
        applicationList: ['APP-SCALE'],
        applicationItems: [
          {
            applicationNumber: 'APP-SCALE',
            disabled: false,
            disabledReason: '',
            unassignedPieces: 9,
            unassignedVolume: 28.4,
          },
        ],
        errorMessage: '',
      })
    mockedUpdatePermitScaleAttachment.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })

    renderPermitDetails()

    expect(
      await screen.findByRole('checkbox', {
        name: 'Include application APP-SCALE in permit',
      }),
    ).toBeDisabled()
    await selectPermitDetailTab('Scale')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    await waitFor(() => expect(includeScale).toBeEnabled())
    await userEvent.click(includeScale)

    await waitFor(() => {
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: false,
      })
    })
    await selectPermitDetailTab('Permit')

    await waitFor(() => {
      const pieces = screen.getByText('Current permit pieces').parentElement?.querySelector('dd')
      const volume = screen
        .getByText('Current permit volume (m³)')
        .parentElement?.querySelector('dd')
      const remaining = screen
        .getByText('Total volume remaining (m³)')
        .parentElement?.querySelector('dd')
      expect(pieces).toHaveTextContent('0')
      expect(volume).toHaveTextContent('0')
      expect(remaining).toHaveTextContent('372.6')
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', [])
    })
    const restoredApplication = await screen.findByRole('checkbox', {
      name: 'Include application APP-SCALE in permit',
    })
    expect(restoredApplication).toBeEnabled()
    const availableApplications = screen.getByRole('region', {
      name: 'Applications available for this permit',
    })
    const applicationRow = within(availableApplications)
      .getByRole('link', { name: 'APP-SCALE' })
      .closest('tr')
    expect(applicationRow).toBeTruthy()
    expect(within(applicationRow as HTMLElement).getByText('9')).toBeInTheDocument()
    expect(within(applicationRow as HTMLElement).getByText('28.4')).toBeInTheDocument()
  })

  it('keeps a Ministerial application unavailable while another scale remains attached', async () => {
    const initialDetail = configureMinisterialActivePermit({
      receiptNumber: null,
      numberOfPieces: 9,
      permitVolume: 28.4,
      exemptionVolumeRemaining: 344.2,
    })
    const refreshedDetail = {
      ...initialDetail,
      numberOfPieces: 5,
      permitVolume: 18.4,
    }
    const scaleToRemove = {
      id: 'SCALE-1',
      timberMark: 'TM-1',
      scaleType: '',
      species: 'Fir',
      grade: 'A',
      pieces: 4,
      volume: 10,
      packageNumber: 'PKG-9',
      permitNumber: '777',
      includedInPermit: true,
    }
    const retainedScale = {
      id: 'SCALE-2',
      timberMark: 'TM-2',
      scaleType: '',
      species: 'Cedar',
      grade: 'B',
      pieces: 5,
      volume: 18.4,
      packageNumber: 'PKG-9',
      permitNumber: '777',
      includedInPermit: true,
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(refreshedDetail)
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 400,
      exemptionVolumeRemaining: 354.2,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['APP-SCALE'],
        items: [scaleToRemove, retainedScale],
      })
      .mockResolvedValue({
        ...tabsResult,
        applications: ['APP-SCALE'],
        items: [{ ...scaleToRemove, permitNumber: '', includedInPermit: false }, retainedScale],
      })
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: [],
      applicationItems: [
        {
          applicationNumber: 'APP-SCALE',
          disabled: true,
          disabledReason: 'Already associated with this permit.',
          unassignedPieces: null,
          unassignedVolume: null,
        },
      ],
      errorMessage: '',
    })
    mockedUpdatePermitScaleAttachment.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })

    renderPermitDetails()

    await screen.findByRole('checkbox', {
      name: 'Include application APP-SCALE in permit',
    })
    await selectPermitDetailTab('Scale')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    await waitFor(() => expect(includeScale).toBeEnabled())
    await userEvent.click(includeScale)

    await waitFor(() => {
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: false,
      })
    })
    await selectPermitDetailTab('Permit')

    await waitFor(() => {
      const pieces = screen.getByText('Current permit pieces').parentElement?.querySelector('dd')
      const volume = screen
        .getByText('Current permit volume (m³)')
        .parentElement?.querySelector('dd')
      const remaining = screen
        .getByText('Total volume remaining (m³)')
        .parentElement?.querySelector('dd')
      expect(pieces).toHaveTextContent('5')
      expect(volume).toHaveTextContent('18.4')
      expect(remaining).toHaveTextContent('354.2')
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', ['APP-SCALE'])
    })
    expect(
      screen.getByRole('checkbox', {
        name: 'Include application APP-SCALE in permit',
      }),
    ).toBeDisabled()
  })

  it.each([
    { permitStatusCode: 'PPD', permitStatusDescription: 'Payment pending' },
    { permitStatusCode: 'EXP', permitStatusDescription: 'Expired' },
  ])(
    'does not allow normal permit scale membership changes for $permitStatusCode permits',
    async ({ permitStatusCode, permitStatusDescription }) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
      })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        items: [
          {
            id: 'SCALE-1',
            timberMark: 'TM-1',
            scaleType: '',
            species: 'Fir',
            grade: 'A',
            pieces: 12,
            volume: 34.5,
            packageNumber: 'PKG-9',
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })

      render(
        <MemoryRouter initialEntries={['/provincial/permit/777']}>
          <Routes>
            <Route
              path="/provincial/permit/:permitNumber"
              element={<ProvincialPermitDetailsPage />}
            />
          </Routes>
        </MemoryRouter>,
      )

      await selectPermitDetailTab('Items')

      expect(await screen.findByText('TM-1')).toBeInTheDocument()
      expect(screen.queryByText('SCALE-1')).not.toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Include in permit' })).toBeInTheDocument()
      const includeScale = screen.getByRole('checkbox', {
        name: 'Include scale SCALE-1 in permit',
      })
      expect(includeScale).toBeChecked()
      expect(includeScale).toBeDisabled()
      await userEvent.click(includeScale)
      expect(mockedUpdatePermitScaleAttachment).not.toHaveBeenCalled()

      await selectPermitDetailTab('Permit')
      expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
    },
  )

  it('allows IDIR approvers to maintain documents while other expired-permit changes stay locked', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: () => true,
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'EXP',
      permitStatusDescription: 'Expired',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '507',
          name: 'expired-reconciliation.pdf',
          description: 'Post-expiry reconciliation',
          type: 'Permit',
          typeCode: 'PMT',
          source: 'permit',
          deletable: true,
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Email approval' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterPermitDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()

    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
  })

  it('allows scoped BCeID submitters to maintain expired permit documents', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00067890'],
        }),
        canPerform: (action: string) =>
          action === '/filePermitUpload' || action === '/permitDetails',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'EXP',
      permitStatusDescription: 'Expired',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '508',
          name: 'submitter-reconciliation.pdf',
          description: 'Post-expiry reconciliation',
          type: 'Permit',
          typeCode: 'PMT',
          source: 'permit',
          deletable: true,
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('adds and removes applications associated with an editable permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: ['1000457'],
      errorMessage: '',
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['1000456'],
      })
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['1000456', '1000457'],
      })
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['1000457'],
      })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const applicationsTile = (
      await screen.findByRole('heading', { name: 'Associated applications' })
    ).closest('.cds--tile') as HTMLElement
    expect(within(applicationsTile).getByRole('link', { name: '1000456' })).toHaveAttribute(
      'href',
      '/provincial/application/1000456',
    )
    const availableApplicationsCombobox = within(applicationsTile).getByRole('combobox', {
      name: 'Available application',
    })
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
    await userEvent.click(availableApplicationsCombobox)
    await waitFor(() => {
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-9', ['1000456'])
    })

    await chooseComboBoxOption(availableApplicationsCombobox, '1000457')
    const addApplicationButton = within(applicationsTile).getByRole('button', {
      name: 'Add application',
    })
    await waitFor(() => {
      expect(addApplicationButton).toBeEnabled()
    })
    await userEvent.click(addApplicationButton)

    await waitFor(() => {
      expect(mockedAddApplicationsToPermit).toHaveBeenCalledWith({
        permitNumber: '777',
        selectedApplications: ['1000457'],
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
    })

    const associatedApplicationRow = within(applicationsTile).getByText('1000456').closest('tr')
    expect(associatedApplicationRow).toBeTruthy()
    await userEvent.click(
      within(associatedApplicationRow as HTMLElement).getByRole('button', { name: 'Remove' }),
    )
    const removalConfirmation = await screen.findByRole('dialog', {
      name: 'Remove associated application?',
    })
    expect(removalConfirmation).toHaveTextContent('1000456 will be removed from permit 777.')
    expect(mockedRemoveApplicationFromPermit).not.toHaveBeenCalled()
    await userEvent.click(within(removalConfirmation).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(mockedRemoveApplicationFromPermit).toHaveBeenCalledWith({
        permitNumber: '777',
        applicationNumber: '1000456',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(3)
    })
  })

  it('keeps table-dependent permit actions unavailable while application links reload', async () => {
    const submitterAuth = createTestAuthContext()
    mockedUseAuth.mockReturnValue({
      ...submitterAuth,
      capabilities: {
        ...submitterAuth.capabilities,
        roles: ['ADMIN', 'PROVINCIAL_SUBMITTER_00067890'],
      },
      canPerform: () => true,
    })
    configureActivePermit()
    mockedFetchAvailablePermitApplications.mockResolvedValue({
      applicationList: ['1000457'],
      errorMessage: '',
    })

    const initialTabs: ProvincialPermitDetailTabsData = {
      ...tabsResult,
      applications: ['1000456'],
      packages: [
        {
          packageNumber: 'PKG-9',
          region: 'Coast',
          speciesEndUseSort: 'HE/PL',
          ageClass: 'Second growth',
          packageVolume: '120.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '',
          status: '',
          reprocessed: '',
          comments: '',
        },
      ],
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          scaleType: '',
          species: 'Fir',
          grade: 'A',
          pieces: 12,
          volume: 34.5,
          packageNumber: 'PKG-9',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    }
    let resolveReload:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>) => void)
      | undefined
    mockedFetchProvincialPermitDetailTabs.mockResolvedValueOnce(initialTabs).mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>>((resolve) => {
          resolveReload = resolve
        }),
    )

    renderPermitDetails()

    const applicationsTile = (
      await screen.findByRole('heading', { name: 'Associated applications' })
    ).closest('.cds--tile') as HTMLElement
    const availableApplicationsCombobox = within(applicationsTile).getByRole('combobox', {
      name: 'Available application',
    })
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
    await userEvent.click(availableApplicationsCombobox)
    await waitFor(() => {
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-9', ['1000456'])
    })
    const addApplicationButton = within(applicationsTile).getByRole('button', {
      name: 'Add application',
    })
    await chooseComboBoxOption(availableApplicationsCombobox, '1000457')
    await waitFor(() => expect(addApplicationButton).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Email review request' })).toBeEnabled()

    await userEvent.click(addApplicationButton)

    await waitFor(() => {
      expect(mockedAddApplicationsToPermit).toHaveBeenCalledWith({
        permitNumber: '777',
        selectedApplications: ['1000457'],
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('Loading associated permit applications…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email review request' })).toBeDisabled()

    await act(async () => {
      resolveReload?.({
        ...initialTabs,
        applications: ['1000456', '1000457'],
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add application' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Email review request' })).toBeEnabled()
    })
  })

  it('renders semantic empty states for empty permit detail collections', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'No associated applications', level: 3 }),
    ).toBeInTheDocument()

    await selectPermitDetailTab('Items')
    expect(
      await screen.findByRole('heading', { name: 'No package details', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No permit items available', level: 3 }),
    ).toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    expect(
      await screen.findByRole('heading', { name: 'No fee details available', level: 3 }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'GBMS' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No permit documents available', level: 3 }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('hides absent agent and GBMS tabs while keeping later panels aligned', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      applicantClientNumber: null,
      agentClientLocationCode: null,
    })

    renderPermitDetails()

    expect(await screen.findByRole('tab', { name: 'Permit' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'GBMS' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(await screen.findByRole('heading', { name: 'Permit documents' })).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('keeps GBMS selected when the permit has no agent', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      applicantClientNumber: null,
      agentClientLocationCode: null,
    })
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([gbmsHistoryRow])

    renderPermitDetails()

    expect(await screen.findByRole('tab', { name: 'GBMS' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    await selectPermitDetailTab('GBMS')

    expect(
      await screen.findByRole('heading', {
        name: 'GBMS invoice history',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'GBMS' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'false')
  })

  it('does not present a deferred document lookup failure as an empty collection', async () => {
    mockedFetchPermitDocuments.mockRejectedValue(new Error('documents unavailable'))

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(mockedFetchPermitDocuments).not.toHaveBeenCalled()
    expect(mockedFetchPermitInvoices).not.toHaveBeenCalled()

    await selectPermitDetailTab('Documents')

    expect(
      await screen.findByRole('heading', { name: 'Permit documents unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve permit documents.')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No permit documents available', level: 3 }),
    ).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
  })

  it('shows recalculated Blanket OIC package pieces while retaining package volume on the Scale tab', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          packageNumber: 'BOIC-9',
          region: 'Coast',
          speciesEndUseSort: 'HE/PL',
          ageClass: 'Old growth',
          packageVolume: '120.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '118.5',
          status: 'APP - Approved',
          reprocessed: 'N',
          comments: 'Current OIC package',
        },
      ],
      items: [
        {
          id: 'SCALE-9',
          timberMark: 'TM-9',
          scaleType: 'C',
          species: 'HE',
          grade: 'A',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'BOIC-9',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Scale')

    expect(await screen.findByText('Blanket OIC package details')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Owner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Summary of Scale' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Package pieces' })).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Current package volume (m³)' }),
    ).toBeInTheDocument()
    const packageTable = screen.getByRole('region', { name: 'Permit packages' })
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Status' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Reprocessed' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageTable).queryByRole('cell', { name: 'APP - Approved' }),
    ).not.toBeInTheDocument()
    expect(within(packageTable).queryByRole('cell', { name: 'N' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Current OIC package' })).toBeInTheDocument()
    const packageRow = screen.getByRole('cell', { name: 'BOIC-9' }).closest('tr')
    expect(packageRow).toBeTruthy()
    expect(within(packageRow as HTMLElement).getByRole('cell', { name: '12' })).toBeInTheDocument()
    expect(
      within(packageRow as HTMLElement).getByRole('cell', { name: '120.5' }),
    ).toBeInTheDocument()
    expect(
      within(packageRow as HTMLElement).getByRole('cell', { name: '118.5' }),
    ).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: true,
    })
  })

  it('keeps a saved Blanket OIC package volume when no scale rows are attached', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          ...editableBlanketOicPackage,
          packageNumber: 'T260917R1',
          packageVolume: '1.0',
          currentPackageVolume: '0.0',
        },
      ],
      items: [],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const packageRow = (await screen.findByRole('cell', { name: 'T260917R1' })).closest('tr')
    expect(packageRow).toBeTruthy()
    expect(within(packageRow as HTMLElement).getByRole('cell', { name: '0' })).toBeInTheDocument()
    expect(within(packageRow as HTMLElement).getByRole('cell', { name: '1.0' })).toBeInTheDocument()
    expect(within(packageRow as HTMLElement).getByRole('cell', { name: '0.0' })).toBeInTheDocument()
  })

  it('omits the Permit column from Blanket OIC scale rows', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'BOIC-9' }],
      items: [
        {
          id: 'SCALE-9',
          timberMark: 'TM-9',
          scaleType: 'C',
          species: 'HE',
          grade: 'A',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'BOIC-9',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Items')

    const itemRows = await screen.findByRole('region', { name: 'Scale rows' })
    expect(within(itemRows).queryByRole('columnheader', { name: 'Permit' })).not.toBeInTheDocument()
    expect(
      within(itemRows)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Timber mark', 'Scale type', 'Pieces', 'Species', 'Grade', 'Volume (m³)'])
    expect(within(itemRows).queryByRole('cell', { name: '777' })).not.toBeInTheDocument()
  })

  it('explains why a Blanket OIC package with scale rows cannot be deleted', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [editableBlanketOicPackage],
      items: [
        {
          id: 'SCALE-9',
          timberMark: 'TM-9',
          scaleType: '',
          species: 'HE',
          grade: 'A',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'BOIC-9',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Items')

    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')
    expect(packageRow).toBeTruthy()
    const packageRowElement = packageRow as HTMLElement
    const deleteButton = within(packageRowElement).getByRole('button', { name: 'Delete' })
    const deletionHelp = within(packageRowElement).getByText(
      'Delete unavailable while this package has scale details.',
    )

    expect(deletionHelp).toBeVisible()
    expect(deleteButton).toBeDisabled()
    expect(deleteButton).toHaveAttribute('aria-describedby', deletionHelp.id)
  })

  it('cancels Blanket OIC package deletion without mutating or refreshing', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    const dialog = await openBlanketOicPackageDeleteConfirmation()
    expect(within(dialog).getByRole('button', { name: 'Delete package' })).toHaveClass(
      'cds--btn--danger',
    )
    expect(
      within(dialog).getByText('Delete Blanket OIC package BOIC-9. This action cannot be undone.'),
    ).toBeVisible()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Delete Blanket OIC package BOIC-9?' }),
      ).not.toBeInTheDocument()
    })
    expect(mockedDeleteBlanketOicPackage).not.toHaveBeenCalled()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(1)
  })

  it.each([null, '00067890', '00012345'])(
    'confirms Blanket OIC package deletion for staff or submitter %s and refreshes the permit tabs',
    async (clientNumber) => {
      configureEditableBlanketOicPackage()
      if (clientNumber) configureBlanketOicSubmitter(clientNumber)
      renderPermitDetails()

      const dialog = await openBlanketOicPackageDeleteConfirmation()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete package' }))

      await waitFor(() => {
        expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)
        expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledWith('777', 'BOIC-9')
        expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      })
      expect(await screen.findByText('Blanket OIC package was deleted.')).toBeInTheDocument()
      expect(
        screen.queryByRole('dialog', { name: 'Delete Blanket OIC package BOIC-9?' }),
      ).not.toBeInTheDocument()
    },
  )

  it('locks Blanket OIC package deletion while the async mutation is pending', async () => {
    configureEditableBlanketOicPackage()
    let resolveDeletion!: (result: Awaited<ReturnType<typeof deleteBlanketOicPackage>>) => void
    mockedDeleteBlanketOicPackage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDeletion = resolve
        }),
    )
    renderPermitDetails()

    const dialog = await openBlanketOicPackageDeleteConfirmation()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete package' }))

    const pendingButton = await within(dialog).findByRole('button', { name: 'Deleting…' })
    expect(pendingButton).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.click(pendingButton)
    expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDeletion({
        success: true,
        message: 'Blanket OIC package was deleted.',
        errors: [],
        warnings: [],
        permitNumber: '777',
        applicationNumber: '1000999',
        packageNumber: 'BOIC-9',
      })
    })

    await waitFor(() => {
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)
    })
  })

  it('surfaces Blanket OIC package deletion failures without refreshing', async () => {
    configureEditableBlanketOicPackage()
    mockedDeleteBlanketOicPackage.mockResolvedValue({
      success: false,
      message: 'Blanket OIC package was not deleted.',
      errors: ['The Blanket OIC package is no longer eligible for deletion.'],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'BOIC-9',
    })
    renderPermitDetails()

    const dialog = await openBlanketOicPackageDeleteConfirmation()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete package' }))

    expect(
      await screen.findByText('The Blanket OIC package is no longer eligible for deletion.'),
    ).toBeInTheDocument()
    expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Blanket OIC package was deleted.')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Blanket OIC package BOIC-9?' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Delete package' })).toBeEnabled()
  })

  it.each(['Create package', 'retry Edit'])(
    'clears a failed package load when starting %s without clearing an unrelated page error',
    async (nextAction) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      configureBlanketOicDocument()
      mockedOpenPermitDocument.mockRejectedValueOnce(new Error('document unavailable'))
      mockedFetchBlanketOicPackageEditContext.mockRejectedValueOnce(
        new Error('Unexpected Blanket OIC package edit context payload.'),
      )
      renderPermitDetails()

      await selectPermitDetailTab('Documents')
      await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
      expect(await screen.findByText('Unable to open permit document.')).toBeVisible()
      await selectPermitDetailTab('Items')
      const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))

      const loadError = 'Unable to load the Blanket OIC package for editing.'
      expect(await screen.findByText(loadError)).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Edit BOIC-9' })).not.toBeInTheDocument()
      expect(screen.getByText('Unable to open permit document.')).toBeVisible()
      expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledWith('BOIC-9')

      if (nextAction === 'Create package') {
        await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
        expect(
          await screen.findByRole('heading', { name: 'Create Blanket OIC package' }),
        ).toBeVisible()
        expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
      } else {
        await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
        const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
          '.application-detail-edit-section',
        ) as HTMLElement
        await waitFor(() =>
          expect(within(packageEditor).getByRole('button', { name: 'Save package' })).toBeEnabled(),
        )
        expect(within(packageEditor).getByLabelText('Comments')).toHaveValue('Current OIC package')
        expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledTimes(2)
      }
      expect(screen.queryByText(loadError)).not.toBeInTheDocument()
      expect(screen.queryByText('Package needs attention')).not.toBeInTheDocument()
      expect(screen.getByText('Unable to open permit document.')).toBeVisible()
      expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
      expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
      consoleError.mockRestore()
    },
  )

  it('resets BOIC drafts and ignores stale package loads across permit routes', async () => {
    let resolvePackageContext:
      | ((value: Awaited<ReturnType<typeof fetchBlanketOicPackageEditContext>>) => void)
      | undefined
    mockedFetchBlanketOicPackageEditContext.mockReturnValue(
      new Promise((resolve) => {
        resolvePackageContext = resolve
      }),
    )
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    }))
    mockedFetchProvincialPermitDetailTabs.mockImplementation(async (request) => ({
      ...tabsResult,
      packages:
        (typeof request === 'string' ? request : request.permitNumber) === '777'
          ? [editableBlanketOicPackage]
          : [],
    }))

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <PermitRouteSwitcher />
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Items')
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')
    expect(packageRow).toBeTruthy()
    await userEvent.click(within(packageRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Loading package…')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
    await act(async () => {
      resolvePackageContext?.({
        packageNumber: 'BOIC-9',
        volume: '120.5',
        averageLength: '7.1',
        averageDiameter: '16.2',
        status: 'ACT',
        comments: 'Stale package',
        reprocessed: 'N',
        ageClass: 'O',
        productType: 'H',
        endUseCode: 'LU',
        speciesCodes: ['HE'],
      })
    })

    await selectPermitDetailTab('Items')
    expect(screen.queryByRole('textbox', { name: 'Package number' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit BOIC-9' })).not.toBeInTheDocument()
  })

  it.each(['loaded', 'failed'])(
    'reloads %s BOIC region context when switching permits in the same exemption',
    async (previousLookup) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const regionLookupError =
        'The exemption region settings could not be loaded. Reload before changing this permit region.'
      if (previousLookup === 'failed') {
        mockedFetchExemptionRegionContext.mockRejectedValue(new Error('Region lookup failed'))
      }
      mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
        ...permitDetail,
        permitNumber: Number(requestedPermitNumber),
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicApplicationNumber: null,
        oicRequestPieces: 200,
        oicRequestVolume: 120.5,
      }))

      render(
        <MemoryRouter initialEntries={['/provincial/permit/777']}>
          <PermitRouteSwitcher />
          <Routes>
            <Route
              path="/provincial/permit/:permitNumber"
              element={<ProvincialPermitDetailsPage />}
            />
          </Routes>
        </MemoryRouter>,
      )

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      if (previousLookup === 'failed') {
        expect(await screen.findByText(regionLookupError)).toBeInTheDocument()
        expect(screen.getByLabelText('Region')).toBeDisabled()
      } else {
        await waitFor(() => expect(screen.getByLabelText('Region')).toBeEnabled())
      }
      const initialRegionContextCallCount = mockedFetchExemptionRegionContext.mock.calls.length
      let resolveRegionContext!: (
        value: Awaited<ReturnType<typeof fetchExemptionRegionContext>>,
      ) => void
      mockedFetchExemptionRegionContext.mockReturnValue(
        new Promise((resolve) => {
          resolveRegionContext = resolve
        }),
      )

      await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
      await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
      await waitFor(() =>
        expect(mockedFetchExemptionRegionContext.mock.calls.length).toBeGreaterThan(
          initialRegionContextCallCount,
        ),
      )

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      expect(screen.getByLabelText('Region')).toBeDisabled()
      expect(screen.queryByText(regionLookupError)).not.toBeInTheDocument()
      await act(async () => {
        resolveRegionContext({ exemptionNumber: 'EX-9', regionNumbers: ['1903'] })
      })
      await waitFor(() => expect(screen.getByLabelText('Region')).toBeEnabled())
      expect(screen.getByLabelText('Region')).toHaveValue('1903')
      consoleError.mockRestore()
    },
  )

  it('ignores a package edit response after cancelling and opening Create package', async () => {
    configureEditableBlanketOicPackage()
    let resolveContext!: (
      value: Awaited<ReturnType<typeof fetchBlanketOicPackageEditContext>>,
    ) => void
    mockedFetchBlanketOicPackageEditContext.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveContext = resolve
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Items')
    const row = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Loading package…')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const editor = screen
      .getByRole('heading', { name: 'Create Blanket OIC package' })
      .closest('.application-detail-edit-section')!
    await userEvent.type(
      within(editor as HTMLElement).getByLabelText('Package number'),
      'NEW-DRAFT',
    )
    await act(async () =>
      resolveContext({
        packageNumber: 'BOIC-9',
        volume: '120.5',
        averageLength: '7.1',
        averageDiameter: '16.2',
        status: 'ACT',
        comments: 'Stale package',
        reprocessed: 'N',
        ageClass: 'O',
        productType: 'H',
        endUseCode: 'LU',
        speciesCodes: ['HE'],
      }),
    )
    expect(screen.getByRole('heading', { name: 'Create Blanket OIC package' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit BOIC-9' })).not.toBeInTheDocument()
    expect(within(editor as HTMLElement).getByLabelText('Package number')).toHaveValue('NEW-DRAFT')
    expect(screen.queryByText('Loading package…')).not.toBeInTheDocument()
    expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
  })

  it('keeps the renamed package selected after refreshing its rows', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        packages: [
          editableBlanketOicPackage,
          { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
        ],
      })
      .mockResolvedValue({
        ...tabsResult,
        packages: [
          { ...editableBlanketOicPackage, packageNumber: 'BOIC-NEW' },
          { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
        ],
      })
    renderPermitDetails()
    await selectPermitDetailTab('Items')
    const row = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    const editor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await waitFor(() => expect(within(editor).getByLabelText('Package number')).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'Package number' })).toBeDisabled()
    expect(screen.getByLabelText('Timber mark')).toBeDisabled()
    await userEvent.clear(within(editor).getByLabelText('Package number'))
    await userEvent.type(within(editor).getByLabelText('Package number'), 'BOIC-NEW')
    const save = within(editor).getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)
    await waitFor(() =>
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
        expect.objectContaining({ packageNumber: 'BOIC-9', newPackageNumber: 'BOIC-NEW' }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Package number' })).toHaveValue('BOIC-NEW'),
    )
    expect(await screen.findByRole('cell', { name: 'BOIC-NEW' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit BOIC-9' })).not.toBeInTheDocument()
  })

  it.each([true, false])(
    'clears package creation and selection across BOIC permit routes (create: %s)',
    async (create) => {
      configureEditableBlanketOicPackage()
      mockedFetchProvincialPermitDetail.mockImplementation(async (number) => ({
        ...permitDetail,
        permitNumber: Number(number),
        permitStatusCode: 'ACT',
        blanketOic: true,
        oicApplicationNumber: 1000999,
      }))
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        packages: [
          editableBlanketOicPackage,
          { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
        ],
      })
      render(
        <MemoryRouter initialEntries={['/provincial/permit/777']}>
          <PermitRouteSwitcher />
          <Routes>
            <Route
              path="/provincial/permit/:permitNumber"
              element={<ProvincialPermitDetailsPage />}
            />
          </Routes>
        </MemoryRouter>,
      )
      await selectPermitDetailTab('Items')
      await chooseComboBoxOption(
        await screen.findByRole('combobox', { name: 'Package number' }),
        'BOIC-10',
      )
      if (create) await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
      await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
      await selectPermitDetailTab('Items')
      expect(await screen.findByRole('combobox', { name: 'Package number' })).toHaveValue('BOIC-9')
      expect(
        screen.queryByRole('heading', { name: 'Create Blanket OIC package' }),
      ).not.toBeInTheDocument()
    },
  )

  it.each([false, true])(
    'shows the federal export permit notice only for non-BOIC permits (BOIC: %s)',
    async (blanketOic) => {
      if (blanketOic) configureEditableBlanketOicPackage()
      renderPermitDetails()
      await selectPermitDetailTab('Permit')
      const link = screen.queryByRole('link', {
        name: 'New Export Controls Online System (New EXCOL)',
      })
      if (blanketOic) expect(link).not.toBeInTheDocument()
      else
        expect(link).toHaveAttribute('href', 'https://www.nexcol-nceel.canada.ca/en/Home-Accueil')
    },
  )

  it('ignores stale available-application responses across permit routes', async () => {
    const resolveOldLookups: Array<
      (value: Awaited<ReturnType<typeof fetchAvailablePermitApplications>>) => void
    > = []
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
      exemptionNumber: requestedPermitNumber === '777' ? 'EX-777' : 'EX-888',
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: false,
    }))
    mockedFetchAvailablePermitApplications.mockImplementation(async (exemptionNumber) => {
      if (exemptionNumber === 'EX-777') {
        return new Promise((resolve) => resolveOldLookups.push(resolve))
      }
      return { applicationList: ['888001'], errorMessage: '' }
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <PermitRouteSwitcher />
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const firstPermitCombobox = await screen.findByRole('combobox', {
      name: 'Available application',
    })
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
    await userEvent.click(firstPermitCombobox)
    await waitFor(() =>
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-777', []),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    const secondPermitCombobox = await screen.findByRole('combobox', {
      name: 'Available application',
    })
    await userEvent.click(secondPermitCombobox)
    await waitFor(() =>
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-888', []),
    )
    expect(await screen.findByRole('combobox', { name: 'Available application' })).toHaveValue(
      '888001',
    )

    await act(async () => {
      resolveOldLookups.forEach((resolve) =>
        resolve({ applicationList: ['777001'], errorMessage: '' }),
      )
    })
    expect(screen.getByRole('combobox', { name: 'Available application' })).toHaveValue('888001')
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    await waitFor(() =>
      expect(mockedAddApplicationsToPermit).toHaveBeenCalledWith({
        permitNumber: '888',
        selectedApplications: ['888001'],
      }),
    )
  })

  it.each([null, '00067890', '00012345'])(
    'lets staff or submitter %s create the first Blanket OIC package and hidden application',
    async (clientNumber) => {
      if (clientNumber) configureBlanketOicSubmitter(clientNumber)
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicApplicationNumber: null,
      })

      render(
        <MemoryRouter initialEntries={['/provincial/permit/777']}>
          <Routes>
            <Route
              path="/provincial/permit/:permitNumber"
              element={<ProvincialPermitDetailsPage />}
            />
          </Routes>
        </MemoryRouter>,
      )

      await selectPermitDetailTab('Items')
      expect(await screen.findByRole('heading', { name: 'No packages yet' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'No package details' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Summary of Scale' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      const heading = await screen.findByRole('heading', { name: 'Create Blanket OIC package' })
      const packageEditor = heading.closest('.application-detail-edit-section') as HTMLElement
      expect(packageEditor).toBeTruthy()
      expect(
        within(packageEditor).queryByRole('combobox', { name: 'Status' }),
      ).not.toBeInTheDocument()
      expect(
        within(packageEditor).queryByRole('group', { name: 'Reprocessed' }),
      ).not.toBeInTheDocument()

      await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
      await chooseComboBoxOption(
        within(packageEditor).getByRole('combobox', { name: 'Species' }),
        'FI - Fir',
      )
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Add species' }))
      await chooseComboBoxOption(
        within(packageEditor).getByRole('combobox', { name: 'Species' }),
        'HE - Hemlock',
      )
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Add species' }))
      await chooseComboBoxOption(
        within(packageEditor).getByRole('combobox', { name: 'End use' }),
        'LU - Lumber',
      )
      await userEvent.clear(within(packageEditor).getByLabelText('Package volume (m³)'))
      await userEvent.type(within(packageEditor).getByLabelText('Package volume (m³)'), '100.0')
      const averageLength = within(packageEditor).getByLabelText('Average length (m)')
      await userEvent.type(averageLength, '0')
      await userEvent.type(
        within(packageEditor).getByLabelText('Average top diameter (rads)'),
        '20.0',
      )
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Create package' }))

      expect(
        await within(packageEditor).findByText('Average length must be greater than 0.'),
      ).toBeInTheDocument()
      expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()

      await userEvent.clear(averageLength)
      await userEvent.type(averageLength, '10.0')
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Create package' }))

      await waitFor(() => {
        expect(mockedAddBlanketOicPackage).toHaveBeenCalledWith({
          permitNumber: '777',
          packageNumber: 'BOIC-NEW',
          newPackageNumber: undefined,
          volume: '100.0',
          averageLength: '10.0',
          averageDiameter: '20.0',
          status: 'ACT',
          comments: '',
          reprocessed: 'N',
          ageClass: 'O',
          productType: 'H',
          endUseCode: 'LU',
          speciesCodes: ['FI', 'HE'],
        })
        expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
        expect(screen.getByText('Blanket OIC package was created.')).toBeInTheDocument()
      })

      await selectPermitDetailTab('Permit')
      await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
      const regionSelect = screen.getByLabelText('Region')
      expect(regionSelect).toBeDisabled()
      expect(regionSelect).toHaveValue('1903')
      expect(
        within(regionSelect)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value')),
      ).toEqual(['', '1903'])
      expect(
        screen.getByText('Region cannot be changed after the first package is created.'),
      ).toBeInTheDocument()
    },
  )

  it('preserves hidden Blanket OIC Shutout and reprocessed values when editing comments', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          ...editableBlanketOicPackage,
          status: 'SHT - Shutout',
          reprocessed: 'Y',
        },
      ],
    })
    mockedFetchBlanketOicPackageEditContext.mockResolvedValue({
      packageNumber: 'BOIC-9',
      volume: '120.5',
      averageLength: '7.1',
      averageDiameter: '16.2',
      status: 'SHT',
      comments: 'Current OIC package',
      reprocessed: 'Y',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['HE'],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageTable = await screen.findByRole('region', { name: 'Permit packages' })
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Status' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Reprocessed' }),
    ).not.toBeInTheDocument()
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    expect(
      within(packageRow).queryByRole('cell', { name: 'SHT - Shutout' }),
    ).not.toBeInTheDocument()
    expect(within(packageRow).queryByRole('cell', { name: 'Y' })).not.toBeInTheDocument()

    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    expect(
      within(packageEditor).queryByRole('combobox', { name: 'Status' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageEditor).queryByRole('group', { name: 'Reprocessed' }),
    ).not.toBeInTheDocument()

    const comments = within(packageEditor).getByLabelText('Comments')
    await waitFor(() => {
      expect(comments).toBeEnabled()
      expect(comments).toHaveValue('Current OIC package')
    })
    await userEvent.type(comments, ' updated')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    await waitFor(() =>
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          packageNumber: 'BOIC-9',
          comments: 'Current OIC package updated',
          status: 'SHT',
          reprocessed: 'Y',
        }),
      ),
    )
  })

  it.each([
    ['Package volume (m³)', '10.25', 'Package volume must have no more than one decimal place.'],
    ['Average length (m)', '0', 'Average length must be greater than 0.'],
    ['Average length (m)', '-1', 'Average length must be numeric.'],
    ['Average top diameter (rads)', '0', 'Average top diameter must be greater than 0.'],
    ['Average top diameter (rads)', '-1', 'Average top diameter must be numeric.'],
    ['Average top diameter (rads)', '100', 'Average top diameter must be 99.99 or less.'],
  ])('keeps invalid Blanket OIC %s out of the save request', async (fieldLabel, value, error) => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const field = within(packageEditor).getByLabelText(fieldLabel)
    await userEvent.clear(field)
    await userEvent.type(field, value)
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    expect(await within(packageEditor).findByText(error)).toBeInTheDocument()
    expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
  })

  it('clears invalid Blanket OIC package feedback when changing package drafts', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        editableBlanketOicPackage,
        { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
      ],
    })
    mockedFetchBlanketOicPackageEditContext.mockImplementation(async (packageNumber) => ({
      packageNumber,
      volume: '120.5',
      averageLength: '7.1',
      averageDiameter: '16.2',
      status: 'ACT',
      comments: 'Current OIC package',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['HE'],
    }))
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const firstPackageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    await userEvent.click(within(firstPackageRow).getByRole('button', { name: 'Edit' }))
    const firstPackageEditor = (
      await screen.findByRole('heading', { name: 'Edit BOIC-9' })
    ).closest('.application-detail-edit-section') as HTMLElement
    const averageLength = within(firstPackageEditor).getByLabelText('Average length (m)')
    await userEvent.clear(averageLength)
    await userEvent.type(averageLength, '0')
    await userEvent.click(within(firstPackageEditor).getByRole('button', { name: 'Save package' }))

    const validationMessage = 'Average length must be greater than 0.'
    expect(await within(firstPackageEditor).findByText(validationMessage)).toBeInTheDocument()
    const packageSelect = screen.getByRole('combobox', { name: 'Package number' })
    expect(packageSelect).toBeDisabled()

    await userEvent.click(within(firstPackageEditor).getByRole('button', { name: 'Cancel edit' }))
    expect(screen.queryByText(validationMessage)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const newPackageEditor = (
      await screen.findByRole('heading', { name: 'Create Blanket OIC package' })
    ).closest('.application-detail-edit-section') as HTMLElement
    expect(within(newPackageEditor).queryByText(validationMessage)).not.toBeInTheDocument()
    await userEvent.click(within(newPackageEditor).getByRole('button', { name: 'Cancel' }))

    expect(packageSelect).toBeEnabled()
    await chooseComboBoxOption(packageSelect, 'BOIC-10')
    const secondPackageRow = (await screen.findByRole('cell', { name: 'BOIC-10' })).closest('tr')!
    await userEvent.click(within(secondPackageRow).getByRole('button', { name: 'Edit' }))
    const secondPackageEditor = (
      await screen.findByRole('heading', { name: 'Edit BOIC-10' })
    ).closest('.application-detail-edit-section') as HTMLElement
    expect(within(secondPackageEditor).getByLabelText('Average length (m)')).toHaveValue('7.1')
    expect(within(secondPackageEditor).queryByText(validationMessage)).not.toBeInTheDocument()
  })

  it('accepts zero volume and the maximum Blanket OIC package dimensions', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const volume = within(packageEditor).getByLabelText('Package volume (m³)')
    await userEvent.clear(volume)
    await userEvent.type(volume, '0.0')
    const averageLength = within(packageEditor).getByLabelText('Average length (m)')
    await userEvent.clear(averageLength)
    await userEvent.type(averageLength, '99')
    const averageDiameter = within(packageEditor).getByLabelText('Average top diameter (rads)')
    await userEvent.clear(averageDiameter)
    await userEvent.type(averageDiameter, '99.99')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    await waitFor(() =>
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'BOIC-9',
          volume: '0.0',
          averageLength: '99',
          averageDiameter: '99.99',
        }),
      ),
    )
  })

  it.each(['00067890', '00012345'])(
    'lets authorized BOIC submitter %s edit an existing package',
    async (clientNumber) => {
      configureEditableBlanketOicPackage()
      configureBlanketOicSubmitter(clientNumber)
      renderPermitDetails()

      await selectPermitDetailTab('Items')
      const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
      const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
        '.application-detail-edit-section',
      ) as HTMLElement
      await userEvent.type(within(packageEditor).getByLabelText('Comments'), ' updated')
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

      await waitFor(() => {
        expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
          expect.objectContaining({
            permitNumber: '777',
            packageNumber: 'BOIC-9',
            comments: 'Current OIC package updated',
          }),
        )
      })
    },
  )

  it.each(['COM', 'PPD', 'EXP', 'CAN'])(
    'keeps BOIC package mutations unavailable to submitters when the permit status is %s',
    async (permitStatusCode) => {
      configureEditableBlanketOicPackage()
      configureBlanketOicSubmitter('00067890')
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        blanketOic: true,
        oicApplicationNumber: 1000999,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Items')
      const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
      expect(within(packageRow).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(within(packageRow).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
    },
  )

  it('keeps BOIC package mutations unavailable without savePermit capability', async () => {
    configureEditableBlanketOicPackage()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === '/permitDetails' }),
    )
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageTable = await screen.findByRole('region', { name: 'Permit packages' })
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Status' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageTable).queryByRole('columnheader', { name: 'Reprocessed' }),
    ).not.toBeInTheDocument()
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    expect(within(packageRow).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(packageRow).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  it('keeps BOIC package mutations unavailable when another user holds the permit lock', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00067890')
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: true,
      lockMessage: 'Another user is editing this permit.',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
    expect(within(packageRow).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(packageRow).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  it('clears a committed Blanket OIC package draft when table refresh fails', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce(tabsResult)
      .mockRejectedValueOnce(new Error('refresh failed'))
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (
      await screen.findByRole('heading', {
        name: 'Create Blanket OIC package',
      })
    ).closest('.application-detail-edit-section') as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await chooseComboBoxOption(
      within(packageEditor).getByRole('combobox', { name: 'Species' }),
      'FI - Fir',
    )
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Add species' }))
    await chooseComboBoxOption(
      within(packageEditor).getByRole('combobox', { name: 'End use' }),
      'LU - Lumber',
    )
    await userEvent.clear(within(packageEditor).getByLabelText('Package volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Package volume (m³)'), '100.0')
    await userEvent.type(within(packageEditor).getByLabelText('Average length (m)'), '10.0')
    await userEvent.type(
      within(packageEditor).getByLabelText('Average top diameter (rads)'),
      '20.0',
    )
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Create package' }))

    await waitFor(() => expect(mockedAddBlanketOicPackage).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Blanket OIC package was created.*Reload before making/),
    ).toBeInTheDocument()
    const committedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(committedUnload)
    expect(committedUnload.defaultPrevented).toBe(false)
  })

  it('clears a committed Blanket OIC scale draft when table refresh fails', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({ ...tabsResult, packages: [editableBlanketOicPackage] })
      .mockRejectedValueOnce(new Error('refresh failed'))
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Species' }),
      'AL - Alder',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), 'W - Utility')
    await userEvent.type(screen.getByLabelText('Pieces'), '12')
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '10.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))

    await waitFor(() => expect(mockedAddBlanketOicScale).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Blanket OIC scale detail was added.*Reload before adding/),
    ).toBeInTheDocument()
    const committedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(committedUnload)
    expect(committedUnload.defaultPrevented).toBe(false)
  })

  it('does not mark the derived first BOIC scale package dirty after reverting selection', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        editableBlanketOicPackage,
        { ...editableBlanketOicPackage, packageNumber: 'BOIC-10' },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageSelect = await screen.findByRole('combobox', { name: 'Package number' })
    expect(packageSelect).toHaveValue('BOIC-9')
    await chooseComboBoxOption(packageSelect, 'BOIC-10')
    await chooseComboBoxOption(packageSelect, 'BOIC-9')

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
  })

  it('scopes BOIC package and scale rows to the selected package', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        editableBlanketOicPackage,
        { ...editableBlanketOicPackage, packageNumber: 'BOIC-10', comments: 'Second package' },
      ],
      items: [
        {
          id: 'SCALE-9',
          timberMark: 'TM-9',
          scaleType: '',
          species: 'HE',
          grade: 'A',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'BOIC-9',
          permitNumber: '777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-10',
          timberMark: 'TM-10',
          scaleType: '',
          species: 'HE',
          grade: 'B',
          pieces: 8,
          volume: 7.5,
          packageNumber: 'BOIC-10',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Items')

    const packageSelect = await screen.findByRole('combobox', { name: 'Package number' })
    expect(packageSelect).toHaveValue('BOIC-9')
    expect(screen.getByRole('cell', { name: 'BOIC-9' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'BOIC-10' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TM-9' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'TM-10' })).not.toBeInTheDocument()

    await chooseComboBoxOption(packageSelect, 'BOIC-10')
    expect(packageSelect).toHaveValue('BOIC-10')
    expect(screen.getByRole('cell', { name: 'BOIC-10' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'BOIC-9' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TM-10' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'TM-9' })).not.toBeInTheDocument()

    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    expect(packageSelect).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeDisabled()
    const selectedPackageRow = screen.getByRole('cell', { name: 'BOIC-10' }).closest('tr')!
    expect(within(selectedPackageRow).getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(within(selectedPackageRow).getByRole('button', { name: 'Delete' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel scale' }))
    expect(packageSelect).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeEnabled()
    expect(within(selectedPackageRow).getByRole('button', { name: 'Edit' })).toBeEnabled()
    expect(screen.getByLabelText('Timber mark')).toHaveValue('')
    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Species' }),
      'HE - Hemlock',
    )
    await userEvent.type(screen.getByLabelText('Timber mark'), 'TM-NEW')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), 'A - Sawlog')
    await userEvent.type(screen.getByLabelText('Pieces'), '4')
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))

    await waitFor(() =>
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'BOIC-10',
          timberMark: 'TM-NEW',
        }),
      ),
    )
  })

  it('distinguishes padded BOIC package keys and preserves the selected key for package actions and scale adds', async () => {
    const plainPackage = {
      ...editableBlanketOicPackage,
      packageNumber: 'PKG-1',
      comments: 'Plain package',
    }
    const paddedPackage = {
      ...editableBlanketOicPackage,
      packageNumber: 'PKG-1 ',
      comments: 'Padded package',
    }
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [plainPackage, paddedPackage],
    })
    mockedFetchBlanketOicPackageEditContext.mockImplementation(async (packageNumber) => ({
      packageNumber,
      volume: '120.5',
      averageLength: '7.1',
      averageDiameter: '16.2',
      status: 'ACT',
      comments: 'Padded package',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['HE'],
    }))
    mockedUpdateBlanketOicPackage.mockResolvedValue({
      success: true,
      message: 'Blanket OIC package was updated.',
      errors: [],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'PKG-1 ',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Items')

    const packageSelect = await screen.findByRole('combobox', { name: 'Package number' })
    await userEvent.click(packageSelect)
    expect(await screen.findByRole('option', { name: 'PKG-1' })).toBeInTheDocument()
    const paddedOption = await screen.findByRole('option', {
      name: 'PKG-1 (1 trailing space)',
    })
    await userEvent.click(paddedOption)

    expect(packageSelect).toHaveValue('PKG-1 (1 trailing space)')
    const paddedPackageCell = await screen.findByRole('cell', {
      name: 'PKG-1 (1 trailing space)',
    })
    const paddedPackageRow = paddedPackageCell.closest('tr')!
    await userEvent.click(within(paddedPackageRow).getByRole('button', { name: 'Edit' }))
    await waitFor(() => {
      expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledWith('PKG-1 ')
    })
    const packageEditor = (
      await screen.findByRole('heading', { name: 'Edit PKG-1 (1 trailing space)' })
    ).closest('.application-detail-edit-section') as HTMLElement
    expect(within(packageEditor).getByLabelText('Package number')).toHaveValue('PKG-1 ')
    await userEvent.type(within(packageEditor).getByLabelText('Comments'), ' updated')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))
    await waitFor(() => {
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'PKG-1 ',
          newPackageNumber: 'PKG-1 ',
          comments: 'Padded package updated',
        }),
      )
      expect(packageSelect).toHaveValue('PKG-1 (1 trailing space)')
    })

    await userEvent.type(screen.getByLabelText('Timber mark'), 'TM-PAD')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Species' }), 'HE - Hemlock')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), 'A - Sawlog')
    await userEvent.type(screen.getByLabelText('Pieces'), '4')
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))

    await waitFor(() => {
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({ packageNumber: 'PKG-1 ', timberMark: 'TM-PAD' }),
      )
    })

    const refreshedPaddedPackageCell = await screen.findByRole('cell', {
      name: 'PKG-1 (1 trailing space)',
    })
    const refreshedPaddedPackageRow = refreshedPaddedPackageCell.closest('tr')!
    await userEvent.click(within(refreshedPaddedPackageRow).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete Blanket OIC package PKG-1 (1 trailing space)?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete package' }))
    await waitFor(() => {
      expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledWith('777', 'PKG-1 ')
    })
  })

  it('labels padded BOIC package keys distinctly in fee tables', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 2,
      packageFeeSummaries: [
        { packageNumber: 'PKG-1', growthType: 'Old growth', totalFeeForPackage: '$1.00' },
        { packageNumber: 'PKG-1 ', growthType: 'Old growth', totalFeeForPackage: '$1.00' },
      ],
      fees: [
        { ...calculatedPermitFees.fees[0], id: 'FEE-PLAIN', packageNumber: 'PKG-1' },
        { ...calculatedPermitFees.fees[0], id: 'FEE-PADDED', packageNumber: 'PKG-1 ' },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')

    expect((await screen.findAllByRole('cell', { name: 'PKG-1' })).length).toBe(2)
    expect((await screen.findAllByRole('cell', { name: 'PKG-1 (1 trailing space)' })).length).toBe(
      2,
    )
  })

  it('adds and removes Blanket OIC scale rows from the items tab', async () => {
    const blanketOicPermit = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
    }
    mockedFetchProvincialPermitDetail.mockResolvedValueOnce(blanketOicPermit).mockResolvedValue({
      ...blanketOicPermit,
      permitVolume: 130.5,
      numberOfPieces: 22,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          packageNumber: 'BOIC-9',
          region: 'Coast',
          speciesEndUseSort: 'HE/PL',
          ageClass: 'Old growth',
          packageVolume: '120.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '118.5',
          status: 'APP - Approved',
          reprocessed: 'N',
          comments: 'Current OIC package',
        },
      ],
      items: [
        {
          id: 'SCALE-9',
          timberMark: 'TM-9',
          scaleType: '',
          species: 'HE',
          grade: 'A',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'BOIC-9',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Items')
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Species' }),
      'AL - Alder',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), 'W - Utility')
    await userEvent.type(screen.getByLabelText('Pieces'), '12')
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '10.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))

    await waitFor(() => {
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith({
        permitNumber: '777',
        packageNumber: 'BOIC-9',
        timberMark: 'TM-NEW',
        speciesCode: 'AL',
        gradeCode: 'W',
        scalePieces: '12',
        scaleVolume: '10.5',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(2)
    })

    await selectPermitDetailTab('Permit')
    const permitVolumeField = screen
      .getByText('Current permit volume (m³)')
      .closest('.detail-field-item') as HTMLElement
    const permitPiecesField = screen
      .getByText('Current permit pieces')
      .closest('.detail-field-item') as HTMLElement
    expect(within(permitVolumeField).getByText('130.5')).toBeInTheDocument()
    expect(within(permitPiecesField).getByText('22')).toBeInTheDocument()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const removalConfirmation = await screen.findByRole('dialog', {
      name: 'Remove Blanket OIC scale?',
    })
    expect(removalConfirmation).toHaveTextContent(
      'Scale SCALE-9 (TM-9) will be removed from permit 777.',
    )
    expect(mockedDeleteBlanketOicScale).not.toHaveBeenCalled()
    await userEvent.click(within(removalConfirmation).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(mockedDeleteBlanketOicScale).toHaveBeenCalledWith({
        scaleId: 'SCALE-9',
        permitNumber: '777',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(3)
      expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(3)
    })
  })

  it('saves permit summary changes through the permit update endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const submitDate = screen.getByLabelText('Submit date')
    const issueDate = screen.getByLabelText('Issued date')
    const expiryDate = screen.getByLabelText('Expiry date')
    expect(submitDate).toHaveValue('2026-04-10')
    expect(submitDate).toBeDisabled()
    expect(submitDate).not.toHaveAttribute('aria-required')
    expect(
      document.querySelector('label[for="permit-permitSubmitDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    expect(issueDate).toBeDisabled()
    expect(issueDate).not.toHaveAttribute('aria-required')
    expect(
      document.querySelector('label[for="permit-permitIssueDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    expect(expiryDate).toBeEnabled()
    expect(expiryDate).toHaveAttribute('aria-required', 'true')
    expect(
      document.querySelector('label[for="permit-permitExpiryDate"] .required-label__marker'),
    ).toBeInTheDocument()
    const permitStatusSelect = screen.getByLabelText('Permit status')
    expect(permitStatusSelect).toHaveValue('COM')
    expect(within(permitStatusSelect).getByRole('option', { name: /Active/ })).toBeInTheDocument()
    expect(
      within(permitStatusSelect).queryByRole('option', { name: /Payment Pending/ }),
    ).not.toBeInTheDocument()
    expect(within(permitStatusSelect).getByRole('option', { name: /Expired/ })).toBeInTheDocument()
    await userEvent.selectOptions(permitStatusSelect, 'ACT')
    expect(screen.getByLabelText('Region')).toBeDisabled()
    expect(screen.getByLabelText('Region')).toHaveValue('Cariboo Natural Resource Region')
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'updated remarks')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'ACT',
          permitReceiptNo: 'R-1',
          permitRemarks: 'updated remarks',
          orgUnitNumber: '1903',
          ownerClientNumber: '00067890',
          ownerClientLocation: '03',
          agentClientNumber: '00012345',
          agentClientLocation: '01',
        }),
      )
    })
    expect(mockedUpdatePermitDetail.mock.calls[0]?.[0]).toHaveProperty(
      'permitSubmitDate',
      '2026-04-10',
    )
    expect(await screen.findByText('The permit was updated successfully.')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  })

  it('allows a completed permit with a missing legacy submit date to be saved', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      applicationDate: null,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Submit date')).toHaveValue('')
    expect(screen.getByLabelText('Submit date')).toBeDisabled()
    expect(screen.getByLabelText('Submit date')).not.toHaveAttribute('aria-required')
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'updated legacy remarks')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'COM',
          permitSubmitDate: '',
          permitRemarks: 'updated legacy remarks',
        }),
      )
    })
  })

  it('clears optional active normal permit dates while preserving the required submit date', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.clear(screen.getByLabelText('Issued date'))
    await userEvent.clear(screen.getByLabelText('Expiry date'))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'ACT',
          permitSubmitDate: '',
          permitIssueDate: '',
          permitExpiryDate: '',
        }),
      )
    })
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Submit date')).toHaveValue(permitDetail.applicationDate ?? '')
    expect(screen.getByLabelText('Issued date')).toHaveValue('')
    expect(screen.getByLabelText('Expiry date')).toHaveValue('')
  })

  it('preserves existing Blanket OIC dates when submitted dates are blank during an active-to-cancelled transition', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'CAN')
    await userEvent.clear(screen.getByLabelText('Issued date'))
    await userEvent.clear(screen.getByLabelText('Expiry date'))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'CAN',
          permitIssueDate: '',
          permitExpiryDate: '',
        }),
      )
    })
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Issued date')).toHaveValue(permitDetail.issueDate ?? '')
    expect(screen.getByLabelText('Expiry date')).toHaveValue(permitDetail.expiryDate ?? '')
  })

  it('clears blank dates when an active Blanket OIC permit remains active', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Submit date')).not.toHaveAttribute('aria-required')
    expect(screen.getByLabelText('Issued date')).not.toHaveAttribute('aria-required')
    expect(screen.getByLabelText('Expiry date')).not.toHaveAttribute('aria-required')
    expect(
      document.querySelector('label[for="permit-permitSubmitDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('label[for="permit-permitIssueDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('label[for="permit-permitExpiryDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.clear(screen.getByLabelText('Issued date'))
    await userEvent.clear(screen.getByLabelText('Expiry date'))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'ACT',
          permitSubmitDate: '',
          permitIssueDate: '',
          permitExpiryDate: '',
        }),
      )
    })
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Submit date')).toHaveValue(permitDetail.applicationDate ?? '')
    expect(screen.getByLabelText('Issued date')).toHaveValue('')
    expect(screen.getByLabelText('Expiry date')).toHaveValue('')
  })

  it('keeps saved Blanket OIC client identities immutable while saving verified locations', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()
    await waitFor(() => {
      expect(screen.getByLabelText('Applicant location')).toBeEnabled()
      expect(screen.getByLabelText('Agent location')).toBeEnabled()
    })
    await userEvent.selectOptions(screen.getByLabelText('Applicant location'), '04')
    await userEvent.selectOptions(screen.getByLabelText('Agent location'), '02')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          ownerClientLocation: '04',
          agentClientNumber: '00012345',
          agentClientLocation: '02',
        }),
      )
    })
  })

  it('shows saved Blanket OIC applicant and agent contact details in one tab', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await waitFor(() => {
      expect(screen.getByText('Owner Co · 00067890')).toBeInTheDocument()
      expect(screen.getByText('Agent Co · 00012345')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Applicant details' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agent information' })).toBeInTheDocument()
    expect(screen.getAllByText('Client')).toHaveLength(2)
    expect(screen.getAllByText('Location')).toHaveLength(2)
    expect(screen.getAllByText('Phone number')).toHaveLength(2)
    expect(screen.getAllByText('Fax number')).toHaveLength(2)
    expect(screen.getAllByText('Email address')).toHaveLength(2)
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
  })

  it('keeps reviewed applicant save actions and required guidance inside the edit card', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )

    const applicantCard = screen
      .getByRole('heading', { name: 'Applicant details' })
      .closest('.cds--tile')
    expect(applicantCard).toBeTruthy()
    expect(within(applicantCard as HTMLElement).getByText('Required fields')).toBeInTheDocument()
    expect(
      within(applicantCard as HTMLElement).getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument()
    expect(
      within(applicantCard as HTMLElement).getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save permit' })).not.toBeInTheDocument()
  })

  it('blocks Blanket OIC client saves until each selected client location is verified', async () => {
    configureEditableBlanketOicPackage()
    let resolveOwnerLocations:
      | ((
          locations: Array<{ locationCode: string; locationName: string; selected: boolean }>,
        ) => void)
      | null = null
    const pendingOwnerLocations = new Promise<
      Array<{ locationCode: string; locationName: string; selected: boolean }>
    >((resolve) => {
      resolveOwnerLocations = resolve
    })
    mockedFetchExemptionClientLocations.mockImplementation((clientNumber) => {
      if (clientNumber === '00067890') return pendingOwnerLocations
      if (clientNumber === '11111111') return Promise.resolve([])
      return Promise.resolve([{ locationCode: '01', locationName: 'Agent office', selected: true }])
    })
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const saveButton = screen.getByRole('button', { name: 'Save changes' })
    expect(saveButton).toBeDisabled()

    await act(async () =>
      resolveOwnerLocations?.([
        { locationCode: '03', locationName: 'Owner office', selected: true },
      ]),
    )
    await waitFor(() => expect(saveButton).toBeEnabled())
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('does not offer removal of a saved Blanket OIC agent', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agent information' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('does not offer addition of a saved Blanket OIC agent', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
      applicantClientNumber: null,
      agentClientLocationCode: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).not.toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Agent information' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
  })

  it('refreshes normal permit client details from the persisted save result', async () => {
    configureActivePermit()
    const persistedDetail = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      ownerClientNumber: '00070001',
      ownerClientLocationCode: '04',
      applicantClientNumber: '00070002',
      agentClientLocationCode: '05',
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
      })
      .mockResolvedValue(persistedDetail)
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'save and refresh clients')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(2))
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('00070001')).toBeInTheDocument()
    expect(screen.getByText('04')).toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('00070002')).toBeInTheDocument()
    expect(screen.getByText('05')).toBeInTheDocument()
  })

  it('requires a reload after a normal permit save cannot refresh derived clients', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureActivePermit()
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
      })
      .mockRejectedValueOnce(new Error('persisted client refresh unavailable'))
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co')).toBeInTheDocument()
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'save without refreshed clients')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(
        /The permit was updated successfully\. Current permit details could not be refreshed; reload before making another change\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Action info')).toBeInTheDocument()
    expect(screen.queryByText('Permit details saved')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'The permit was saved, but its current details could not be refreshed. Reload before making another change.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    await waitFor(() =>
      expect(
        screen.queryByText(
          /The permit was updated successfully\. Current permit details could not be refreshed; reload before making another change\./i,
        ),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText(
        'The permit was saved, but its current details could not be refreshed. Reload before making another change.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()
    await selectPermitDetailTab('Owner')
    const ownerTile = screen
      .getByRole('heading', { level: 2, name: 'Applicant details' })
      .closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(within(ownerTile as HTMLElement).queryByText('00067890')).not.toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).queryByText('Owner Co')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(2)
    expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()

    consoleWarn.mockRestore()
  })

  it('does not navigate or continue a deferred status transition after a saved normal permit cannot refresh', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureActivePermit()
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
      })
      .mockRejectedValueOnce(new Error('persisted client refresh unavailable'))
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/permit/:permitNumber',
          element: (
            <>
              <ProvincialPermitDetailsPage />
              <Link to="/next">Leave permit</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')
    await userEvent.click(screen.getByRole('link', { name: 'Leave permit' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce())
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({ permitSubmitDate: '2026-04-11', permitStatus: 'ACT' }),
    )
    expect(
      await screen.findByText(
        /Current permit details could not be refreshed; reload before making another change\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Next page' })).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce()

    consoleWarn.mockRestore()
  })

  it('validates permit text storage boundaries before saving', async () => {
    configureActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const receiptNumber = screen.getByLabelText('Receipt number')
    await selectPermitDetailTab('Permit')
    const remarks = screen.getByLabelText('Remarks')
    const saveButton = screen.getByRole('button', { name: 'Save permit' })

    expect(receiptNumber).toHaveAttribute('maxlength', '50')
    fireEvent.change(receiptNumber, { target: { value: 'R'.repeat(51) } })
    fireEvent.change(remarks, { target: { value: 'X'.repeat(255) } })
    await userEvent.click(saveButton)

    expect(
      (await screen.findAllByText('Receipt number must be 50 characters or fewer.')).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    fireEvent.change(receiptNumber, { target: { value: 'R-1' } })
    await userEvent.click(saveButton)

    expect(
      (await screen.findAllByText('Permit remarks must be 254 characters or fewer.')).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    fireEvent.change(remarks, { target: { value: 'Résumé' } })
    await userEvent.click(saveButton)

    expect(
      (
        await screen.findAllByText(
          'Permit remarks contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
        )
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('allows an approver to expire a permit like legacy', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'EXP')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'EXP',
        }),
      )
    })
  })

  it('edits an active submit date while keeping ordinary linked and derived fields read-only', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    const submitDate = screen.getByLabelText('Submit date')
    expect(submitDate).toBeEnabled()
    expect(screen.getByLabelText('Exemption number')).toBeDisabled()
    expect(screen.getByLabelText('Received date')).toBeDisabled()
    expect(screen.getByLabelText('Current permit volume (m³)')).toBeDisabled()
    expect(screen.getByLabelText('Current permit pieces')).toBeDisabled()

    await userEvent.clear(submitDate)
    await userEvent.type(submitDate, '2026-04-09')
    expect(screen.getByLabelText('Received date')).toHaveValue('2026-04-09')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'EX-9',
          permitSubmitDate: '2026-04-09',
          permitRequestDate: '2026-04-09',
          permitTotalVolume: '120',
          permitNumberOfPieces: '10',
        }),
      )
    })
  })

  it('keeps ministry-controlled permit status and dates read-only without permit review authority', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    expect(screen.getByLabelText('Permit status')).toBeDisabled()
    expect(screen.getByLabelText('Submit date')).toBeDisabled()
    expect(screen.getByLabelText('Issued date')).toBeDisabled()
    expect(screen.getByLabelText('Expiry date')).toBeDisabled()
    expect(screen.getByLabelText('Received date')).toBeDisabled()
  })

  it('does not submit hidden Blanket OIC request limits for a normal permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      oicRequestPieces: 250,
      oicRequestVolume: 125.75,
      blanketOic: false,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'normal permit update')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitRemarks: 'normal permit update',
          oicPermitTotalPieces: '',
          oicPermitTotalVolume: '',
        }),
      )
    })
  })

  it('guards unload only after a permit field differs from its edit baseline', async () => {
    renderPermitDetails()
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    const remarksInput = screen.getByLabelText('Remarks')
    await userEvent.clear(remarksInput)
    await userEvent.type(remarksInput, 'changed but not saved')
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
    const cancelledUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cancelledUnload)
    expect(cancelledUnload.defaultPrevented).toBe(false)
  })

  it('saves dirty shipping before permit fields without erasing either draft', async () => {
    configureActivePermit()
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/permit/:permitNumber',
          element: (
            <>
              <ProvincialPermitDetailsPage />
              <Link to="/next">Leave permit</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Updated permit remarks')
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Updated Destination')

    await userEvent.click(screen.getByRole('link', { name: 'Leave permit' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationCompanyName: 'Updated Destination',
      }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        permitRemarks: 'Updated permit remarks',
        destinationCompanyName: 'Updated Destination',
      }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitShipping.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitDetail.mock.invocationCallOrder[0],
    )
  })

  it('labels a combined permit and shipping save', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Updated permit remarks')
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Updated Destination')
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText('Permit and shipping details saved')).toBeInTheDocument()
  })

  it('serializes direct permit and shipping saves without stranding busy state', async () => {
    configureActivePermit()
    let resolvePermitSave:
      | ((value: Awaited<ReturnType<typeof updatePermitDetail>>) => void)
      | undefined
    mockedUpdatePermitDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermitSave = resolve
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Slow permit save')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))
    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Queued shipping change')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Wait for the current permit change to finish before saving again.'),
    ).toBeInTheDocument()
    await act(async () => {
      resolvePermitSave?.({
        success: true,
        message: 'The permit was updated successfully.',
        errors: [],
        warnings: [],
        source: 'api',
      })
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save shipping' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))
    await waitFor(() => expect(mockedUpdatePermitShipping).toHaveBeenCalledTimes(1))
  })

  it.each([
    {
      origin: 'Applicant',
      destination: 'Permit',
      confirmation: 'Applicant details saved',
    },
    {
      origin: 'Permit',
      destination: 'Applicant',
      confirmation: 'Permit details saved',
    },
  ])(
    'keeps the $origin save confirmation after switching to $destination while it is pending',
    async ({ origin, destination, confirmation }) => {
      configureMinisterialActivePermit()
      let resolvePermitSave:
        | ((value: Awaited<ReturnType<typeof updatePermitDetail>>) => void)
        | undefined
      mockedUpdatePermitDetail.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePermitSave = resolve
        }),
      )
      renderPermitDetails()

      if (origin === 'Applicant') {
        await selectPermitDetailTab('Applicant')
        await userEvent.click(
          await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
        )
        const applicantLocation = screen.getByLabelText('Applicant location')
        await waitFor(() => expect(applicantLocation).toBeEnabled())
        await userEvent.selectOptions(applicantLocation, '04')
      } else {
        await userEvent.click(
          await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
        )
        await userEvent.clear(screen.getByLabelText('Remarks'))
        await userEvent.type(screen.getByLabelText('Remarks'), 'Delayed permit save')
      }

      await userEvent.click(
        screen.getByRole('button', {
          name: origin === 'Applicant' ? 'Save changes' : 'Save permit',
        }),
      )
      await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce())

      await selectPermitDetailTab(destination)
      await act(async () => {
        resolvePermitSave?.({
          success: true,
          message: 'The permit was updated successfully.',
          errors: [],
          warnings: [],
          source: 'api',
        })
      })

      expect(await screen.findByText(confirmation)).toBeInTheDocument()
    },
  )

  it('saves shipping changes before completing a permit', async () => {
    configureEditableBlanketOicPackage()
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/permit/:permitNumber',
          element: (
            <>
              <ProvincialPermitDetailsPage />
              <Link to="/next">Leave permit</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping details' }))
    const destinationCountry = screen.getByRole('combobox', {
      name: 'Final destination country',
    })
    await userEvent.click(destinationCountry)
    await userEvent.click(await screen.findByRole('option', { name: 'United States (US)' }))
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Region')).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')

    await userEvent.click(screen.getByRole('link', { name: 'Leave permit' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
      expect.objectContaining({ destinationCountry: 'US' }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        destinationCountry: 'US',
        orgUnitNumber: '1903',
        permitSubmitDate: '2026-04-11',
        permitStatus: 'ACT',
      }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ permitStatus: 'COM' }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(2)
    expect(mockedUpdatePermitShipping.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitDetail.mock.invocationCallOrder[0],
    )
    expect(mockedUpdatePermitDetail.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitDetail.mock.invocationCallOrder[1],
    )
  })

  it('limits editable Blanket OIC regions to the exemption area', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const regionSelect = screen.getByLabelText('Region')
    expect(regionSelect).toBeEnabled()
    expect(regionSelect).toHaveValue('1903')
    expect(
      within(regionSelect).getByRole('option', {
        name: /Kootenay-Boundary Natural Resource Region/,
      }),
    ).toBeInTheDocument()
    expect(
      within(regionSelect).queryByRole('option', { name: /Skeena Natural Resource Region/ }),
    ).not.toBeInTheDocument()
    await userEvent.selectOptions(regionSelect, '1904')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          orgUnitNumber: '1904',
        }),
      )
    })
  })

  it('requires a BOIC Region draft to be saved or discarded before creating a package', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Region'), '1904')
    await selectPermitDetailTab('Scale')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (
      await screen.findByRole('heading', { name: 'Create Blanket OIC package' })
    ).closest('.application-detail-edit-section') as HTMLElement
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Create package' }))

    expect(
      await screen.findByText('Save or discard the Region change before saving a package.'),
    ).toBeInTheDocument()
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    await selectPermitDetailTab('Permit')
    expect(screen.getByLabelText('Region')).toBeEnabled()
    expect(screen.getByLabelText('Region')).toHaveValue('1904')
  })

  it.each([1903, 1908])(
    'keeps linked BOIC region %s fixed even without current packages',
    async (orgUnitNumber) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicApplicationNumber: 1000999,
        oicRequestPieces: 200,
        oicRequestVolume: 120.5,
        orgUnitNumber,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      const regionSelect = screen.getByLabelText('Region')
      await waitFor(() => expect(regionSelect).toHaveValue(String(orgUnitNumber)))
      expect(regionSelect).toBeDisabled()
      expect(
        within(regionSelect)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value')),
      ).toEqual(['', String(orgUnitNumber)])
      expect(
        screen.getByText('Region cannot be changed after the first package is created.'),
      ).toBeInTheDocument()
      await userEvent.clear(screen.getByLabelText('Remarks'))
      await userEvent.type(screen.getByLabelText('Remarks'), 'Updated remarks')
      await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

      await waitFor(() => {
        expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
          expect.objectContaining({
            orgUnitNumber: String(orgUnitNumber),
            permitRemarks: 'Updated remarks',
          }),
        )
      })
    },
  )

  it('groups saved Blanket OIC quantities and remarks in the Permit details card', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicRequestPieces: 250,
      oicRequestVolume: 125.75,
      remarks: 'Saved BOIC remarks',
    })

    renderPermitDetails()

    const permitTile = (
      await screen.findByRole('heading', {
        name: 'Permit details',
      })
    ).closest('.cds--tile')
    expect(permitTile).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Volume and remarks' })).not.toBeInTheDocument()
    expect(
      within(permitTile as HTMLElement).getByRole('link', { name: 'EX-9' }),
    ).toBeInTheDocument()
    const savedSummaryFields: Array<[string, string]> = [
      ['Status', 'Active'],
      ['Exemption type', 'Blanket OIC'],
      ['Region', permitDetail.region ?? ''],
      ['Submit date', permitDetail.applicationDate ?? ''],
      ['Issued date', permitDetail.issueDate ?? ''],
      ['Expiry date', permitDetail.expiryDate ?? ''],
    ]
    for (const [label, value] of savedSummaryFields) {
      const field = within(permitTile as HTMLElement)
        .getByText(label)
        .closest('.detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    for (const label of [
      'Permit number',
      'Application number(s)',
      'Package number(s)',
      'Received date',
    ]) {
      expect(within(permitTile as HTMLElement).queryByText(label)).not.toBeInTheDocument()
    }
    const requestPiecesLabel = within(permitTile as HTMLElement).getByText('Permit Request Pieces')
    expect(requestPiecesLabel).toBeInTheDocument()
    expect(
      within(requestPiecesLabel.closest('.detail-field-item') as HTMLElement).getByText('250'),
    ).toBeInTheDocument()
    expect(
      within(permitTile as HTMLElement).getByText('Permit Request Volume (m³)'),
    ).toBeInTheDocument()
    expect(within(permitTile as HTMLElement).getByText('125.75')).toBeInTheDocument()
    for (const [label, value] of [
      ['Total exemption volume (m³)', '250'],
      ['Total volume remaining (m³)', '130'],
      ['Current permit volume (m³)', String(permitDetail.permitVolume)],
      ['Current permit pieces', String(permitDetail.numberOfPieces)],
      ['Remarks', 'Saved BOIC remarks'],
    ]) {
      const field = within(permitTile as HTMLElement)
        .getByText(label)
        .closest('.detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
  })

  it.each([
    ['populated', '250', '999999999'],
    ['zero', '0', '0'],
  ])(
    'saves %s active Blanket OIC request values with the existing mutation field names',
    async (_description, pieces, volume) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        blanketOic: true,
        oicRequestPieces: 200,
        oicRequestVolume: 120.5,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      const permitTile = screen
        .getByRole('heading', { name: 'Permit details' })
        .closest('.cds--tile') as HTMLElement
      expect(screen.queryByRole('heading', { name: 'Volume and remarks' })).not.toBeInTheDocument()
      expect(within(permitTile).getByLabelText('Exemption number')).toBeDisabled()
      expect(within(permitTile).getByLabelText('Submit date')).toBeEnabled()
      expect(within(permitTile).getByLabelText('Received date')).toBeDisabled()
      expect(within(permitTile).getByLabelText('Region')).toHaveValue('1903')
      expect(within(permitTile).getByLabelText('Remarks')).toHaveValue('ok')
      expect(within(permitTile).getByLabelText('Current permit volume (m³)')).toBeDisabled()
      expect(within(permitTile).getByLabelText('Current permit pieces')).toBeDisabled()
      expect(within(permitTile).getByLabelText('Permit Request Pieces')).toHaveAttribute(
        'aria-required',
        'true',
      )
      expect(within(permitTile).getByLabelText('Permit Request Volume (m³)')).toHaveAttribute(
        'aria-required',
        'true',
      )
      expect(
        document.querySelector('label[for="permit-oicPermitTotalPieces"] .required-label__marker'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-oicPermitTotalVolume"] .required-label__marker'),
      ).toBeInTheDocument()
      await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
      if (pieces) {
        await userEvent.type(screen.getByLabelText('Permit Request Pieces'), pieces)
      }
      await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
      if (volume) {
        await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), volume)
      }
      await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

      await waitFor(() => {
        expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
          expect.objectContaining({
            oicPermitTotalPieces: pieces,
            oicPermitTotalVolume: volume,
          }),
        )
      })
    },
  )

  it('requires nonblank active Blanket OIC request values without coercing them to zero', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Permit Request Pieces is required.')).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Permit Request Volume is required.')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByLabelText('Permit Request Pieces')).toHaveValue('')
    expect(screen.getByLabelText('Permit Request Volume (m³)')).toHaveValue('')
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('allows zero Blanket OIC request values while cancelling an active permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'CAN')
    expect(screen.getByLabelText('Permit Request Pieces')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Permit Request Volume (m³)')).toHaveAttribute(
      'aria-required',
      'true',
    )
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '0')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'CAN',
          oicPermitTotalPieces: '0',
          oicPermitTotalVolume: '0',
        }),
      )
    })
  })

  it('requires request values before saving an active Blanket OIC permit with blank legacy values', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: null,
      oicRequestVolume: null,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Permit Request Pieces is required.')).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Permit Request Volume is required.')).length,
    ).toBeGreaterThan(0)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('validates Blanket OIC request ceilings before saving', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '-1')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '-1')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Permit Request Pieces must be a whole number.')).length,
    ).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText('Permit Request Volume must be numeric.')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '10000000000')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '1.234')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Permit Request Pieces must be 9999999999 or less.')).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText('Permit Request Volume must have no more than 2 decimal places.'),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '250')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '1234567.89')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Permit Request Volume must be 9 characters or fewer.')).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('requires positive Blanket OIC request ceilings when completing a permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    expect(screen.getByLabelText('Permit Request Pieces')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Permit Request Volume (m³)')).toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(
      document.querySelector('label[for="permit-oicPermitTotalPieces"] .required-label__marker'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('label[for="permit-oicPermitTotalVolume"] .required-label__marker'),
    ).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '0')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Use a positive numeric value.')).length,
    ).toBeGreaterThanOrEqual(2)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it.each([
    ['normal', false],
    ['Blanket OIC', true],
  ])(
    'requires submit, issue, and expiry dates before completing a %s permit',
    async (_description, blanketOic) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        exemptionTypeDescription: blanketOic ? 'Blanket OIC' : 'Standard exemption',
        blanketOic,
        applicationDate: blanketOic ? permitDetail.applicationDate : null,
        issueDate: blanketOic ? null : permitDetail.issueDate,
        expiryDate: blanketOic ? null : permitDetail.expiryDate,
        oicApplicationNumber: blanketOic ? 1000999 : null,
        oicRequestPieces: blanketOic ? 200 : null,
        oicRequestVolume: blanketOic ? 120.5 : null,
      })
      mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
        approvedExemptionVolume: permitDetail.approvedExemptionVolume,
        exemptionVolumeRemaining: permitDetail.exemptionVolumeRemaining,
        exemptionTypeDescription: blanketOic ? 'Blanket OIC' : 'Standard exemption',
        blanketOic,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      const statusLabel = blanketOic ? 'Status' : 'Permit status'
      await userEvent.selectOptions(screen.getByLabelText(statusLabel), 'COM')

      const submitDate = screen.getByLabelText('Submit date')
      const issueDate = screen.getByLabelText('Issued date')
      const expiryDate = screen.getByLabelText('Expiry date')
      expect(submitDate).toHaveValue(blanketOic ? (permitDetail.applicationDate ?? '') : '')
      expect(issueDate).toHaveValue(blanketOic ? '' : (permitDetail.issueDate ?? ''))
      expect(expiryDate).toHaveValue(blanketOic ? '' : (permitDetail.expiryDate ?? ''))
      expect(submitDate).toHaveAttribute('aria-required', 'true')
      expect(issueDate).toHaveAttribute('aria-required', 'true')
      expect(expiryDate).toHaveAttribute('aria-required', 'true')
      expect(
        document.querySelector('label[for="permit-permitSubmitDate"] .required-label__marker'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-permitIssueDate"] .required-label__marker'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-permitExpiryDate"] .required-label__marker'),
      ).toBeInTheDocument()

      await userEvent.clear(submitDate)
      await userEvent.clear(issueDate)
      await userEvent.tab()
      expect(await screen.findByText('Issued date is required.')).toBeInTheDocument()
      await userEvent.clear(expiryDate)
      await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

      expect(await screen.findByText('Submit date is required.')).toBeInTheDocument()
      expect(await screen.findByText('Expiry date is required.')).toBeInTheDocument()
      expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

      await userEvent.selectOptions(screen.getByLabelText(statusLabel), 'ACT')
      expect(submitDate).not.toHaveAttribute('aria-required')
      expect(issueDate).not.toHaveAttribute('aria-required')
      expect(expiryDate).not.toHaveAttribute('aria-required')
      expect(
        document.querySelector('label[for="permit-permitSubmitDate"] .required-label__marker'),
      ).not.toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-permitIssueDate"] .required-label__marker'),
      ).not.toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-permitExpiryDate"] .required-label__marker'),
      ).not.toBeInTheDocument()
      expect(submitDate).not.toHaveAttribute('aria-invalid', 'true')
      expect(issueDate).not.toHaveAttribute('aria-invalid', 'true')
      expect(expiryDate).not.toHaveAttribute('aria-invalid', 'true')

      await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))
      await waitFor(() => {
        expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
          expect.objectContaining({
            permitStatus: 'ACT',
            permitSubmitDate: '',
            permitIssueDate: '',
            permitExpiryDate: '',
          }),
        )
      })
    },
  )

  it.each([
    ['COM', 'Completed'],
    ['PPD', 'Payment pending'],
  ])(
    'keeps Blanket OIC request ceilings read-only for %s permits',
    async (permitStatusCode, permitStatusDescription) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
        blanketOic: true,
        oicRequestPieces: 200,
        oicRequestVolume: 120.5,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

      const requestPieces = screen.getByLabelText('Permit Request Pieces')
      const requestVolume = screen.getByLabelText('Permit Request Volume (m³)')
      expect(requestPieces).toBeDisabled()
      expect(requestVolume).toBeDisabled()
      expect(requestPieces).not.toHaveAttribute('aria-required')
      expect(requestVolume).not.toHaveAttribute('aria-required')
      expect(
        document.querySelector('label[for="permit-oicPermitTotalPieces"] .required-label__marker'),
      ).not.toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-oicPermitTotalVolume"] .required-label__marker'),
      ).not.toBeInTheDocument()
    },
  )

  it('keeps Blanket OIC request ceilings visible but not editable when the permit is locked', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: true,
      lockMessage: 'Another user is editing this permit.',
    })
    renderPermitDetails()

    expect(await screen.findByText('Permit Request Pieces')).toBeInTheDocument()
    expect(screen.getByText('Permit Request Volume (m³)')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Another user is editing this permit.')).toBeInTheDocument()
  })

  it('allows a cancelled permit to be reactivated before other edits', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'ACT')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'ACT',
          permitReceiptNo: 'R-1',
        }),
      )
    })
  })

  it('uses the authoritative payment-pending status and displays permit warnings', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedUpdatePermitDetail.mockResolvedValue({
      success: true,
      message: 'The permit was updated successfully.',
      errors: [],
      warnings: [
        'Fee Receipt Number should not be empty for a complete Permit so it will be saved as Payment Pending.',
      ],
      source: 'api',
      permitStatus: 'PPD',
      permitReceiptNo: '',
      permitVolume: 95,
      permitNumberOfPieces: 9,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Fee Receipt Number should not be empty for a complete Permit/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Payment Pending').length).toBeGreaterThan(0)
    const financialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile')
    expect(within(financialTile as HTMLElement).getByText('95')).toBeInTheDocument()
    expect(within(financialTile as HTMLElement).getByText('9')).toBeInTheDocument()
  })

  it('only exposes the supported payment completion fields for a payment-pending permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      receiptNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByText(/select Completed on the Permit tab/i)).toBeInTheDocument()
    const receiptNumber = screen.getByLabelText('Receipt number')
    await userEvent.type(receiptNumber, 'R-2')
    expect(screen.getByRole('button', { name: 'Save permit' })).toBeDisabled()

    await selectPermitDetailTab('Owner')
    expect(screen.getByRole('heading', { name: 'Applicant details' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()
    await selectPermitDetailTab('Permit')

    const financialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile') as HTMLElement
    expect(within(financialTile).queryByLabelText('Receipt number')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Permit status')).toBeEnabled()
    expect(screen.getByLabelText('Exemption number')).toBeDisabled()
    expect(screen.getByLabelText('Issued date')).toBeDisabled()
    expect(screen.getByLabelText('Region')).toBeDisabled()
    expect(screen.getByLabelText('Current permit volume (m³)')).toBeDisabled()
    expect(screen.getByLabelText('Current permit pieces')).toBeDisabled()
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')
    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Receipt number')).toBeEnabled()
    expect(screen.getByLabelText('Receipt number')).toHaveValue('R-2')
    expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'COM',
          permitReceiptNo: 'R-2',
          permitIssueDate: permitDetail.issueDate,
        }),
      )
    })
  })

  it('labels a current PPD permit and retains its current-only status option when options omit it', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'PPD',
      receiptNumber: null,
    })
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [
        { value: 'ACT', label: 'Active' },
        { value: 'COM', label: 'Completed' },
        { value: 'CAN', label: 'Cancelled' },
        { value: 'EXP', label: 'Expired' },
      ],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
    })
    renderPermitDetails()

    expect((await screen.findAllByText('Payment Pending')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))

    const permitStatusSelect = screen.getByLabelText('Permit status')
    expect(permitStatusSelect).toHaveValue('PPD')
    expect(
      within(permitStatusSelect).getByRole('option', { name: 'Payment Pending (PPD)' }),
    ).toBeInTheDocument()
  })

  it('keeps an existing invoiced receipt read-only', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
      receiptNumber: 'R-1',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Receipt number')).toBeDisabled()
  })

  it('keeps payment-pending receipt completion read-only without permit review authority', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      receiptNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.queryByText(/select Completed on the Permit tab/i)).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    expect(screen.getByLabelText('Receipt number')).toBeDisabled()
    expect(screen.queryByText(/select Completed on the Permit tab/i)).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('saves shipping changes through the shipping update endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Updated Destination')
    await userEvent.clear(screen.getByLabelText('Estimated shipping date'))
    await userEvent.type(screen.getByLabelText('Estimated shipping date'), '2026-05-25')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    await waitFor(() => {
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          destinationCompanyName: 'Updated Destination',
          estimatedShippingDate: '2026-05-25',
        }),
      )
    })
    expect(await screen.findByText('The permit was saved successfully.')).toBeInTheDocument()
    expect(screen.getByText('Updated Destination')).toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).not.toHaveBeenCalled()
  })

  it('renders shipping descriptions and clears Other Port when a standard port is selected', async () => {
    configureActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    expect(await screen.findByText('Canada (CA)')).toBeInTheDocument()
    expect(screen.getByText('Ship (S)')).toBeInTheDocument()
    expect(screen.getByText('Vancouver (VA)')).toBeInTheDocument()
    expect(screen.queryByText('Other port of export')).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export'), 'Boundary Bay')
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'VA')

    expect(screen.queryByLabelText('Other port of export')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))
    await waitFor(() => {
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({ portOfExport: 'VA', otherPortOfExport: '' }),
      )
    })
  })

  it('fails closed when shipping reference options cannot be loaded', async () => {
    configureActivePermit()
    mockedFetchShippingReferenceOptions.mockRejectedValueOnce(new Error('Oracle unavailable'))
    renderPermitDetails()

    expect(
      await screen.findByText(
        'Shipping reference options could not be loaded. Shipping changes are unavailable.',
      ),
    ).toBeInTheDocument()
    await selectPermitDetailTab('Shipping')
    expect(screen.getByRole('button', { name: 'Edit shipping' })).toBeDisabled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it('disables shipping save when a text value exceeds the frontend schema width', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValueOnce({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      destinationCompanyName: 'A'.repeat(53),
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    expect(screen.getByRole('button', { name: 'Save shipping' })).toBeDisabled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it.each([
    ['COM', 'Completed'],
    ['PPD', 'Payment pending'],
  ])(
    'keeps destination country read-only while preserving other shipping edits for %s',
    async (permitStatusCode, permitStatusDescription) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

      expect(screen.getByLabelText('Final destination country')).toBeDisabled()
      expect(screen.getByLabelText('Purchaser')).toBeEnabled()
    },
  )

  it('requires a cancelled permit to be reactivated before editing shipping', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')

    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()
  })

  it('hides permit edit controls without savePermit access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== 'savePermit',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    await selectPermitDetailTab('Shipping')
    expect(await screen.findByRole('heading', { name: 'Shipping' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()
  })

  it('keeps every permit mutation unavailable when edit context loading fails', async () => {
    mockedFetchPermitFeeOverrideContext.mockRejectedValue(new Error('Oracle unavailable'))

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Permit edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Email approval' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()

    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it('locks completed permit details for a scoped submitter while retaining shipping updates', async () => {
    configureBlanketOicSubmitter('00067890')
    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    await waitFor(() => expect(mockedFetchPermitFeeOverrideContext).toHaveBeenCalled())
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Remarks' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Updated purchaser')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    await waitFor(() =>
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          destinationCompanyName: 'Updated purchaser',
        }),
      ),
    )
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('keeps completed permit details editable for authorized staff', async () => {
    renderPermitDetails()
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByRole('textbox', { name: 'Remarks' })).toBeEnabled()
  })

  it('hides permit approval email from provincial submitters without permit review authority', async () => {
    const submitterAuth = createTestAuthContext()
    mockedUseAuth.mockReturnValue({
      ...submitterAuth,
      capabilities: {
        ...submitterAuth.capabilities,
        roles: ['PROVINCIAL_SUBMITTER_00067890'],
      },
      canPerform: (action: string) => action === 'savePermit' || action === '/permitDetails',
    })

    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Email approval' })).not.toBeInTheDocument()
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
  })

  it('loads the server-resolved approval recipient and sends an edited address', async () => {
    renderPermitDetails()

    const approvalButton = await screen.findByRole('button', { name: 'Email approval' })
    await userEvent.click(approvalButton)

    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    expect(mockedFetchPermitApprovalEmailDefault).toHaveBeenCalledWith('777')
    const recipient = within(dialog).getByLabelText('Applicant email address')
    expect(recipient).toHaveValue('agent@example.test')

    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'updated.applicant@example.ca')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send approval' }))

    await waitFor(() => {
      expect(mockedSendPermitApprovalEmail).toHaveBeenCalledWith(
        '777',
        'updated.applicant@example.ca',
      )
      expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    })
    expect(screen.getByText('Permit approval email sent.')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('defaults Blanket OIC approval mail to the owner', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValueOnce({
      ...permitDetail,
      blanketOic: true,
      oicApplicationNumber: 111,
    })
    mockedFetchPermitApprovalEmailDefault.mockResolvedValueOnce('owner@example.test')
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Email approval' }))

    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    expect(within(dialog).getByLabelText('Applicant email address')).toHaveValue(
      'owner@example.test',
    )
  })

  it('does not open the approval dialog when the server cannot resolve a default', async () => {
    mockedFetchPermitApprovalEmailDefault.mockRejectedValueOnce(new Error('Oracle unavailable'))
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Email approval' }))

    expect(
      await screen.findByText('Unable to resolve the permit applicant notification email.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
  })

  it('blocks an invalid approval recipient and cancels without changing the permit', async () => {
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Email approval' }))
    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    const recipient = within(dialog).getByLabelText('Applicant email address')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'not-an-email')

    expect(within(dialog).getByText('Enter one valid email address.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Send approval' })).toBeDisabled()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    })
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it('keeps the approval dialog open when notification delivery cannot be sent', async () => {
    mockedSendPermitApprovalEmail.mockResolvedValueOnce({
      success: false,
      message: 'Permit approval notification is unavailable.',
      permitRequestDate: '',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Email approval' }))
    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send approval' }))

    expect(
      await screen.findByText('Permit approval notification is unavailable.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Email permit 777 approval?' })).toBeInTheDocument()
    expect(mockedSendPermitApprovalEmail).toHaveBeenCalledWith('777', 'agent@example.test')
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it('lets an eligible provincial submitter request permit review and records the first BOIC request date', async () => {
    const submitterAuth = createTestAuthContext()
    mockedUseAuth.mockReturnValue({
      ...submitterAuth,
      capabilities: {
        ...submitterAuth.capabilities,
        roles: ['PROVINCIAL_SUBMITTER_00067890'],
      },
      canPerform: (action: string) => action === '/permitDetails',
    })
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicApplicationNumber: 111,
      receivedDate: null,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          packageNumber: 'BOIC-1',
          region: 'RCO',
          speciesEndUseSort: 'FI/UT',
          ageClass: 'O',
          packageVolume: '10.0',
          averageLength: '5.0',
          averageTopDiameter: '2.0',
          productType: 'H',
          currentPackageVolume: '10.0',
          status: 'ACT',
          reprocessed: 'N',
          comments: '',
        },
      ],
      items: [
        {
          id: '1',
          timberMark: 'TM1',
          scaleType: '',
          species: 'Fir',
          grade: 'J',
          pieces: 1,
          volume: 10,
          packageNumber: 'BOIC-1',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: true,
      message: 'Permit review request email sent.',
      permitRequestDate: '2026-07-10',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const requestButton = await screen.findByRole('button', { name: 'Email review request' })
    expect(requestButton).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Email approval' })).not.toBeInTheDocument()
    await userEvent.click(requestButton)

    await waitFor(() => {
      expect(mockedSendPermitReviewRequestEmail).toHaveBeenCalledWith('777')
      expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: /Email permit .* approval/ })).toBeNull()
      expect(screen.getByText('Permit review request email sent.')).toBeInTheDocument()
    })
    expect(screen.getAllByText('2026-07-10')).toHaveLength(1)
  })

  it('saves a permit fee override without changing unrelated permit fields', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Fees')
    expect(screen.getByRole('radio', { name: 'Yes', checked: true })).toBeDisabled()
    expect(screen.getByLabelText('Override fee (CAD)')).toBeDisabled()
    expect(screen.getByLabelText('Override comment')).toBeDisabled()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    expect(screen.getByRole('radio', { name: 'Yes', checked: true })).toBeEnabled()
    await userEvent.clear(screen.getByLabelText('Override fee (CAD)'))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.clear(screen.getByLabelText('Override comment'))
    await userEvent.type(screen.getByLabelText('Override comment'), 'Reviewed calculation')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'ACT',
          overrideInd: 'true',
          overrideFee: '45.25',
          overrideComment: 'Reviewed calculation',
        }),
      )
    })
  })

  it('shows fee override fields only when Yes is selected', async () => {
    configureActivePermit()

    renderPermitDetails()
    await selectPermitDetailTab('Fees')

    expect(screen.getByRole('radio', { name: 'No', checked: true })).toBeDisabled()
    expect(screen.queryByLabelText('Override fee (CAD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Override comment')).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    expect(screen.getByRole('radio', { name: 'No', checked: true })).toBeEnabled()
    expect(screen.queryByLabelText('Override fee (CAD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Override comment')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByLabelText('Override fee (CAD)')).toBeInTheDocument()
    expect(screen.getByLabelText('Override comment')).toBeInTheDocument()
  })

  it('clears disabled override values from the save payload when No is selected', async () => {
    configureActivePermit()
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))

    expect(screen.queryByLabelText('Override fee (CAD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Override comment')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          overrideInd: 'false',
          overrideFee: '',
          overrideComment: '',
        }),
      )
    })
  })

  it('shows fee override validation inline and keeps Save enabled', async () => {
    configureActivePermit()
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))

    const overrideFee = screen.getByLabelText('Override fee (CAD)')
    const overrideComment = screen.getByLabelText('Override comment')
    const saveButton = screen.getByRole('button', { name: 'Save fee override' })
    await userEvent.clear(overrideFee)
    await userEvent.click(saveButton)

    expect(saveButton).toBeEnabled()
    expect(overrideFee).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Override fee is required.')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.type(overrideFee, '1.00')
    fireEvent.change(overrideComment, { target: { value: 'Résumé' } })
    await userEvent.click(saveButton)

    expect(overrideComment).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText(
        'Override comment contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('clears a prior success notification when fee override validation blocks a save', async () => {
    configureActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    expect(await screen.findByText('Fee override saved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit fee override' }))
    await userEvent.clear(screen.getByLabelText('Override fee (CAD)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    expect(screen.getByText('Override fee is required.')).toBeInTheDocument()
    expect(screen.queryByText('Fee override saved')).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
  })

  it('validates permit fee override storage boundaries before saving', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))

    const overrideFee = screen.getByLabelText('Override fee (CAD)')
    const overrideComment = screen.getByLabelText('Override comment')
    const saveButton = screen.getByRole('button', { name: 'Save fee override' })

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '9999999.995')
    await userEvent.click(saveButton)

    expect(
      await screen.findByText('Override fee must round to 9999999.99 or less.'),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '0.001')
    await userEvent.click(saveButton)

    expect(await screen.findByText('Override fee must round to at least 0.01.')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '1.00')
    fireEvent.change(overrideComment, { target: { value: 'x'.repeat(255) } })
    await userEvent.click(saveButton)

    expect(
      await screen.findByText('Override comment must be 254 characters or fewer.'),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('preserves legacy Oracle rounding for permit fee overrides', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.clear(screen.getByLabelText('Override fee (CAD)'))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '0.005')
    await userEvent.click(screen.getByRole('button', { name: 'Save fee override' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ overrideFee: '0.01' }),
      )
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    expect(screen.getByLabelText('Override fee (CAD)')).toHaveValue('0.01')
  })

  it.each([
    { permitStatusCode: 'COM', permitStatusDescription: 'Completed' },
    { permitStatusCode: 'PPD', permitStatusDescription: 'Payment pending' },
  ])(
    'keeps fee overrides read-only for $permitStatusCode permits',
    async ({ permitStatusCode, permitStatusDescription }) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
      })
      mockedFetchPermitFeeOverrideContext.mockResolvedValue({
        overrideEnabled: true,
        overrideFee: '25.00',
        overrideComment: 'Invoiced calculation',
        locked: false,
        lockMessage: '',
      })

      renderPermitDetails()
      await selectPermitDetailTab('Fees')

      expect(await screen.findByRole('radio', { name: 'Yes', checked: true })).toBeDisabled()
      expect(screen.getByLabelText('Override fee (CAD)')).toBeDisabled()
      expect(screen.getByLabelText('Override comment')).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()
      expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    },
  )

  it('requires the permit review action to edit a fee override', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === 'savePermit',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')

    expect(await screen.findByRole('radio', { name: 'No', checked: true })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()
  })

  it('downloads the completed permit report with its response filename', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const printButton = await screen.findByRole('button', { name: 'Print permit' })
    await userEvent.click(printButton)

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'permitReport',
        actionMapping: 'generate',
        values: { permitNumber: '777' },
      })
      expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(
        expect.any(Blob),
        'permit-report.pdf',
      )
    })
  })

  it('hides permit report action when the user lacks report access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/permitReport',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Print permit' })).not.toBeInTheDocument()
  })

  it('shows the permit document action on the documents tab without header actions', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')

    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Permit Document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Permit Report' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Edit permit documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterPermitDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
  })

  it('shows the permit upload action to a scoped Provincial Submitter', async () => {
    configureActivePermit()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00067890'],
        }),
        canPerform: (action: string) => action === '/filePermitUpload',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('opens, cancels, and reopens the Ministerial document modal from Add document', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    await userEvent.click(await screen.findByRole('button', { name: 'Add document' }))
    const modal = await screen.findByRole('dialog', { name: 'Add document' })
    expect(modal.closest('.detail-document-upload-modal--side-panel')).not.toBeInTheDocument()
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add document' }))
    expect(await screen.findByRole('dialog', { name: 'Add document' })).toBeInTheDocument()
  })

  it('closes the Ministerial upload modal after each successful upload and keeps Add document available', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    const firstFile = new File(['first test'], 'first-ministerial.pdf', { type: 'application/pdf' })
    await userEvent.click(await screen.findByRole('button', { name: 'Add document' }))
    const firstModal = await screen.findByRole('dialog', { name: 'Add document' })
    await userEvent.upload(within(firstModal).getByLabelText('Document File'), firstFile)
    await userEvent.click(within(firstModal).getByRole('button', { name: 'Review upload' }))
    await userEvent.click(within(firstModal).getByRole('button', { name: 'Submit upload' }))

    await waitFor(() =>
      expect(submitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ file: firstFile, permitNumber: '777' }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Document uploaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add document' })).toBeInTheDocument()
    const documentSection = screen.getByRole('heading', { name: 'Documents' }).closest('.cds--tile')
    expect(documentSection).toBeTruthy()
    expect(
      within(documentSection as HTMLElement).queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()

    const secondFile = new File(['second test'], 'second-ministerial.pdf', {
      type: 'application/pdf',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add document' }))
    const secondModal = await screen.findByRole('dialog', { name: 'Add document' })
    await userEvent.upload(within(secondModal).getByLabelText('Document File'), secondFile)
    await userEvent.click(within(secondModal).getByRole('button', { name: 'Review upload' }))
    await userEvent.click(within(secondModal).getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => expect(submitAdminUpload).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Document uploaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(
      within(documentSection as HTMLElement).queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()
  })

  it('allows an authorized Ministerial user to delete an existing document before uploading', async () => {
    configureMinisterialActivePermit()
    mockedFetchPermitDocuments.mockResolvedValue({
      source: 'api',
      rows: [
        {
          id: 'MIN-DOC-1',
          name: 'ministerial-document.pdf',
          description: 'Synthetic Ministerial document',
          type: 'Permit',
          typeCode: 'PMT',
          source: 'permit',
          deletable: true,
        },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    const documentRow = (await screen.findByText('ministerial-document.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    await userEvent.click(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    )
    const confirmation = await screen.findByRole('dialog', { name: 'Delete document' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete ministerial-document.pdf? This cannot be undone.',
    )
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(mockedRemovePermitDocument).not.toHaveBeenCalled()
  })

  it('opens the Blanket OIC document side panel directly and preserves queued files until discard is confirmed', async () => {
    configureBlanketOicDocument()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add document' }))

    const panel = await screen.findByRole('dialog', { name: 'Add documents' })
    expect(panel.closest('.detail-document-upload-modal--side-panel')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    const file = new File(['test'], 'pending.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(panel).getByLabelText('Document File'), file)
    await userEvent.type(
      within(panel).getByLabelText(/Document description for pending.pdf/),
      'Keep this description',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }))
    expect(within(panel).getByLabelText(/Document description for pending.pdf/)).toHaveValue(
      'Keep this description',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add documents' })).not.toBeInTheDocument(),
    )
    expect(submitAdminUpload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('saves consecutive Blanket OIC documents and retains the latest success after each panel closes', async () => {
    configureBlanketOicDocument()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Add document' }))
    const panel = await screen.findByRole('dialog', { name: 'Add documents' })
    const file = new File(['test'], 'new.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(panel).getByLabelText('Document File'), file)
    await userEvent.type(
      within(panel).getByLabelText(/Document description for new.pdf/),
      'New document',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Review upload' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save documents' }))
    await waitFor(() =>
      expect(submitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ file, fileDescription: 'New document', permitNumber: '777' }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add documents' })).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Document uploaded')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add document' }))
    const secondPanel = await screen.findByRole('dialog', { name: 'Add documents' })
    expect(screen.queryByLabelText(/Document description for new.pdf/)).not.toBeInTheDocument()
    const secondFile = new File(['second test'], 'second-new.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(secondPanel).getByLabelText('Document File'), secondFile)
    await userEvent.type(
      within(secondPanel).getByLabelText(/Document description for second-new.pdf/),
      'Second document',
    )
    await userEvent.click(within(secondPanel).getByRole('button', { name: 'Review upload' }))
    await userEvent.click(within(secondPanel).getByRole('button', { name: 'Save documents' }))

    await waitFor(() =>
      expect(submitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({
          file: secondFile,
          fileDescription: 'Second document',
          permitNumber: '777',
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add documents' })).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Document uploaded')).toBeInTheDocument()
  })

  it('opens Blanket OIC documents separately from Download using the authenticated permit target', async () => {
    configureBlanketOicDocument()
    const blob = new Blob(['%PDF-1.7'], { type: 'application/octet-stream' })
    mockedOpenPermitDocument.mockResolvedValue({ source: 'api', blob, filename: 'permit.pdf' })
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    await waitFor(() =>
      expect(openDocumentPreview).toHaveBeenCalledWith(blob, 'permit.pdf', previewWindow),
    )
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(previewWindow.opener).toBeNull()
    expect(mockedOpenPermitDocument).toHaveBeenCalledWith(
      'BOIC-DOC-1',
      'permit-document.pdf',
      '777',
    )
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(blob, 'permit.pdf'),
    )
    expect(openDocumentPreview).toHaveBeenCalledTimes(1)
  })

  it('reports a Blanket OIC document open failure and closes its reserved tab without downloading', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureBlanketOicDocument()
    mockedOpenPermitDocument.mockRejectedValue(new Error('document unavailable'))
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Unable to open permit document.')).toBeInTheDocument()
    expect(previewWindow.close).toHaveBeenCalledOnce()
    expect(openDocumentPreview).not.toHaveBeenCalled()
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('keeps a delayed document error on the page while creating and cancelling a package', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureBlanketOicDocument()
    let rejectDocument!: (error: Error) => void
    mockedOpenPermitDocument.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectDocument = reject
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (
      await screen.findByRole('heading', { name: 'Create Blanket OIC package' })
    ).closest('.application-detail-edit-section') as HTMLElement

    await act(() => rejectDocument(new Error('document unavailable')))

    const documentError = await screen.findByText('Unable to open permit document.')
    expect(documentError).toBeVisible()
    expect(packageEditor).not.toContainElement(documentError)
    expect(screen.getByText('Action failed')).toBeVisible()
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()

    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Unable to open permit document.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    expect(screen.getByText('Unable to open permit document.')).toBeVisible()
    expect(screen.queryByText('Package needs attention')).not.toBeInTheDocument()
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it.each(['response error', 'request rejection'])(
    'keeps a package save %s in its panel without replacing an unrelated page error',
    async (failure) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      configureBlanketOicDocument()
      mockedOpenPermitDocument.mockRejectedValueOnce(new Error('document unavailable'))
      if (failure === 'response error') {
        mockedUpdateBlanketOicPackage.mockResolvedValueOnce({
          success: false,
          message: 'Blanket OIC package was not updated.',
          errors: ['The package could not be saved.'],
          warnings: [],
          permitNumber: '777',
          applicationNumber: '1000999',
          packageNumber: 'BOIC-9',
        })
      } else {
        mockedUpdateBlanketOicPackage.mockRejectedValueOnce(new Error('package unavailable'))
      }
      renderPermitDetails()
      await selectPermitDetailTab('Documents')
      await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
      expect(await screen.findByText('Unable to open permit document.')).toBeVisible()
      await selectPermitDetailTab('Items')
      const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')!
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit' }))
      const packageEditor = (await screen.findByRole('heading', { name: 'Edit BOIC-9' })).closest(
        '.application-detail-edit-section',
      ) as HTMLElement
      const saveButton = within(packageEditor).getByRole('button', { name: 'Save package' })
      await waitFor(() => expect(saveButton).toBeEnabled())
      expect(screen.getByText('Unable to open permit document.')).toBeVisible()
      fireEvent.change(within(packageEditor).getByLabelText('Comments'), {
        target: { value: 'Unsaved package changes' },
      })
      await userEvent.click(saveButton)

      const packageError = await within(packageEditor).findByText('Package needs attention')
      expect(packageError).toBeVisible()
      const packageMessage =
        failure === 'response error'
          ? 'The package could not be saved.'
          : 'Unable to save the Blanket OIC package.'
      expect(within(packageEditor).getByText(packageMessage)).toBeVisible()
      expect(screen.getAllByText(packageMessage)).toHaveLength(1)
      expect(within(packageEditor).getByLabelText('Comments')).toHaveValue(
        'Unsaved package changes',
      )
      const documentError = screen.getByText('Unable to open permit document.')
      expect(documentError).toBeVisible()
      expect(packageEditor).not.toContainElement(documentError)
      expect(screen.getByText('Action failed')).toBeVisible()
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledOnce()

      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Cancel edit' }))
      expect(screen.getByText('Unable to open permit document.')).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      expect(screen.getByText('Unable to open permit document.')).toBeVisible()
      expect(screen.queryByText('Package needs attention')).not.toBeInTheDocument()
      expect(screen.queryByText(packageMessage)).not.toBeInTheDocument()
      expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
      consoleError.mockRestore()
    },
  )

  it('completes concurrent document downloads for the same permit', async () => {
    configureBlanketOicDocument()
    const pendingDocuments: Array<(value: Awaited<ReturnType<typeof openPermitDocument>>) => void> =
      []
    mockedOpenPermitDocument.mockImplementation(
      () => new Promise((resolve) => pendingDocuments.push(resolve)),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(pendingDocuments).toHaveLength(2)
    const first = new Blob(['first'])
    const second = new Blob(['second'])
    await act(() => pendingDocuments[1]({ source: 'api', blob: second, filename: 'second.pdf' }))
    await act(() => pendingDocuments[0]({ source: 'api', blob: first, filename: 'first.pdf' }))
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(first, 'first.pdf')
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(second, 'second.pdf')
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledTimes(2)
  })

  it('ignores a late Blanket OIC document preview response after changing permits', async () => {
    configureBlanketOicDocument()
    let resolveDocument!: (value: Awaited<ReturnType<typeof openPermitDocument>>) => void
    mockedOpenPermitDocument.mockReturnValue(
      new Promise((resolve) => {
        resolveDocument = resolve
      }),
    )
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(previewWindow.opener).toBeNull()
    expect(openDocumentPreview).not.toHaveBeenCalled()
    mockedFetchProvincialPermitDetail.mockResolvedValue({ ...permitDetail, permitNumber: 888 })
    await act(() => router.navigate('/provincial/permit/888'))
    await screen.findByRole('heading', { name: 'Permit 888' })
    expect(previewWindow.close).toHaveBeenCalledOnce()
    await act(() =>
      resolveDocument({ source: 'api', blob: new Blob(['test']), filename: 'previous.pdf' }),
    )
    expect(openDocumentPreview).not.toHaveBeenCalled()
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    expect(previewWindow.close).toHaveBeenCalledOnce()
  })

  it('keeps Blanket OIC document actions within their permissions', async () => {
    configureBlanketOicDocument()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
        canPerform: (action: string) =>
          action !== '/filePermitUpload' && action !== '/permitDetails',
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    expect(await screen.findByRole('button', { name: 'Open' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('downloads a permit document from the API response', async () => {
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '500',
          name: 'permit-doc.pdf',
          description: 'Test permit document',
          type: 'Invoice',
          typeCode: 'INV',
        },
      ],
      source: 'api',
    })
    const documentBlob = new Blob(['test'])
    mockedOpenPermitDocument.mockResolvedValue({
      source: 'api',
      blob: documentBlob,
      filename: 'permit-doc.pdf',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await screen.findByText('permit-doc.pdf')
    const downloadDocumentButton = await screen.findByRole('button', { name: 'Download' })
    await userEvent.click(downloadDocumentButton)

    await waitFor(() => {
      expect(mockedOpenPermitDocument).toHaveBeenCalledWith('500', 'permit-doc.pdf', '777')
    })
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(documentBlob, 'permit-doc.pdf')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('renders permit documents without source metadata or an inline filter', async () => {
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '501',
          name: 'visible-document.pdf',
          description: 'Visible document',
          type: 'Permit',
          typeCode: 'PER',
          source: 'legacy-source-only',
        },
        {
          id: '502',
          name: 'other-document.pdf',
          description: 'Other document',
          type: 'Permit',
          typeCode: 'PER',
          source: 'api',
        },
      ],
      source: 'api',
    })

    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    expect(await screen.findByText('visible-document.pdf')).toBeInTheDocument()
    expect(screen.getByText('other-document.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter document rows')).not.toBeInTheDocument()
  })

  it('removes invoice document rows and refreshes tables', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '500',
            name: 'permit-doc.pdf',
            description: 'Test permit document',
            type: 'Invoice',
            typeCode: 'INV',
          },
        ],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('permit-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)
    const confirmation = await screen.findByRole('dialog', { name: 'Delete invoice and document' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete permit-doc.pdf? This also deletes the associated invoice record, including its value, conversion rate, and fee. This cannot be undone.',
    )
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedRemovePermitInvoiceDocument).toHaveBeenCalledWith('500', '777')
      expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('permit-doc.pdf')).not.toBeInTheDocument()
    })
    const success = await screen.findByText('Document deleted')
    expect(success.closest('.cds--toast-notification')).toHaveClass(
      'cds--toast-notification--success',
    )
    expect(screen.getByText('permit-doc.pdf was deleted.')).toBeInTheDocument()
  })

  it('keeps refreshed permit documents visible when the independent invoice refresh fails', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '600',
            name: 'permit-only.pdf',
            description: 'Permit document',
            type: 'Permit',
            typeCode: 'PER',
          },
        ],
        source: 'api',
      })
      .mockResolvedValueOnce({ rows: [], source: 'api' })
    mockedFetchPermitInvoices.mockRejectedValueOnce(new Error('invoice lookup unavailable'))

    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete document' })).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => expect(mockedRemovePermitDocument).toHaveBeenCalledWith('600', '777'))
    expect(screen.queryByText('permit-only.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('permit-only.pdf was deleted.')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Permit documents unavailable' }),
    ).not.toBeInTheDocument()
  })

  it('keeps active invoice document delete independent from invoice upload permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileInvoiceUpload',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '501',
          name: 'locked-invoice-doc.pdf',
          description: 'Invoice controlled document',
          type: 'Invoice',
          typeCode: 'INV',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('locked-invoice-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeEnabled()
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
  })

  it('lets admin override a concurrent read-only role for active invoice document delete', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_ADMIN', 'LEXIS_READ_ONLY'] }),
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '504',
          name: 'admin-invoice-doc.pdf',
          description: 'Admin controlled invoice',
          type: 'Invoice',
          typeCode: 'INV',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('admin-invoice-doc.pdf')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('lets application approvers override a concurrent read-only role for active invoice document delete', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_APPLICATION_APPROVER', 'LEXIS_READ_ONLY'],
        }),
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '505',
          name: 'approver-invoice-doc.pdf',
          description: 'Approver controlled invoice',
          type: 'Invoice',
          typeCode: 'INV',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('approver-invoice-doc.pdf')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('disables invoice document delete outside active permit status', async () => {
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '502',
          name: 'complete-invoice-doc.pdf',
          description: 'Completed permit invoice',
          type: 'Invoice',
          typeCode: 'INV',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('complete-invoice-doc.pdf')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('disables active permit document delete for read-only users', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_READ_ONLY'] }),
        canPerform: () => true,
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '503',
          name: 'readonly-permit-doc.pdf',
          description: 'Read-only permit',
          type: 'Permit',
          typeCode: 'PER',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await screen.findByText('readonly-permit-doc.pdf')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('allows scoped submitters with a concurrent read-only role to delete active permit documents without upload access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00067890', 'LEXIS_READ_ONLY'],
        }),
        canPerform: (action: string) => action === '/permitDetails',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '504',
          name: 'submitter-permit-doc.pdf',
          description: 'Scoped submitter document',
          type: 'Permit',
          typeCode: 'PER',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    await enterPermitDocumentEditMode()
    await screen.findByText('submitter-permit-doc.pdf')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Delete document' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete submitter-permit-doc.pdf? This cannot be undone.',
    )
    expect(confirmation).not.toHaveTextContent('invoice record')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(mockedRemovePermitDocument).not.toHaveBeenCalled()
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
  })

  it('keeps documents with unknown authoritative source read-only', async () => {
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '505',
          name: 'unknown-source.pdf',
          description: 'Source metadata mismatch',
          type: 'Unknown',
          typeCode: 'OTHER',
          source: 'unknown',
          deletable: false,
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    const documentRow = (await screen.findByText('unknown-source.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getAllByText('Unknown')).toHaveLength(1)
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
    expect(mockedRemovePermitDocument).not.toHaveBeenCalled()
  })

  it('keeps application-linked child documents read-only', async () => {
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [
        {
          id: '7777',
          name: 'application-doc.pdf',
          description: 'Linked application document',
          type: 'Application',
          typeCode: 'INS',
          source: 'application',
          deletable: false,
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    const documentRow = (await screen.findByText('application-doc.pdf')).closest('tr')
    expect(documentRow).toBeTruthy()
    expect(within(documentRow as HTMLElement).getAllByText('Application')).toHaveLength(1)
    expect(
      within(documentRow as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
    expect(mockedRemovePermitApplicationDocument).not.toHaveBeenCalled()
    expect(mockedRemovePermitDocument).not.toHaveBeenCalled()
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
  })

  it('shows detail error contract when permit detail endpoint fails', async () => {
    mockedFetchProvincialPermitDetail.mockRejectedValue(new Error('backend down'))

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Unable to retrieve provincial permit detail.', {
        selector: '.detail-page-inline-error',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).not.toHaveBeenCalled()
    expect(mockedFetchPermitDocuments).not.toHaveBeenCalled()
    expect(mockedFetchPermitInvoices).not.toHaveBeenCalled()
  })

  it('keeps permit table tabs available and distinguishes lookup failure from empty data', async () => {
    mockedFetchProvincialPermitDetailTabs.mockRejectedValue(new Error('tables unavailable'))

    render(
      <MemoryRouter initialEntries={['/provincial/permit/777']}>
        <Routes>
          <Route
            path="/provincial/permit/:permitNumber"
            element={<ProvincialPermitDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectPermitDetailTab('Items')
    expect(screen.getByRole('heading', { level: 2, name: 'Permit items' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: false,
    })
    expect(screen.getByText('Permit items unavailable')).toBeInTheDocument()
    expect(screen.getAllByText('Unable to retrieve permit table details.')).toHaveLength(3)
    expect(screen.queryByLabelText('Filter item rows')).not.toBeInTheDocument()

    await selectPermitDetailTab('Permit')
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Unavailable')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Unavailable')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('Unavailable')
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()
  })

  it('hides Blanket OIC table mutations when permit table details are unavailable', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
    })
    mockedFetchProvincialPermitDetailTabs.mockRejectedValue(new Error('tables unavailable'))

    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    expect(await screen.findByText('Scale unavailable')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Create Blanket OIC package' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })
})
