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
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type * as SearchOptionsConstants from '@/constants/search-options'
import { SEARCH_OPTIONS_UNAVAILABLE_MESSAGE } from '@/constants/search-options'
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
  updatePermitApplications,
  updatePermitScaleAttachment,
  updatePermitScaleSelection,
  type PermitAvailableApplicationItem,
  type ProvincialPermitDetailTabsData,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  fetchPermitApprovalEmailDefault,
  fetchPermitFeeOverrideContext,
  fetchPermitDocuments,
  fetchPermitReviewRequestEmailDefaults,
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
  fetchApplicationClientLocations,
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
    applicationTotals: [],
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
  updatePermitApplications: vi.fn(),
  updatePermitScaleAttachment: vi.fn(),
  updatePermitScaleSelection: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  fetchPermitApprovalEmailDefault: vi.fn(),
  fetchPermitFeeOverrideContext: vi.fn(),
  fetchPermitDocuments: vi.fn(),
  fetchPermitReviewRequestEmailDefaults: vi.fn(),
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
  fetchApplicationClientLocations: vi.fn(),
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

vi.mock('@/service/search-options-service', async () => ({
  SEARCH_OPTIONS_UNAVAILABLE_MESSAGE: (
    await vi.importActual<typeof SearchOptionsConstants>('@/constants/search-options')
  ).SEARCH_OPTIONS_UNAVAILABLE_MESSAGE,
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
    selectedClientName,
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
    selectedClientName?: string
  }) => (
    <div>
      <label htmlFor={id}>{labelText}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-counterparty-client-number={counterpartyClientNumber ?? ''}
        data-selected-client-name={selectedClientName ?? ''}
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
const mockedUpdatePermitScaleSelection = vi.mocked(updatePermitScaleSelection)
const mockedUpdatePermitScaleAttachment = vi.mocked(updatePermitScaleAttachment)
const mockedFetchAvailablePermitApplications = vi.mocked(fetchAvailablePermitApplications)
const mockedAddApplicationsToPermit = vi.mocked(addApplicationsToPermit)
const mockedRemoveApplicationFromPermit = vi.mocked(removeApplicationFromPermit)
const mockedUpdatePermitApplications = vi.mocked(updatePermitApplications)
const mockedAddBlanketOicPackage = vi.mocked(addBlanketOicPackage)
const mockedUpdateBlanketOicPackage = vi.mocked(updateBlanketOicPackage)
const mockedDeleteBlanketOicPackage = vi.mocked(deleteBlanketOicPackage)
const mockedFetchBlanketOicPackageEditContext = vi.mocked(fetchBlanketOicPackageEditContext)
const mockedAddBlanketOicScale = vi.mocked(addBlanketOicScale)
const mockedDeleteBlanketOicScale = vi.mocked(deleteBlanketOicScale)
const mockedFetchPermitApprovalEmailDefault = vi.mocked(fetchPermitApprovalEmailDefault)
const mockedFetchPermitFeeOverrideContext = vi.mocked(fetchPermitFeeOverrideContext)
const mockedFetchPermitDocuments = vi.mocked(fetchPermitDocuments)
const mockedFetchPermitReviewRequestEmailDefaults = vi.mocked(fetchPermitReviewRequestEmailDefaults)
const mockedOpenPermitDocument = vi.mocked(openPermitDocument)
const mockedRemovePermitApplicationDocument = vi.mocked(removePermitApplicationDocument)
const mockedRemovePermitDocument = vi.mocked(removePermitDocument)
const mockedRemovePermitInvoiceDocument = vi.mocked(removePermitInvoiceDocument)
const mockedSendPermitApprovalEmail = vi.mocked(sendPermitApprovalEmail)
const mockedSendPermitReviewRequestEmail = vi.mocked(sendPermitReviewRequestEmail)
const mockedUpdatePermitDetail = vi.mocked(updatePermitDetail)
const mockedUpdatePermitShipping = vi.mocked(updatePermitShipping)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationClientLocations = vi.mocked(fetchApplicationClientLocations)
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
  applicationTotals: [],
  packages: [],
  items: [],
  fees: [],
  packageFeeSummaries: [],
  totalFeeVolume: null,
  gbmsEvents: [],
  oicItems: [],
  boicItems: [],
}

// Tabs for a permit with an application on it, so its Scale and Fees tabs aren't empty.
const tabsWithApplication: ProvincialPermitDetailTabsData = {
  ...tabsResult,
  applications: ['1000456'],
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
    totalFeeForPackage: null,
  })),
  fees: calculatedPermitFees.fees.map((row) => ({
    ...row,
    ewb: '',
    filPercent: '',
    mfPercent: '',
    amount: 0,
    amountDisplay: '',
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

// The Fee column is the last cell of a fee row.
const feeAmountCell = (row: HTMLElement) => within(row).getAllByRole('cell').at(-1) as HTMLElement

// A section's result shows inside that section's card, after the card title.
const expectResultInCard = (message: string, cardTitle: string) => {
  const notice = screen.getByText(message).closest('.app-notification-container') as HTMLElement
  const card = notice.closest<HTMLElement>('.cds--tile')
  expect(card).not.toBeNull()
  const title = within(card as HTMLElement).getByRole('heading', { name: cardTitle })
  expect(title.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

// Scale rows have Delete actions too, so document actions are found inside the Documents tab.
const getDocumentsSection = () => screen.getByRole('region', { name: 'Documents' })
const findDocumentsSection = () => screen.findByRole('region', { name: 'Documents' })

// Documents have no edit mode: their actions show whenever the user may use them.
const enterPermitDocumentEditMode = async (): Promise<void> => {
  await waitFor(() => expect(document.querySelector('.detail-documents-section')).not.toBeNull())
}

// The package panel's End use and Age class are Dropdowns: click, then choose the option.
const chooseDropdownOption = async (dropdown: HTMLElement, optionName: string) => {
  await userEvent.click(dropdown)
  await userEvent.click(await screen.findByRole('option', { name: optionName }))
}

// A package Dropdown shows the selected package as its button text.
const selectedDropdownText = (dropdown: HTMLElement): string =>
  dropdown.querySelector('.cds--list-box__label')?.textContent ?? ''

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
  remainingVolume: '2.0',
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

const saveCompletedPermitRemarks = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
  await userEvent.clear(screen.getByLabelText('Remarks'))
  await userEvent.type(screen.getByLabelText('Remarks'), 'updated remarks')
  await userEvent.click(screen.getByRole('button', { name: /^Save (?:permit|changes)$/ }))
}

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

const ministerialApplicationTotals = {
  '101103': { applicationNumber: '101103', pieces: 2515, volume: 847.7 },
  '101104': { applicationNumber: '101104', pieces: 58, volume: 70.7 },
}

// Tabs for a Ministerial permit with these applications on it, with their totals on the permit.
const ministerialTabsWith = (
  ...applicationNumbers: Array<keyof typeof ministerialApplicationTotals>
): ProvincialPermitDetailTabsData => ({
  ...tabsResult,
  applications: applicationNumbers,
  applicationTotals: applicationNumbers.map((number) => ministerialApplicationTotals[number]),
})

// The applications a Ministerial permit can add, as the available application list returns them.
const availableApplications = (
  ...items: Array<Partial<PermitAvailableApplicationItem> & { applicationNumber: string }>
) => {
  const applicationItems = items.map((item) => ({
    disabled: false,
    disabledReason: '',
    unassignedPieces: null,
    unassignedVolume: null,
    ...item,
  }))
  return {
    applicationList: applicationItems
      .filter((item) => !item.disabled)
      .map((item) => item.applicationNumber),
    applicationItems,
    errorMessage: '',
  }
}

const getApplicationTable = () => screen.getByRole('region', { name: 'Application number(s)' })
const findApplicationTable = () => screen.findByRole('region', { name: 'Application number(s)' })
const applicationRowNumbers = () =>
  within(getApplicationTable())
    .getAllByRole('link')
    .map((link) => link.textContent)
const applicationRow = (applicationNumber: string) =>
  within(getApplicationTable())
    .getByRole('link', { name: applicationNumber })
    .closest('tr') as HTMLElement
const includeApplication = (applicationNumber: string) =>
  screen.getByRole('checkbox', { name: `Include application ${applicationNumber} in permit` })
// A read-only field's value, found by its label.
const permitFieldValue = (label: string) =>
  screen.getByText(label).parentElement?.querySelector('dd')

const findBlanketOicPackageCard = async (packageNumber = 'BOIC-9') => {
  const title = `Package ${packageNumber.replace(/\s+$/, (spaces) => ` (${spaces.length} trailing space${spaces.length === 1 ? '' : 's'})`)}`
  const heading = await screen.findByRole('heading', { name: title })
  const card = heading.closest('.detail-section-card')
  expect(card).toBeTruthy()
  return card as HTMLElement
}

const getActiveSectionSaveButton = () =>
  within(screen.getByRole('tabpanel')).getByRole('button', {
    name: /^Save (?:changes|permit|shipping)$/,
  })

const openBlanketOicPackageDeleteConfirmation = async () => {
  await selectPermitDetailTab('Items')
  const packageCard = await findBlanketOicPackageCard()
  const deleteButton = within(packageCard).getByRole('button', { name: 'Delete package' })
  await waitFor(() => expect(deleteButton).toBeEnabled())
  await userEvent.click(deleteButton)
  return screen.findByRole('dialog', { name: 'Are you sure you want to delete this package?' })
}

describe('Provincial Permit Detail Action Smoke', () => {
  let previewWindow: Window
  it.each([
    { tab: 'Permit', edit: /Edit permit(?: details)?/, save: /^Save (permit|changes)$/ },
    { tab: 'Applicant', edit: /Edit applicant(?: details)?/, save: /^Save (permit|changes)$/ },
    { tab: 'Shipping', edit: /Edit shipping(?: details)?/, save: /^Save (shipping|changes)$/ },
  ])('closes unchanged $tab editing without any permit mutation', async ({ tab, edit, save }) => {
    if (tab === 'Applicant') configureMinisterialActivePermit()
    else configureActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab(tab)
    const launcher = await screen.findByRole('button', { name: edit })
    await userEvent.click(launcher)
    await waitFor(() =>
      expect(screen.queryByText('Loading client locations…')).not.toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: save }))
    await waitFor(() => expect(screen.getByRole('button', { name: edit })).toHaveFocus())
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(screen.queryByText('Permit details updated.')).not.toBeInTheDocument()
  })

  it('closes unchanged receipt editing without updating the permit', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit receipt number' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit receipt number' })).toHaveFocus(),
    )
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
  })

  it('shows a saved receipt number in the Fees tab and returns focus to its Edit button', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit receipt number' }))
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await userEvent.type(screen.getByLabelText('Receipt number'), 'R-2026-10-14')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const notice = (await screen.findByText('Receipt number saved.')).closest(
      '.cds--inline-notification',
    ) as HTMLElement
    expect(notice).toHaveClass('cds--inline-notification--success')
    expect(notice.closest('[role="tabpanel"]')).toBe(screen.getByRole('tabpanel', { name: 'Fees' }))
    expectResultInCard('Receipt number saved.', 'Permit fees')
    expect(screen.queryByText('Permit details saved.')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit receipt number' })).toHaveFocus(),
    )
  })

  it.each([
    {
      section: 'Permit details',
      tab: 'Permit',
      card: 'Permit summary',
      ministerial: false,
      change: async () => {
        await userEvent.click(
          await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
        )
        await userEvent.clear(screen.getByLabelText('Remarks'))
        await userEvent.type(screen.getByLabelText('Remarks'), 'test-2026-10-14')
      },
    },
    {
      section: 'Applicant details',
      tab: 'Applicant',
      card: 'Applicant details',
      ministerial: true,
      change: async () => {
        await userEvent.click(
          await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
        )
        const location = screen.getByLabelText('Client location', {
          selector: '#permit-ownerClientLocation',
        })
        await waitFor(() => expect(location).toBeEnabled())
        await userEvent.selectOptions(location, '04')
      },
    },
    {
      section: 'Shipping details',
      tab: 'Shipping',
      card: 'Shipping',
      ministerial: false,
      change: async () => {
        await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
        await userEvent.clear(screen.getByLabelText('Purchaser'))
        await userEvent.type(screen.getByLabelText('Purchaser'), 'test-2026-10-14')
      },
    },
    {
      section: 'Receipt number',
      tab: 'Fees',
      card: 'Permit fees',
      ministerial: true,
      change: async () => {
        await userEvent.click(await screen.findByRole('button', { name: 'Edit receipt number' }))
        await userEvent.clear(screen.getByLabelText('Receipt number'))
        await userEvent.type(screen.getByLabelText('Receipt number'), 'R-2026-10-14')
      },
    },
    {
      section: 'Fee override',
      tab: 'Fees',
      card: 'Fee calculation details',
      ministerial: false,
      change: async () => {
        await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
        await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
        await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
      },
    },
  ])(
    'shows a rejected $section save in the $tab tab and keeps the form open',
    async ({ section, tab, card, ministerial, change }) => {
      if (ministerial) configureMinisterialActivePermit()
      else configureActivePermit()
      const rejection = {
        success: false,
        message: '',
        errors: [
          'The test-2026-10-14 change was rejected.',
          'Check the saved details before trying again.',
        ],
        warnings: [],
        source: 'api' as const,
      }
      mockedUpdatePermitDetail.mockResolvedValue(rejection)
      mockedUpdatePermitShipping.mockResolvedValue(rejection)
      renderPermitDetails()
      await selectPermitDetailTab(tab)
      await change()
      await userEvent.click(
        screen.getByRole('button', { name: /^Save (?:changes|permit|shipping|fee override)$/ }),
      )

      const notice = (await screen.findByText(`${section} not saved.`)).closest(
        '.cds--inline-notification',
      ) as HTMLElement
      expect(notice).toHaveClass('cds--inline-notification--error')
      expect(notice).toHaveTextContent('The test-2026-10-14 change was rejected.')
      expect(notice).toHaveTextContent('Check the saved details before trying again.')
      expect(notice.closest('[role="tabpanel"]')).toBe(screen.getByRole('tabpanel', { name: tab }))
      expectResultInCard(`${section} not saved.`, card)
      expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^Save (?:changes|permit|shipping|fee override)$/ }),
      ).toBeInTheDocument()

      // Discarding the draft also clears the failed save's notice.
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
      await userEvent.click(within(discard).getByRole('button', { name: 'Discard changes' }))
      expect(screen.queryByText(`${section} not saved.`)).not.toBeInTheDocument()
    },
  )

  it('focuses a failed Shipping save without discarding the draft', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    try {
      configureActivePermit()
      mockedUpdatePermitShipping.mockRejectedValueOnce(new Error('unavailable'))
      renderPermitDetails()
      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
      fireEvent.change(screen.getByLabelText('Purchaser'), { target: { value: 'Draft purchaser' } })
      await userEvent.click(getActiveSectionSaveButton())
      const notice = (await screen.findByText('Shipping details not saved.')).closest(
        '.app-inline-notification',
      )
      await waitFor(() => expect(notice).toHaveFocus())
      expect(screen.getByLabelText('Purchaser')).toHaveValue('Draft purchaser')
    } finally {
      visibleRects.mockRestore()
    }
  })

  it('closes unchanged fee override editing without rounding or updating its saved value', async () => {
    configureActivePermit()
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '25.005',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
      interior: true,
    })
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit fee override' })).toHaveFocus(),
    )
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Override fee (CAD)')).toHaveValue('25.005')
  })

  it('closes unchanged Blanket OIC package editing without normalizing its saved precision', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchBlanketOicPackageEditContext.mockResolvedValue({
      packageNumber: 'BOIC-9',
      volume: '120.55',
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
    renderPermitDetails()
    await selectPermitDetailTab('Items')
    const card = await findBlanketOicPackageCard()
    await userEvent.click(within(card).getByRole('button', { name: 'Edit package' }))
    const panel = within(await screen.findByRole('complementary', { name: 'Edit package' }))
    await waitFor(() => expect(panel.getByLabelText('Volume (m³)')).toHaveValue('120.55'))
    await userEvent.click(panel.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Edit package' })).toHaveFocus(),
    )
    expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
    expect(screen.queryByRole('complementary', { name: 'Edit package' })).not.toBeInTheDocument()
  })

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
    mockedUpdatePermitScaleSelection.mockResolvedValue({
      success: true,
      message: 'Scale selection was saved.',
      errors: [],
      warnings: [],
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
    mockedUpdatePermitApplications.mockResolvedValue({
      success: true,
      message: 'Application changes were saved.',
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
      interior: true,
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    // Editing looks clients up with the client in the other slot as the counterparty.
    mockedFetchApplicationClientData.mockImplementation(
      async (clientNumber, clientLocationCode, context) => {
        if (context && 'counterpartyClientNumber' in context) {
          return {
            clientNumber: clientNumber === '67890' ? '00067890' : clientNumber,
            companyName:
              clientLocationCode === '01' || clientLocationCode === '02' ? 'Agent Co' : 'Owner Co',
            clientAcronym: '',
            address:
              clientLocationCode === '01' || clientLocationCode === '02'
                ? '2 Agent St'
                : '1 Owner St',
            city:
              clientLocationCode === '01' || clientLocationCode === '02' ? 'Nanaimo' : 'Victoria',
            province: 'BC',
            postalCode:
              clientLocationCode === '01' || clientLocationCode === '02' ? 'V9R 1A1' : 'V8V 1A1',
            country: 'Canada',
            phone:
              clientLocationCode === '01' || clientLocationCode === '02'
                ? '2505553333'
                : '2505551111',
            fax: '',
            email:
              clientLocationCode === '01' || clientLocationCode === '02'
                ? 'agent@example.test'
                : 'owner@example.test',
            notfound: '',
          }
        }
        if (clientNumber === '00067890' && clientLocationCode === '03') {
          return {
            clientNumber,
            companyName: 'Owner Co',
            clientAcronym: '',
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
          clientAcronym: '',
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
    mockedFetchApplicationClientLocations.mockImplementation(async (clientNumber) =>
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
    mockedFetchPermitReviewRequestEmailDefaults.mockResolvedValue({
      regionalEmailAddress: 'region@example.test',
      copyToEmailAddress: 'agent@example.test',
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
    mockedFetchPermitApprovalEmailDefault.mockResolvedValue('owner@example.test')
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

  it('shows one decimal for the saved request volume and preserves its stored edit text', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicRequestVolume: 1,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Permit')
    const field = (await screen.findByText('Permit request volume (m³)')).closest('dl')
    expect(within(field as HTMLElement).getByText('1.0')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    expect(screen.getByRole('textbox', { name: 'Permit request volume (m³)' })).toHaveValue('1')
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
      'Scale',
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
      'Scale',
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
      within(pageHeader as HTMLElement).queryByText('Check and manage this provincial permit'),
    ).not.toBeInTheDocument()
    expect(within(pageHeader as HTMLElement).getByText(/^Author: /)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Permit search' })).toHaveAttribute(
      'href',
      '/provincial/permit',
    )
    expect(within(pageHeader as HTMLElement).getByText('Active')).toBeInTheDocument()
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
      within(permitSummaryTile as HTMLElement).queryByText('Package number(s)'),
    ).not.toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).queryByText('PKG-9')).not.toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByRole('link', { name: 'EX-9' }),
    ).toHaveAttribute('href', '/provincial/exemption/EX-9')
    expect(within(permitSummaryTile as HTMLElement).getByText('Submit date')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).queryByText('Received date'),
    ).not.toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getAllByText('Apr 10, 2026')).toHaveLength(1)
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
    expect(within(permitFinancialTile as HTMLElement).getByText('250.0')).toBeInTheDocument()
    expect(within(permitFinancialTile as HTMLElement).getByText('130.0')).toBeInTheDocument()
    expect(within(permitFinancialTile as HTMLElement).getByText('120.0')).toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Permit request pieces'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Permit request volume (m³)'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Agent client number'),
    ).not.toBeInTheDocument()
    expect(
      within(permitFinancialTile as HTMLElement).queryByText('Federal permit number'),
    ).not.toBeInTheDocument()
    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co · 00067890')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByText('(250) 555-1111')).toBeInTheDocument()
    expect(screen.queryByText('2505551111')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('Agent Co · 00012345')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
    expect(screen.getByText('(250) 555-3333')).toBeInTheDocument()
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
    // The tab and its card title carry the same icon.
    expect(screen.getByRole('tab', { name: 'GBMS' }).querySelector('svg')).not.toBeNull()
    expect(
      screen.getByRole('heading', { name: 'GBMS invoice history' }).querySelector('svg'),
    ).not.toBeNull()
    expect(screen.getByRole('cell', { name: 'A006654' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A007321' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A007322' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$1,939.50' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'May 6, 2020' })).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'Feb 15, 2022' })).toBeInTheDocument()
  }, 15000)

  it('shows empty GBMS invoice cells as not provided', async () => {
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([
      {
        ...gbmsHistoryRow,
        cancelledByInvoice: '',
        replacedByInvoice: '',
        invoiceAmount: '',
        printedDate: '',
      },
    ])
    renderPermitDetails()

    await selectPermitDetailTab('GBMS')
    const table = await screen.findByRole('region', { name: 'GBMS invoice history' })
    const cells = within(table).getAllByRole('cell')

    expect(cells.map((cell) => cell.textContent)).toEqual([
      'A006654',
      '—Not provided',
      '—Not provided',
      '—Not provided',
      '—Not provided',
      'May 6, 2020',
      'Feb 15, 2022',
    ])
  })

  it('shows a one-time success on the saved Blanket OIC permit without losing navigation state', async () => {
    configureEditableBlanketOicPackage()
    const retainedState = {
      source: 'permit-create',
      lexisDetailTab: 'permit',
      returnTo: {
        label: 'Exemption EX-9',
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

    const success = await screen.findByText('The permit was saved.')
    expect(success.closest('.cds--inline-notification')).toHaveClass(
      'cds--inline-notification--success',
    )
    // The design shows the confirmation as the title alone.
    expect(screen.getAllByText('The permit was saved.')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
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
    await waitFor(() => expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument())
    view.rerender(<RouterProvider router={router} />)
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
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
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
  })

  it('replaces the permit creation notice with a later action result without resurfacing it', async () => {
    configureEditableBlanketOicPackage()
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      {
        initialEntries: [
          {
            pathname: '/provincial/permit/777',
            state: { blanketOicPermitCreated: '777' },
          },
        ],
      },
    )
    const view = render(<RouterProvider router={router} />)

    expect(await screen.findByText('The permit was saved.')).toBeInTheDocument()
    const dialog = await openBlanketOicPackageDeleteConfirmation()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    const latestAction = await screen.findByText('Package deleted.')
    expect(latestAction).toBeVisible()
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'close notification' })).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    expect(screen.queryByText('Package deleted.')).not.toBeInTheDocument()
    view.rerender(<RouterProvider router={router} />)
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
  })

  it('shows Blanket OIC creation success once the exemption context identifies the permit', async () => {
    configureEditableBlanketOicPackage()
    // The permit endpoint omits exemption context, so Blanket OIC is only known after it loads.
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      exemptionNumber: 'BOIC-1',
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      approvedExemptionVolume: null,
      exemptionVolumeRemaining: null,
      exemptionTypeDescription: null,
      blanketOic: false,
    })
    let resolveExemptionContext!: (
      value: Awaited<ReturnType<typeof fetchProvincialPermitExemptionContext>>,
    ) => void
    mockedFetchProvincialPermitExemptionContext.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExemptionContext = resolve
      }),
    )
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      {
        initialEntries: [
          { pathname: '/provincial/permit/777', state: { blanketOicPermitCreated: '777' } },
        ],
      },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: /Permit 777/ })).toBeInTheDocument()
    await waitFor(() => expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalled())
    // The signal must survive the partial detail instead of being consumed without a notice.
    expect(router.state.location.state).toEqual({ blanketOicPermitCreated: '777' })

    await act(async () =>
      resolveExemptionContext({
        approvedExemptionVolume: 250,
        exemptionVolumeRemaining: 130,
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
      }),
    )
    expect(await screen.findByText('The permit was saved.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toEqual({}))
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
    expect(await screen.findByText('The permit was saved.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toEqual({}))

    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitNumber: 888,
      blanketOic: true,
      exemptionTypeDescription: 'Blanket OIC',
    })
    await act(() => router.navigate('/provincial/permit/888'))
    expect(await screen.findByRole('heading', { name: 'Permit 888' })).toBeInTheDocument()
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()

    configureEditableBlanketOicPackage()
    await act(() => router.navigate(-1))
    expect(
      await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Permit 777 (Pending)' })).toBeInTheDocument()
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
  })

  it('focuses the page title when a permit opens from a link', async () => {
    renderPermitDetails()

    const heading = await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('does not carry an action failure to another permit', async () => {
    mockedRunReport.mockRejectedValueOnce(new Error('Report unavailable'))
    const router = createMemoryRouter(
      [{ path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> }],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Print permit' }))
    expect(await screen.findByText('Unable to generate permit report.')).toBeInTheDocument()

    mockedFetchProvincialPermitDetail.mockResolvedValue({ ...permitDetail, permitNumber: 888 })
    await act(() => router.navigate('/provincial/permit/888'))
    expect(await screen.findByRole('heading', { name: /Permit 888/ })).toBeInTheDocument()
    expect(screen.queryByText('Unable to generate permit report.')).not.toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
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
    expect(screen.queryByText('The permit was saved.')).not.toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
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

    const applicantLocation = screen.getByLabelText('Client location', {
      selector: '#permit-ownerClientLocation',
    })
    const agentLocation = screen.getByLabelText('Agent client location', {
      selector: '#permit-agentClientLocation',
    })
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
    expect(await screen.findByText('Applicant details saved.')).toBeInTheDocument()
    expectResultInCard('Applicant details saved.', 'Applicant details')
  })

  it.each([
    { user: 'an Administrator', readOnly: false },
    { user: 'a Read Only user', readOnly: true },
  ])(
    'lists the applications on a Ministerial permit with their pieces and volume for $user',
    async ({ readOnly }) => {
      configureMinisterialActivePermit()
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue(
        ministerialTabsWith('101104', '101103'),
      )
      if (readOnly) {
        mockedUseAuth.mockReturnValue(
          createTestAuthContext({ canPerform: (action: string) => action === '/permitDetails' }),
        )
      }
      renderPermitDetails()

      const table = await findApplicationTable()
      const block = table.closest('.ministerial-permit-details__applications') as HTMLElement
      expect(within(block).getByText('Application number(s)')).toHaveClass('detail-field-label')
      expect(applicationRowNumbers()).toEqual(['101103', '101104'])
      expect(within(table).getByRole('link', { name: '101103' })).toHaveAttribute(
        'href',
        '/provincial/application/101103',
      )
      expect(within(applicationRow('101103')).getByText('2,515')).toBeInTheDocument()
      expect(within(applicationRow('101103')).getByText('847.7')).toBeInTheDocument()
      expect(within(applicationRow('101104')).getByText('58')).toBeInTheDocument()
      expect(within(applicationRow('101104')).getByText('70.7')).toBeInTheDocument()
      for (const name of ['Application number', 'Pieces', 'Volume (m³)']) {
        expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument()
      }
      expect(
        within(table).queryByRole('columnheader', { name: 'Include in permit' }),
      ).not.toBeInTheDocument()
      expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
      expect(screen.queryByText('Included applications')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Applications' })).not.toBeInTheDocument()
      expect(!screen.queryByRole('button', { name: 'Edit permit details' })).toBe(readOnly)
      expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
    },
  )

  it('shows the empty value for a Ministerial permit with no applications', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()

    const label = await screen.findByText('Application number(s)')
    const block = label.closest('.ministerial-permit-details__applications') as HTMLElement
    expect(await within(block).findByText('Not provided')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Application number(s)' })).not.toBeInTheDocument()
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
  })

  it('lists the applications on the permit ticked and the candidates unticked in edit mode', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(ministerialTabsWith('101104'))
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications(
        { applicationNumber: '101105' },
        { applicationNumber: '101103', unassignedPieces: 2515, unassignedVolume: 847.7 },
        {
          applicationNumber: '101102',
          disabled: true,
          disabledReason: 'This application is already attached to another permit.',
          unassignedPieces: 3,
          unassignedVolume: 4.5,
        },
      ),
    )
    renderPermitDetails()
    await findApplicationTable()
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))

    expect(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    ).not.toBeChecked()
    expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-9', ['101104'])
    expect(applicationRowNumbers()).toEqual(['101102', '101103', '101104', '101105'])
    expect(includeApplication('101104')).toBeChecked()
    expect(includeApplication('101105')).not.toBeChecked()
    expect(
      within(getApplicationTable()).getByRole('columnheader', { name: 'Include in permit' }),
    ).toBeInTheDocument()
    // An application on the permit shows its totals on the permit; a candidate shows what adding
    // it attaches.
    expect(within(applicationRow('101104')).getByText('58')).toBeInTheDocument()
    expect(within(applicationRow('101104')).getByText('70.7')).toBeInTheDocument()
    expect(within(applicationRow('101103')).getByText('2,515')).toBeInTheDocument()
    expect(within(applicationRow('101105')).getAllByText('Not provided')).toHaveLength(2)

    const blocked = includeApplication('101102')
    expect(blocked).toBeDisabled()
    expect(within(applicationRow('101102')).getByRole('link', { name: '101102' })).toHaveAttribute(
      'href',
      '/provincial/application/101102',
    )
    await userEvent.hover(blocked.closest('.disabled-button-tooltip') as HTMLElement)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This application is already attached to another permit.',
    )

    const card = getApplicationTable().closest('.cds--tile') as HTMLElement
    expect(within(card).getAllByRole('table')).toHaveLength(1)
    expect(screen.queryByText(/choose Add application/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
  })

  it('moves the current permit totals with the ticks and sends nothing until Save', async () => {
    configureMinisterialActivePermit({
      numberOfPieces: 0,
      permitVolume: 0,
      exemptionVolumeRemaining: 918.4,
    })
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications(
        { applicationNumber: '101103', unassignedPieces: 2515, unassignedVolume: 847.7 },
        { applicationNumber: '101104', unassignedPieces: 58, unassignedVolume: 70.7 },
      ),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent('2515')
    expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('847.7')

    await userEvent.click(includeApplication('101104'))
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent('2573')
    expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('918.4')
    expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('918.4')

    await userEvent.click(includeApplication('101103'))
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^58$/)
    expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('70.7')
    expect(within(applicationRow('101103')).getByText('2,515')).toBeInTheDocument()
    expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('918.4')
    expect(mockedUpdatePermitApplications).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('saves only the application changes in one request and returns focus to Edit permit details', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    onTestFinished(() => visibleRects.mockRestore())
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce(ministerialTabsWith('101104'))
      .mockResolvedValue(ministerialTabsWith('101103'))
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: '101103',
        unassignedPieces: 2515,
        unassignedVolume: 847.7,
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    // Unticking an application on the permit asks nothing; Save applies it.
    await userEvent.click(includeApplication('101104'))
    expect(includeApplication('101104')).not.toBeChecked()
    expect(
      screen.queryByRole('dialog', { name: 'Remove associated application?' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    await userEvent.click(getActiveSectionSaveButton())

    const notice = (await screen.findByText('Permit details saved.')).closest(
      '.cds--inline-notification',
    )
    expect(notice).toHaveClass('cds--inline-notification--success')
    expectResultInCard('Permit details saved.', 'Permit details')
    expect(mockedUpdatePermitApplications).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitApplications).toHaveBeenCalledWith({
      permitNumber: '777',
      addedApplications: ['101103'],
      removedApplications: ['101104'],
    })
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit permit details' })).toHaveFocus(),
    )
    expect(applicationRowNumbers()).toEqual(['101103'])
    expect(within(getApplicationTable()).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('saves application changes before the other permit details, with the agent and totals they give the permit', async () => {
    const initialDetail = configureMinisterialActivePermit({ remarks: '' })
    const refreshedDetail: ProvincialPermitDetail = {
      ...initialDetail,
      numberOfPieces: 2515,
      permitVolume: 847.7,
      applicantClientNumber: '00012399',
      agentClientLocationCode: '05',
    }
    let applicationsSaved = false
    mockedFetchProvincialPermitDetail.mockImplementation(async () =>
      applicationsSaved ? refreshedDetail : initialDetail,
    )
    mockedUpdatePermitApplications.mockImplementationOnce(async () => {
      applicationsSaved = true
      return { success: true, message: 'Application changes were saved.', errors: [], warnings: [] }
    })
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: '101103',
        unassignedPieces: 2515,
        unassignedVolume: 847.7,
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'test-2026-10-20')
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitApplications.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitDetail.mock.invocationCallOrder[0],
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        permitRemarks: 'test-2026-10-20',
        ownerClientNumber: '00067890',
        ownerClientLocation: '03',
        agentClientNumber: '00012399',
        agentClientLocation: '05',
        permitTotalVolume: '847.7',
        permitNumberOfPieces: '2515',
      }),
    )
  })

  it('keeps the ticks and draft totals when the application save is refused', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    onTestFinished(() => visibleRects.mockRestore())
    configureMinisterialActivePermit({ numberOfPieces: 0, permitVolume: 0, remarks: '' })
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: '101103',
        unassignedPieces: 2515,
        unassignedVolume: 847.7,
      }),
    )
    mockedUpdatePermitApplications.mockResolvedValueOnce({
      success: false,
      message: '',
      errors: ['The added scales total 847.7 m³, but the exemption has 30.0 m³ remaining.'],
      warnings: [],
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'test-2026-10-20')
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    const notice = (await screen.findByText('Permit details not saved.')).closest(
      '.app-inline-notification',
    )
    expect(notice).toHaveTextContent(
      'The added scales total 847.7 m³, but the exemption has 30.0 m³ remaining.',
    )
    await waitFor(() => expect(notice).toHaveFocus())
    expectResultInCard('Permit details not saved.', 'Permit details')
    expect(includeApplication('101103')).toBeChecked()
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent('2515')
    expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('847.7')
    expect(screen.getByLabelText('Remarks')).toHaveValue('test-2026-10-20')
    expect(getActiveSectionSaveButton()).toBeEnabled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('says the application changes were saved when the rest of the permit is refused', async () => {
    configureMinisterialActivePermit({ remarks: '' })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce(tabsResult)
      .mockResolvedValue(ministerialTabsWith('101103'))
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: '101103',
        unassignedPieces: 2515,
        unassignedVolume: 847.7,
      }),
    )
    mockedUpdatePermitDetail.mockResolvedValueOnce({
      success: false,
      message: '',
      errors: ['The test-2026-10-20 change was rejected.'],
      warnings: [],
      source: 'api',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'test-2026-10-20')
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    const notice = (await screen.findByText('Permit details not saved.')).closest(
      '.cds--inline-notification',
    )
    expect(notice).toHaveClass('cds--inline-notification--error')
    expect(notice).toHaveTextContent(
      'Application changes were saved. The test-2026-10-20 change was rejected.',
    )
    expect(screen.getByLabelText('Remarks')).toHaveValue('test-2026-10-20')
    // The saved application is now on the permit, so the application draft is clean.
    await waitFor(() => expect(includeApplication('101103')).toBeChecked())

    await userEvent.click(getActiveSectionSaveButton())
    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitApplications).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(2)
  })

  it('shows a warning when an added application had nothing to attach', async () => {
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({ applicationNumber: '101105' }),
    )
    mockedUpdatePermitApplications.mockResolvedValueOnce({
      success: true,
      message: 'Application changes were saved.',
      errors: [],
      warnings: [
        'Application 101105 has no unassigned scale rows, so it was not added to the permit.',
      ],
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101105 in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    const notice = (
      await screen.findByText(
        'Application 101105 has no unassigned scale rows, so it was not added to the permit.',
      )
    ).closest('.cds--inline-notification')
    expect(notice).toHaveClass('cds--inline-notification--warning')
    expect(notice).toHaveTextContent('Permit details saved.')
  })

  it('asks before discarding changed ticks and restores the saved ticks and totals', async () => {
    configureMinisterialActivePermit({ numberOfPieces: 58, permitVolume: 70.7 })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(ministerialTabsWith('101104'))
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: '101103',
        unassignedPieces: 2515,
        unassignedVolume: 847.7,
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    await userEvent.click(includeApplication('101104'))
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent('2515')

    const cancel = () =>
      within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Cancel' })
    await userEvent.click(cancel())
    const keep = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(keep).getByRole('button', { name: 'Keep editing' }))
    expect(includeApplication('101103')).toBeChecked()
    expect(includeApplication('101104')).not.toBeChecked()
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent('2515')

    await userEvent.click(cancel())
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discard).getByRole('button', { name: 'Discard changes' }))
    expect(within(getApplicationTable()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(applicationRowNumbers()).toEqual(['101104'])
    expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^58$/)
    expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('70.7')

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    expect(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    ).not.toBeChecked()
    expect(includeApplication('101104')).toBeChecked()
    expect(mockedUpdatePermitApplications).not.toHaveBeenCalled()
  })

  it('asks before leaving the page with a changed tick', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(ministerialTabsWith('101104'))
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({ applicationNumber: '101103' }),
    )
    const router = createMemoryRouter(
      [
        { path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> },
        { path: '/provincial/application/:applicationNumber', element: <h1>Application</h1> },
      ],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await userEvent.click(within(getApplicationTable()).getByRole('link', { name: '101104' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/permit/777')
    expect(mockedUpdatePermitApplications).not.toHaveBeenCalled()
  })

  it('disables the ticks while the application changes save and sends one request for a second Save', async () => {
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({ applicationNumber: '101103' }, { applicationNumber: '101104' }),
    )
    let resolveSave!: (result: Awaited<ReturnType<typeof updatePermitApplications>>) => void
    mockedUpdatePermitApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    )
    const save = getActiveSectionSaveButton()
    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })
    expect(mockedUpdatePermitApplications).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(includeApplication('101104')).toBeDisabled())
    expect(includeApplication('101103')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

    await act(async () =>
      resolveSave({
        success: true,
        message: 'Application changes were saved.',
        errors: [],
        warnings: [],
      }),
    )
    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitApplications).toHaveBeenCalledTimes(1)
  })

  it('lists only the applications on a Payment pending permit and saves their removal', async () => {
    configureMinisterialActivePermit({
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(ministerialTabsWith('101103', '101104'))
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    expect(
      await screen.findByRole('checkbox', { name: 'Include application 101104 in permit' }),
    ).toBeChecked()
    expect(applicationRowNumbers()).toEqual(['101103', '101104'])
    await userEvent.click(includeApplication('101104'))
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() =>
      expect(mockedUpdatePermitApplications).toHaveBeenCalledWith({
        permitNumber: '777',
        addedApplications: [],
        removedApplications: ['101104'],
      }),
    )
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
  })

  it('keeps the Application number(s) table read-only when staff edit a Completed Ministerial permit', async () => {
    configureMinisterialActivePermit({
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(ministerialTabsWith('101103'))
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await waitFor(() => expect(getActiveSectionSaveButton()).toBeEnabled())
    expect(applicationRowNumbers()).toEqual(['101103'])
    expect(within(getApplicationTable()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'Include in permit' }),
    ).not.toBeInTheDocument()
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()
  })

  it("lists a new Ministerial permit's candidates unticked and saves applications, then shipping, then the permit", async () => {
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications(
        { applicationNumber: '101103', unassignedPieces: 2515, unassignedVolume: 847.7 },
        { applicationNumber: '101104', unassignedPieces: 58, unassignedVolume: 70.7 },
      ),
    )
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

    expect(
      await screen.findByRole('checkbox', { name: 'Include application 101103 in permit' }),
    ).not.toBeChecked()
    expect(includeApplication('101104')).not.toBeChecked()
    await userEvent.click(includeApplication('101103'))
    await selectPermitDetailTab('Shipping')
    await userEvent.clear(await screen.findByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'test-2026-10-20 purchaser')
    await selectPermitDetailTab('Permit')
    await userEvent.click(getActiveSectionSaveButton())

    expect(await screen.findByText('Permit and shipping details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitApplications).toHaveBeenCalledWith({
      permitNumber: '777',
      addedApplications: ['101103'],
      removedApplications: [],
    })
    expect(mockedUpdatePermitApplications.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitShipping.mock.invocationCallOrder[0],
    )
    expect(mockedUpdatePermitShipping.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdatePermitDetail.mock.invocationCallOrder[0],
    )
  })

  it('explains the empty scale, documents and fees of a Ministerial permit with no applications', async () => {
    configureMinisterialActivePermit({ receiptNumber: null })
    renderPermitDetails()

    await selectPermitDetailTab('Scale')
    const scaleEmptyState = (await screen.findByRole('heading', { name: 'No scale yet' })).closest(
      '.lexis-empty-state',
    )
    expect(scaleEmptyState?.closest('.cds--tile')).toBeNull()
    expect(scaleEmptyState).toHaveTextContent(
      'Scale comes from the applications selected for this permit. Select an application on the Permit tab.',
    )
    expect(scaleEmptyState?.querySelectorAll('.permit-empty-state__sentence')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Permit tab' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Permit' })).toHaveFocus())

    await selectPermitDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this permit' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Documents stay with the record as it moves through the application, exemption and permit stages.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add documents' })).toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    const feesEmptyState = (await screen.findByRole('heading', { name: 'No fees yet' })).closest(
      '.lexis-empty-state',
    )
    expect(feesEmptyState).toHaveClass('lexis-empty-state--tab')
    expect(feesEmptyState?.closest('.cds--tile')).toBeNull()
    expect(feesEmptyState).toHaveTextContent(
      "Fees are calculated from the permit's Summary of scale. They appear once an application is selected on the Permit tab.",
    )
    expect(feesEmptyState?.querySelectorAll('.permit-empty-state__sentence')).toHaveLength(2)
    expect(screen.queryByLabelText('Receipt number')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Permit fees' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Package fees' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Permit tab' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Permit' })).toHaveFocus())
  })

  it('explains the empty scale and fees of an ordinary OIC permit with no applications', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      receiptNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Scale')
    const scaleEmptyState = (await screen.findByRole('heading', { name: 'No scale yet' })).closest(
      '.lexis-empty-state',
    )
    expect(scaleEmptyState).toHaveTextContent(
      'Scale comes from the applications selected for this permit. Select an application on the Permit tab.',
    )
    expect(screen.queryByRole('heading', { name: 'No package details' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Permit tab' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')

    await selectPermitDetailTab('Fees')
    const feesEmptyState = (await screen.findByRole('heading', { name: 'No fees yet' })).closest(
      '.lexis-empty-state',
    )
    expect(feesEmptyState).toHaveTextContent(
      "Fees are calculated from the permit's Summary of scale. They appear once an application is selected on the Permit tab.",
    )
    expect(screen.queryByText('Fee calculation details')).not.toBeInTheDocument()
  })

  it('counts ordinary OIC permit remarks against 250 characters', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    expect(screen.getByLabelText('Remarks')).toHaveAttribute('maxlength', '250')
    expect(screen.getByText('2/250')).toBeVisible()
  })

  it('describes the ordinary OIC Purchaser as a company name', async () => {
    configureActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    expect(screen.getByLabelText('Purchaser')).toHaveAccessibleDescription('Company name')
  })

  it('shows a failed Ministerial application lookup once and retries only when requested', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureMinisterialActivePermit()
    mockedFetchAvailablePermitApplications
      .mockRejectedValueOnce(new Error('available applications unavailable'))
      .mockResolvedValueOnce(
        availableApplications({
          applicationNumber: 'APP-RETRY',
          unassignedPieces: 2,
          unassignedVolume: 3.5,
        }),
      )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    const unavailableState = (
      await screen.findByRole('heading', { name: 'Applications unavailable' })
    ).closest('.lexis-empty-state')
    expect(unavailableState).toBeTruthy()
    expect(unavailableState).toHaveTextContent('Applications could not be loaded. Try again.')
    expect(unavailableState).toHaveAttribute('role', 'alert')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Remarks')).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('link', { name: 'APP-RETRY' })).toBeInTheDocument()
    expect(includeApplication('APP-RETRY')).not.toBeChecked()

    consoleError.mockRestore()
  })

  it('refreshes the Ministerial totals and candidates after saving an application', async () => {
    const initialDetail = configureMinisterialActivePermit({
      receiptNumber: null,
      numberOfPieces: 0,
      permitVolume: 0,
    })
    const refreshedDetail = { ...initialDetail, numberOfPieces: 8, permitVolume: 12.5 }
    let applicationsSaved = false
    mockedFetchProvincialPermitDetail.mockImplementation(async () =>
      applicationsSaved ? refreshedDetail : initialDetail,
    )
    mockedUpdatePermitApplications.mockImplementationOnce(async () => {
      applicationsSaved = true
      return { success: true, message: 'Application changes were saved.', errors: [], warnings: [] }
    })
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 117.5,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValueOnce(tabsResult).mockResolvedValue({
      ...tabsResult,
      applications: ['APP-REFRESH'],
      applicationTotals: [{ applicationNumber: 'APP-REFRESH', pieces: 8, volume: 12.5 }],
    })
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: 'APP-REFRESH',
        unassignedPieces: 8,
        unassignedVolume: 12.5,
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    await waitFor(() => {
      expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^8$/)
      expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('12.5')
      expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('117.5')
    })
    expect(within(applicationRow('APP-REFRESH')).getByText('8')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    await waitFor(() =>
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', [
        'APP-REFRESH',
      ]),
    )
    expect(
      await screen.findByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    ).toBeChecked()
  })

  it('closes the edit card without an unsaved-changes prompt when saved application changes cannot refresh', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureMinisterialActivePermit({ receiptNumber: null, remarks: '' })
    mockedFetchProvincialPermitExemptionContext.mockRejectedValueOnce(
      new Error('exemption totals unavailable'),
    )
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: 'APP-REFRESH',
        unassignedPieces: 8,
        unassignedVolume: 12.5,
      }),
    )
    const router = createMemoryRouter(
      [
        { path: '/provincial/permit/:permitNumber', element: <ProvincialPermitDetailsPage /> },
        { path: '/provincial/exemption/:exemptionNumber', element: <h1>Exemption</h1> },
      ],
      { initialEntries: ['/provincial/permit/777'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Keep this draft remark')
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    )
    await userEvent.click(getActiveSectionSaveButton())

    const notice = await screen.findByText(
      'The current totals could not be refreshed. Other changes were not saved. Reload before making another change.',
    )
    expect(notice.closest('.cds--inline-notification')).toHaveClass(
      'cds--inline-notification--warning',
    )
    expect(notice.closest('.cds--inline-notification')).toHaveTextContent(
      'Application changes saved.',
    )
    expect(mockedUpdatePermitApplications).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Remarks')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Save (?:changes|permit|shipping)$/ }),
    ).not.toBeInTheDocument()

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    await userEvent.click(screen.getByRole('link', { name: 'EX-9' }))
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-9')
    consoleError.mockRestore()
  })

  it('refreshes the Ministerial remaining volume and candidates after removing an application', async () => {
    const initialDetail = configureMinisterialActivePermit({ receiptNumber: null })
    const refreshedDetail = { ...initialDetail, numberOfPieces: 0, permitVolume: 0 }
    let applicationsSaved = false
    mockedFetchProvincialPermitDetail.mockImplementation(async () =>
      applicationsSaved ? refreshedDetail : initialDetail,
    )
    mockedUpdatePermitApplications.mockImplementationOnce(async () => {
      applicationsSaved = true
      return { success: true, message: 'Application changes were saved.', errors: [], warnings: [] }
    })
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 372.6,
      exemptionTypeDescription: 'Ministerial',
      blanketOic: false,
    })
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        applications: ['APP-REFRESH'],
        applicationTotals: [{ applicationNumber: 'APP-REFRESH', pieces: 8, volume: 28.4 }],
      })
      .mockResolvedValue(tabsResult)
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: 'APP-REFRESH',
        unassignedPieces: 8,
        unassignedVolume: 28.4,
      }),
    )
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
    await waitFor(() =>
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-9', ['APP-REFRESH']),
    )
    const included = await screen.findByRole('checkbox', {
      name: 'Include application APP-REFRESH in permit',
    })
    expect(included).toBeChecked()
    expect(applicationRowNumbers()).toEqual(['APP-REFRESH'])
    await userEvent.click(included)
    await userEvent.click(getActiveSectionSaveButton())

    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitApplications).toHaveBeenCalledWith({
      permitNumber: '777',
      addedApplications: [],
      removedApplications: ['APP-REFRESH'],
    })
    await waitFor(() => {
      expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^0$/)
      expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('0')
      expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('372.6')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    await waitFor(() =>
      expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', []),
    )
    expect(
      await screen.findByRole('checkbox', { name: 'Include application APP-REFRESH in permit' }),
    ).not.toBeChecked()
    expect(within(applicationRow('APP-REFRESH')).getByText('28.4')).toBeInTheDocument()
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

  it('shows all associated application numbers and no package numbers in the permit summary', async () => {
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
    expect(within(permitSummaryTile).queryByText('Package number(s)')).not.toBeInTheDocument()
    expect(within(permitSummaryTile).queryByText('PKG-9, PKG-10')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    const permitSummaryEditor = screen
      .getByRole('heading', { name: 'Permit summary' })
      .closest('.cds--tile') as HTMLElement
    expect(within(permitSummaryEditor).getByText('1000456, 1000457')).toBeInTheDocument()
    expect(within(permitSummaryEditor).queryByText('Package number(s)')).not.toBeInTheDocument()
    expect(within(permitSummaryEditor).queryByText('PKG-9, PKG-10')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Application number(s)')).not.toBeInTheDocument()
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
      await screen.findByRole('heading', { name: 'No documents for this permit', level: 2 }),
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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$2.08')
  })

  it.each([false, true])(
    'selects ordinary OIC package fees without changing permit totals (override=%s)',
    async (overrideEnabled) => {
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        packages: ['PKG-A', 'PKG-A ', 'PKG-EMPTY'].map((packageNumber) => ({
          ...editableBlanketOicPackage,
          packageNumber,
          ageClass: 'Items-only age class',
        })),
      })
      mockedFetchPermitFeeOverrideContext.mockResolvedValue({
        overrideEnabled,
        overrideFee: overrideEnabled ? '99.00' : '',
        overrideComment: overrideEnabled ? 'Synthetic override' : '',
        locked: false,
        lockMessage: '',
        interior: false,
      })
      mockedFetchProvincialPermitFees.mockResolvedValue({
        totalFeeVolume: 5.1,
        packageFeeSummaries: [
          { packageNumber: 'PKG-A', growthType: 'Second growth', totalFeeForPackage: '$2.08' },
          { packageNumber: 'PKG-A ', growthType: 'Old growth', totalFeeForPackage: '$6.04' },
          { packageNumber: 'PKG-EMPTY', growthType: '', totalFeeForPackage: '$0.00' },
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
            packageNumber: 'PKG-A ',
            volume: 3,
            amount: 6.04,
            amountDisplay: '$6.04',
          },
        ],
      })
      renderPermitDetails(
        '/provincial/permit/777?itemsFilter=none&feesFilter=PKG-EMPTY&documentsFilter=none&invoicesFilter=none',
      )
      await selectPermitDetailTab('Scale')
      await chooseDropdownOption(
        screen.getByRole('combobox', { name: 'Package number' }),
        'PKG-A (1 trailing space)',
      )
      await selectPermitDetailTab('Fees')
      const selector = await screen.findByRole('combobox', { name: 'Package number' })
      const feesPanel = screen.getByRole('tabpanel', { name: 'Fees' })
      expect(selectedDropdownText(selector)).toBe('PKG-A (1 trailing space)')
      expect(
        screen.queryByRole('region', { name: 'Permit package fee summaries' }),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'EX-9' })).toHaveAttribute(
        'href',
        '/provincial/exemption/EX-9',
      )
      const feeRows = screen.getByRole('region', { name: 'Permit fee rows' })
      expect(within(feeRows).getAllByRole('row')).toHaveLength(2)
      expect(within(feeRows).getByRole('cell', { name: '$6.04' })).toBeVisible()
      expect(within(feeRows).queryByRole('cell', { name: '$1.04' })).not.toBeInTheDocument()
      const ageClass = within(feesPanel)
        .getByText('Age class')
        .closest('.record-field') as HTMLElement
      expect(within(ageClass).getByText('Old growth')).toBeVisible()
      expect(within(feesPanel).queryByText('Items-only age class')).not.toBeInTheDocument()
      const expectedTotal = overrideEnabled ? '$99.00' : '$8.12'
      expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('5.1')
      expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue(expectedTotal)

      await chooseDropdownOption(selector, 'PKG-EMPTY')
      expect(screen.getByRole('heading', { name: 'No fee details available' })).toBeVisible()
      const packageFee = screen
        .getByText('Package fee (CAD)')
        .closest('.record-field') as HTMLElement
      expect(within(packageFee).getByText('$0.00')).toBeVisible()
      expect(ageClass).toHaveTextContent('—')
      expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('5.1')
      expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue(expectedTotal)

      await chooseDropdownOption(selector, 'PKG-A')
      const firstFeeRows = screen.getByRole('region', { name: 'Permit fee rows' })
      expect(within(firstFeeRows).getAllByRole('row')).toHaveLength(3)
      expect(within(firstFeeRows).getAllByRole('cell', { name: '$1.04' })).toHaveLength(2)
      expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue(expectedTotal)
      await selectPermitDetailTab('Scale')
      expect(selectedDropdownText(screen.getByRole('combobox', { name: 'Package number' }))).toBe(
        'PKG-A',
      )
      expect(screen.getByRole('heading', { name: 'Package PKG-A' })).toBeVisible()
      expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
      expect(mockedUpdatePermitScaleAttachment).not.toHaveBeenCalled()
    },
  )

  it.each([
    { receiptNumber: 'R-1', interior: false, shown: true },
    { receiptNumber: null, interior: true, shown: true },
    { receiptNumber: null, interior: false, shown: false },
  ])(
    'shows Receipt number only with a receipt or on an Interior permit (%o)',
    async ({ receiptNumber, interior, shown }) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({ ...permitDetail, receiptNumber })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsWithApplication)
      mockedFetchPermitFeeOverrideContext.mockResolvedValue({
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
        locked: false,
        lockMessage: '',
        interior,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Fees')
      expect(await screen.findByLabelText('Total volume (m³)')).toBeInTheDocument()
      await waitFor(() => expect(mockedFetchPermitFeeOverrideContext).toHaveBeenCalled())
      if (shown) {
        expect(await screen.findByLabelText('Receipt number')).toHaveValue(receiptNumber ?? '—')
      } else {
        expect(screen.queryByLabelText('Receipt number')).not.toBeInTheDocument()
      }
    },
  )

  it('shows a single ordinary OIC package and its masked subtotal without changing numeric permit fees', async () => {
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'PKG-9' }],
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      ...calculatedPermitFees,
      packageFeeSummaries: [
        { packageNumber: 'PKG-9', growthType: 'Old growth', totalFeeForPackage: null },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await screen.findByText('Package number')
    const packageNumber = screen
      .getByText('Package number')
      .closest('.detail-field-item') as HTMLElement
    expect(within(packageNumber).getByText('PKG-9')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Package number' })).not.toBeInTheDocument()
    const packageFee = screen.getByText('Package fee (CAD)').closest('.record-field') as HTMLElement
    expect(within(packageFee).getByText('Not provided')).toBeVisible()
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
  })

  it('keeps an ordinary OIC package visible when its fee rows and summary are absent', async () => {
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'PKG-NO-FEE' }],
    })
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 0,
      packageFeeSummaries: [],
      fees: [],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await screen.findByText('Package number')
    const packageNumber = screen
      .getByText('Package number')
      .closest('.detail-field-item') as HTMLElement
    expect(within(packageNumber).getByText('PKG-NO-FEE')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Package number' })).not.toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No fee details available' })).toBeVisible()
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('0.0')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$0.00')
  })

  it('shows Blanket OIC fees without an amount as not provided instead of a bare currency sign', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitFees.mockResolvedValue({
      totalFeeVolume: 1,
      packageFeeSummaries: [
        { packageNumber: 'BOIC-9', growthType: 'Old growth', totalFeeForPackage: null },
      ],
      fees: [
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-9',
          packageNumber: 'BOIC-9',
          volume: 1,
          amount: 0,
          amountDisplay: '',
        },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')

    const permitFeesTile = (await screen.findByRole('heading', { name: 'Permit fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    const totalFees = within(permitFeesTile)
      .getByText('Total fees (CAD)')
      .closest('.record-field, .detail-field-item') as HTMLElement
    expect(totalFees).toHaveTextContent('Not provided')
    const packageFeesTile = screen
      .getByRole('heading', { name: 'Package fees' })
      .closest('.cds--tile') as HTMLElement
    const packageFee = within(packageFeesTile)
      .getByText('Package fee (CAD)')
      .closest('.record-field, .detail-field-item') as HTMLElement
    expect(packageFee).toHaveTextContent('Not provided')
    expect(
      feeAmountCell(within(packageFeesTile).getByRole('row', { name: /TEST-FEE/ })),
    ).toHaveTextContent('Not provided')
    expect(screen.queryByText('$')).not.toBeInTheDocument()
  })

  it.each([true, false])(
    'shows Override rate on the Blanket OIC Fees tab only when the exemption has one (%s)',
    async (exemptionRateOverride) => {
      configureEditableBlanketOicPackage()
      mockedFetchProvincialPermitFees.mockResolvedValue({
        totalFeeVolume: 0,
        packageFeeSummaries: [
          { packageNumber: 'BOIC-9', growthType: 'Old growth', totalFeeForPackage: '$0.00' },
        ],
        fees: [],
        exemptionRateOverride,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Fees')

      const packageFeesTile = (
        await screen.findByRole('heading', { name: 'Package fees' })
      ).closest('.cds--tile') as HTMLElement
      await waitFor(() =>
        expect(within(packageFeesTile).getByText('Package fee (CAD)')).toBeInTheDocument(),
      )
      if (exemptionRateOverride) {
        const overrideRate = within(packageFeesTile)
          .getByText('Override rate')
          .closest('.record-field') as HTMLElement
        expect(overrideRate).toHaveTextContent('Yes')
      } else {
        expect(within(packageFeesTile).queryByText('Override rate')).not.toBeInTheDocument()
      }
    },
  )

  it('shows only the selected BOIC package fees without changing authoritative totals', async () => {
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
        { packageNumber: 'BOIC-9', growthType: 'Old growth', totalFeeForPackage: null },
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
    await chooseDropdownOption(
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
      ['Total volume (m³)', '5.1'],
      ['Total fees (CAD)', '$8.12'],
      ['Override fees?', 'No'],
    ]) {
      const field = within(permitFeesTile)
        .getByText(label)
        .closest('.record-field, .detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    expect(within(permitFeesTile).getByRole('button', { name: 'Edit fee override' })).toBeEnabled()
    expect(within(packageFeesTile).queryByLabelText('Receipt number')).not.toBeInTheDocument()

    const feeRows = within(packageFeesTile).getByRole('table')
    expect(
      selectedDropdownText(
        within(packageFeesTile).getByRole('combobox', { name: 'Package number' }),
      ),
    ).toBe('BOIC-10')
    expect(within(packageFeesTile).getByRole('heading', { name: 'Fee details' })).toBeVisible()
    expect(within(feeRows).getAllByRole('row')).toHaveLength(2)
    expect(within(feeRows).queryByRole('cell', { name: '$2.08' })).not.toBeInTheDocument()
    expect(within(feeRows).getByRole('cell', { name: '$6.04' })).toBeVisible()
    await chooseDropdownOption(
      within(packageFeesTile).getByRole('combobox', { name: 'Package number' }),
      'BOIC-9',
    )
    expect(within(packageFeesTile).getByRole('table')).toHaveTextContent('$2.08')
    const packageFee = within(packageFeesTile)
      .getByText('Package fee (CAD)')
      .closest('.record-field, .detail-field-item') as HTMLElement
    expect(packageFee).toHaveTextContent('Not provided')
    expect(within(permitFeesTile).getByText('$8.12')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('keeps Ministerial scale changes local until save and discards them on Cancel', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'MIN-1' },
        { ...editableBlanketOicPackage, packageNumber: 'MIN-2' },
      ],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(checkbox).toBeDisabled()
    const packageTotal = (label: string) =>
      screen.getByText(label).closest('.record-field')?.textContent ?? ''
    expect(packageTotal('Package volume (m³)')).toContain('1.0')
    expect(packageTotal('Package pieces')).toContain('1')
    await userEvent.click(screen.getByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    expect(packageTotal('Package volume (m³)')).toContain('0.0')
    expect(packageTotal('Package pieces')).toContain('0')
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
    expect(mockedUpdatePermitScaleAttachment).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Package number' })).toBeEnabled()
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Summary of scale' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(checkbox).toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(packageTotal('Package volume (m³)')).toContain('1.0')
    expect(packageTotal('Package pieces')).toContain('1')
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
  })

  it('keeps a Ministerial scale draft across a package switch and saves it as one selection', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'MIN-1' },
        { ...editableBlanketOicPackage, packageNumber: 'MIN-2' },
      ],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-2',
          packageNumber: 'MIN-2',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 2,
          volume: 2,
          permitNumber: '',
          includedInPermit: false,
        },
      ],
    })
    mockedUpdatePermitScaleSelection.mockResolvedValue({
      success: true,
      message: 'Scale selection was saved.',
      errors: [],
      warnings: [],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }))

    const scalePackage = screen.getByRole('combobox', { name: 'Package number' })
    expect(scalePackage).toBeEnabled()
    await chooseDropdownOption(scalePackage, 'MIN-2')
    const second = screen.getByRole('checkbox', { name: 'Include scale SCALE-2 in permit' })
    expect(second).toBeEnabled()
    await userEvent.click(second)

    await chooseDropdownOption(scalePackage, 'MIN-1')
    expect(
      screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
    ).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledWith({
        permitNumber: '777',
        includedScaleIds: ['SCALE-2'],
        excludedScaleIds: ['SCALE-1'],
      }),
    )
  })

  it('keeps the Ministerial scale draft on rejection and submits one atomic selection', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      items: ['SCALE-1', 'SCALE-2'].map((id) => ({
        id,
        packageNumber: 'MIN-1',
        timberMark: 'TEST',
        scaleType: 'C',
        species: 'HE',
        grade: 'U',
        pieces: 1,
        volume: 1,
        permitNumber: '777',
        includedInPermit: true,
      })),
    })
    let resolveSave!: (result: Awaited<ReturnType<typeof updatePermitScaleSelection>>) => void
    mockedUpdatePermitScaleSelection.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    const first = screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' })
    const second = screen.getByRole('checkbox', { name: 'Include scale SCALE-2 in permit' })
    await userEvent.click(first)
    await userEvent.click(second)
    const save = screen.getByRole('button', { name: 'Save changes' })
    await userEvent.dblClick(save)
    expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledWith({
      permitNumber: '777',
      includedScaleIds: [],
      excludedScaleIds: ['SCALE-1', 'SCALE-2'],
    })
    expect(first).toBeDisabled()
    await act(async () =>
      resolveSave({ success: false, message: '', errors: ['Selection rejected'], warnings: [] }),
    )
    expect(await screen.findByText('Selection rejected')).toBeInTheDocument()
    expect(first).toBeEnabled()
    expect(first).not.toBeChecked()
    expect(second).not.toBeChecked()
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Summary of scale' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(first).toBeChecked()
    expect(second).toBeChecked()
  })

  it.each([true, false])(
    'clears previous action feedback when a scale save starts (success: %s)',
    async (success) => {
      configureMinisterialActivePermit()
      mockedFetchAvailablePermitApplications.mockResolvedValue(
        availableApplications({ applicationNumber: 'APP-ELIGIBLE' }),
      )
      mockedFetchProvincialPermitDetailTabs.mockResolvedValueOnce(tabsResult).mockResolvedValue({
        ...tabsResult,
        applications: ['APP-ELIGIBLE'],
        packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
        items: [
          {
            id: 'SCALE-1',
            packageNumber: 'MIN-1',
            timberMark: 'TEST',
            scaleType: 'C',
            species: 'HE',
            grade: 'U',
            pieces: 1,
            volume: 1,
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })
      let resolveSave!: (result: Awaited<ReturnType<typeof updatePermitScaleSelection>>) => void
      mockedUpdatePermitScaleSelection.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSave = resolve
        }),
      )
      renderPermitDetails()
      await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
      await userEvent.click(
        await screen.findByRole('checkbox', { name: 'Include application APP-ELIGIBLE in permit' }),
      )
      await userEvent.click(getActiveSectionSaveButton())
      expect(await screen.findByText('Permit details saved.')).toBeVisible()

      await selectPermitDetailTab('Scale')
      await userEvent.click(screen.getByRole('button', { name: 'Edit scale selection' }))
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      expect(screen.queryByText('Permit details saved.')).not.toBeInTheDocument()

      await act(async () =>
        resolveSave({
          success,
          message: success ? 'Scale selection was saved.' : '',
          errors: success ? [] : ['Selection rejected'],
          warnings: [],
        }),
      )
      const scaleSummary = screen.getByRole('region', { name: 'Summary of scale' })
      expect(
        await within(scaleSummary).findByText(
          success ? 'Summary of scale saved.' : 'Selection rejected',
        ),
      ).toBeVisible()
      expect(screen.queryByText('Permit details saved.')).not.toBeInTheDocument()
    },
  )

  it('focuses the scale result when excluding the last Ministerial scale removes the editor', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    onTestFinished(() => visibleRects.mockRestore())
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({
        ...tabsResult,
        packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
        items: [
          {
            id: 'SCALE-1',
            packageNumber: 'MIN-1',
            timberMark: 'TEST',
            scaleType: 'C',
            species: 'HE',
            grade: 'U',
            pieces: 1,
            volume: 1,
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })
      .mockResolvedValue(tabsResult)
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const notice = (await screen.findByText('Summary of scale saved.')).closest(
      '.app-inline-notification',
    )
    await waitFor(() => expect(notice).toHaveFocus())
    expect(screen.getByRole('heading', { name: 'No scale yet' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit scale selection' })).not.toBeInTheDocument()
  })

  it('keeps scale controls locked until the saved selection and totals finish refreshing', async () => {
    const initialDetail = configureMinisterialActivePermit()
    const initialTabs = {
      ...tabsResult,
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'MIN-1' },
        { ...editableBlanketOicPackage, packageNumber: 'MIN-2' },
      ],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    }
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(initialTabs)
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }))

    let resolveDetail!: (detail: ProvincialPermitDetail) => void
    mockedFetchProvincialPermitDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )
    // The row refresh can finish before the permit totals refresh does.
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...initialTabs,
      items: [{ ...initialTabs.items[0], permitNumber: '', includedInPermit: false }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    const scaleSummary = screen.getByRole('region', { name: 'Summary of scale' })
    expect(within(scaleSummary).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Package number' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit scale selection' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' })).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
    ).not.toBeChecked()
    expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledTimes(1)

    await act(async () => resolveDetail({ ...initialDetail, permitVolume: 0, numberOfPieces: 0 }))
    expect(await screen.findByRole('button', { name: 'Edit scale selection' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Package number' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
    ).not.toBeChecked()
    expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledTimes(1)
  })

  it.each(['COM', 'EXP', 'CAN'])(
    'keeps Ministerial Scale read-only for %s',
    async (permitStatusCode) => {
      configureMinisterialActivePermit({ permitStatusCode })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
        items: [
          {
            id: 'SCALE-1',
            packageNumber: 'MIN-1',
            timberMark: 'TEST',
            scaleType: 'C',
            species: 'HE',
            grade: 'U',
            pieces: 1,
            volume: 1,
            permitNumber: '777',
            includedInPermit: true,
          },
        ],
      })
      renderPermitDetails()
      await selectPermitDetailTab('Scale')
      expect(
        await screen.findByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
      ).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Edit scale selection' })).not.toBeInTheDocument()
    },
  )

  it('lets the Ministerial Scale selection change on a Payment pending permit', async () => {
    configureMinisterialActivePermit({
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(includeScale).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit scale selection' }))
    await waitFor(() => expect(includeScale).toBeEnabled())
  })

  it('asks before discarding a Ministerial scale draft when leaving the permit', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
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
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }))
    await userEvent.click(screen.getByRole('link', { name: 'Leave permit' }))
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/provincial/permit/777')
    expect(
      screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
    ).not.toBeChecked()

    await userEvent.click(screen.getByRole('link', { name: 'Leave permit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeVisible()
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
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
    expect(selectedDropdownText(scalePackage)).toBe('MIN-1')
    expect(within(scaleDetails).getByText('Old growth')).toBeVisible()
    expect(within(scaleDetails).getByText('3.0')).toBeVisible()
    const scaleRows = screen.getByRole('region', { name: 'Scale rows' })
    expect(within(scaleRows).getByText('TM-PLAIN')).toBeVisible()
    expect(within(scaleRows).queryByText('TM-PADDED')).not.toBeInTheDocument()
    expect(
      within(scaleRows).queryByRole('columnheader', { name: 'Package' }),
    ).not.toBeInTheDocument()

    await chooseDropdownOption(scalePackage, 'MIN-1 (1 trailing space)')
    expect(selectedDropdownText(scalePackage)).toBe('MIN-1 (1 trailing space)')
    expect(within(scaleDetails).getByText('Second growth')).toBeVisible()
    expect(within(scaleDetails).getByText('9.0')).toBeVisible()
    expect(within(scaleRows).getByText('TM-PADDED')).toBeVisible()
    expect(within(scaleRows).queryByText('TM-PLAIN')).not.toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    const feesPackage = await screen.findByRole('combobox', { name: 'Package number' })
    const packageFeesTile = screen
      .getByRole('heading', { name: 'Package fees' })
      .closest('.cds--tile') as HTMLElement
    expect(selectedDropdownText(feesPackage)).toBe('MIN-1 (1 trailing space)')
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

  it('shows a single Ministerial package number when its fee summary is absent', async () => {
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
    const packageFeesTile = (await screen.findByRole('heading', { name: 'Package fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    const packageNumber = within(packageFeesTile)
      .getByText('Package number')
      .closest('.detail-field-item') as HTMLElement
    expect(within(packageNumber).getByText('MIN-NO-FEE')).toBeVisible()
    expect(
      within(packageFeesTile).queryByRole('combobox', { name: 'Package number' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No fee details available' })).toBeVisible()
  })

  it('refreshes loaded fees after saving the permit submit date and preserves the current tab', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'PKG-9' }],
    })
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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
    expect(screen.queryByLabelText('Filter fee rows')).not.toBeInTheDocument()
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    const savedNotice = (await screen.findByText('Permit details saved.')).closest(
      '.cds--inline-notification',
    ) as HTMLElement
    expect(savedNotice.closest('[role="tabpanel"]')).toBe(
      screen.getByRole('tabpanel', { name: 'Permit' }),
    )
    expectResultInCard('Permit details saved.', 'Permit summary')
    expect(screen.queryByText('The permit was updated successfully.')).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({ permitSubmitDate: '2026-04-11', permitStatus: 'ACT' }),
    )
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Loading…')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    const feesPanel = screen.getByRole('tabpanel', { name: 'Fees' })
    expect(within(feesPanel).queryByText('Package fee (CAD)')).not.toBeInTheDocument()

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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$75.00')
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('row', { name: /TEST-FEE/ })).getByText('$75.00')).toBeVisible()
    const packageFee = within(feesPanel)
      .getByText('Package fee (CAD)')
      .closest('.record-field') as HTMLElement
    expect(within(packageFee).getByText('$75.00')).toBeVisible()
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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
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
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.selectOptions(screen.getByLabelText('Final destination country'), 'CA')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    const savedNotice = (await screen.findByText('Shipping details saved.')).closest(
      '.cds--inline-notification',
    ) as HTMLElement
    expect(savedNotice.closest('[role="tabpanel"]')).toBe(
      screen.getByRole('tabpanel', { name: 'Shipping' }),
    )
    expectResultInCard('Shipping details saved.', 'Shipping')
    expect(screen.queryByText('The permit was saved successfully.')).not.toBeInTheDocument()
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(2)
    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Loading…')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    await act(async () => resolveRefreshedFees?.(maskedPermitFees))

    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('—')
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('10.0')
    const feeRow = screen.getByRole('row', { name: /TEST-FEE/ })
    expect(feeAmountCell(feeRow)).toHaveTextContent('Not provided')
    expect(within(feeRow).queryByText('$')).not.toBeInTheDocument()
    expect(within(feeRow).queryByText('3.75')).not.toBeInTheDocument()

    // Editing again replaces the notice from the last save.
    await selectPermitDetailTab('Shipping')
    expect(screen.getByText('Shipping details saved.')).toBeVisible()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    expect(screen.queryByText('Shipping details saved.')).not.toBeInTheDocument()
  })

  it('refreshes fee rows when a fee override is enabled and disabled', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitFees
      .mockResolvedValueOnce(calculatedPermitFees)
      .mockResolvedValueOnce(maskedPermitFees)
      .mockResolvedValueOnce(calculatedPermitFees)
    // The edit context is read on load and when each editor opens; the last read sees the override
    // the first save stored.
    const withoutOverride = {
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior: true,
    }
    mockedFetchPermitFeeOverrideContext
      .mockResolvedValueOnce(withoutOverride)
      .mockResolvedValueOnce(withoutOverride)
      .mockResolvedValue({ ...withoutOverride, overrideEnabled: true, overrideFee: '45.25' })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    await waitFor(() =>
      expect(feeAmountCell(screen.getByRole('row', { name: /TEST-FEE/ }))).toHaveTextContent(
        'Not provided',
      ),
    )
    const savedNotice = screen
      .getByText('Fee override saved.')
      .closest('.cds--inline-notification') as HTMLElement
    expect(savedNotice.closest('[role="tabpanel"]')).toBe(
      screen.getByRole('tabpanel', { name: 'Fees' }),
    )
    expectResultInCard('Fee override saved.', 'Fee calculation details')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$45.25')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    await waitFor(() => expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$37.50'))
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
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    await waitFor(() =>
      expect(feeAmountCell(screen.getByRole('row', { name: /TEST-FEE/ }))).toHaveTextContent(
        'Not provided',
      ),
    )
    await act(async () => resolveOriginalFees?.(calculatedPermitFees))
    const feeRow = screen.getByRole('row', { name: /TEST-FEE/ })
    expect(feeAmountCell(feeRow)).toHaveTextContent('Not provided')
    expect(within(feeRow).queryByText('$37.50')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$45.25')
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
            { packageNumber: 'PKG-10', growthType: 'Second growth', totalFeeForPackage: null },
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
      await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))
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
      expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$45.25')
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
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    expect(await screen.findByText('Fee override saved.')).toBeInTheDocument()
    expect(await screen.findByText('Unable to retrieve permit fee details.')).toBeInTheDocument()
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Unavailable')
    expect(screen.queryByRole('row', { name: /TEST-FEE/ })).not.toBeInTheDocument()
    await selectPermitDetailTab('Items')
    await selectPermitDetailTab('Fees')

    await waitFor(() => expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('$45.25'))
    expect(feeAmountCell(screen.getByRole('row', { name: /TEST-FEE/ }))).toHaveTextContent(
      'Not provided',
    )
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

    await selectPermitDetailTab('Fees')
    expect(mockedFetchProvincialPermitFees).toHaveBeenCalledTimes(1)
    expect(mockedFetchProvincialPermitGbmsEvents).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: false,
    })
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Loading…')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Loading…')
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
      await screen.findByRole('heading', { name: 'No documents for this permit', level: 2 }),
    ).toBeInTheDocument()
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(1)
    await selectPermitDetailTab('Permit')
    await selectPermitDetailTab('Documents')
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(1)

    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
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
        interior: true,
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

  it('waits for delayed Blanket OIC context before rendering reviewed permit tabs and fees', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      approvedExemptionVolume: null,
      exemptionVolumeRemaining: null,
      exemptionTypeDescription: null,
      blanketOic: false,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
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

    expect(await screen.findByText('Loading permit details…')).toBeInTheDocument()
    expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalledWith('EX-9')
    expect(mockedFetchProvincialPermitDetailTabs).not.toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    expect(screen.queryByText('Fee calculation details')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No fee details available' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveExemptionContext?.({
        approvedExemptionVolume: 250,
        exemptionVolumeRemaining: 130,
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
      })
    })

    await waitFor(() =>
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
        permitNumber: '777',
        receiptNumber: 'R-1',
        blanketOic: true,
      }),
    )
    expect(await screen.findByRole('tab', { name: 'Scale' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    await selectPermitDetailTab('Fees')
    expect(await screen.findByRole('heading', { name: 'Permit fees' })).toBeInTheDocument()
  })

  it('waits for Ministerial core tables before showing an empty scale state', async () => {
    configureMinisterialActivePermit()
    let resolveTabs:
      | ((value: Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>) => void)
      | undefined
    mockedFetchProvincialPermitDetailTabs.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof fetchProvincialPermitDetailCoreTabs>>>((resolve) => {
          resolveTabs = resolve
        }),
    )

    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    expect(await screen.findByText('Loading permit items…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No scale yet' })).not.toBeInTheDocument()

    await act(async () => {
      resolveTabs?.(tabsResult)
    })

    expect(await screen.findByRole('heading', { name: 'No scale yet' })).toBeInTheDocument()
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
        for (const label of ['Total volume (m³)', 'Total fees (CAD)']) {
          const field = within(permitFeesTile)
            .getByText(label)
            .closest('.record-field, .detail-field-item') as HTMLElement
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
        expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Unavailable')
      }
    },
  )

  it('shows ordinary OIC package cards and included totals for the selected package', async () => {
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
        {
          id: 'SCALE-3',
          timberMark: 'TM-3',
          scaleType: 'B',
          species: 'Fir',
          grade: 'A',
          pieces: 99,
          volume: 99.9,
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

    expect(screen.getByRole('tab', { name: 'Scale' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Scale' }).querySelector('svg'),
    ).toHaveAttribute('width', '24')
    const packageSelect = screen.getByRole('combobox', { name: 'Package number' })
    expect(selectedDropdownText(packageSelect)).toBe('PKG-9')
    const packageCard = screen
      .getByRole('heading', { name: 'Package PKG-9' })
      .closest('.detail-section-card') as HTMLElement
    expect(within(packageCard).getByText('Coast')).toBeVisible()
    expect(within(packageCard).getByText('HE/PL')).toBeVisible()
    expect(within(packageCard).getByText('Second growth')).toBeVisible()
    expect(within(packageCard).getByText('120.5')).toBeVisible()
    expect(within(packageCard).getByText('Unmanufactured')).toBeVisible()
    const scaleSummary = within(packageCard).getByRole('region', { name: 'Summary of scale' })
    for (const [label, value] of [
      ['Current package pieces', '12'],
      ['Current package volume (m³)', '34.5'],
    ]) {
      const field = within(scaleSummary).getByText(label).closest('.record-field') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add scale' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Permit packages' })).not.toBeInTheDocument()
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
    expect(within(itemRows).getAllByRole('cell', { name: 'C' })).toHaveLength(1)
    expect(within(itemRows).getAllByRole('cell', { name: '777' })).toHaveLength(1)
    expect(within(itemRows).getAllByRole('cell', { name: 'PKG-9' })).toHaveLength(2)
    expect(within(itemRows).queryByRole('cell', { name: 'PKG-10' })).not.toBeInTheDocument()
    expect(
      within(itemRows).getByRole('checkbox', { name: 'Include scale SCALE-3 in permit' }),
    ).not.toBeChecked()

    await chooseDropdownOption(packageSelect, 'PKG-10')
    const secondCard = screen
      .getByRole('heading', { name: 'Package PKG-10' })
      .closest('.detail-section-card') as HTMLElement
    expect(within(secondCard).getByText('FI/LU')).toBeVisible()
    expect(within(secondCard).getByRole('cell', { name: 'TM-2' })).toBeVisible()
    expect(within(secondCard).queryByRole('cell', { name: 'TM-1' })).not.toBeInTheDocument()
    for (const [label, value] of [
      ['Current package pieces', '8'],
      ['Current package volume (m³)', '12.5'],
    ]) {
      const field = within(secondCard).getByText(label).closest('.record-field') as HTMLElement
      expect(within(field).getByText(value)).toBeVisible()
    }
  })

  it('keeps a zero-included OIC package selectable for re-inclusion while a sibling remains attached', async () => {
    configureActivePermit()
    let firstScaleIncluded = true
    mockedFetchProvincialPermitDetailTabs.mockImplementation(async () => ({
      ...tabsResult,
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'PKG-9' },
        { ...editableBlanketOicPackage, packageNumber: 'PKG-9 ' },
      ],
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          scaleType: 'C',
          species: 'Fir',
          grade: 'A',
          pieces: 2,
          volume: 3,
          packageNumber: 'PKG-9',
          permitNumber: firstScaleIncluded ? '777' : '',
          includedInPermit: firstScaleIncluded,
        },
        {
          id: 'SCALE-2',
          timberMark: 'TM-2',
          scaleType: 'C',
          species: 'Fir',
          grade: 'A',
          pieces: 4,
          volume: 5,
          packageNumber: 'PKG-9 ',
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    }))
    mockedUpdatePermitScaleAttachment.mockImplementation(async ({ attachInd }) => {
      firstScaleIncluded = attachInd
      return { success: true, message: 'Scale selection updated.', errors: [], warnings: [] }
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const selector = screen.getByRole('combobox', { name: 'Package number' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }))
    await waitFor(() =>
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: false,
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: 'Include scale SCALE-1 in permit',
        }),
      ).not.toBeChecked(),
    )
    expect(selectedDropdownText(selector)).toBe('PKG-9')
    const summary = screen.getByRole('region', { name: 'Summary of scale' })
    for (const [label, value] of [
      ['Current package pieces', '0'],
      ['Current package volume (m³)', '0.0'],
    ]) {
      const field = within(summary).getByText(label).closest('.record-field') as HTMLElement
      expect(within(field).getByText(value)).toBeVisible()
    }
    await chooseDropdownOption(selector, 'PKG-9 (1 trailing space)')
    expect(screen.getByRole('checkbox', { name: 'Include scale SCALE-2 in permit' })).toBeChecked()
    await chooseDropdownOption(selector, 'PKG-9')
    const excludedScale = screen.getByRole('checkbox', { name: 'Include scale SCALE-1 in permit' })
    expect(excludedScale).toBeEnabled()
    expect(excludedScale).not.toBeChecked()
    await userEvent.click(excludedScale)
    await waitFor(() =>
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenLastCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: true,
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: 'Include scale SCALE-1 in permit',
        }),
      ).toBeChecked(),
    )
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
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

  it('offers a Ministerial application again after its last scale is removed', async () => {
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
        applicationTotals: [{ applicationNumber: 'APP-SCALE', pieces: 9, volume: 28.4 }],
        items: [attachedScale],
      })
      .mockResolvedValue({
        ...tabsResult,
        applications: [],
        applicationTotals: [],
        items: [{ ...attachedScale, permitNumber: '', includedInPermit: false }],
      })
    mockedFetchAvailablePermitApplications.mockResolvedValue(
      availableApplications({
        applicationNumber: 'APP-SCALE',
        unassignedPieces: 9,
        unassignedVolume: 28.4,
      }),
    )
    mockedUpdatePermitScaleSelection.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })

    renderPermitDetails()

    await findApplicationTable()
    expect(within(applicationRow('APP-SCALE')).getByText('9')).toBeInTheDocument()
    await selectPermitDetailTab('Scale')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(includeScale).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit scale selection' }))
    await waitFor(() => expect(includeScale).toBeEnabled())
    await userEvent.click(includeScale)
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledWith({
        permitNumber: '777',
        includedScaleIds: [],
        excludedScaleIds: ['SCALE-1'],
      })
    })
    await selectPermitDetailTab('Permit')

    await waitFor(() => {
      expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^0$/)
      expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('0')
      expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('372.6')
    })
    expect(screen.queryByRole('region', { name: 'Application number(s)' })).not.toBeInTheDocument()
    expect(mockedFetchAvailablePermitApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    const restoredApplication = await screen.findByRole('checkbox', {
      name: 'Include application APP-SCALE in permit',
    })
    expect(restoredApplication).toBeEnabled()
    expect(restoredApplication).not.toBeChecked()
    expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', [])
    expect(within(applicationRow('APP-SCALE')).getByText('9')).toBeInTheDocument()
    expect(within(applicationRow('APP-SCALE')).getByText('28.4')).toBeInTheDocument()
  })

  it('keeps a Ministerial application on the permit while another of its scales remains attached', async () => {
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
        applicationTotals: [{ applicationNumber: 'APP-SCALE', pieces: 9, volume: 28.4 }],
        items: [scaleToRemove, retainedScale],
      })
      .mockResolvedValue({
        ...tabsResult,
        applications: ['APP-SCALE'],
        applicationTotals: [{ applicationNumber: 'APP-SCALE', pieces: 5, volume: 18.4 }],
        items: [{ ...scaleToRemove, permitNumber: '', includedInPermit: false }, retainedScale],
      })
    mockedUpdatePermitScaleSelection.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })

    renderPermitDetails()

    await findApplicationTable()
    expect(within(applicationRow('APP-SCALE')).getByText('28.4')).toBeInTheDocument()
    await selectPermitDetailTab('Scale')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(includeScale).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit scale selection' }))
    await waitFor(() => expect(includeScale).toBeEnabled())
    await userEvent.click(includeScale)
    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdatePermitScaleSelection).toHaveBeenCalledWith({
        permitNumber: '777',
        includedScaleIds: [],
        excludedScaleIds: ['SCALE-1'],
      })
    })
    await selectPermitDetailTab('Permit')

    await waitFor(() => {
      expect(permitFieldValue('Current permit pieces')).toHaveTextContent(/^5$/)
      expect(permitFieldValue('Current permit volume (m³)')).toHaveTextContent('18.4')
      expect(permitFieldValue('Total volume remaining (m³)')).toHaveTextContent('354.2')
      expect(within(applicationRow('APP-SCALE')).getByText('18.4')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    expect(
      await screen.findByRole('checkbox', { name: 'Include application APP-SCALE in permit' }),
    ).toBeChecked()
    expect(mockedFetchAvailablePermitApplications).toHaveBeenLastCalledWith('EX-9', ['APP-SCALE'])
    expect(applicationRowNumbers()).toEqual(['APP-SCALE'])
  })

  it.each([
    { permitStatusCode: 'COM', permitStatusDescription: 'Completed' },
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

  it('changes scale membership and removes applications, but adds none, on a Payment pending permit', async () => {
    mockedUpdatePermitScaleAttachment.mockResolvedValue({
      success: true,
      message: 'Scale detail was removed from the permit.',
      errors: [],
      warnings: [],
    })
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      applications: ['1000456'],
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

    const applicationsTile = (
      await screen.findByRole('heading', { name: 'Associated applications' })
    ).closest('.cds--tile') as HTMLElement
    expect(within(applicationsTile).queryByRole('button', { name: 'Add application' })).toBeNull()
    expect(
      within(applicationsTile).queryByRole('combobox', { name: 'Available application' }),
    ).toBeNull()
    const associatedApplicationRow = within(applicationsTile).getByText('1000456').closest('tr')
    await userEvent.click(
      within(associatedApplicationRow as HTMLElement).getByRole('button', {
        name: 'Remove application 1000456',
      }),
    )
    const removalConfirmation = await screen.findByRole('dialog', {
      name: 'Remove associated application?',
    })
    await userEvent.click(within(removalConfirmation).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(mockedRemoveApplicationFromPermit).toHaveBeenCalledWith({
        permitNumber: '777',
        applicationNumber: '1000456',
      })
    })

    await selectPermitDetailTab('Items')
    const includeScale = await screen.findByRole('checkbox', {
      name: 'Include scale SCALE-1 in permit',
    })
    expect(includeScale).toBeEnabled()
    await userEvent.click(includeScale)
    await waitFor(() => {
      expect(mockedUpdatePermitScaleAttachment).toHaveBeenCalledWith({
        scaleId: 'SCALE-1',
        permitNumber: '777',
        attachInd: false,
      })
    })
  })

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
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()

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
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()
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
      within(associatedApplicationRow as HTMLElement).getByRole('button', {
        name: 'Remove application 1000456',
      }),
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

  describe('application results on an editable permit', () => {
    const configureEditablePermitWithApplication = () => {
      configureActivePermit()
      mockedFetchAvailablePermitApplications.mockResolvedValue({
        applicationList: ['1000457'],
        errorMessage: '',
      })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        applications: ['1000456'],
      })
    }

    const findAssociatedApplicationsTile = async () =>
      (await screen.findByRole('heading', { name: 'Associated applications' })).closest(
        '.cds--tile',
      ) as HTMLElement

    const addAvailableApplication = async (applicationsTile: HTMLElement) => {
      const combobox = within(applicationsTile).getByRole('combobox', {
        name: 'Available application',
      })
      await userEvent.click(combobox)
      await chooseComboBoxOption(combobox, '1000457')
      const addButton = within(applicationsTile).getByRole('button', { name: 'Add application' })
      await waitFor(() => expect(addButton).toBeEnabled())
      await userEvent.click(addButton)
    }

    it('focuses the added notice inside the Associated applications card', async () => {
      const visibleRects = vi
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
      onTestFinished(() => visibleRects.mockRestore())
      configureEditablePermitWithApplication()
      renderPermitDetails()

      await addAvailableApplication(await findAssociatedApplicationsTile())

      const notice = (await screen.findByText('Application was added to the permit.')).closest(
        '.app-inline-notification',
      )
      await waitFor(() => expect(notice).toHaveFocus())
      expect(within(notice as HTMLElement).getByText('Application added.')).toBeVisible()
      expectResultInCard('Application was added to the permit.', 'Associated applications')
    })

    it('shows a refused application add inside the Associated applications card', async () => {
      configureEditablePermitWithApplication()
      mockedAddApplicationsToPermit.mockResolvedValueOnce({
        success: false,
        message: '',
        errors: ['test-2026-10-20 application refused.'],
        warnings: [],
      })
      renderPermitDetails()

      await addAvailableApplication(await findAssociatedApplicationsTile())

      const notice = (await screen.findByText('Application not added.')).closest(
        '.cds--inline-notification',
      )
      expect(notice).toHaveClass('cds--inline-notification--error')
      expect(notice).toHaveTextContent('test-2026-10-20 application refused.')
      expectResultInCard('Application not added.', 'Associated applications')
      expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    })

    it('focuses the removed notice inside the Associated applications card', async () => {
      const visibleRects = vi
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
      onTestFinished(() => visibleRects.mockRestore())
      configureEditablePermitWithApplication()
      renderPermitDetails()

      const applicationsTile = await findAssociatedApplicationsTile()
      await userEvent.click(
        within(applicationsTile).getByRole('button', { name: 'Remove application 1000456' }),
      )
      const removal = await screen.findByRole('dialog', { name: 'Remove associated application?' })
      await userEvent.click(within(removal).getByRole('button', { name: 'Remove' }))

      const notice = (await screen.findByText('Application was removed from the permit.')).closest(
        '.app-inline-notification',
      )
      await waitFor(() => expect(notice).toHaveFocus())
      expect(within(notice as HTMLElement).getByText('Application removed.')).toBeVisible()
      expectResultInCard('Application was removed from the permit.', 'Associated applications')
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
      await screen.findByRole('heading', { name: 'No scale yet', level: 3 }),
    ).toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    expect(
      await screen.findByRole('heading', { name: 'No fee details available', level: 3 }),
    ).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'GBMS' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(
      await screen.findByRole('heading', { name: 'No documents for this permit', level: 2 }),
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
    expect(
      await screen.findByRole('heading', { name: 'No documents for this permit', level: 2 }),
    ).toBeInTheDocument()

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

    await selectPermitDetailTab('Documents')

    expect(
      await screen.findByRole('heading', { name: 'Documents unavailable', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve permit documents.')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No documents for this permit', level: 2 }),
    ).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'close notification' })).not.toBeInTheDocument()
  })

  it('shows recalculated Blanket OIC package pieces while retaining package volume on the Scale tab', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
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
          speciesCodes: ['AL', 'HE', 'PL'],
          endUseCodes: ['LU'],
          endUseDescriptions: ['Lumber'],
          ageClass: 'Old growth',
          packageVolume: '120.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Harvested Timber',
          productTypeCode: 'H',
          currentPackageVolume: '118.5',
          status: 'APP - Approved',
          reprocessed: 'N',
          comments: 'Current OIC package\nSecond line',
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

    await findBlanketOicPackageCard()
    expect(screen.queryByText('Blanket OIC package details')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Owner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Items' })).not.toBeInTheDocument()
    expect(screen.getByText('Summary of scale')).toBeInTheDocument()
    const packageCard = await findBlanketOicPackageCard()
    for (const [label, value] of [
      ['Species list', 'AL, HE, PL'],
      ['End use', 'Lumber'],
      ['Product type', 'Harvested'],
    ]) {
      const field = within(packageCard)
        .getByText(label)
        .closest('.record-field, .detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    expect(
      await within(packageCard).findByRole('button', { name: 'Edit package' }),
    ).toBeInTheDocument()
    expect(within(packageCard).queryByText('Comments')).not.toBeInTheDocument()
    expect(within(packageCard).getByText('Current package pieces')).toBeInTheDocument()
    expect(within(packageCard).getByText('Current package volume (m³)')).toBeInTheDocument()
    for (const [label, value] of [
      ['Package volume (m³)', '120.5'],
      ['Current package pieces', '12'],
      ['Current package volume (m³)', '118.5'],
    ]) {
      const field = within(packageCard)
        .getAllByText(label)[0]
        .closest('.record-field, .detail-field-item') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
    expect(within(packageCard).queryByText('APP - Approved')).not.toBeInTheDocument()
    expect(within(packageCard).queryByText('N')).not.toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: true,
    })
  })

  it.each([
    { viewer: 'anyone on a Completed permit', status: 'COM', readOnly: false, comments: 'Note' },
    { viewer: 'a Read Only user', status: 'ACT', readOnly: true, comments: 'Note' },
    { viewer: 'nobody when the package has none', status: 'COM', readOnly: false, comments: ' ' },
  ])(
    'shows Blanket OIC package comments read-only on the card to $viewer',
    async ({ status, readOnly, comments }) => {
      configureEditableBlanketOicPackage()
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: status,
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicApplicationNumber: 1000999,
      })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        packages: [{ ...editableBlanketOicPackage, comments }],
      })
      if (readOnly) {
        mockedUseAuth.mockReturnValue(
          createTestAuthContext({ canPerform: (action: string) => action === '/permitDetails' }),
        )
      }
      renderPermitDetails()

      await selectPermitDetailTab('Scale')

      const packageCard = await findBlanketOicPackageCard()
      expect(within(packageCard).getByText('Package volume (m³)')).toBeInTheDocument()
      expect(
        within(packageCard).queryByRole('button', { name: 'Edit package' }),
      ).not.toBeInTheDocument()
      if (comments.trim()) {
        const field = within(packageCard)
          .getByText('Comments')
          .closest('.record-field') as HTMLElement
        expect(within(field).getByText(comments)).toBeInTheDocument()
      } else {
        expect(within(packageCard).queryByText('Comments')).not.toBeInTheDocument()
      }
    },
  )

  it('hides the Blanket OIC option warnings from a Read Only user without a save region', async () => {
    configureEditableBlanketOicPackage()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_READ_ONLY'],
          grantedActions: ['/permitDetails'],
          actionRegions: { permitdetails: ['1903'] },
        }),
        canPerform: (action: string) => action === '/permitDetails',
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    await findBlanketOicPackageCard()
    expect(screen.queryByText('Blanket OIC region options unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText('Required permit options not configured')).not.toBeInTheDocument()
  })

  it('shows the Blanket OIC option warnings to a writer whose region list is empty', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    renderPermitDetails()

    expect(await screen.findByText('Blanket OIC region options unavailable')).toBeInTheDocument()
    expect(screen.getByText('Required permit options not configured')).toBeInTheDocument()
  })

  it('keeps the Blanket OIC Scale summary hidden until the permit tables load', async () => {
    configureEditableBlanketOicPackage()
    let resolveTabs: ((tabs: ProvincialPermitDetailTabsData) => void) | undefined
    mockedFetchProvincialPermitDetailTabs.mockImplementation(
      () =>
        new Promise<ProvincialPermitDetailTabsData>((resolve) => {
          resolveTabs = resolve
        }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    expect(screen.getByText('No scales yet.')).not.toBeVisible()

    await act(async () => {
      resolveTabs?.({ ...tabsResult, packages: [editableBlanketOicPackage] })
    })

    expect(await screen.findByText('No scales yet.')).toBeVisible()
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

    const packageCard = await findBlanketOicPackageCard('T260917R1')
    expect(within(packageCard).getByText('0')).toBeInTheDocument()
    expect(within(packageCard).getByText('1.0')).toBeInTheDocument()
    expect(within(packageCard).getByText('0.0')).toBeInTheDocument()
  })

  it('keeps a stored second decimal in Blanket OIC scale and current package volumes', async () => {
    configureEditableBlanketOicPackage()
    const scaleRow = {
      timberMark: 'TM-9',
      scaleType: 'C',
      species: 'HE',
      grade: 'A',
      pieces: 1,
      packageNumber: 'BOIC-9',
      permitNumber: '777',
      includedInPermit: true,
    }
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, currentPackageVolume: '2.05' }],
      items: [
        { ...scaleRow, id: 'SCALE-1', volume: 0.05 },
        { ...scaleRow, id: 'SCALE-2', volume: 2 },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const scaleRows = await screen.findByRole('region', { name: 'Scale rows' })
    expect(within(scaleRows).getByRole('cell', { name: '0.05' })).toBeInTheDocument()
    expect(within(scaleRows).getByRole('cell', { name: '2.0' })).toBeInTheDocument()
    expect(within(await findBlanketOicPackageCard()).getByText('2.05')).toBeInTheDocument()
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

  it('hides Delete package while the Blanket OIC package has scale rows', async () => {
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

    const packageCard = await findBlanketOicPackageCard()
    expect(within(packageCard).getByRole('button', { name: 'Edit package' })).toBeEnabled()
    expect(
      within(packageCard).queryByRole('button', { name: 'Delete package' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageCard).queryByText('Delete unavailable while this package has scale details.'),
    ).not.toBeInTheDocument()
  })

  it('shows the Blanket OIC package selector only for two or more packages', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const packageCard = await findBlanketOicPackageCard()
    expect(screen.queryByRole('combobox', { name: 'Package number' })).not.toBeInTheDocument()
    expect(screen.queryByText('Blanket OIC package details')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create package' }).closest('.permit-package-toolbar'),
    ).not.toBeNull()
    expect(within(packageCard).getByRole('button', { name: 'Delete package' })).toBeEnabled()
    const scaleSummary = within(packageCard).getByRole('region', { name: 'Summary of scale' })
    expect(within(scaleSummary).getByRole('button', { name: 'Add scale' })).toBeEnabled()
    expect(within(scaleSummary).getByText('No scales yet.')).toBeInTheDocument()
  })

  it('shows a saved package inside the Scale tab, above the package card', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const packageCard = await findBlanketOicPackageCard()
    await userEvent.click(within(packageCard).getByRole('button', { name: 'Edit package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Comments'), ' updated')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    const result = await within(screen.getByRole('tabpanel')).findByText('Package saved.')
    expect(
      result.compareDocumentPosition(await findBlanketOicPackageCard()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('Blanket OIC package was updated.')).not.toBeInTheDocument()
  })

  it("moves focus to the new package's Edit package after a package is created", async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetailTabs
      .mockResolvedValueOnce({ ...tabsResult, packages: [editableBlanketOicPackage] })
      .mockResolvedValue({
        ...tabsResult,
        packages: [
          editableBlanketOicPackage,
          { ...editableBlanketOicPackage, packageNumber: 'BOIC-NEW' },
        ],
      })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.click(within(packageEditor).getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
    await waitFor(() =>
      expect(within(packageEditor).getByRole('combobox', { name: 'End use' })).toBeEnabled(),
    )
    await chooseDropdownOption(
      within(packageEditor).getByRole('combobox', { name: 'End use' }),
      'Lumber',
    )
    await userEvent.clear(within(packageEditor).getByLabelText('Volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Volume (m³)'), '100.0')
    await userEvent.clear(within(packageEditor).getByLabelText('Average length (m)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average length (m)'), '10.0')
    await userEvent.clear(within(packageEditor).getByLabelText('Average top diameter (rads)'))
    await userEvent.type(
      within(packageEditor).getByLabelText('Average top diameter (rads)'),
      '20.0',
    )
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    expect(await screen.findByText('Package saved.')).toBeInTheDocument()
    const newPackage = await findBlanketOicPackageCard('BOIC-NEW')
    await waitFor(() =>
      expect(within(newPackage).getByRole('button', { name: 'Edit package' })).toHaveFocus(),
    )

    // Opening the panel again returns focus to the button that opened it.
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    await userEvent.click(
      within(
        (await screen.findByRole('heading', { name: 'Create package' })).closest(
          '.application-detail-edit-section',
        ) as HTMLElement,
      ).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create package' })).toHaveFocus(),
    )
  })

  it('shows a single Ministerial package number as text on the Scale tab', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      items: [],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    const packageDetails = await screen.findByRole('group', { name: 'Package details' })
    const packageNumber = within(packageDetails)
      .getByText('Package number')
      .closest('.detail-field-item') as HTMLElement
    expect(within(packageNumber).getByText('MIN-1')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Package number' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Summary of scale' })).getByText('No scales yet.'),
    ).toBeInTheDocument()
  })

  it('cancels Blanket OIC package deletion without mutating or refreshing', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    const dialog = await openBlanketOicPackageDeleteConfirmation()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('cds--btn--danger')
    expect(dialog).toHaveTextContent(
      'Package BOIC-9 will be deleted. This action cannot be undone.',
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Are you sure you want to delete this package?' }),
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
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)
        expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledWith('777', 'BOIC-9')
        expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      })
      expect(
        await within(screen.getByRole('tabpanel')).findByText('Package deleted.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('dialog', { name: 'Are you sure you want to delete this package?' }),
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
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

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
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('The Blanket OIC package is no longer eligible for deletion.'),
    ).toBeInTheDocument()
    expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledTimes(1)
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Package deleted.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Are you sure you want to delete this package?' }),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()
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
      await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
      expect(await screen.findByText('Unable to open the selected document.')).toBeInTheDocument()
      await selectPermitDetailTab('Items')
      const packageRow = await findBlanketOicPackageCard()
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))

      const loadError = 'Unable to load the Blanket OIC package for editing.'
      expect(await screen.findByText(loadError)).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Edit package' })).not.toBeInTheDocument()
      expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
      expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledWith('BOIC-9')

      if (nextAction === 'Create package') {
        await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
        expect(await screen.findByRole('heading', { name: 'Create package' })).toBeVisible()
        const packageEditor = screen
          .getByRole('heading', { name: 'Create package' })
          .closest('.application-detail-edit-section') as HTMLElement
        expect(within(packageEditor).getByLabelText('Package number')).toHaveValue('')
        expect(within(packageEditor).getByLabelText('Comments')).toHaveValue('')
      } else {
        await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
        const packageEditor = (
          await screen.findByRole('heading', { name: 'Edit package' })
        ).closest('.application-detail-edit-section') as HTMLElement
        await waitFor(() =>
          expect(within(packageEditor).getByRole('button', { name: 'Save package' })).toBeEnabled(),
        )
        expect(within(packageEditor).getByLabelText('Comments')).toHaveValue('Current OIC package')
        expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledTimes(2)
      }
      expect(screen.queryByText(loadError)).not.toBeInTheDocument()
      expect(screen.queryByText('Package needs attention')).not.toBeInTheDocument()
      expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
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
    const packageRow = await findBlanketOicPackageCard()
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
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
    expect(screen.queryByRole('heading', { name: 'Edit package' })).not.toBeInTheDocument()
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
    const row = await findBlanketOicPackageCard()
    await userEvent.click(within(row).getByRole('button', { name: 'Edit package' }))
    expect(await screen.findByText('Loading package…')).toBeInTheDocument()
    await userEvent.click(
      within(screen.getByRole('complementary', { name: 'Edit package' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const editor = screen
      .getByRole('heading', { name: 'Create package' })
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
    expect(screen.getByRole('heading', { name: 'Create package' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit package' })).not.toBeInTheDocument()
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
    const row = await findBlanketOicPackageCard()
    await userEvent.click(within(row).getByRole('button', { name: 'Edit package' }))
    const editor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await waitFor(() => expect(within(editor).getByLabelText('Package number')).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'Package number' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add scale' })).toBeEnabled()
    expect(screen.queryByLabelText('Timber mark')).not.toBeInTheDocument()
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
      expect(selectedDropdownText(screen.getByRole('combobox', { name: 'Package number' }))).toBe(
        'BOIC-NEW',
      ),
    )
    expect(await screen.findByRole('heading', { name: 'Package BOIC-NEW' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit package' })).not.toBeInTheDocument()
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
      await chooseDropdownOption(
        await screen.findByRole('combobox', { name: 'Package number' }),
        'BOIC-10',
      )
      if (create) await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
      await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
      await selectPermitDetailTab('Items')
      expect(
        selectedDropdownText(await screen.findByRole('combobox', { name: 'Package number' })),
      ).toBe('BOIC-9')
      expect(screen.queryByRole('heading', { name: 'Create package' })).not.toBeInTheDocument()
    },
  )

  it.each([false, true])(
    'shows the federal export permit notice only for non-BOIC permits (BOIC: %s)',
    async (blanketOic) => {
      if (blanketOic) configureEditableBlanketOicPackage()
      renderPermitDetails()
      await selectPermitDetailTab('Permit')
      const link = screen.queryByRole('link', {
        name: 'Export Controls Online System (EXCOL)',
      })
      if (blanketOic) expect(link).not.toBeInTheDocument()
      else {
        expect(link).toHaveAttribute('href', 'https://www.nexcol-nceel.canada.ca/en/Home-Accueil')
        expect(
          link?.closest('.app-notification-container')?.querySelector('.app-inline-notification'),
        ).toHaveTextContent(
          'If this provincial permit also requires a federal permit, apply through Export Controls Online System (EXCOL).',
        )
      }
    },
  )

  it('keeps one federal export notice for a Ministerial permit, after the card in view and inside it in edit', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Permit')

    const findLink = () => {
      const panel = within(screen.getByRole('tabpanel'))
      const links = panel.getAllByRole('link', { name: 'Export Controls Online System (EXCOL)' })
      expect(links).toHaveLength(1)
      expect(links[0]).toHaveAttribute('href', 'https://www.nexcol-nceel.canada.ca/en/Home-Accueil')
      expect(links[0]).toHaveAttribute('target', '_blank')
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
      return {
        link: links[0],
        card: panel.getByRole('heading', { name: 'Permit details' }).closest('.cds--tile')!,
      }
    }

    const view = findLink()
    expect(view.card).not.toContainElement(view.link)
    expect(
      view.card.compareDocumentPosition(view.link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Edit permit details' }))
    const edit = findLink()
    expect(edit.card).toContainElement(edit.link)
    const saveChanges = within(edit.card as HTMLElement).getByRole('button', {
      name: 'Save changes',
    })
    expect(
      edit.link.compareDocumentPosition(saveChanges) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

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

  it('leaves the next permit untouched when a permit save finishes after the route changes', async () => {
    let resolveSave: (result: Awaited<ReturnType<typeof updatePermitDetail>>) => void = () =>
      undefined
    mockedUpdatePermitDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      remarks: `Remarks for ${requestedPermitNumber}`,
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
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Saved on 777')
    await userEvent.click(getActiveSectionSaveButton())
    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitNumber: '777', permitRemarks: 'Saved on 777' }),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('888'))
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const remarks = screen.getByLabelText('Remarks')
    expect(remarks).toHaveValue('Remarks for 888')
    await userEvent.type(remarks, ' draft')
    await act(async () => {
      resolveSave({
        success: true,
        message: 'The permit was updated successfully.',
        errors: [],
        warnings: [],
        source: 'api',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.queryByText('Permit details saved.')).toBeNull()
    expect(screen.getByLabelText('Remarks')).toHaveValue('Remarks for 888 draft')
    const save = getActiveSectionSaveButton()
    expect(save).toBeEnabled()
    await userEvent.click(save)

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenLastCalledWith(
        expect.objectContaining({ permitNumber: '888', permitRemarks: 'Remarks for 888 draft' }),
      ),
    )
    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
  })

  it('leaves the next permit untouched when a package save finishes after the route changes', async () => {
    let resolveSave: (result: Awaited<ReturnType<typeof updateBlanketOicPackage>>) => void = () =>
      undefined
    mockedUpdateBlanketOicPackage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    }))
    mockedFetchProvincialPermitDetailTabs.mockImplementation(async (request) => ({
      ...tabsResult,
      packages: [
        (typeof request === 'string' ? request : request.permitNumber) === '777'
          ? editableBlanketOicPackage
          : { ...editableBlanketOicPackage, packageNumber: 'BOIC-8' },
      ],
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

    await selectPermitDetailTab('Scale')
    const card = await findBlanketOicPackageCard()
    await userEvent.click(within(card).getByRole('button', { name: 'Edit package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Comments'), ' updated')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledOnce())

    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    await selectPermitDetailTab('Scale')
    const nextCard = await findBlanketOicPackageCard('BOIC-8')
    await act(async () => {
      resolveSave({
        success: true,
        message: 'Blanket OIC package was updated.',
        errors: [],
        warnings: [],
        permitNumber: '777',
        applicationNumber: '1000999',
        packageNumber: 'BOIC-9',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.queryByText('Package saved.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Package BOIC-9' })).toBeNull()
    expect(within(nextCard).getByRole('button', { name: 'Edit package' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeEnabled()
  })

  it('keeps the reviewed permit edit actions at the bottom of the Permit details card', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))

    const card = screen
      .getByRole('heading', { level: 2, name: 'Permit details' })
      .closest('.cds--tile') as HTMLElement
    const actions = within(card)
      .getByRole('button', { name: 'Save changes' })
      .closest('.legacy-search-actions') as HTMLElement
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save changes'])
    expect(card.lastElementChild).toBe(actions)
  })

  it('keeps edit actions for other permit types at the bottom of the Financial and volume card', async () => {
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))

    const summaryCard = screen
      .getByRole('heading', { level: 2, name: 'Permit summary' })
      .closest('.cds--tile') as HTMLElement
    const financialCard = screen
      .getByRole('heading', { level: 2, name: 'Financial and volume' })
      .closest('.cds--tile') as HTMLElement
    expect(summaryCard).not.toBe(financialCard)
    expect(within(summaryCard).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(
      within(summaryCard).queryByRole('button', { name: 'Save permit' }),
    ).not.toBeInTheDocument()

    const actions = within(financialCard)
      .getByRole('button', { name: 'Save permit' })
      .closest('.legacy-search-actions') as HTMLElement
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save permit'])
    expect(financialCard.lastElementChild).toBe(actions)
    expect(screen.getAllByRole('button', { name: 'Save permit' })).toHaveLength(1)
  })

  it('keeps the Blanket OIC fee cards and their edit actions before any package exists', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
      receiptNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    const permitFeesCard = (
      await screen.findByRole('heading', { name: 'Permit fees', level: 2 })
    ).closest('.cds--tile') as HTMLElement
    expect(
      await within(permitFeesCard).findByRole('button', { name: 'Edit fee override' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Package fees', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel').querySelector('.lexis-empty-state--tab')).toBeNull()
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
      expect(
        await screen.findByRole('heading', { name: 'No packages for this permit' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'No package details' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Summary of scale' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      const heading = await screen.findByRole('heading', { name: 'Create package' })
      const packageEditor = heading.closest('.application-detail-edit-section') as HTMLElement
      expect(packageEditor).toBeTruthy()
      expect(
        within(packageEditor).queryByRole('combobox', { name: 'Status' }),
      ).not.toBeInTheDocument()
      expect(
        within(packageEditor).queryByRole('group', { name: 'Reprocessed' }),
      ).not.toBeInTheDocument()

      await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
      expect(within(packageEditor).getByText('Required fields')).toBeInTheDocument()
      expect(within(packageEditor).getByRole('combobox', { name: 'Age class' })).toHaveTextContent(
        'Old growth',
      )
      expect(within(packageEditor).getByLabelText('Volume (m³)')).toHaveValue('0.0')
      expect(within(packageEditor).getByLabelText('Average length (m)')).toHaveValue('0.0')
      expect(within(packageEditor).getByLabelText('Average top diameter (rads)')).toHaveValue('0.0')
      expect(within(packageEditor).getAllByText('Must be greater than 0')).toHaveLength(2)
      const speciesList = within(packageEditor).getByRole('combobox', { name: /^Species list/ })
      await userEvent.click(speciesList)
      await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
      await userEvent.click(
        await within(packageEditor).findByRole('option', { name: /HE - Hemlock/ }),
      )
      await waitFor(() =>
        expect(within(packageEditor).getByRole('combobox', { name: 'End use' })).toBeEnabled(),
      )
      await chooseDropdownOption(
        within(packageEditor).getByRole('combobox', { name: 'End use' }),
        'Lumber',
      )
      await userEvent.clear(within(packageEditor).getByLabelText('Volume (m³)'))
      await userEvent.type(within(packageEditor).getByLabelText('Volume (m³)'), '100.0')
      const averageLength = within(packageEditor).getByLabelText('Average length (m)')
      await userEvent.clear(averageLength)
      await userEvent.type(averageLength, '0')
      await userEvent.clear(within(packageEditor).getByLabelText('Average top diameter (rads)'))
      await userEvent.type(
        within(packageEditor).getByLabelText('Average top diameter (rads)'),
        '20.0',
      )
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

      expect(
        await within(packageEditor).findByText('Enter a length greater than 0 and no more than 99'),
      ).toBeInTheDocument()
      expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()

      await userEvent.clear(averageLength)
      await userEvent.type(averageLength, '10.0')
      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

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
        expect(screen.getByText('Package saved.')).toBeInTheDocument()
      })

      // The permit read when its editor opens includes the hidden application the package created.
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicApplicationNumber: 1000999,
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
    const packageRow = await findBlanketOicPackageCard()
    expect(within(packageRow).queryByText('SHT - Shutout')).not.toBeInTheDocument()
    expect(within(packageRow).queryByText('Y')).not.toBeInTheDocument()

    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
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
    ['Volume (m³)', '10.25', 'Package volume must have no more than one decimal place'],
    ['Volume (m³)', '0', 'Enter a volume greater than 0 and no more than 120.5'],
    ['Volume (m³)', '120.6', 'Enter a volume greater than 0 and no more than 120.5'],
    ['Average length (m)', '0', 'Enter a length greater than 0 and no more than 99'],
    ['Average length (m)', '-1', 'Enter a length greater than 0 and no more than 99'],
    ['Average top diameter (rads)', '0', 'Enter a diameter greater than 0 and no more than 99.99'],
    ['Average top diameter (rads)', '-1', 'Enter a diameter greater than 0 and no more than 99.99'],
    [
      'Average top diameter (rads)',
      '100',
      'Enter a diameter greater than 0 and no more than 99.99',
    ],
  ])('keeps invalid Blanket OIC %s out of the save request', async (fieldLabel, value, error) => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = await findBlanketOicPackageCard()
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const field = within(packageEditor).getByLabelText(fieldLabel)
    await userEvent.clear(field)
    await userEvent.type(field, value)
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    expect(await within(packageEditor).findByText(error)).toBeInTheDocument()
    expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
  })

  it.each([
    { comments: 'A'.repeat(180), error: null },
    { comments: 'A'.repeat(181), error: 'Package comments must be 180 characters or fewer' },
    {
      comments: 'Review caf\u00e9',
      error:
        'Package comments contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
    },
  ])(
    'validates Blanket OIC package comments before saving ($error)',
    async ({ comments, error }) => {
      configureEditableBlanketOicPackage()
      renderPermitDetails()
      await selectPermitDetailTab('Items')
      const packageRow = await findBlanketOicPackageCard()
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
      const editor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
        '.application-detail-edit-section',
      ) as HTMLElement
      const field = within(editor).getByLabelText('Comments')
      const save = within(editor).getByRole('button', { name: 'Save package' })
      await waitFor(() => expect(save).toBeEnabled())
      expect(field).toHaveAttribute('maxlength', '180')
      fireEvent.change(field, { target: { value: comments } })
      expect(field).toHaveValue(comments)

      if (!error) {
        await userEvent.type(field, 'Z')
        expect(field).toHaveValue(comments)
        expect(within(editor).getByText('180/180')).toBeInTheDocument()
      }
      await userEvent.click(save)
      if (error) {
        expect(await within(editor).findByText(error)).toBeInTheDocument()
        expect(field).toHaveAttribute('aria-invalid', 'true')
        expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
      } else {
        await waitFor(() =>
          expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledWith(
            expect.objectContaining({ comments }),
          ),
        )
      }
    },
  )

  it('preserves loaded Blanket OIC package comments above the input limit', async () => {
    configureEditableBlanketOicPackage()
    const comments = 'A'.repeat(181)
    mockedFetchBlanketOicPackageEditContext.mockResolvedValue({
      packageNumber: 'BOIC-9',
      volume: '120.5',
      averageLength: '7.1',
      averageDiameter: '16.2',
      status: 'ACT',
      comments,
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['HE'],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Items')
    const packageRow = await findBlanketOicPackageCard()
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
    await waitFor(() => expect(screen.getByLabelText('Comments')).toHaveValue(comments))
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
    const firstPackageRow = await findBlanketOicPackageCard()
    await userEvent.click(within(firstPackageRow).getByRole('button', { name: 'Edit package' }))
    const firstPackageEditor = (
      await screen.findByRole('heading', { name: 'Edit package' })
    ).closest('.application-detail-edit-section') as HTMLElement
    const averageLength = within(firstPackageEditor).getByLabelText('Average length (m)')
    await userEvent.clear(averageLength)
    await userEvent.type(averageLength, '0')
    await userEvent.click(within(firstPackageEditor).getByRole('button', { name: 'Save package' }))

    const validationMessage = 'Enter a length greater than 0 and no more than 99'
    expect(await within(firstPackageEditor).findByText(validationMessage)).toBeInTheDocument()
    const packageSelect = screen.getByRole('combobox', { name: 'Package number' })
    expect(packageSelect).toBeEnabled()

    await userEvent.click(within(firstPackageEditor).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(screen.queryByText(validationMessage)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const newPackageEditor = (
      await screen.findByRole('heading', { name: 'Create package' })
    ).closest('.application-detail-edit-section') as HTMLElement
    expect(within(newPackageEditor).queryByText(validationMessage)).not.toBeInTheDocument()
    await userEvent.click(within(newPackageEditor).getByRole('button', { name: 'Cancel' }))
    // The closed panel returns focus to Create package.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create package' })).toHaveFocus(),
    )

    expect(packageSelect).toBeEnabled()
    await chooseDropdownOption(packageSelect, 'BOIC-10')
    const secondPackageRow = await findBlanketOicPackageCard('BOIC-10')
    await userEvent.click(within(secondPackageRow).getByRole('button', { name: 'Edit package' }))
    const secondPackageEditor = (
      await screen.findByRole('heading', { name: 'Edit package' })
    ).closest('.application-detail-edit-section') as HTMLElement
    expect(within(secondPackageEditor).getByLabelText('Package number')).toHaveValue('BOIC-10')
    expect(within(secondPackageEditor).getByLabelText('Average length (m)')).toHaveValue('7.1')
    expect(within(secondPackageEditor).queryByText(validationMessage)).not.toBeInTheDocument()
  })

  it('accepts the permit request volume and the maximum Blanket OIC package dimensions', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = await findBlanketOicPackageCard()
    await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const volume = within(packageEditor).getByLabelText('Volume (m³)')
    await userEvent.clear(volume)
    await userEvent.type(volume, '120.5')
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
          volume: '120.5',
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
      const packageRow = await findBlanketOicPackageCard()
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
      const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
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

  it('offers BOIC package and scale changes to submitters on a Payment pending permit', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00067890')
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = await findBlanketOicPackageCard()
    expect(within(packageRow).getByRole('button', { name: 'Edit package' })).toBeEnabled()
    expect(within(packageRow).getByRole('button', { name: 'Delete package' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add scale' })).toBeEnabled()
  })

  it.each(['COM', 'EXP', 'CAN'])(
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
      const packageRow = await findBlanketOicPackageCard()
      expect(
        within(packageRow).queryByRole('button', { name: 'Edit package' }),
      ).not.toBeInTheDocument()
      expect(
        within(packageRow).queryByRole('button', { name: 'Delete package' }),
      ).not.toBeInTheDocument()
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
    const packageRow = await findBlanketOicPackageCard()
    expect(
      within(packageRow).queryByRole('button', { name: 'Edit package' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageRow).queryByRole('button', { name: 'Delete package' }),
    ).not.toBeInTheDocument()
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
      interior: true,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    const packageRow = await findBlanketOicPackageCard()
    expect(
      within(packageRow).queryByRole('button', { name: 'Edit package' }),
    ).not.toBeInTheDocument()
    expect(
      within(packageRow).queryByRole('button', { name: 'Delete package' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  it('shows Create package errors on their fields and focuses the first one', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const save = within(packageEditor).getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    await userEvent.click(save)

    expect(await within(packageEditor).findByText('Enter a package number')).toBeVisible()
    expect(within(packageEditor).getByText('Select at least one species')).toBeVisible()
    expect(within(packageEditor).queryByText('Select an end use')).not.toBeInTheDocument()
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(within(packageEditor).getByLabelText('Package number')).toHaveFocus(),
    )

    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.click(within(packageEditor).getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
    const endUse = within(packageEditor).getByRole('combobox', { name: 'End use' })
    await waitFor(() => expect(endUse).toBeEnabled())
    await userEvent.click(save)

    expect(await within(packageEditor).findByText('Select an end use')).toBeVisible()
    await waitFor(() => expect(endUse).toHaveFocus())
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
  })

  it('limits a package volume to the permit request volume', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestVolume: 200,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [editableBlanketOicPackage],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const volume = within(packageEditor).getByLabelText('Volume (m³)')
    expect(volume).toHaveAttribute('aria-required', 'true')
    expect(
      within(packageEditor).getByText(
        'Must be less than or equal to permit request volume. Must be greater than 0',
      ),
    ).toBeVisible()
    const save = within(packageEditor).getByRole('button', { name: 'Save package' })
    const limitError = 'Enter a volume greater than 0 and no more than 200.0'

    for (const value of ['0', '200.1']) {
      await userEvent.clear(volume)
      await userEvent.type(volume, value)
      await userEvent.click(save)
      expect(await within(packageEditor).findByText(limitError)).toBeVisible()
    }
    await userEvent.clear(volume)
    await userEvent.type(volume, '200')
    await userEvent.click(save)
    await within(packageEditor).findByText('Enter a package number')
    expect(within(packageEditor).queryByText(limitError)).not.toBeInTheDocument()
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
  })

  it('shows the server total volume error on the Volume field', async () => {
    configureEditableBlanketOicPackage()
    mockedAddBlanketOicPackage.mockResolvedValueOnce({
      success: false,
      message: '',
      errors: ['The total package volume must not exceed the permit request volume (120.5).'],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '1000999',
      packageNumber: 'BOIC-NEW',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.click(within(packageEditor).getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
    const endUse = within(packageEditor).getByRole('combobox', { name: 'End use' })
    await waitFor(() => expect(endUse).toBeEnabled())
    await chooseDropdownOption(endUse, 'Lumber')
    const volume = within(packageEditor).getByLabelText('Volume (m³)')
    await userEvent.clear(volume)
    await userEvent.type(volume, '1')
    await userEvent.clear(within(packageEditor).getByLabelText('Average length (m)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average length (m)'), '2')
    await userEvent.clear(within(packageEditor).getByLabelText('Average top diameter (rads)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average top diameter (rads)'), '2')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    expect(
      await within(packageEditor).findByText(
        'The total package volume must not exceed the permit request volume (120.5)',
      ),
    ).toBeVisible()
    expect(volume).toHaveAttribute('aria-invalid', 'true')
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())
  })

  it('shows a taken package number on its field and reads ".1" and "2,5" as numbers', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
      oicRequestVolume: 1,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
    mockedAddBlanketOicPackage.mockResolvedValueOnce({
      success: false,
      message: '',
      errors: ['Package 2 already exists.'],
      warnings: [],
      permitNumber: '777',
      applicationNumber: '',
      packageNumber: '2',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
    const packageNumber = within(packageEditor).getByLabelText('Package number')
    await userEvent.type(packageNumber, '2')
    await userEvent.click(within(packageEditor).getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
    const endUse = within(packageEditor).getByRole('combobox', { name: 'End use' })
    await waitFor(() => expect(endUse).toBeEnabled())
    await chooseDropdownOption(endUse, 'Lumber')
    await userEvent.clear(within(packageEditor).getByLabelText('Volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Volume (m³)'), '.1')
    await userEvent.clear(within(packageEditor).getByLabelText('Average length (m)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average length (m)'), '2,5')
    await userEvent.clear(within(packageEditor).getByLabelText('Average top diameter (rads)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average top diameter (rads)'), '2')
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    await waitFor(() =>
      expect(mockedAddBlanketOicPackage).toHaveBeenCalledWith(
        expect.objectContaining({ packageNumber: '2', volume: '0.1', averageLength: '2.5' }),
      ),
    )
    expect(await within(packageEditor).findByText('Package 2 already exists')).toBeVisible()
    expect(within(packageEditor).getByLabelText('Volume (m³)')).toHaveValue('0.1')
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()
    await waitFor(() => expect(packageNumber).toHaveFocus())

    await userEvent.type(packageNumber, '5')
    expect(within(packageEditor).queryByText('Package 2 already exists')).not.toBeInTheDocument()
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()
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
        name: 'Create package',
      })
    ).closest('.application-detail-edit-section') as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.click(within(packageEditor).getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await within(packageEditor).findByRole('option', { name: /FI - Fir/ }))
    await waitFor(() =>
      expect(within(packageEditor).getByRole('combobox', { name: 'End use' })).toBeEnabled(),
    )
    await chooseDropdownOption(
      within(packageEditor).getByRole('combobox', { name: 'End use' }),
      'Lumber',
    )
    await userEvent.clear(within(packageEditor).getByLabelText('Volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Volume (m³)'), '100.0')
    await userEvent.clear(within(packageEditor).getByLabelText('Average length (m)'))
    await userEvent.type(within(packageEditor).getByLabelText('Average length (m)'), '10.0')
    await userEvent.clear(within(packageEditor).getByLabelText('Average top diameter (rads)'))
    await userEvent.type(
      within(packageEditor).getByLabelText('Average top diameter (rads)'),
      '20.0',
    )
    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Save package' }))

    await waitFor(() => expect(mockedAddBlanketOicPackage).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText('Reload before making another package change.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Package saved.')).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    await chooseDropdownOption(await screen.findByRole('combobox', { name: 'Species' }), 'Alder')
    await chooseDropdownOption(screen.getByRole('combobox', { name: 'Grade' }), 'Utility')
    await userEvent.type(screen.getByLabelText('Pieces'), '12')
    await userEvent.clear(screen.getByLabelText('Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    await waitFor(() => expect(mockedAddBlanketOicScale).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Reload before adding another scale row.')).toBeInTheDocument()
    expect(screen.getByText('Scale saved.')).toBeInTheDocument()
    const committedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(committedUnload)
    expect(committedUnload.defaultPrevented).toBe(false)
  })

  it('keeps a BOIC scale draft in its drawer until save or confirmed discard', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    expect(screen.queryByLabelText('Timber mark')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
    const pristineUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pristineUnload)
    expect(pristineUnload.defaultPrevented).toBe(false)
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Save scale' })).toBeEnabled(),
    )
    await waitFor(() => expect(within(panel).getByLabelText('Timber mark')).toHaveFocus())
    expect(within(panel).getByLabelText('Volume (m³)')).toHaveValue('0.0')
    expect(
      within(panel).getByText('Must be less than or equal to remaining package volume (2.0 m³)'),
    ).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    expect(await within(panel).findByText('Enter a timber mark')).toBeInTheDocument()
    expect(within(panel).getByText('Enter a whole number of pieces')).toBeInTheDocument()
    expect(within(panel).getByText('Select a species')).toBeInTheDocument()
    expect(within(panel).getByText('Enter a volume greater than 0')).toBeInTheDocument()
    expect(within(panel).queryByText('Scale needs attention')).not.toBeInTheDocument()
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
    await waitFor(() => expect(within(panel).getByLabelText('Timber mark')).toHaveFocus())
    await userEvent.type(within(panel).getByLabelText('Timber mark'), 'KEEP-ME')
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    )
    expect(within(panel).getByLabelText('Timber mark')).toHaveValue('KEEP-ME')
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(screen.queryByRole('complementary', { name: 'Add scale' })).not.toBeInTheDocument()
    const discardedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(discardedUnload)
    expect(discardedUnload.defaultPrevented).toBe(false)
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add scale' })).toHaveFocus())
  })

  it('settles focus in the scale panel after discarding a package draft', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const packagePanel = screen.getByRole('complementary', { name: 'Create package' })
    const packageNumber = within(packagePanel).getByLabelText('Package number')
    await waitFor(() => expect(packageNumber).toBeEnabled())
    await userEvent.type(packageNumber, 'DRAFT-PACKAGE')
    const addScale = screen.getByRole('button', { name: 'Add scale' })
    await waitFor(() => expect(addScale).toBeEnabled())

    await userEvent.click(addScale)
    expect(screen.getAllByRole('dialog', { name: 'Discard changes?' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(packageNumber).toHaveValue('DRAFT-PACKAGE')
    await waitFor(() => expect(addScale).toHaveFocus())

    await userEvent.click(addScale)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    expect(screen.getByLabelText('Timber mark')).toHaveFocus()
    expect(screen.queryByRole('complementary', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
  })

  it('returns focus to collapsed Species when keeping the scale draft after native Escape', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    const species = within(panel).getByRole('combobox', { name: 'Species' })
    await chooseDropdownOption(species, 'Hemlock')
    species.focus()
    expect(species).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(species, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 })
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(species).toHaveFocus())
    expect(species).toHaveTextContent('Hemlock')
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
  })

  it('holds the BOIC scale package and draft through a rejected in-flight save', async () => {
    configureEditableBlanketOicPackage()
    let resolveSave!: (result: Awaited<ReturnType<typeof addBlanketOicScale>>) => void
    mockedAddBlanketOicScale.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    await userEvent.type(within(panel).getByLabelText('Timber mark'), 'TM-RETRY')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Species' }), 'Hemlock')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    await userEvent.type(within(panel).getByLabelText('Pieces'), '4')
    await userEvent.clear(within(panel).getByLabelText('Volume (m³)'))
    await userEvent.type(within(panel).getByLabelText('Volume (m³)'), '1.5')
    const save = within(panel).getByRole('button', { name: 'Save scale' })
    await waitFor(() => expect(save).toBeEnabled())
    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })
    expect(mockedAddBlanketOicScale).toHaveBeenCalledTimes(1)
    expect(within(panel).getByRole('button', { name: 'Saving scale' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeDisabled()
    await act(async () =>
      resolveSave({
        success: false,
        message: 'Record changed. Reload before retrying.',
        errors: [],
        warnings: [],
      }),
    )
    expect(
      await within(panel).findByText('Record changed. Reload before retrying.'),
    ).toBeInTheDocument()
    expect(within(panel).getByLabelText('Timber mark')).toHaveValue('TM-RETRY')
    expect(within(panel).getByLabelText('Volume (m³)')).toHaveValue('1.5')
    expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
      expect.objectContaining({ packageNumber: 'BOIC-9', timberMark: 'TM-RETRY' }),
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Add scale' })).not.toBeInTheDocument(),
    )
    expect(mockedAddBlanketOicScale).toHaveBeenCalledTimes(2)
  })

  it('shows Add scale errors on their fields, including the server checks', async () => {
    configureEditableBlanketOicPackage()
    mockedAddBlanketOicScale.mockResolvedValueOnce({
      success: false,
      message: 'Scale was not added.',
      errors: [
        'Timber mark TM-BAD is not valid for exemption 123.',
        'A scale with the same timber mark/species/grade combination already exists.',
      ],
      warnings: [],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    await userEvent.type(within(panel).getByLabelText('Timber mark'), 'TM-BAD')
    await userEvent.type(within(panel).getByLabelText('Pieces'), '4')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Species' }), 'Hemlock')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    const volume = within(panel).getByLabelText('Volume (m³)')
    await userEvent.clear(volume)
    await userEvent.type(volume, '2.5')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))

    expect(
      await within(panel).findByText(
        'Must be less than or equal to remaining package volume (2.0 m³)',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()

    await userEvent.clear(volume)
    await userEvent.type(volume, '.5')
    expect(volume).not.toHaveAttribute('aria-invalid', 'true')
    expect(
      within(panel).getByText('Must be less than or equal to remaining package volume (2.0 m³)'),
    ).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))

    await waitFor(() =>
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({ timberMark: 'TM-BAD', scaleVolume: '0.5', scalePieces: '4' }),
      ),
    )
    expect(
      await within(panel).findByText('Timber mark TM-BAD is not valid for exemption 123'),
    ).toBeInTheDocument()
    expect(within(panel).getByText('Scale needs attention')).toBeInTheDocument()
    expect(
      within(panel).getByText(
        'A scale with the same timber mark/species/grade combination already exists.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByLabelText('Timber mark')).toHaveFocus())
  })

  it('limits a new scale to the exact remaining package volume', async () => {
    configureEditableBlanketOicPackage()
    // Scales of 0.25 and 0.25 in a 2.00 package: the rounded total reads 0.6, but 1.50 remains.
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        {
          ...editableBlanketOicPackage,
          packageVolume: '2.0',
          currentPackageVolume: '0.6',
          remainingVolume: '1.5',
        },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    expect(
      within(panel).getByText('Must be less than or equal to remaining package volume (1.5 m³)'),
    ).toBeInTheDocument()
    await userEvent.type(within(panel).getByLabelText('Timber mark'), 'TM-EXACT')
    await userEvent.type(within(panel).getByLabelText('Pieces'), '1')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Species' }), 'Hemlock')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    const volume = within(panel).getByLabelText('Volume (m³)')

    await userEvent.clear(volume)
    await userEvent.type(volume, '1.51')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    expect(
      await within(panel).findByText(
        'Must be less than or equal to remaining package volume (1.5 m³)',
      ),
    ).toBeInTheDocument()
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()

    await userEvent.clear(volume)
    await userEvent.type(volume, '1.50')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    await waitFor(() =>
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({ timberMark: 'TM-EXACT', scaleVolume: '1.50' }),
      ),
    )
  })

  it('uppercases the Add scale timber mark and accepts zero pieces but not blank pieces', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = await screen.findByRole('complementary', { name: 'Add scale' })
    const timberMark = within(panel).getByLabelText('Timber mark')
    await userEvent.type(timberMark, 'ek123a')
    expect(timberMark).toHaveValue('EK123A')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Species' }), 'Hemlock')
    await chooseDropdownOption(within(panel).getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    await userEvent.clear(within(panel).getByLabelText('Volume (m³)'))
    await userEvent.type(within(panel).getByLabelText('Volume (m³)'), '1.5')

    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    expect(await within(panel).findByText('Enter a whole number of pieces')).toBeInTheDocument()
    expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()

    await userEvent.type(within(panel).getByLabelText('Pieces'), '0')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save scale' }))
    await waitFor(() =>
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({ timberMark: 'EK123A', scalePieces: '0', scaleVolume: '1.5' }),
      ),
    )
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
    expect(selectedDropdownText(packageSelect)).toBe('BOIC-9')
    await chooseDropdownOption(packageSelect, 'BOIC-10')
    await chooseDropdownOption(packageSelect, 'BOIC-9')

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
    expect(selectedDropdownText(packageSelect)).toBe('BOIC-9')
    expect(await screen.findByRole('heading', { name: 'Package BOIC-9' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Package BOIC-10' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TM-9' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'TM-10' })).not.toBeInTheDocument()

    await chooseDropdownOption(packageSelect, 'BOIC-10')
    expect(selectedDropdownText(packageSelect)).toBe('BOIC-10')
    expect(await screen.findByRole('heading', { name: 'Package BOIC-10' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Package BOIC-9' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TM-10' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'TM-9' })).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    // The page stays usable beside the panel, and replacing a panel with entered data asks first.
    expect(packageSelect).toBeEnabled()
    const selectedPackageRow = await findBlanketOicPackageCard('BOIC-10')
    expect(within(selectedPackageRow).getByRole('button', { name: 'Edit package' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    )
    expect(screen.getByLabelText('Timber mark')).toHaveValue('TM-NEW')
    expect(screen.queryByRole('heading', { name: 'Create package' })).not.toBeInTheDocument()
    // BOIC-10 has scale rows, so it can't be deleted.
    expect(
      within(selectedPackageRow).queryByRole('button', { name: 'Delete package' }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      within(screen.getByRole('complementary', { name: 'Add scale' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    const discardScale = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discardScale).getByRole('button', { name: 'Discard changes' }))
    expect(packageSelect).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create package' })).toBeEnabled()
    expect(within(selectedPackageRow).getByRole('button', { name: 'Edit package' })).toBeEnabled()
    expect(screen.queryByLabelText('Timber mark')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))
    expect(screen.getByLabelText('Timber mark')).toHaveValue('')
    await chooseDropdownOption(await screen.findByRole('combobox', { name: 'Species' }), 'Hemlock')
    await userEvent.type(screen.getByLabelText('Timber mark'), 'TM-NEW')
    await chooseDropdownOption(screen.getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    await userEvent.type(screen.getByLabelText('Pieces'), '4')
    await userEvent.clear(screen.getByLabelText('Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

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

    expect(selectedDropdownText(packageSelect)).toBe('PKG-1 (1 trailing space)')
    const paddedPackageRow = await findBlanketOicPackageCard('PKG-1 ')
    await userEvent.click(within(paddedPackageRow).getByRole('button', { name: 'Edit package' }))
    await waitFor(() => {
      expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledWith('PKG-1 ')
    })
    const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement
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
      expect(selectedDropdownText(packageSelect)).toBe('PKG-1 (1 trailing space)')
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    await userEvent.type(screen.getByLabelText('Timber mark'), 'TM-PAD')
    await chooseDropdownOption(screen.getByRole('combobox', { name: 'Species' }), 'Hemlock')
    await chooseDropdownOption(screen.getByRole('combobox', { name: 'Grade' }), 'Sawlog')
    await userEvent.type(screen.getByLabelText('Pieces'), '4')
    await userEvent.clear(screen.getByLabelText('Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    await waitFor(() => {
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith(
        expect.objectContaining({ packageNumber: 'PKG-1 ', timberMark: 'TM-PAD' }),
      )
    })

    const refreshedPaddedPackageRow = await findBlanketOicPackageCard('PKG-1 ')
    await userEvent.click(
      within(refreshedPaddedPackageRow).getByRole('button', { name: 'Delete package' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this package?',
    })
    expect(dialog).toHaveTextContent('Package PKG-1 (1 trailing space) will be deleted.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockedDeleteBlanketOicPackage).toHaveBeenCalledWith('777', 'PKG-1 ')
    })
  })

  it('shows only the selected padded BOIC package fee row', async () => {
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
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-PLAIN',
          packageNumber: 'PKG-1',
          timberMark: 'TM-PLAIN',
          amountDisplay: '$1.00',
        },
        {
          ...calculatedPermitFees.fees[0],
          id: 'FEE-PADDED',
          packageNumber: 'PKG-1 ',
          timberMark: 'TM-PADDED',
          amountDisplay: '$2.00',
        },
      ],
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [
        { ...editableBlanketOicPackage, packageNumber: 'PKG-1' },
        { ...editableBlanketOicPackage, packageNumber: 'PKG-1 ' },
      ],
    })

    renderPermitDetails()
    await selectPermitDetailTab('Scale')
    await chooseDropdownOption(
      await screen.findByRole('combobox', { name: 'Package number' }),
      'PKG-1 (1 trailing space)',
    )
    await selectPermitDetailTab('Fees')

    const packageFeesTile = (await screen.findByRole('heading', { name: 'Package fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    expect(
      selectedDropdownText(
        within(packageFeesTile).getByRole('combobox', { name: 'Package number' }),
      ),
    ).toBe('PKG-1 (1 trailing space)')
    const feeRows = within(packageFeesTile).getByRole('table')
    expect(within(feeRows).getByText('TM-PADDED')).toBeInTheDocument()
    expect(within(feeRows).queryByText('TM-PLAIN')).not.toBeInTheDocument()
  })

  it.each(['A', 'Grade A'])('adds and removes scales: %s', async (grade) => {
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
          grade,
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
    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    await chooseDropdownOption(await screen.findByRole('combobox', { name: 'Species' }), 'Alder')
    await chooseDropdownOption(screen.getByRole('combobox', { name: 'Grade' }), 'Utility')
    await userEvent.type(screen.getByLabelText('Pieces'), '12')
    await userEvent.clear(screen.getByLabelText('Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    await waitFor(() => {
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith({
        permitNumber: '777',
        packageNumber: 'BOIC-9',
        timberMark: 'TM-NEW',
        speciesCode: 'AL',
        gradeCode: 'W',
        scalePieces: '12',
        scaleVolume: '1.5',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
      expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(2)
    })
    const scaleSummary = screen.getByRole('region', { name: 'Summary of scale' })
    expect(await within(scaleSummary).findByText('Scale saved.')).toBeInTheDocument()

    await selectPermitDetailTab('Permit')
    const permitVolumeField = screen
      .getByText('Current permit volume (m³)')
      .closest('.record-field') as HTMLElement
    const permitPiecesField = screen
      .getByText('Current permit pieces')
      .closest('.record-field') as HTMLElement
    expect(within(permitVolumeField).getByText('130.5')).toBeInTheDocument()
    expect(within(permitPiecesField).getByText('22')).toBeInTheDocument()

    await selectPermitDetailTab('Items')
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Scale rows' })).getByRole('button', {
        name: `Delete scale TM-9, HE, grade ${grade}`,
      }),
    )
    const removalConfirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this scale?',
    })
    expect(removalConfirmation).toHaveTextContent(
      'Timber mark TM-9 · HE · Grade A · 10.5 m³ will be deleted. This action cannot be undone.',
    )
    expect(mockedDeleteBlanketOicScale).not.toHaveBeenCalled()
    await userEvent.click(within(removalConfirmation).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockedDeleteBlanketOicScale).toHaveBeenCalledWith({
        scaleId: 'SCALE-9',
        permitNumber: '777',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(3)
      expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(3)
    })
    expect(
      await within(screen.getByRole('region', { name: 'Summary of scale' })).findByText(
        'Scale deleted.',
      ),
    ).toBeInTheDocument()
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
    expect(expiryDate).toBeDisabled()
    expect(expiryDate).not.toHaveAttribute('aria-required')
    expect(
      document.querySelector('label[for="permit-permitExpiryDate"] .required-label__marker'),
    ).not.toBeInTheDocument()
    const permitStatusSelect = screen.getByLabelText('Status')
    expect(permitStatusSelect).toHaveValue('COM')
    expect(within(permitStatusSelect).getByRole('option', { name: /Active/ })).toBeInTheDocument()
    expect(
      within(permitStatusSelect).queryByRole('option', { name: /Payment pending/i }),
    ).not.toBeInTheDocument()
    expect(within(permitStatusSelect).getByRole('option', { name: /Expired/ })).toBeInTheDocument()
    await userEvent.selectOptions(permitStatusSelect, 'ACT')
    expect(screen.queryByLabelText('Region')).not.toBeInTheDocument()
    expect(screen.getByText('Region').nextElementSibling).toHaveTextContent(
      'Cariboo Natural Resource Region',
    )
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
    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
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
    const activePermit = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activePermit)
      .mockResolvedValue({ ...activePermit, issueDate: null, expiryDate: null })
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
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'CAN',
          permitIssueDate: '',
          permitExpiryDate: '',
        }),
      )
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText('Issued date').parentElement?.querySelector('dd'),
    ).not.toHaveTextContent('Not provided')
    expect(
      screen.getByText('Expiry date').parentElement?.querySelector('dd'),
    ).not.toHaveTextContent('Not provided')
  })

  it.each([
    { targetStatus: 'CAN', description: 'Cancelled', currentStatus: 'ACT', submitter: false },
    { targetStatus: 'EXP', description: 'Expired', currentStatus: 'ACT', submitter: false },
    { targetStatus: 'COM', description: 'Completed', currentStatus: 'PPD', submitter: true },
  ])(
    'focuses the saved notice when a save to $targetStatus removes the permit Edit button (submitter: $submitter)',
    async ({ targetStatus, description, currentStatus, submitter }) => {
      const visibleRects = vi
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
      try {
        if (submitter) {
          mockedUseAuth.mockReturnValue(
            createTestAuthContext({
              capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
              canPerform: (action: string) => action !== '/permitsReview',
            }),
          )
        }
        const currentPermit = {
          ...permitDetail,
          permitStatusCode: currentStatus,
          permitStatusDescription: currentStatus === 'ACT' ? 'Active' : 'Payment pending',
          blanketOic: true,
          oicRequestPieces: 200,
          oicRequestVolume: 120.5,
        }
        // The permit is read on load and again when its editor opens.
        mockedFetchProvincialPermitDetail
          .mockResolvedValueOnce(currentPermit)
          .mockResolvedValueOnce(currentPermit)
          .mockResolvedValue({
            ...currentPermit,
            permitStatusCode: targetStatus,
            permitStatusDescription: description,
          })
        renderPermitDetails()

        await userEvent.click(
          await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
        )
        await userEvent.selectOptions(screen.getByLabelText('Status'), targetStatus)
        await userEvent.click(getActiveSectionSaveButton())

        const notice = (await screen.findByText('Permit details saved.')).closest(
          '.app-inline-notification',
        )
        await waitFor(() => expect(notice).toHaveFocus())
        expect(
          screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
        ).not.toBeInTheDocument()
      } finally {
        visibleRects.mockRestore()
      }
    },
  )

  it('clears blank dates when an active Blanket OIC permit remains active', async () => {
    const activePermit = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activePermit)
      .mockResolvedValue({ ...activePermit, issueDate: null, expiryDate: null })
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
    await userEvent.click(getActiveSectionSaveButton())

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
    expect(document.getElementById('permit-ownerClientNumber')).toBeNull()
    expect(document.getElementById('permit-agentClientNumber')).toBeNull()
    await waitFor(() => {
      expect(
        screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      ).toBeEnabled()
      expect(
        screen.getByLabelText('Agent client location', {
          selector: '#permit-agentClientLocation',
        }),
      ).toBeEnabled()
    })
    await userEvent.selectOptions(
      screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      '04',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Agent client location', {
        selector: '#permit-agentClientLocation',
      }),
      '02',
    )
    await userEvent.click(getActiveSectionSaveButton())

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

  it("looks up a Blanket OIC permit's clients for editing with the other client named", async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00012345')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const ownerLocation = screen.getByLabelText('Client location', {
      selector: '#permit-ownerClientLocation',
    })
    await waitFor(() => expect(ownerLocation).toBeEnabled())
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
      '00067890',
      'owner',
      '',
      '00012345',
    )
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
      '00012345',
      'agent',
      '',
      '00067890',
    )

    await userEvent.selectOptions(ownerLocation, '04')
    await waitFor(() =>
      expect(mockedFetchApplicationClientData).toHaveBeenLastCalledWith('00067890', '04', {
        permitNumber: '777',
        counterpartyClientNumber: '00012345',
      }),
    )
  })

  it('shows saved Blanket OIC applicant and agent contact details in one tab', async () => {
    configureEditableBlanketOicPackage()
    const lookup = mockedFetchApplicationClientData.getMockImplementation()!
    mockedFetchApplicationClientData.mockImplementation(async (...args) => {
      const data = await lookup(...args)
      return data
        ? {
            ...data,
            clientAcronym: 'TEST',
            locationName: data.clientNumber === '00067890' ? 'Main office' : 'Agent office',
          }
        : null
    })
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await waitFor(() => {
      expect(screen.getByText('Owner Co (TEST) · 00067890')).toBeInTheDocument()
      expect(screen.getByText('Agent Co (TEST) · 00012345')).toBeInTheDocument()
      expect(screen.getByText('03 - Main office')).toBeInTheDocument()
      expect(screen.getByText('01 - Agent office')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Applicant details' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Owner' }).closest('.cds--tile')).toBe(
      screen.getByRole('heading', { name: 'Agent' }).closest('.cds--tile'),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
    for (const label of ['Client', 'Client location', 'Agent client', 'Agent client location']) {
      expect(screen.getAllByText(label)).toHaveLength(1)
    }
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

  it('keeps reviewed shipping actions inside the card, Cancel first', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping details' }))

    const actions = screen
      .getByRole('button', { name: 'Save changes' })
      .closest('.legacy-search-actions')
    expect(actions).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Shipping details' }).closest('.cds--tile'),
    ).toContainElement(actions as HTMLElement)
    expect(
      within(actions as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save changes'])
    expect(screen.queryByRole('button', { name: 'Save shipping' })).not.toBeInTheDocument()
  })

  it("starts a Ministerial permit's empty shipping options on the defaults and keeps saved ones", async () => {
    configureMinisterialActivePermit({
      destinationCountryCode: 'CA',
      transportTypeCode: null,
      portOfExportCode: null,
    })
    mockedFetchShippingReferenceOptions.mockResolvedValue({
      countries: [
        { code: 'CA', name: 'Canada' },
        { code: 'US', name: 'United States' },
      ],
      transportTypes: [
        { code: 'S', name: 'Ship' },
        { code: 'B', name: 'Barge' },
      ],
      ports: [
        { code: 'VA', name: 'Vancouver' },
        { code: 'CB', name: 'Cowichan Bay' },
      ],
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    const editShipping = await screen.findByRole('button', { name: 'Edit shipping details' })
    await waitFor(() => expect(editShipping).toBeEnabled())
    await userEvent.click(editShipping)

    expect(document.getElementById('permit-destinationCountry')).toHaveValue('Canada (CA)')
    expect(document.getElementById('permit-destinationCountry')).toHaveAttribute(
      'placeholder',
      'Search and select a final destination country',
    )
    expect(screen.getByLabelText('Transport type')).toHaveValue('B')
    expect(screen.getByLabelText('Customs port of export')).toHaveValue('CB')

    // The defaults are the starting values, so leaving changes nothing and asks nothing.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Edit shipping details' })).toBeInTheDocument()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()

    // Saving keeps the defaults that filled the empty fields.
    await userEvent.click(screen.getByRole('button', { name: 'Edit shipping details' }))
    await userEvent.click(getActiveSectionSaveButton())
    await waitFor(() =>
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationCountry: 'CA',
          transportType: 'B',
          portOfExport: 'CB',
        }),
      ),
    )
  })

  it.each([
    { description: 'empty shipping options', savedCountry: null, country: 'US' },
    { description: 'a saved country', savedCountry: 'CA', country: 'CA' },
  ])(
    "starts a regular permit's $description on the defaults without replacing saved values",
    async ({ savedCountry, country }) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        destinationCountryCode: savedCountry,
        transportTypeCode: null,
        portOfExportCode: null,
      })
      mockedFetchShippingReferenceOptions.mockResolvedValue({
        countries: [
          { code: 'CA', name: 'Canada' },
          { code: 'US', name: 'United States of America' },
        ],
        transportTypes: [
          { code: 'S', name: 'Ship' },
          { code: 'B', name: 'Barge' },
        ],
        ports: [
          { code: 'VA', name: 'Vancouver' },
          { code: 'CB', name: 'Cowichan Bay' },
        ],
      })
      renderPermitDetails()

      await selectPermitDetailTab('Shipping')
      const editShipping = await screen.findByRole('button', { name: 'Edit shipping' })
      await waitFor(() => expect(editShipping).toBeEnabled())
      await userEvent.click(editShipping)

      expect(screen.getByLabelText('Final destination country')).toHaveValue(country)
      expect(screen.getByLabelText('Transport type')).toHaveValue('B')
      expect(screen.getByLabelText('Customs port of export')).toHaveValue('CB')

      // The defaults are the starting values, so leaving changes nothing and asks nothing.
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Edit shipping' })).toBeInTheDocument()
      expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()

      // Saving keeps the defaults that filled the empty fields.
      await userEvent.click(screen.getByRole('button', { name: 'Edit shipping' }))
      await userEvent.click(getActiveSectionSaveButton())
      await waitFor(() =>
        expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
          expect.objectContaining({
            destinationCountry: country,
            transportType: 'B',
            portOfExport: 'CB',
          }),
        ),
      )
    },
  )

  it('rejects Blanket OIC client saves until each selected client location is verified', async () => {
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
    mockedFetchApplicationClientLocations.mockImplementation((clientNumber) => {
      if (clientNumber === '00067890') return pendingOwnerLocations
      if (clientNumber === '11111111') return Promise.resolve([])
      return Promise.resolve([{ locationCode: '01', locationName: 'Agent office', selected: true }])
    })
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const saveButton = getActiveSectionSaveButton()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    const location = screen.getByLabelText('Client location', {
      selector: '#permit-ownerClientLocation',
    })
    expect(location).toBeDisabled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await act(async () =>
      resolveOwnerLocations?.([
        { locationCode: '03', locationName: 'Owner office', selected: true },
      ]),
    )
    expect(saveButton).toBeEnabled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    await userEvent.selectOptions(location, '')
    await userEvent.click(saveButton)
    expect(await screen.findByText('Select a client location')).toBeVisible()
    expect(location).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(location).toHaveFocus())
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    await userEvent.selectOptions(location, '03')
    expect(location).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(saveButton)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Edit applicant(?: details)?/ })).toHaveFocus(),
    )
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('lets a Provincial Submitter remove a saved Blanket OIC agent but not change it', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00067890')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()
    expect(document.getElementById('permit-agentClientNumber')).toBeNull()

    await userEvent.click(agentUsedCheckbox)
    expect(screen.queryByRole('heading', { name: 'Agent' })).not.toBeInTheDocument()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    expect(document.getElementById('permit-agentClientNumber')).toBeNull()

    await userEvent.click(agentUsedCheckbox)
    await waitFor(() =>
      expect(
        screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      ).toBeEnabled(),
    )
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          agentClientNumber: '',
          agentClientLocation: '',
        }),
      )
    })
  })

  it('lets a Provincial Submitter whose client is the saved Blanket OIC agent remove it', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00012345')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()

    await userEvent.click(agentUsedCheckbox)
    await waitFor(() =>
      expect(
        screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      ).toBeEnabled(),
    )
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          agentClientNumber: '',
          agentClientLocation: '',
        }),
      )
    })
  })

  it('keeps the agent of a Blanket OIC permit locked for a Provincial Submitter whose client is neither its owner nor its agent', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00099999')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )

    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
  })

  it('lets an Application Approver remove a saved Blanket OIC agent but not change it', async () => {
    configureEditableBlanketOicPackage()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\approver',
          roles: ['APPLICATION_APPROVER'],
        }),
      }),
    )
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()
    expect(document.getElementById('permit-agentClientNumber')).toBeNull()

    await userEvent.click(agentUsedCheckbox)
    expect(screen.queryByRole('heading', { name: 'Agent' })).not.toBeInTheDocument()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    expect(document.getElementById('permit-agentClientNumber')).toBeNull()
    await waitFor(() =>
      expect(
        screen.getByLabelText('Agent client location', {
          selector: '#permit-agentClientLocation',
        }),
      ).toHaveValue('01'),
    )

    await userEvent.click(agentUsedCheckbox)
    await waitFor(() =>
      expect(
        screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      ).toBeEnabled(),
    )
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          agentClientNumber: '',
          agentClientLocation: '',
        }),
      )
    })
  })

  it('lets an Application Approver add an agent to a Blanket OIC permit without one', async () => {
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
    await userEvent.click(agentUsedCheckbox)
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    const agentLocation = screen.getByLabelText('Agent client location', {
      selector: '#permit-agentClientLocation',
    })
    await waitFor(() =>
      expect(
        screen.getByLabelText('Client location', { selector: '#permit-ownerClientLocation' }),
      ).toBeEnabled(),
    )
    await userEvent.click(getActiveSectionSaveButton())
    const agentClient = screen.getByLabelText('Agent client', {
      selector: '#permit-agentClientNumber',
    })
    await waitFor(() => expect(agentClient).toHaveAttribute('aria-invalid', 'true'))
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    fireEvent.change(agentClient, { target: { value: '00012345' } })
    await waitFor(() => expect(agentLocation).toBeEnabled())
    await userEvent.selectOptions(agentLocation, '01')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          agentClientNumber: '00012345',
          agentClientLocation: '01',
        }),
      )
    })
  })

  it('lets a Provincial Submitter add an agent to a Blanket OIC permit without one', async () => {
    configureEditableBlanketOicPackage()
    configureBlanketOicSubmitter('00067890')
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
    expect(agentUsedCheckbox).toBeEnabled()
    await userEvent.click(agentUsedCheckbox)
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    const agentClient = screen.getByLabelText('Agent client', {
      selector: '#permit-agentClientNumber',
    })
    expect(agentClient).toBeEnabled()
    fireEvent.change(agentClient, { target: { value: '00012345' } })
    const agentLocation = screen.getByLabelText('Agent client location', {
      selector: '#permit-agentClientLocation',
    })
    await waitFor(() => expect(agentLocation).toBeEnabled())
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
      '00012345',
      'agent',
      '',
      '00067890',
    )
    await userEvent.selectOptions(agentLocation, '01')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00067890',
          agentClientNumber: '00012345',
          agentClientLocation: '01',
        }),
      )
    })
  })

  it('lets a Provincial Submitter change the agent of a Payment pending Blanket OIC permit', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
      receiptNumber: null,
    })
    configureBlanketOicSubmitter('00067890')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit applicant details' }))
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()

    await userEvent.click(agentUsedCheckbox)
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'PPD',
          ownerClientNumber: '00067890',
          agentClientNumber: '',
          agentClientLocation: '',
        }),
      )
    })
  })

  it('keeps the agent of a Completed Blanket OIC permit locked for Provincial Submitters', async () => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    configureBlanketOicSubmitter('00067890')
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Agent Co · 00012345')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()
  })

  it("keeps a Ministerial permit's agent locked for Provincial Submitters", async () => {
    configureMinisterialActivePermit()
    configureBlanketOicSubmitter('00067890')
    renderPermitDetails()

    await selectPermitDetailTab('Applicant')
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit applicant(?: details)?/ }),
    )

    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeDisabled()
  })

  const configureBlanketOicApproverPermit = (
    permitStatusCode: string,
    permitStatusDescription: string,
    savedAgent: boolean,
  ) => {
    configureEditableBlanketOicPackage()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode,
      permitStatusDescription,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: 1000999,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
      receiptNumber: permitStatusCode === 'PPD' ? null : permitDetail.receiptNumber,
      ...(savedAgent ? {} : { applicantClientNumber: null, agentClientLocationCode: null }),
    })
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\approver',
          roles: ['APPLICATION_APPROVER'],
        }),
      }),
    )
  }

  it('lets an Application Approver remove the agent of a Payment pending Blanket OIC permit', async () => {
    configureBlanketOicApproverPermit('PPD', 'Payment pending', true)
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit applicant details' }))
    const ownerLocation = screen.getByLabelText('Client location', {
      selector: '#permit-ownerClientLocation',
    })
    await waitFor(() => expect(ownerLocation).toHaveValue('03'))
    expect(ownerLocation).toBeDisabled()
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()

    await userEvent.click(agentUsedCheckbox)
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'PPD',
          ownerClientNumber: '00067890',
          ownerClientLocation: '03',
          agentClientNumber: '',
          agentClientLocation: '',
        }),
      )
    })
  })

  it('lets an Application Approver add an agent to a Payment pending Blanket OIC permit', async () => {
    configureBlanketOicApproverPermit('PPD', 'Payment pending', false)
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit applicant details' }))
    const agentUsedCheckbox = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentUsedCheckbox).not.toBeChecked()
    expect(agentUsedCheckbox).toBeEnabled()
    await userEvent.click(agentUsedCheckbox)
    const agentClient = screen.getByLabelText('Agent client', {
      selector: '#permit-agentClientNumber',
    })
    expect(agentClient).toBeEnabled()
    fireEvent.change(agentClient, { target: { value: '00012345' } })
    const agentLocation = screen.getByLabelText('Agent client location', {
      selector: '#permit-agentClientLocation',
    })
    await waitFor(() => expect(agentLocation).toBeEnabled())
    await userEvent.selectOptions(agentLocation, '01')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitStatus: 'PPD',
          ownerClientNumber: '00067890',
          agentClientNumber: '00012345',
          agentClientLocation: '01',
        }),
      )
    })
  })

  it('shows the picked agent client with its acronym in the editor', async () => {
    configureBlanketOicApproverPermit('PPD', 'Payment pending', false)
    const lookup = mockedFetchApplicationClientData.getMockImplementation()!
    mockedFetchApplicationClientData.mockImplementation(async (...args) => {
      const data = await lookup(...args)
      return data ? { ...data, clientAcronym: 'TEST' } : null
    })
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit applicant details' }))
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    const agentClient = screen.getByLabelText('Agent client', {
      selector: '#permit-agentClientNumber',
    })
    fireEvent.change(agentClient, { target: { value: '00012345' } })

    await waitFor(() =>
      expect(agentClient).toHaveAttribute('data-selected-client-name', 'Agent Co (TEST)'),
    )
  })

  it('keeps the agent of a Completed Blanket OIC permit locked for Application Approvers', async () => {
    configureBlanketOicApproverPermit('COM', 'Completed', true)
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    expect(await screen.findByRole('button', { name: 'Edit shipping details' })).toBeEnabled()
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Agent Co · 00012345')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()
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
    const activeDetail = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    // The permit is read on load, when its editor opens, and after the save.
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValue(persistedDetail)
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'save and refresh clients')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(3))
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Agent Co · 00070001')).toBeInTheDocument()
    expect(screen.getByText('04')).toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('Agent Co · 00070002')).toBeInTheDocument()
    expect(screen.getByText('05')).toBeInTheDocument()
  })

  it('requires a reload after a normal permit save cannot refresh derived clients', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureActivePermit()
    const activeDetail = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    // The permit is read on load and when its editor opens; the read after the save fails.
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValueOnce(activeDetail)
      .mockRejectedValueOnce(new Error('persisted client refresh unavailable'))
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co · 00067890')).toBeInTheDocument()
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'save without refreshed clients')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(
        'Current permit details could not be refreshed; reload before making another change.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Permit details saved.').closest('.cds--inline-notification'),
    ).toHaveClass('cds--inline-notification--warning')
    expect(
      screen.getByText(
        'The permit was saved, but its current details could not be refreshed. Reload before making another change.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Current permit details could not be refreshed; reload before making another change.',
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
    expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledTimes(3)
    expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()

    consoleWarn.mockRestore()
  })

  it('requires a reload after a permit save cannot refresh its exemption totals', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    mockedFetchProvincialPermitExemptionContext.mockRejectedValueOnce(
      new Error('exemption totals unavailable'),
    )
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'save without refreshed totals')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(
        'Current permit details could not be refreshed; reload before making another change.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    consoleWarn.mockRestore()
  })

  it('does not continue a deferred status transition after a saved normal permit cannot refresh', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    configureActivePermit()
    const activeDetail = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    // The permit is read on load and when its editor opens; the read after the save fails.
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValueOnce(activeDetail)
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
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await userEvent.click(getActiveSectionSaveButton())

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
    const saveButton = getActiveSectionSaveButton()

    expect(receiptNumber).toHaveAttribute('maxlength', '50')
    fireEvent.change(receiptNumber, { target: { value: 'R'.repeat(51) } })
    fireEvent.change(remarks, { target: { value: 'X'.repeat(255) } })
    await userEvent.click(saveButton)

    expect(
      (await screen.findAllByText('Receipt number must be 50 characters or fewer')).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    fireEvent.change(receiptNumber, { target: { value: 'R-1' } })
    await userEvent.click(saveButton)

    expect(
      (await screen.findAllByText('Permit remarks must be 250 characters or fewer')).length,
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
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'EXP')
    await userEvent.click(getActiveSectionSaveButton())

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
    for (const label of [
      'Exemption number',
      'Current permit volume (m³)',
      'Current permit pieces',
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
      expect(screen.getByText(label).tagName).toBe('DT')
    }
    expect(screen.queryByText('Received date')).not.toBeInTheDocument()

    await userEvent.clear(submitDate)
    await userEvent.type(submitDate, '2026-04-09')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'EX-9',
          permitSubmitDate: '2026-04-09',
          permitRequestDate: '2026-04-09',
          permitTotalVolume: '120.0',
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

    expect(screen.getByLabelText('Status')).toBeDisabled()
    expect(screen.getByLabelText('Submit date')).toBeDisabled()
    expect(screen.getByLabelText('Issued date')).toBeDisabled()
    expect(screen.getByLabelText('Expiry date')).toBeDisabled()
    expect(screen.queryByLabelText('Received date')).not.toBeInTheDocument()
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
    await userEvent.click(getActiveSectionSaveButton())

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
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    const cancelledUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cancelledUnload)
    expect(cancelledUnload.defaultPrevented).toBe(false)
  })

  it("saves a new Ministerial permit's shipping before its permit fields", async () => {
    configureMinisterialActivePermit()
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

    await userEvent.clear(await screen.findByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Updated permit remarks')
    // A new permit's tabs keep their entered values without asking.
    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    await userEvent.clear(await screen.findByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Updated Destination')
    await selectPermitDetailTab('Permit')
    expect(screen.getByLabelText('Remarks')).toHaveValue('Updated permit remarks')
    await userEvent.click(getActiveSectionSaveButton())

    expect(await screen.findByText('Permit and shipping details saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
      expect.objectContaining({ destinationCompanyName: 'Updated Destination' }),
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

  it('finishes the first Ministerial save from Shipping and stays busy through both saves', async () => {
    configureMinisterialActivePermit()
    let resolveShipping!: (result: Awaited<ReturnType<typeof updatePermitShipping>>) => void
    let resolvePermit!: (result: Awaited<ReturnType<typeof updatePermitDetail>>) => void
    mockedUpdatePermitShipping.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveShipping = resolve
      }),
    )
    mockedUpdatePermitDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermit = resolve
      }),
    )
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
    fireEvent.change(await screen.findByLabelText('Remarks'), {
      target: { value: 'First-save core remark' },
    })
    await selectPermitDetailTab('Shipping')
    fireEvent.change(await screen.findByLabelText('Purchaser'), {
      target: { value: 'First-save purchaser' },
    })
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(mockedUpdatePermitShipping).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    const saved: Awaited<ReturnType<typeof updatePermitDetail>> = {
      success: true,
      message: 'Saved.',
      errors: [],
      warnings: [],
      source: 'api',
    }
    await act(async () => resolveShipping(saved))

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        permitRemarks: 'First-save core remark',
        destinationCompanyName: 'First-save purchaser',
      }),
    )
    await act(async () => resolvePermit(saved))

    expect(await screen.findByText('Permit and shipping details saved.')).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit shipping details' })).toHaveFocus(),
    )
    await selectPermitDetailTab('Permit')
    expect(screen.queryByLabelText('Remarks')).not.toBeInTheDocument()
    expect(screen.getByText('First-save core remark')).toBeVisible()
    await selectPermitDetailTab('Applicant')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it("checks a new Ministerial permit's untouched Shipping fields before saving", async () => {
    configureMinisterialActivePermit({
      destinationCompanyName: '',
      destinationCountryCode: '',
      transportTypeCode: '',
      transportName: '',
      estimatedShippingDate: '',
      portOfExportCode: '',
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

    await userEvent.type(await screen.findByLabelText('Remarks'), ' updated')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(screen.getByLabelText('Purchaser')).toHaveFocus())
    expect(screen.getByRole('tab', { name: 'Shipping' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Purchaser')).toHaveAttribute('aria-invalid', 'true')
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it.each([
    {
      section: 'Permit',
      open: async () =>
        userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ })),
      field: () => screen.getByLabelText('Remarks'),
      current: { remarks: 'changed by another user' },
      expected: 'changed by another user',
    },
    {
      section: 'Shipping',
      open: async () => {
        await selectPermitDetailTab('Shipping')
        await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
      },
      field: () => screen.getByLabelText('Purchaser'),
      current: { destinationCompanyName: 'Purchaser changed elsewhere' },
      expected: 'Purchaser changed elsewhere',
    },
  ])(
    'rereads the $section editor from a fresh permit after the edit context',
    async ({ open, field, current, expected }) => {
      configureActivePermit()
      renderPermitDetails()
      await screen.findByRole('button', { name: /Edit permit(?: details)?/ })
      const editContextReads = mockedFetchPermitFeeOverrideContext.mock.calls.length
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        ...current,
      })

      await open()

      await waitFor(() => expect(field()).toHaveValue(expected))
      expect(mockedFetchPermitFeeOverrideContext.mock.calls.length).toBe(editContextReads + 1)
      expect(mockedFetchProvincialPermitDetail).toHaveBeenLastCalledWith('777', { fresh: true })
      expect(mockedFetchPermitFeeOverrideContext.mock.invocationCallOrder.at(-1)).toBeLessThan(
        mockedFetchProvincialPermitDetail.mock.invocationCallOrder.at(-1)!,
      )
    },
  )

  it('rereads the fee override from the new edit context when its editor opens', async () => {
    configureActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await screen.findByRole('button', { name: 'Edit fee override' })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: true,
      overrideFee: '99.00',
      overrideComment: 'Set by another user',
      locked: false,
      lockMessage: '',
      interior: true,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Edit fee override' }))

    await waitFor(() => expect(screen.getByLabelText('Override fee (CAD)')).toHaveValue('99.00'))
    expect(mockedFetchProvincialPermitDetail).toHaveBeenLastCalledWith('777', { fresh: true })
  })

  const delayFreshPermitRead = () => {
    const activePermit: ProvincialPermitDetail = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    let resolveFreshRead: (detail: ProvincialPermitDetail) => void = () => undefined
    mockedFetchProvincialPermitDetail.mockImplementation(async (_permitNumber, options) =>
      options?.fresh
        ? new Promise<ProvincialPermitDetail>((resolve) => {
            resolveFreshRead = resolve
          })
        : activePermit,
    )
    return {
      activePermit,
      resolve: async (detail: ProvincialPermitDetail) => {
        await act(async () => resolveFreshRead(detail))
      },
    }
  }

  it('keeps text typed while the permit is reread for editing', async () => {
    const freshRead = delayFreshPermitRead()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'typed during the read')
    await freshRead.resolve({ ...freshRead.activePermit, remarks: 'changed by another user' })

    await waitFor(() => expect(getActiveSectionSaveButton()).toBeEnabled())
    expect(screen.getByLabelText('Remarks')).toHaveValue('typed during the read')
  })

  it('keeps Save unavailable until the permit is reread for editing, then saves', async () => {
    const freshRead = delayFreshPermitRead()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(getActiveSectionSaveButton()).toBeDisabled()
    await userEvent.click(getActiveSectionSaveButton())
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await freshRead.resolve(freshRead.activePermit)
    await waitFor(() => expect(getActiveSectionSaveButton()).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Remarks'), ' updated')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitRemarks: expect.stringMatching(/ updated$/) }),
      ),
    )
  })

  it('does not open the editor when the fresh permit cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    onTestFinished(() => consoleError.mockRestore())
    configureActivePermit()
    renderPermitDetails()
    const edit = await screen.findByRole('button', { name: /Edit permit(?: details)?/ })
    mockedFetchProvincialPermitDetail.mockRejectedValueOnce(new Error('permit unavailable'))

    await userEvent.click(edit)

    expect(await screen.findByText('Permit not refreshed.')).toBeVisible()
    expect(screen.queryByLabelText('Remarks')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit permit(?: details)?/ })).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('does not open the editor when the new edit context says another user holds the lock', async () => {
    configureActivePermit()
    renderPermitDetails()
    const edit = await screen.findByRole('button', { name: /Edit permit(?: details)?/ })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: true,
      lockMessage: 'This permit is locked by test-user.',
      interior: true,
    })

    await userEvent.click(edit)

    expect(await screen.findByText('This permit is locked by test-user.')).toBeVisible()
    expect(screen.queryByLabelText('Remarks')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit permit(?: details)?/ })).toBeNull()
  })

  it('asks before leaving a tab with unsaved changes and edits one section at a time', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Updated permit remarks')
    await userEvent.click(screen.getByRole('tab', { name: 'Shipping' }))

    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await waitFor(() =>
      expect(within(discard).getByRole('button', { name: 'Keep editing' })).toHaveFocus(),
    )
    await userEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Remarks')).toHaveValue('Updated permit remarks')

    await userEvent.click(screen.getByRole('tab', { name: 'Shipping' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('tab', { name: 'Shipping' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await selectPermitDetailTab('Permit')
    expect(screen.queryByLabelText('Remarks')).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('waits for a permit save before editing shipping without stranding busy state', async () => {
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
    await userEvent.click(getActiveSectionSaveButton())
    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('tab', { name: 'Shipping' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Remarks')).toHaveValue('Slow permit save')
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    await act(async () => {
      resolvePermitSave?.({
        success: true,
        message: 'The permit was updated successfully.',
        errors: [],
        warnings: [],
        source: 'api',
      })
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Edit permit(?: details)?/ })).toBeEnabled(),
    )
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'Shipping change after save')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save shipping' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))
    await waitFor(() => expect(mockedUpdatePermitShipping).toHaveBeenCalledTimes(1))
  })

  it.each([
    {
      origin: 'Applicant',
      destination: 'Permit',
      confirmation: 'Applicant details saved.',
    },
    {
      origin: 'Permit',
      destination: 'Applicant',
      confirmation: 'Permit details saved.',
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
        const applicantLocation = screen.getByLabelText('Client location', {
          selector: '#permit-ownerClientLocation',
        })
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
          name: 'Save changes',
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

      // The result stays with the tab that was saved.
      expect((await screen.findByText(confirmation)).closest('[role="tabpanel"]')).toBe(
        screen.getByRole('tabpanel', { name: origin, hidden: true }),
      )
    },
  )

  it('saves policy fields before completing a permit', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Region')).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Submit date'))
    await userEvent.type(screen.getByLabelText('Submit date'), '2026-04-11')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(2))
    expect(mockedUpdatePermitDetail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orgUnitNumber: '1903',
        permitSubmitDate: '2026-04-11',
        permitStatus: 'ACT',
      }),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ permitStatus: 'COM' }),
    )
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
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
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          orgUnitNumber: '1904',
        }),
      )
    })
  })

  it('asks to discard a BOIC Region draft before creating a package', async () => {
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
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('tab', { name: 'Permit' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Region')).toHaveValue('1904')
    expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await selectPermitDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    expect(await screen.findByRole('complementary', { name: 'Create package' })).toBeInTheDocument()
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Region')).toBeEnabled()
    expect(screen.getByLabelText('Region')).toHaveValue(String(permitDetail.orgUnitNumber))
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
      await userEvent.click(getActiveSectionSaveButton())

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
      ['Submit date', 'Apr 10, 2026'],
      ['Issued date', 'May 1, 2026'],
      ['Expiry date', 'Jun 1, 2026'],
    ]
    for (const [label, value] of savedSummaryFields) {
      const field = within(permitTile as HTMLElement)
        .getByText(label)
        .closest('.record-field') as HTMLElement
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
    const requestPiecesLabel = within(permitTile as HTMLElement).getByText('Permit request pieces')
    expect(requestPiecesLabel).toBeInTheDocument()
    expect(
      within(requestPiecesLabel.closest('.record-field') as HTMLElement).getByText('250'),
    ).toBeInTheDocument()
    expect(
      within(permitTile as HTMLElement).getByText('Permit request volume (m³)'),
    ).toBeInTheDocument()
    expect(within(permitTile as HTMLElement).getByText('125.75')).toBeInTheDocument()
    for (const [label, value] of [
      ['Total exemption volume (m³)', '250.0'],
      ['Total volume remaining (m³)', '130.0'],
      ['Current permit volume (m³)', `${permitDetail.permitVolume}.0`],
      ['Current permit pieces', String(permitDetail.numberOfPieces)],
      ['Remarks', 'Saved BOIC remarks'],
    ]) {
      const field = within(permitTile as HTMLElement)
        .getByText(label)
        .closest('.record-field') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }
  })

  it.each([
    [1, '1.0', '1'],
    [12.25, '12.25', '12.25'],
  ])(
    'formats read-only BOIC request volume %s and retains editor text %s',
    async (volume, expectedDisplay, expectedInput) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        exemptionTypeDescription: 'Blanket OIC',
        blanketOic: true,
        oicRequestPieces: 1,
        oicRequestVolume: volume,
      })
      renderPermitDetails()

      const heading = await screen.findByRole('heading', { name: 'Permit details' })
      const card = within(heading.closest('.cds--tile') as HTMLElement)
      const label = card.getByText('Permit request volume (m³)')
      expect(label.parentElement?.querySelector('dd')).toHaveTextContent(expectedDisplay)
      await userEvent.click(card.getByRole('button', { name: 'Edit permit details' }))
      expect(screen.getByLabelText('Permit request volume (m³)')).toHaveValue(expectedInput)
    },
  )

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
      expect(within(permitTile).queryByLabelText('Exemption number')).not.toBeInTheDocument()
      expect(within(permitTile).getByLabelText('Submit date')).toBeEnabled()
      expect(within(permitTile).queryByLabelText('Received date')).not.toBeInTheDocument()
      expect(within(permitTile).getByLabelText('Region')).toHaveValue('1903')
      expect(within(permitTile).getByLabelText('Remarks')).toHaveValue('ok')
      expect(
        within(permitTile).queryByLabelText('Current permit volume (m³)'),
      ).not.toBeInTheDocument()
      expect(within(permitTile).queryByLabelText('Current permit pieces')).not.toBeInTheDocument()
      expect(within(permitTile).getByLabelText('Permit request pieces')).toHaveAttribute(
        'aria-required',
        'true',
      )
      expect(within(permitTile).getByLabelText('Permit request volume (m³)')).toHaveAttribute(
        'aria-required',
        'true',
      )
      expect(
        document.querySelector('label[for="permit-oicPermitTotalPieces"] .required-label__marker'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('label[for="permit-oicPermitTotalVolume"] .required-label__marker'),
      ).toBeInTheDocument()
      await userEvent.clear(screen.getByLabelText('Permit request pieces'))
      if (pieces) {
        await userEvent.type(screen.getByLabelText('Permit request pieces'), pieces)
      }
      await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
      if (volume) {
        await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), volume)
      }
      await userEvent.click(getActiveSectionSaveButton())

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
    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.click(getActiveSectionSaveButton())

    expect(
      (await screen.findAllByText('Permit request pieces is required')).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Permit request volume is required')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByLabelText('Permit request pieces')).toHaveValue('')
    expect(screen.getByLabelText('Permit request volume (m³)')).toHaveValue('')
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
    expect(screen.getByLabelText('Permit request pieces')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Permit request volume (m³)')).toHaveAttribute(
      'aria-required',
      'true',
    )
    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.type(screen.getByLabelText('Permit request pieces'), '0')
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), '0')
    await userEvent.click(getActiveSectionSaveButton())

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
    await userEvent.type(screen.getByLabelText('Remarks'), ' Updated')
    await userEvent.click(getActiveSectionSaveButton())

    expect(
      (await screen.findAllByText('Permit request pieces is required')).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Permit request volume is required')).length,
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
    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.type(screen.getByLabelText('Permit request pieces'), '-1')
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), '-1')
    await userEvent.click(getActiveSectionSaveButton())

    // The errors show on their fields, and the first takes focus.
    expect(await screen.findByText('Permit request pieces must be a whole number')).toBeVisible()
    expect(await screen.findByText('Permit request volume must be numeric')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Permit request pieces')).toHaveFocus())
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.type(screen.getByLabelText('Permit request pieces'), '10000000000')
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), '1.234')
    await userEvent.click(getActiveSectionSaveButton())

    expect(
      (await screen.findAllByText('Permit request pieces must be 9999999999 or less')).length,
    ).toBeGreaterThanOrEqual(1)
    // Any plain decimal fits the stored text, however many places it has.
    expect(screen.queryByText(/Permit request volume must/)).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.type(screen.getByLabelText('Permit request pieces'), '250')
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), '1234567.89')
    await userEvent.click(getActiveSectionSaveButton())

    expect(
      (await screen.findAllByText('Permit request volume must be 9 characters or fewer')).length,
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
    expect(screen.getByLabelText('Permit request pieces')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Permit request volume (m³)')).toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(
      document.querySelector('label[for="permit-oicPermitTotalPieces"] .required-label__marker'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('label[for="permit-oicPermitTotalVolume"] .required-label__marker'),
    ).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Permit request pieces'))
    await userEvent.type(screen.getByLabelText('Permit request pieces'), '0')
    await userEvent.clear(screen.getByLabelText('Permit request volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit request volume (m³)'), '0')
    await userEvent.click(getActiveSectionSaveButton())

    expect(
      (await screen.findAllByText('Use a positive numeric value')).length,
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
      const statusLabel = 'Status'
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
      expect(issueDate).not.toHaveAttribute('aria-invalid', 'true')
      await userEvent.clear(expiryDate)
      await userEvent.click(
        screen.getByRole('button', { name: blanketOic ? 'Save changes' : 'Save permit' }),
      )

      expect(await screen.findByText('Submit date is required')).toBeInTheDocument()
      expect(await screen.findByText('Issued date is required')).toBeInTheDocument()
      expect(await screen.findByText('Expiry date is required')).toBeInTheDocument()
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

      await userEvent.click(
        screen.getByRole('button', { name: blanketOic ? 'Save changes' : 'Save permit' }),
      )
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
    'lets permit reviewers change Blanket OIC request ceilings on %s permits',
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

      const requestPieces = screen.getByLabelText('Permit request pieces')
      const requestVolume = screen.getByLabelText('Permit request volume (m³)')
      expect(requestPieces).toBeEnabled()
      expect(requestVolume).toBeEnabled()
      expect(requestPieces).toHaveAttribute('aria-required', 'true')
      expect(requestVolume).toHaveAttribute('aria-required', 'true')
      await userEvent.clear(requestPieces)
      await userEvent.type(requestPieces, '250')
      await userEvent.click(getActiveSectionSaveButton())

      await waitFor(() =>
        expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
          expect.objectContaining({ oicPermitTotalPieces: '250', oicPermitTotalVolume: '120.5' }),
        ),
      )
    },
  )

  it('keeps blank Blanket OIC request ceilings optional on a Payment pending permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      blanketOic: true,
      oicRequestPieces: null,
      oicRequestVolume: null,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    expect(screen.getByLabelText('Permit request pieces')).toBeEnabled()
    expect(screen.getByLabelText('Permit request pieces')).not.toHaveAttribute('aria-required')
    expect(screen.getByLabelText('Permit request volume (m³)')).not.toHaveAttribute('aria-required')
  })

  it('requires each Blanket OIC request ceiling on a Payment pending permit only once it is saved', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: null,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    const requestPieces = screen.getByLabelText('Permit request pieces')
    expect(requestPieces).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Permit request volume (m³)')).not.toHaveAttribute('aria-required')
    await userEvent.clear(requestPieces)
    await userEvent.click(getActiveSectionSaveButton())
    await waitFor(() => expect(requestPieces).toHaveAttribute('aria-invalid', 'true'))
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.type(requestPieces, '250')
    await userEvent.click(getActiveSectionSaveButton())

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ oicPermitTotalPieces: '250', oicPermitTotalVolume: '' }),
      ),
    )
  })

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
      interior: true,
    })
    renderPermitDetails()

    expect(await screen.findByText('Permit request pieces')).toBeInTheDocument()
    expect(screen.getByText('Permit request volume (m³)')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Another user is editing this permit.')).toBeInTheDocument()
  })

  it('keeps a cancelled permit read-only', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('says why a cancelled Blanket OIC permit without packages offers no Create package', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    expect(
      await screen.findByRole('heading', { name: 'No packages for this permit' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("This permit is cancelled, so packages can't be added."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Create a package/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  it('does not ask a viewer who cannot create packages to create the first Blanket OIC package', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === '/permitDetails' }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicApplicationNumber: null,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Items')
    expect(
      await screen.findByRole('heading', { name: 'No packages for this permit' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No package has been created for this Blanket OIC permit.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Create a package/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  it('shows the saved issued date and exemption balance after a completed permit is made active', async () => {
    const completedPermit = {
      ...permitDetail,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
      exemptionVolumeRemaining: 2,
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(completedPermit)
      .mockResolvedValueOnce(completedPermit)
      .mockResolvedValue({
        ...completedPermit,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        issueDate: null,
      })
    mockedFetchProvincialPermitExemptionContext.mockResolvedValue({
      approvedExemptionVolume: 250,
      exemptionVolumeRemaining: 1,
      exemptionTypeDescription: 'Standard exemption',
      blanketOic: false,
    })
    renderPermitDetails()

    const remaining = () =>
      screen.getByText('Total volume remaining (m³)').parentElement?.querySelector('dd')
    expect(await screen.findByText('Total volume remaining (m³)')).toBeInTheDocument()
    expect(remaining()).toHaveTextContent('2.0')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ACT')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
    expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalledWith('EX-9')
    expect(remaining()).toHaveTextContent('1.0')
    expect(screen.getByText('Issued date').parentElement?.querySelector('dd')).toHaveTextContent(
      'Not provided',
    )
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.getByLabelText('Issued date')).toHaveValue('')
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
        'Receipt number should not be empty for a complete permit so it will be saved as Payment pending.',
      ],
      source: 'api',
      permitStatus: 'PPD',
      permitReceiptNo: '',
      permitVolume: 95,
      permitNumberOfPieces: 9,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Save as Payment pending?' })).getByRole(
        'button',
        { name: 'Save' },
      ),
    )

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Receipt number should not be empty for a complete permit/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Payment pending').length).toBeGreaterThan(0)
    const financialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile')
    expect(within(financialTile as HTMLElement).getByText('95.0')).toBeInTheDocument()
    expect(within(financialTile as HTMLElement).getByText('9')).toBeInTheDocument()
  })

  it('does not offer the approval email when the server saves a completed permit as Payment pending', async () => {
    const activePermit = {
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    }
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(activePermit)
      .mockResolvedValueOnce(activePermit)
      .mockResolvedValue({
        ...activePermit,
        permitStatusCode: 'PPD',
        permitStatusDescription: 'Payment pending',
        receiptNumber: null,
      })
    mockedUpdatePermitDetail.mockResolvedValue({
      success: true,
      message: 'The permit was updated successfully.',
      errors: [],
      warnings: [
        'Receipt number should not be empty for a complete permit so it will be saved as Payment pending.',
      ],
      source: 'api',
      permitStatus: 'PPD',
      permitReceiptNo: '',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await selectPermitDetailTab('Permit')
    await userEvent.click(getActiveSectionSaveButton())
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Save as Payment pending?' })).getByRole(
        'button',
        { name: 'Save' },
      ),
    )

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitStatus: 'COM', permitReceiptNo: '' }),
      ),
    )
    expect(
      await screen.findByText(/Receipt number should not be empty for a complete permit/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
  })

  it('asks before saving a completed Interior permit without a receipt and sends nothing on Discard', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    const warning = await screen.findByRole('dialog', { name: 'Save as Payment pending?' })
    expect(
      within(warning).getByText(
        'Receipt number should not be empty for a complete permit so it will be saved as Payment pending.',
      ),
    ).toBeVisible()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.click(within(warning).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull(),
    )
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Status')).toHaveValue('COM')
    expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled()
  })

  it('sends the request once the warning for a completed Interior permit without a receipt is accepted', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))
    const warning = await screen.findByRole('dialog', { name: 'Save as Payment pending?' })
    await userEvent.click(within(warning).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitStatus: 'COM', permitReceiptNo: '' }),
      ),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull(),
    )
  })

  const completedPermitWithoutReceipt = {
    ...permitDetail,
    permitStatusCode: 'COM',
    permitStatusDescription: 'Completed',
    receiptNumber: null,
  }

  const editCompletedPermitShipping = async () => {
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Purchaser'))
    await userEvent.type(screen.getByLabelText('Purchaser'), 'test-2026-10-19')
  }

  it('asks before saving the shipping of a completed Interior permit without a receipt and sends nothing on Discard', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue(completedPermitWithoutReceipt)
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    const warning = await screen.findByRole('dialog', { name: 'Save as Payment pending?' })
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.click(within(warning).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull(),
    )
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Purchaser')).toHaveValue('test-2026-10-19')
    expect(screen.getByRole('button', { name: 'Save shipping' })).toBeEnabled()
  })

  it('saves the shipping of a completed Interior permit without a receipt as Payment pending once the warning is accepted', async () => {
    let storedPermit: ProvincialPermitDetail = completedPermitWithoutReceipt
    mockedFetchProvincialPermitDetail.mockImplementation(async () => storedPermit)
    mockedUpdatePermitDetail.mockImplementation(async () => {
      storedPermit = {
        ...completedPermitWithoutReceipt,
        permitStatusCode: 'PPD',
        permitStatusDescription: 'Payment pending',
        destinationCompanyName: 'test-2026-10-19',
      }
      return {
        success: true,
        message: 'The permit was updated successfully.',
        errors: [],
        warnings: [
          'Receipt number should not be empty for a complete permit so it will be saved as Payment pending.',
        ],
        source: 'api',
        permitStatus: 'PPD',
        permitReceiptNo: '',
      }
    })
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))
    const warning = await screen.findByRole('dialog', { name: 'Save as Payment pending?' })
    await userEvent.click(within(warning).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'COM',
          permitReceiptNo: '',
          destinationCompanyName: 'test-2026-10-19',
        }),
      ),
    )
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(await screen.findByText('Permit and shipping details saved.')).toBeInTheDocument()
    expect(
      screen.getByText(/Receipt number should not be empty for a complete permit/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Payment pending').length).toBeGreaterThan(0)
    expect(screen.getByText('test-2026-10-19')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit shipping' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
  })

  it('keeps the shipping edit open when saving the completed permit as Payment pending fails', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue(completedPermitWithoutReceipt)
    mockedUpdatePermitDetail.mockResolvedValue({
      success: false,
      message: 'Unable to update permit.',
      errors: ['The test-2026-10-19 change was rejected.'],
      warnings: [],
      source: 'api',
    })
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Save as Payment pending?' })).getByRole(
        'button',
        { name: 'Save' },
      ),
    )

    expect(await screen.findByText('Permit and shipping details not saved.')).toBeInTheDocument()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Purchaser')).toHaveValue('test-2026-10-19')
  })

  it('explains why the shipping of a completed Interior permit without a receipt cannot be saved while permit options are unavailable', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue(completedPermitWithoutReceipt)
    mockedFetchProvincialPermitOptions.mockRejectedValue(new Error('options unavailable'))
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    expect(await screen.findByText('Permit and shipping details not saved.')).toBeInTheDocument()
    expect(screen.getAllByText(SEARCH_OPTIONS_UNAVAILABLE_MESSAGE).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Purchaser')).toHaveValue('test-2026-10-19')
  })

  it('shows a permit details error before asking to save the shipping of a completed Interior permit without a receipt', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...completedPermitWithoutReceipt,
      remarks: 'Café test-2026-10-19',
    })
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    expect(
      await screen.findByText(
        'Permit remarks contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it.each([
    { description: 'a permit that is not Interior', interior: false, receiptNumber: null },
    { description: 'an Interior permit with a receipt', interior: true, receiptNumber: 'R-9' },
  ])(
    'saves the shipping of a completed permit straight away for $description',
    async ({ interior, receiptNumber }) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...completedPermitWithoutReceipt,
        receiptNumber,
      })
      mockedFetchPermitFeeOverrideContext.mockResolvedValue({
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
        locked: false,
        lockMessage: '',
        interior,
      })
      renderPermitDetails()

      await editCompletedPermitShipping()
      await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

      await waitFor(() =>
        expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
          expect.objectContaining({ destinationCompanyName: 'test-2026-10-19' }),
        ),
      )
      expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
      expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    },
  )

  it('sends the shipping of a completed Interior permit without a receipt to the shipping save for a Provincial Submitter', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue(completedPermitWithoutReceipt)
    mockedUpdatePermitShipping.mockResolvedValue({
      success: true,
      message: 'The permit was saved successfully.',
      errors: [],
      warnings: [
        'Receipt number should not be empty for a complete permit so it will be saved as Payment pending.',
      ],
      source: 'api',
      permitStatus: 'PPD',
      permitReceiptNo: '',
    })
    renderPermitDetails()

    await editCompletedPermitShipping()
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    await waitFor(() =>
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({ destinationCompanyName: 'test-2026-10-19' }),
      ),
    )
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(
      await screen.findByText(/Receipt number should not be empty for a complete permit/),
    ).toBeInTheDocument()
  })

  it.each([
    { description: 'a permit that is not Interior', interior: false, receipt: '' },
    { description: 'an Interior permit with a receipt', interior: true, receipt: 'R-9' },
  ])('saves a completed permit straight away for $description', async ({ interior, receipt }) => {
    configureActivePermit()
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
    await selectPermitDetailTab('Fees')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    if (receipt) await userEvent.type(screen.getByLabelText('Receipt number'), receipt)
    await selectPermitDetailTab('Permit')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitStatus: 'COM', permitReceiptNo: receipt }),
      ),
    )
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
  })

  it('only exposes the supported payment completion fields for a payment-pending permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      receiptNumber: null,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsWithApplication)
    renderPermitDetails()

    await selectPermitDetailTab('Owner')
    expect(await screen.findByRole('heading', { name: 'Applicant details' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Edit applicant(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    const receiptNumber = screen.getByLabelText('Receipt number')
    await userEvent.type(receiptNumber, 'R-2')

    await selectPermitDetailTab('Permit')

    const financialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile') as HTMLElement
    expect(within(financialTile).queryByLabelText('Receipt number')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeEnabled()
    expect(screen.getByLabelText('Issued date')).toBeDisabled()
    for (const label of [
      'Exemption number',
      'Region',
      'Current permit volume (m³)',
      'Current permit pieces',
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
      expect(screen.getByText(label).tagName).toBe('DT')
    }
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'COM')
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

  it('saves a receipt on a Payment pending permit and leaves its status Payment pending', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    onTestFinished(() => visibleRects.mockRestore())
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      receiptNumber: null,
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsWithApplication)
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    expect(screen.queryByText(/select Completed on the Permit tab/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Receipt number'), 'R-2')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() =>
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ permitStatus: 'PPD', permitReceiptNo: 'R-2' }),
      ),
    )
    expect(
      screen.queryByText(
        'Select Completed on the Permit tab before saving a payment-pending receipt.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Save as Payment pending?' })).toBeNull()
    // The receipt locks and its Edit button goes, so the saved notice takes focus.
    const notice = (await screen.findByText('Receipt number saved.')).closest(
      '.app-inline-notification',
    )
    await waitFor(() => expect(notice).toHaveFocus())
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

    expect((await screen.findAllByText('Payment pending')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /Edit permit(?: details)?/ }))

    const permitStatusSelect = screen.getByLabelText('Status')
    expect(permitStatusSelect).toHaveValue('PPD')
    expect(
      within(permitStatusSelect).getByRole('option', { name: 'Payment pending' }),
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
    expect(await screen.findByLabelText('Receipt number')).toBeDisabled()
    expect(
      within(screen.getByRole('tabpanel', { name: 'Fees' })).queryByRole('button', {
        name: /Edit permit(?: details)?/,
      }),
    ).not.toBeInTheDocument()
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
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsWithApplication)
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(await screen.findByLabelText('Receipt number')).toBeDisabled()
    expect(screen.queryByText(/select Completed on the Permit tab/i)).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel', { name: 'Fees' })).queryByRole('button', {
        name: /Edit permit(?: details)?/,
      }),
    ).not.toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it.each([
    { permitStatusCode: 'PPD', permitStatusDescription: 'Payment pending', statusEditable: true },
    { permitStatusCode: 'ACT', permitStatusDescription: 'Active', statusEditable: false },
  ])(
    'lets Provincial Submitters change the status only on a Payment pending permit ($permitStatusCode)',
    async ({ permitStatusCode, permitStatusDescription, statusEditable }) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
          canPerform: (action: string) => action !== '/permitsReview',
        }),
      )
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
        receiptNumber: null,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

      if (statusEditable) {
        expect(screen.getByLabelText('Status')).toBeEnabled()
      } else {
        expect(screen.getByLabelText('Status')).toBeDisabled()
      }
      expect(screen.getByLabelText('Issued date')).toBeDisabled()
      expect(screen.getByLabelText('Expiry date')).toBeDisabled()
    },
  )

  it.each(['CAN', 'ACT', 'COM'])(
    'saves a Provincial Submitter change of a Payment pending permit to %s without the approval email',
    async (targetStatus) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
          canPerform: (action: string) => action !== '/permitsReview',
        }),
      )
      const paymentPendingPermit = {
        ...permitDetail,
        permitStatusCode: 'PPD',
        permitStatusDescription: 'Payment pending',
        receiptNumber: null,
      }
      mockedFetchProvincialPermitDetail
        .mockResolvedValueOnce(paymentPendingPermit)
        .mockResolvedValueOnce(paymentPendingPermit)
        .mockResolvedValue({ ...paymentPendingPermit, permitStatusCode: targetStatus })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsWithApplication)
      mockedUpdatePermitDetail.mockResolvedValue({
        success: true,
        message: 'The permit was updated successfully.',
        errors: [],
        warnings: [],
        source: 'api',
        permitStatus: targetStatus,
      })
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      const status = screen.getByLabelText('Status')
      expect(
        within(status)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value')),
      ).toEqual(['', 'ACT', 'COM', 'PPD', 'CAN', 'EXP'])
      await userEvent.selectOptions(status, targetStatus)
      await selectPermitDetailTab('Fees')
      expect(screen.getByLabelText('Receipt number')).toBeDisabled()
      await selectPermitDetailTab('Permit')
      await userEvent.click(getActiveSectionSaveButton())
      if (targetStatus === 'COM') {
        await userEvent.click(
          within(await screen.findByRole('dialog', { name: 'Save as Payment pending?' })).getByRole(
            'button',
            { name: 'Save' },
          ),
        )
      }

      await waitFor(() => {
        expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
          expect.objectContaining({
            permitStatus: targetStatus,
            permitReceiptNo: '',
            permitIssueDate: permitDetail.issueDate,
            permitExpiryDate: permitDetail.expiryDate,
          }),
        )
      })
      expect(await screen.findByText('Permit details saved.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
      expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
    },
  )

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
    expect(await screen.findByText('Shipping details saved.')).toBeInTheDocument()
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
    expect(screen.queryByText('Other port of export name')).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export name'), 'Boundary Bay')
    await userEvent.selectOptions(screen.getByLabelText('Customs port of export'), 'VA')

    expect(screen.queryByLabelText('Other port of export name')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Transport name'), ' Updated')
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

  it('rejects a shipping save when a text value exceeds the frontend schema width', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      destinationCompanyName: 'A'.repeat(53),
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    const save = screen.getByRole('button', { name: 'Save shipping' })
    expect(save).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Transport name'), ' Updated')
    await userEvent.click(save)
    const purchaser = screen.getByLabelText('Purchaser')
    await waitFor(() => expect(purchaser).toHaveAttribute('aria-invalid', 'true'))
    await waitFor(() => expect(purchaser).toHaveFocus())
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it.each([
    ['COM', 'Completed'],
    ['PPD', 'Payment pending'],
  ])(
    'lets the destination country change with the other shipping details for %s',
    async (permitStatusCode, permitStatusDescription) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

      expect(screen.getByLabelText('Final destination country')).toBeEnabled()
      expect(screen.getByLabelText('Purchaser')).toBeEnabled()
    },
  )

  it('locks the customs port of export on a cancelled permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    expect(screen.getByLabelText('Customs port of export')).toBeDisabled()
    expect(screen.getByLabelText('Transport name')).toBeEnabled()
  })

  it('locks the customs port of export on a completed permit for Provincial Submitters', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    expect(screen.getByLabelText('Customs port of export')).toBeDisabled()
    expect(screen.getByLabelText('Transport name')).toBeEnabled()
    expect(screen.getByLabelText('Final destination country')).toBeEnabled()
  })

  it.each([
    { permitStatusCode: 'PPD', description: 'Payment pending', customsPortLocked: false },
    { permitStatusCode: 'COM', description: 'Completed', customsPortLocked: true },
  ])(
    'locks the other port name on a $description permit for Provincial Submitters',
    async ({ permitStatusCode, description, customsPortLocked }) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
          canPerform: (action: string) => action !== '/permitsReview',
        }),
      )
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription: description,
        portOfExportCode: 'OT',
        otherPortOfExport: 'Generic TEST port',
      })
      renderPermitDetails()

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

      expect(screen.getByLabelText('Other port of export name')).toBeDisabled()
      expect(screen.getByLabelText('Other port of export name')).toHaveValue('Generic TEST port')
      if (customsPortLocked) {
        expect(screen.getByLabelText('Customs port of export')).toBeDisabled()
      } else {
        expect(screen.getByLabelText('Customs port of export')).toBeEnabled()
      }
      expect(screen.getByLabelText('Transport name')).toBeEnabled()
    },
  )

  it('keeps the other port name editable on a Payment pending permit for permit reviewers', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      portOfExportCode: 'OT',
      otherPortOfExport: 'Generic TEST port',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

    expect(screen.getByLabelText('Other port of export name')).toBeEnabled()
    expect(screen.getByLabelText('Customs port of export')).toBeEnabled()
  })

  it.each([
    { submitter: true, savedPort: 'VA', ports: ['', 'VA'] },
    { submitter: true, savedPort: 'OT', ports: ['', 'OT', 'VA'] },
    { submitter: false, savedPort: 'VA', ports: ['', 'OT', 'VA'] },
  ])(
    'offers Other as the port of export on a Payment pending permit only when its name can be kept (submitter: $submitter, saved port $savedPort)',
    async ({ submitter, savedPort, ports }) => {
      if (submitter) {
        mockedUseAuth.mockReturnValue(
          createTestAuthContext({
            capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
            canPerform: (action: string) => action !== '/permitsReview',
          }),
        )
      }
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'PPD',
        permitStatusDescription: 'Payment pending',
        portOfExportCode: savedPort,
        otherPortOfExport: savedPort === 'OT' ? 'Generic TEST port' : null,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))

      const port = screen.getByLabelText('Customs port of export')
      expect(
        within(port)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value')),
      ).toEqual(ports)
      if (submitter && savedPort === 'OT') {
        await userEvent.selectOptions(port, 'VA')
        await userEvent.selectOptions(port, 'OT')
        expect(screen.getByLabelText('Other port of export name')).toBeDisabled()
        expect(screen.getByLabelText('Other port of export name')).toHaveValue('Generic TEST port')
      }
    },
  )

  it.each([
    ['COM', 'Completed'],
    ['PPD', 'Payment pending'],
  ])('keeps the expiry date read-only on a %s permit', async (permitStatusCode, description) => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode,
      permitStatusDescription: description,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))

    expect(screen.getByLabelText('Expiry date')).toBeDisabled()
  })

  it('keeps the receipt number read-only for Provincial Submitters', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    configureActivePermit()
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    expect(await screen.findByLabelText('Receipt number')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit receipt number' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel', { name: 'Fees' })).queryByRole('button', {
        name: /Edit permit(?: details)?/,
      }),
    ).not.toBeInTheDocument()
  })

  it('focuses the Fees tab when a submitter cancels permit editing from it', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_PROVINCIAL_SUBMITTER'] }),
        canPerform: (action: string) => action !== '/permitsReview',
      }),
    )
    configureMinisterialActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await selectPermitDetailTab('Fees')
    const feesPanel = screen.getByRole('tabpanel', { name: 'Fees' })
    expect(within(feesPanel).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    await userEvent.click(within(feesPanel).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Fees' })).toHaveFocus())
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true')
  })

  it('saves shipping changes on a cancelled permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.type(screen.getByLabelText('Transport name'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save shipping' }))

    await waitFor(() => {
      expect(mockedUpdatePermitShipping).toHaveBeenCalledWith(
        expect.objectContaining({ permitNumber: '777' }),
      )
    })
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
    expect(
      screen.queryByRole('button', { name: /Edit permit(?: details)?/ }),
    ).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()

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
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
  })

  it('offers the approval email after a reviewer saves a completed permit', async () => {
    renderPermitDetails()

    expect(await screen.findByRole('heading', { name: 'Permit summary' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Email approval' })).not.toBeInTheDocument()
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
    await saveCompletedPermitRemarks()

    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    expect(mockedFetchPermitApprovalEmailDefault).toHaveBeenCalledWith('777')
    const recipient = within(dialog).getByLabelText('Applicant email address')
    expect(recipient).toHaveValue('owner@example.test')

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
    const sentNotice = screen.getByText('Permit approval email sent.')
    expect(
      screen.getByText('Sent to the applicant (updated.applicant@example.ca).'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Action completed')).not.toBeInTheDocument()
    await waitFor(() => expect(sentNotice.closest('.permit-page-result')).toHaveFocus())
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedSendPermitApprovalEmail).toHaveBeenCalledTimes(1)
  })

  it('offers the approval email again when a reviewer saves an unchanged completed permit', async () => {
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:permit|changes)$/ }))

    expect(await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })).toBeVisible()
    expect(mockedFetchPermitApprovalEmailDefault).toHaveBeenCalledWith('777')
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('does not offer the approval email for a payment pending permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:permit|changes)$/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Edit permit(?: details)?/ })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    expect(mockedFetchPermitApprovalEmailDefault).not.toHaveBeenCalled()
  })

  it('does not open the approval email after the page moves to another permit', async () => {
    let resolveDefaultEmail: (email: string) => void = () => undefined
    mockedFetchPermitApprovalEmailDefault.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDefaultEmail = resolve
      }),
    )
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
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

    await saveCompletedPermitRemarks()
    await waitFor(() => expect(mockedFetchPermitApprovalEmailDefault).toHaveBeenCalledWith('777'))
    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
    expect(
      await screen.findByRole('button', { name: /Edit permit(?: details)?/ }),
    ).toBeInTheDocument()
    await act(async () => resolveDefaultEmail('owner@example.test'))

    expect(screen.queryByRole('dialog', { name: /approval\?$/ })).toBeNull()
  })

  it('defaults Blanket OIC approval mail to the owner', async () => {
    const blanketOicPermit = {
      ...permitDetail,
      blanketOic: true,
      oicApplicationNumber: 111,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    }
    // The permit is read on load and when its editor opens.
    mockedFetchProvincialPermitDetail
      .mockResolvedValueOnce(blanketOicPermit)
      .mockResolvedValueOnce(blanketOicPermit)
    mockedFetchPermitApprovalEmailDefault.mockResolvedValueOnce('owner@example.test')
    renderPermitDetails()

    await saveCompletedPermitRemarks()

    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    expect(within(dialog).getByLabelText('Applicant email address')).toHaveValue(
      'owner@example.test',
    )
  })

  it('does not open the approval dialog when the server cannot resolve a default', async () => {
    mockedFetchPermitApprovalEmailDefault.mockRejectedValueOnce(new Error('Oracle unavailable'))
    renderPermitDetails()

    await saveCompletedPermitRemarks()

    expect(
      await screen.findByText('Unable to resolve the permit applicant notification email.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
  })

  it('blocks an invalid approval recipient and cancels without sending', async () => {
    renderPermitDetails()

    await saveCompletedPermitRemarks()
    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    const recipient = within(dialog).getByLabelText('Applicant email address')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'not-an-email')

    expect(within(dialog).getByText('Enter one valid email address.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send approval' }))
    await waitFor(() => expect(recipient).toHaveFocus())
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Email permit 777 approval?' })).toBeNull()
    })
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  it('keeps Send approval enabled and shows the field error when the address is blank', async () => {
    mockedFetchPermitApprovalEmailDefault.mockResolvedValueOnce('')
    renderPermitDetails()

    await saveCompletedPermitRemarks()
    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    const recipient = within(dialog).getByLabelText('Applicant email address')
    expect(recipient).toHaveValue('')
    expect(within(dialog).queryByText('Enter one valid email address.')).not.toBeInTheDocument()
    const sendButton = within(dialog).getByRole('button', { name: 'Send approval' })
    expect(sendButton).toBeEnabled()

    await userEvent.click(sendButton)

    expect(await within(dialog).findByText('Enter one valid email address.')).toBeInTheDocument()
    await waitFor(() => expect(recipient).toHaveFocus())
    expect(recipient).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).queryByText('Approval email not sent.')).not.toBeInTheDocument()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
  })

  it('keeps the approval dialog open when notification delivery cannot be sent', async () => {
    mockedSendPermitApprovalEmail.mockResolvedValueOnce({
      success: false,
      message: 'Permit approval notification is unavailable.',
      permitRequestDate: '',
    })
    renderPermitDetails()

    await saveCompletedPermitRemarks()
    const dialog = await screen.findByRole('dialog', { name: 'Email permit 777 approval?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send approval' }))

    expect(
      await screen.findByText('Permit approval notification is unavailable.'),
    ).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Approval email not sent.')).toBeVisible()
    expect(screen.getAllByText('Approval email not sent.')).toHaveLength(1)
    expect(mockedSendPermitApprovalEmail).toHaveBeenCalledWith('777', 'owner@example.test')
    expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1)
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
  })

  const configureReadyBlanketOicSubmitterPermit = (permitStatusCode = 'ACT') => {
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
      permitStatusCode,
      permitStatusDescription: permitStatusCode === 'ACT' ? 'Active' : permitStatusCode,
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
  }

  const openPermitReviewRequestDialog = async () => {
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
    await waitFor(() => expect(requestButton).toBeEnabled())
    await userEvent.click(requestButton)
    return screen.findByRole('dialog', { name: 'Email permit 777 review request?' })
  }

  it.each([
    {
      blanketOic: true,
      message:
        'An active permit requires a package and scale detail before review can be requested.',
    },
    {
      blanketOic: false,
      message:
        'An active permit requires an application, package, and scale detail before review can be requested.',
    },
  ])(
    'names what the permit still needs before review can be requested (Blanket OIC: $blanketOic)',
    async ({ blanketOic, message }) => {
      configureReadyBlanketOicSubmitterPermit()
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode: 'ACT',
        permitStatusDescription: 'Active',
        blanketOic,
        oicApplicationNumber: blanketOic ? 111 : null,
      })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        applications: [],
        packages: [],
        items: [],
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
      await waitFor(() => expect(requestButton).toBeDisabled())
      await userEvent.hover(requestButton.closest('.disabled-button-tooltip') as HTMLElement)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(message)
    },
  )

  it('sends the review request to the regional office with an editable copy recipient', async () => {
    configureReadyBlanketOicSubmitterPermit()
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: true,
      message:
        'Your email request for Permit Number 777 has been sent to the Regional office for review. You will be notified when the Permit to Transport Unmanufactured Timber from BC has been issued.',
      permitRequestDate: '2026-07-10',
    })

    const dialog = await openPermitReviewRequestDialog()

    expect(mockedFetchPermitReviewRequestEmailDefaults).toHaveBeenCalledWith('777')
    expect(mockedSendPermitReviewRequestEmail).not.toHaveBeenCalled()
    expect(within(dialog).getByLabelText('Send to')).toHaveValue('region@example.test')
    expect(within(dialog).getByLabelText('Send to')).toHaveAttribute('readonly')
    const copyTo = within(dialog).getByLabelText('Copy to')
    expect(copyTo).toHaveValue('agent@example.test')
    await userEvent.clear(copyTo)
    await userEvent.type(copyTo, 'copy@example.test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    await waitFor(() => {
      expect(mockedSendPermitReviewRequestEmail).toHaveBeenCalledWith('777', 'copy@example.test')
      expect(screen.queryByRole('dialog', { name: 'Email permit 777 review request?' })).toBeNull()
    })
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
    const sentNotice = await screen.findByText(
      /Your email request for Permit Number 777 has been sent/,
    )
    await waitFor(() => expect(sentNotice.closest('.permit-page-result')).toHaveFocus())
    expect(sentNotice).toHaveTextContent('You will be notified when the Permit to Transport')
    expect(screen.queryByText('Review request email sent.')).not.toBeInTheDocument()
    // The first request sets the Submit date to the request date.
    expect(screen.getAllByText('Jul 10, 2026')).toHaveLength(1)
    expect(screen.queryByText('Apr 10, 2026')).not.toBeInTheDocument()
  })

  it('leaves the dates alone when the review request returns no request date', async () => {
    configureReadyBlanketOicSubmitterPermit()
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: true,
      message: 'Your email request for Permit Number 777 has been sent to the Regional office.',
      permitRequestDate: '',
    })

    const dialog = await openPermitReviewRequestDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(
      await screen.findByText(/Your email request for Permit Number 777 has been sent/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Apr 10, 2026')).toHaveLength(1)
  })

  it('tells the user to notify the Regional Office when the review request has no message', async () => {
    configureReadyBlanketOicSubmitterPermit()
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: false,
      message: '',
      permitRequestDate: '',
    })

    const dialog = await openPermitReviewRequestDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(
      await within(dialog).findByText(
        'Email was not sent. Warning: Regional Office must be otherwise notified.',
      ),
    ).toBeVisible()
  })

  it('keeps the review request dialog open when the copy recipient is invalid or sending fails', async () => {
    configureReadyBlanketOicSubmitterPermit()
    mockedSendPermitReviewRequestEmail.mockResolvedValue({
      success: false,
      message: 'Permit review request email could not be sent.',
      permitRequestDate: '',
    })

    const dialog = await openPermitReviewRequestDialog()
    const copyTo = within(dialog).getByLabelText('Copy to')
    await userEvent.clear(copyTo)
    await userEvent.type(copyTo, 'not-an-email')
    expect(within(dialog).queryByText('Enter one valid email address.')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(
      await within(dialog).findByText('Enter one valid email address.', {
        selector: '.cds--form-requirement',
      }),
    ).toBeVisible()
    await waitFor(() => expect(copyTo).toHaveFocus())
    expect(copyTo).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getAllByText('Enter one valid email address.')).toHaveLength(1)
    expect(within(dialog).queryByText('Review request email not sent.')).toBeNull()
    expect(mockedSendPermitReviewRequestEmail).not.toHaveBeenCalled()

    await userEvent.type(copyTo, 'x')
    expect(within(dialog).queryByText('Enter one valid email address.')).toBeNull()
    await userEvent.clear(copyTo)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    await waitFor(() => expect(mockedSendPermitReviewRequestEmail).toHaveBeenCalledWith('777', ''))
    expect(await within(dialog).findByText('Review request email not sent.')).toBeVisible()
    expect(within(dialog).getByText('Permit review request email could not be sent.')).toBeVisible()
  })

  it('does not open the review request after the page moves to another permit', async () => {
    configureReadyBlanketOicSubmitterPermit()
    mockedFetchProvincialPermitDetail.mockImplementation(async (requestedPermitNumber) => ({
      ...permitDetail,
      permitNumber: Number(requestedPermitNumber),
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicApplicationNumber: 111,
      receivedDate: null,
    }))
    let resolveDefaults: (
      defaults: Awaited<ReturnType<typeof fetchPermitReviewRequestEmailDefaults>>,
    ) => void = () => undefined
    mockedFetchPermitReviewRequestEmailDefaults.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDefaults = resolve
      }),
    )
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
    const requestButton = await screen.findByRole('button', { name: 'Email review request' })
    await waitFor(() => expect(requestButton).toBeEnabled())
    await userEvent.click(requestButton)
    await waitFor(() =>
      expect(mockedFetchPermitReviewRequestEmailDefaults).toHaveBeenCalledWith('777'),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Switch permit' }))
    await waitFor(() => expect(mockedFetchProvincialPermitDetail).toHaveBeenCalledWith('888'))
    expect(await screen.findByRole('button', { name: 'Email review request' })).toBeInTheDocument()
    await act(async () =>
      resolveDefaults({
        regionalEmailAddress: 'region@example.test',
        copyToEmailAddress: 'agent@example.test',
      }),
    )

    expect(screen.queryByRole('dialog', { name: /review request\?$/ })).toBeNull()
  })

  it.each(['COM', 'PPD', 'CAN', 'EXP'])(
    'hides the review request action from submitters on %s permits',
    async (permitStatusCode) => {
      configureReadyBlanketOicSubmitterPermit(permitStatusCode)
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

      expect(await screen.findByRole('heading', { name: 'Permit details' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Email review request' })).toBeNull()
    },
  )

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
      interior: true,
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
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

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

  it('keeps reviewed fee actions singular and hides them and the stale override summary while editing', async () => {
    configureMinisterialActivePermit()
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior: true,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit receipt number' }))
    expect(screen.queryByRole('button', { name: 'Edit receipt number' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()

    await userEvent.click(
      within(screen.getByRole('tabpanel', { name: 'Fees' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(screen.getAllByRole('button', { name: 'Edit receipt number' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Edit fee override' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Edit fee override' }))
    expect(screen.queryByRole('button', { name: 'Edit receipt number' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit fee override' })).not.toBeInTheDocument()

    expect(screen.queryByText('Override fees?', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No', checked: true })).toBeEnabled()
    const cancel = within(screen.getByRole('tabpanel', { name: 'Fees' })).getByRole('button', {
      name: 'Cancel',
    })
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    { receiptNumber: 'R-77', interior: false, shown: 'R-77' },
    { receiptNumber: null, interior: true, shown: '—' },
  ])(
    'shows the reviewed receipt number and Edit receipt number on the Permit fees card (%o)',
    async ({ receiptNumber, interior, shown }) => {
      configureMinisterialActivePermit({ receiptNumber })
      mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
        ...tabsResult,
        packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      })
      mockedFetchPermitFeeOverrideContext.mockResolvedValue({
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
        locked: false,
        lockMessage: '',
        interior,
      })
      renderPermitDetails()

      await selectPermitDetailTab('Fees')
      const permitFeesTile = (await screen.findByRole('heading', { name: 'Permit fees' })).closest(
        '.cds--tile',
      ) as HTMLElement
      const packageFeesTile = screen
        .getByRole('heading', { name: 'Package fees' })
        .closest('.cds--tile') as HTMLElement
      const editReceipt = await within(permitFeesTile).findByRole('button', {
        name: 'Edit receipt number',
      })
      expect(
        within(permitFeesTile)
          .getAllByRole('button', { name: /^Edit / })
          .map((button) => button.textContent),
      ).toEqual(['Edit receipt number', 'Edit fee override'])
      expect(within(packageFeesTile).queryByRole('button', { name: /^Edit / })).toBeNull()
      expect(
        Array.from(permitFeesTile.querySelectorAll('dt'), (term) => term.textContent).slice(0, 3),
      ).toEqual(['Receipt number', 'Total volume (m³)', 'Total fees (CAD)'])
      const receiptField = within(permitFeesTile)
        .getByText('Receipt number', { selector: 'dt' })
        .closest('.record-field') as HTMLElement
      expect(within(receiptField).getByText(shown)).toBeVisible()

      await userEvent.click(editReceipt)
      expect(within(permitFeesTile).getByLabelText('Receipt number')).toHaveValue(
        receiptNumber ?? '',
      )
      expect(within(packageFeesTile).queryByLabelText('Receipt number')).not.toBeInTheDocument()
    },
  )

  it('hides the reviewed receipt number without a receipt on a non-Interior permit', async () => {
    configureMinisterialActivePermit({ receiptNumber: null })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior: false,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    const permitFeesTile = (await screen.findByRole('heading', { name: 'Permit fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    expect(
      await within(permitFeesTile).findByRole('button', { name: 'Edit fee override' }),
    ).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Edit receipt number' })).not.toBeInTheDocument()
    expect(within(permitFeesTile).queryByText('Receipt number')).not.toBeInTheDocument()
  })

  it.each([
    { permitStatusCode: 'COM', permitStatusDescription: 'Completed' },
    { permitStatusCode: 'PPD', permitStatusDescription: 'Payment pending' },
  ])('keeps a stored receipt number read-only without Edit receipt number (%o)', async (status) => {
    configureMinisterialActivePermit({ ...status, receiptNumber: 'R-77' })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
    })
    mockedFetchPermitFeeOverrideContext.mockResolvedValue({
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior: false,
    })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    const permitFeesTile = (await screen.findByRole('heading', { name: 'Permit fees' })).closest(
      '.cds--tile',
    ) as HTMLElement
    expect(await within(permitFeesTile).findByText('R-77')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit receipt number' })).not.toBeInTheDocument()
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
      interior: true,
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))

    expect(screen.queryByLabelText('Override fee (CAD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Override comment')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

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
      interior: true,
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))

    const overrideFee = screen.getByLabelText('Override fee (CAD)')
    const overrideComment = screen.getByLabelText('Override comment')
    const saveButton = screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ })
    await userEvent.clear(overrideFee)
    await userEvent.click(saveButton)

    expect(saveButton).toBeEnabled()
    expect(overrideFee).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Override fee is required')).toBeInTheDocument()
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
    // The edit context read when the second editor opens sees the override the first save stored.
    const withoutOverride = {
      overrideEnabled: false,
      overrideFee: '',
      overrideComment: '',
      locked: false,
      lockMessage: '',
      interior: true,
    }
    mockedFetchPermitFeeOverrideContext
      .mockResolvedValueOnce(withoutOverride)
      .mockResolvedValueOnce(withoutOverride)
      .mockResolvedValue({ ...withoutOverride, overrideEnabled: true, overrideFee: '45.25' })
    renderPermitDetails()

    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '45.25')
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    expect(await screen.findByText('Fee override saved.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit fee override' }))
    await userEvent.clear(screen.getByLabelText('Override fee (CAD)'))
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

    expect(screen.getByText('Override fee is required')).toBeInTheDocument()
    expect(screen.queryByText('Fee override saved.')).not.toBeInTheDocument()
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
      interior: true,
    })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))

    const overrideFee = screen.getByLabelText('Override fee (CAD)')
    const overrideComment = screen.getByLabelText('Override comment')
    const saveButton = screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ })

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '9999999.995')
    await userEvent.click(saveButton)

    expect(
      await screen.findByText('Override fee must round to 9999999.99 or less'),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '0.001')
    await userEvent.click(saveButton)

    expect(await screen.findByText('Override fee must round to at least 0.01')).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()

    await userEvent.clear(overrideFee)
    await userEvent.type(overrideFee, '1.00')
    fireEvent.change(overrideComment, { target: { value: 'x'.repeat(255) } })
    await userEvent.click(saveButton)

    expect(
      await screen.findByText('Override comment must be 254 characters or fewer'),
    ).toBeInTheDocument()
    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
  })

  it('preserves legacy Oracle rounding for permit fee overrides', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
    })
    const storedOverride = {
      overrideEnabled: true,
      overrideFee: '25.00',
      overrideComment: 'Legacy override',
      locked: false,
      lockMessage: '',
      interior: true,
    }
    // The edit context read when the second editor opens sees the rounded fee the save stored.
    mockedFetchPermitFeeOverrideContext
      .mockResolvedValueOnce(storedOverride)
      .mockResolvedValueOnce(storedOverride)
      .mockResolvedValue({ ...storedOverride, overrideFee: '0.01' })

    renderPermitDetails()
    await selectPermitDetailTab('Fees')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.clear(screen.getByLabelText('Override fee (CAD)'))
    await userEvent.type(screen.getByLabelText('Override fee (CAD)'), '0.005')
    await userEvent.click(screen.getByRole('button', { name: /^Save (?:fee override|changes)$/ }))

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
        interior: true,
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
    expect(await screen.findByText('Permit report downloaded.')).toBeVisible()
    expect(screen.queryByText('Action completed')).not.toBeInTheDocument()
  })

  it('stays silent when the permit report file picker is cancelled', async () => {
    mockedRunReport.mockResolvedValueOnce({
      source: 'api',
      filename: 'permit-report.pdf',
      contentType: 'application/octet-stream',
      downloaded: false,
      cancelled: true,
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

    await userEvent.click(await screen.findByRole('button', { name: 'Print permit' }))

    await waitFor(() => expect(mockedRunReport).toHaveBeenCalledTimes(1))
    await screen.findByRole('button', { name: 'Print permit' })
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    expect(screen.queryByText('Permit report downloaded.')).not.toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit permit documents' })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Invoices' })).not.toBeInTheDocument()
  })

  it('opens, cancels, and reopens the Ministerial Add documents side panel', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
    const panel = await screen.findByRole('complementary', { name: 'Add documents' })
    expect(screen.queryByRole('dialog', { name: 'Add documents' })).not.toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))
    expect(await screen.findByRole('complementary', { name: 'Add documents' })).toBeInTheDocument()
  })

  it('closes the Ministerial side panel after each save and keeps Add documents available', async () => {
    configureMinisterialActivePermit()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')

    const firstFile = new File(['first test'], 'first-ministerial.pdf', { type: 'application/pdf' })
    await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
    const firstPanel = await screen.findByRole('complementary', { name: 'Add documents' })
    await userEvent.upload(within(firstPanel).getByLabelText('Document File'), firstFile)
    await waitFor(() =>
      expect(within(firstPanel).getByRole('button', { name: 'Save documents' })).toBeEnabled(),
    )
    await userEvent.click(within(firstPanel).getByRole('button', { name: 'Save documents' }))

    await waitFor(() =>
      expect(submitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ file: firstFile, permitNumber: '777' }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    const documentSection = screen.getByRole('region', { name: 'Documents' })
    expect(within(documentSection).getByText('1 document saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add documents' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
    expect(documentSection.closest('.cds--tile')).toBeNull()

    const secondFile = new File(['second test'], 'second-ministerial.pdf', {
      type: 'application/pdf',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))
    const secondPanel = await screen.findByRole('complementary', { name: 'Add documents' })
    await userEvent.upload(within(secondPanel).getByLabelText('Document File'), secondFile)
    await waitFor(() =>
      expect(within(secondPanel).getByRole('button', { name: 'Save documents' })).toBeEnabled(),
    )
    await userEvent.click(within(secondPanel).getByRole('button', { name: 'Save documents' }))

    await waitFor(() => expect(submitAdminUpload).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(3)
    expect(within(documentSection).getByText('1 document saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add documents' })).toBeInTheDocument()
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
      within(documentRow as HTMLElement).getByRole('button', { name: /^Delete\b/ }),
    )
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(confirmation).toHaveTextContent(
      'ministerial-document.pdf will be deleted. This action cannot be undone.',
    )
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(mockedRemovePermitDocument).not.toHaveBeenCalled()
  })

  it('opens the Blanket OIC document side panel directly and preserves queued files until discard is confirmed', async () => {
    configureBlanketOicDocument()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    expect(
      await within(await findDocumentsSection()).findByRole('button', { name: /^Delete\b/ }),
    ).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))

    const panel = await screen.findByRole('complementary', { name: 'Add documents' })
    expect(panel).toHaveClass('detail-document-upload-panel')
    expect(within(panel).queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    const file = new File(['test'], 'pending.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(panel).getByLabelText('Document File'), file)
    await userEvent.type(
      within(panel).getByLabelText(/Document description for pending.pdf/),
      'Keep this description',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }))
    const reopenedPanel = await screen.findByRole('complementary', { name: 'Add documents' })
    expect(within(reopenedPanel).getByText('pending.pdf')).toBeInTheDocument()
    expect(
      within(reopenedPanel).getByLabelText(/Document description for pending.pdf/),
    ).toHaveValue('Keep this description')
    await userEvent.click(within(reopenedPanel).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
    expect(submitAdminUpload).not.toHaveBeenCalled()
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()
  })

  it('saves consecutive Blanket OIC documents and retains the latest success after each panel closes', async () => {
    configureBlanketOicDocument()
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
    const panel = await screen.findByRole('complementary', { name: 'Add documents' })
    const file = new File(['test'], 'new.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(panel).getByLabelText('Document File'), file)
    await userEvent.type(
      within(panel).getByLabelText(/Document description for new.pdf/),
      'New document',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Save documents' }))
    await waitFor(() =>
      expect(submitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ file, fileDescription: 'New document', permitNumber: '777' }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1 document saved.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Add documents' }))
    const secondPanel = await screen.findByRole('complementary', { name: 'Add documents' })
    expect(screen.queryByLabelText(/Document description for new.pdf/)).not.toBeInTheDocument()
    const secondFile = new File(['second test'], 'second-new.pdf', { type: 'application/pdf' })
    await userEvent.upload(within(secondPanel).getByLabelText('Document File'), secondFile)
    await userEvent.type(
      within(secondPanel).getByLabelText(/Document description for second-new.pdf/),
      'Second document',
    )
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
      expect(
        screen.queryByRole('complementary', { name: 'Add documents' }),
      ).not.toBeInTheDocument(),
    )
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(3)
    expect(screen.getByText('1 document saved.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add documents' })).toHaveFocus())
  })

  it.each(['BOIC', 'Ministerial'])(
    'opens %s documents separately from Download using the authenticated permit target',
    async (type) => {
      configureBlanketOicDocument()
      if (type === 'Ministerial') configureMinisterialActivePermit()
      const blob = new Blob(['%PDF-1.7'], { type: 'application/octet-stream' })
      mockedOpenPermitDocument.mockResolvedValue({ source: 'api', blob, filename: 'permit.pdf' })
      renderPermitDetails()
      await selectPermitDetailTab('Documents')
      await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
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
      await userEvent.click(screen.getByRole('button', { name: /^Download\b/ }))
      await waitFor(() =>
        expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(blob, 'permit.pdf'),
      )
      expect(openDocumentPreview).toHaveBeenCalledTimes(1)
    },
  )

  it('reports a Blanket OIC document open failure and closes its reserved tab without downloading', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    configureBlanketOicDocument()
    mockedOpenPermitDocument.mockRejectedValue(new Error('document unavailable'))
    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
    expect(await screen.findByText('Unable to open the selected document.')).toBeInTheDocument()
    expect(previewWindow.close).toHaveBeenCalledOnce()
    expect(openDocumentPreview).not.toHaveBeenCalled()
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('keeps a delayed document error in the Documents tab while creating and cancelling a package', async () => {
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
    await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
    await selectPermitDetailTab('Items')
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageEditor = (await screen.findByRole('heading', { name: 'Create package' })).closest(
      '.application-detail-edit-section',
    ) as HTMLElement

    await act(() => rejectDocument(new Error('document unavailable')))

    // The error belongs to the Documents tab, which is hidden while Items is selected.
    const documentError = await screen.findByText('Unable to open the selected document.')
    expect(documentError.closest('#permit-documents')).not.toBeNull()
    expect(packageEditor).not.toContainElement(documentError)
    expect(within(packageEditor).queryByText('Package needs attention')).not.toBeInTheDocument()

    await userEvent.click(within(packageEditor).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
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
      await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
      expect(await screen.findByText('Unable to open the selected document.')).toBeInTheDocument()
      await selectPermitDetailTab('Items')
      const packageRow = await findBlanketOicPackageCard()
      await userEvent.click(within(packageRow).getByRole('button', { name: 'Edit package' }))
      const packageEditor = (await screen.findByRole('heading', { name: 'Edit package' })).closest(
        '.application-detail-edit-section',
      ) as HTMLElement
      const saveButton = within(packageEditor).getByRole('button', { name: 'Save package' })
      await waitFor(() => expect(saveButton).toBeEnabled())
      expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
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
      const documentError = screen.getByText('Unable to open the selected document.')
      expect(documentError.closest('#permit-documents')).not.toBeNull()
      expect(packageEditor).not.toContainElement(documentError)
      expect(mockedUpdateBlanketOicPackage).toHaveBeenCalledOnce()

      await userEvent.click(within(packageEditor).getByRole('button', { name: 'Cancel' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
      expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
      expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: /^Download\b/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Download\b/ }))
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
    await userEvent.click(await screen.findByRole('button', { name: /^Open\b/ }))
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
    expect(await screen.findByRole('button', { name: /^Open\b/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Download\b/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    expect(
      within(getDocumentsSection()).queryByRole('button', { name: /^Delete\b/ }),
    ).not.toBeInTheDocument()
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
    const downloadDocumentButton = await screen.findByRole('button', { name: /^Download\b/ })
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
    const deleteButton = await within(await findDocumentsSection()).findByRole('button', {
      name: /^Delete\b/,
    })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(confirmation).toHaveTextContent(
      'permit-doc.pdf will be deleted. This also deletes the associated invoice record, including its value, conversion rate, and fee. This action cannot be undone.',
    )
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedRemovePermitInvoiceDocument).toHaveBeenCalledWith('500', '777')
      expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('permit-doc.pdf')).not.toBeInTheDocument()
    })
    const success = await within(screen.getByRole('region', { name: 'Documents' })).findByText(
      'Document deleted.',
    )
    expect(success.closest('.cds--inline-notification')).toHaveClass(
      'cds--inline-notification--success',
    )
  })

  it('keeps refreshed permit documents visible after a delete', async () => {
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

    renderPermitDetails()
    await selectPermitDetailTab('Documents')
    await enterPermitDocumentEditMode()
    await userEvent.click(
      await within(await findDocumentsSection()).findByRole('button', { name: /^Delete\b/ }),
    )
    await userEvent.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Are you sure you want to delete this document?',
        }),
      ).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => expect(mockedRemovePermitDocument).toHaveBeenCalledWith('600', '777'))
    expect(screen.queryByText('permit-only.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('Document deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Documents unavailable' })).not.toBeInTheDocument()
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
    const deleteButton = await within(await findDocumentsSection()).findByRole('button', {
      name: /^Delete\b/,
    })
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
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()
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
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()
  })

  it('hides invoice document delete outside active permit status', async () => {
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
    expect(
      within(getDocumentsSection()).queryByRole('button', { name: /^Delete\b/ }),
    ).not.toBeInTheDocument()
  })

  it('hides active permit document delete from read-only users', async () => {
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
    expect(
      within(getDocumentsSection()).queryByRole('button', { name: /^Delete\b/ }),
    ).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Add documents' })).not.toBeInTheDocument()
    await enterPermitDocumentEditMode()
    await screen.findByText('submitter-permit-doc.pdf')
    expect(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ })).toBeEnabled()
    await userEvent.click(within(getDocumentsSection()).getByRole('button', { name: /^Delete\b/ }))
    const confirmation = await screen.findByRole('dialog', {
      name: 'Are you sure you want to delete this document?',
    })
    expect(confirmation).toHaveTextContent(
      'submitter-permit-doc.pdf will be deleted. This action cannot be undone.',
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
      within(documentRow as HTMLElement).queryByRole('button', { name: /^Delete\b/ }),
    ).not.toBeInTheDocument()
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
      within(documentRow as HTMLElement).queryByRole('button', { name: /^Delete\b/ }),
    ).not.toBeInTheDocument()
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
        selector: '.app-inline-notification .cds--inline-notification__subtitle',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Permit 777' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).not.toHaveBeenCalled()
    expect(mockedFetchPermitDocuments).not.toHaveBeenCalled()
  })

  it('renders an active permit title once, with (Pending), after the permit loads', async () => {
    let resolveDetail: (detail: ProvincialPermitDetail) => void = () => undefined
    mockedFetchProvincialPermitDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )
    renderPermitDetails()

    expect(await screen.findByText('Loading provincial permit detail…')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeEmptyDOMElement()
    await act(async () => {
      resolveDetail({ ...permitDetail, permitStatusCode: 'ACT', permitStatusDescription: 'Active' })
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Permit 777 (Pending)' }),
    ).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 2, name: 'Scale' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: false,
    })
    expect(screen.getByText('Scale unavailable')).toBeInTheDocument()
    expect(screen.getAllByText('Unable to retrieve permit table details.')).toHaveLength(3)
    expect(screen.queryByLabelText('Filter item rows')).not.toBeInTheDocument()

    await selectPermitDetailTab('Permit')
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Fees')
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Unavailable')
    expect(screen.getByLabelText('Total fees (CAD)')).toHaveValue('Unavailable')
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
    expect(screen.queryByRole('heading', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })

  describe('edit focus', () => {
    it('focuses the first permit field on edit and the Edit button after Cancel', async () => {
      configureEditableBlanketOicPackage()
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: 'Edit permit details' }))
      await waitFor(() => expect(screen.getByLabelText('Status')).toHaveFocus())
      await userEvent.click(
        within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Cancel' }),
      )

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit permit details' })).toHaveFocus(),
      )
    })

    it('returns focus to Edit after a successful save', async () => {
      configureActivePermit()
      renderPermitDetails()

      await userEvent.click(await screen.findByRole('button', { name: /Edit permit(?: details)?/ }))
      await userEvent.clear(screen.getByLabelText('Remarks'))
      await userEvent.type(screen.getByLabelText('Remarks'), 'Saved remarks')
      await userEvent.click(getActiveSectionSaveButton())

      await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Edit permit(?: details)?/ })).toHaveFocus(),
      )
    })

    it('focuses the Override fees? choice when editing the fee override', async () => {
      configureActivePermit()
      renderPermitDetails()

      await selectPermitDetailTab('Fees')
      await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))

      await waitFor(() => expect(screen.getByRole('radio', { name: 'No' })).toHaveFocus())
    })
  })

  describe('panel tab changes', () => {
    const panels = [
      { name: 'Add scale', field: 'Timber mark' },
      { name: 'Create package', field: 'Comments' },
    ]

    it('asks before leaving a queued permit document for another tab', async () => {
      configureBlanketOicDocument()
      renderPermitDetails()
      await selectPermitDetailTab('Documents')
      await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
      const panel = await screen.findByRole('complementary', { name: 'Add documents' })
      await userEvent.upload(
        within(panel).getByLabelText('Document File'),
        new File(['test'], 'pending.pdf', { type: 'application/pdf' }),
      )

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
      expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(within(panel).getByText('pending.pdf')).toBeInTheDocument()

      await selectPermitDetailTab('Shipping')
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
      expect(screen.getByRole('tab', { name: 'Shipping' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('complementary', { name: 'Add documents' })).not.toBeInTheDocument()
      expect(submitAdminUpload).not.toHaveBeenCalled()
      const unload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(false)
    })

    it.each(panels)(
      'asks before leaving a changed $name panel for another tab',
      async ({ name, field }) => {
        configureEditableBlanketOicPackage()
        renderPermitDetails()
        await selectPermitDetailTab('Scale')
        await userEvent.click(await screen.findByRole('button', { name }))
        const panel = await screen.findByRole('complementary', { name })
        await userEvent.type(await within(panel).findByLabelText(field), 'KEEP-ME')

        await selectPermitDetailTab('Shipping')

        const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
        expect(screen.getByRole('tab', { name: 'Scale' })).toHaveAttribute('aria-selected', 'true')
        await userEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }))
        expect(within(panel).getByLabelText(field)).toHaveValue('KEEP-ME')
        expect(screen.getByRole('tab', { name: 'Scale' })).toHaveAttribute('aria-selected', 'true')

        await selectPermitDetailTab('Shipping')
        await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

        await waitFor(() =>
          expect(screen.getByRole('tab', { name: 'Shipping' })).toHaveAttribute(
            'aria-selected',
            'true',
          ),
        )
        expect(screen.queryByRole('complementary', { name })).not.toBeInTheDocument()
        const unload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(unload)
        expect(unload.defaultPrevented).toBe(false)
        expect(mockedAddBlanketOicScale).not.toHaveBeenCalled()
        expect(mockedAddBlanketOicPackage).not.toHaveBeenCalled()
      },
    )

    it.each(panels)(
      'leaves an unchanged $name panel for another tab without asking',
      async ({ name }) => {
        configureEditableBlanketOicPackage()
        renderPermitDetails()
        await selectPermitDetailTab('Scale')
        await userEvent.click(await screen.findByRole('button', { name }))
        await screen.findByRole('complementary', { name })

        await selectPermitDetailTab('Shipping')

        expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Shipping' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        expect(screen.queryByRole('complementary', { name })).not.toBeInTheDocument()
      },
    )
  })

  it('asks before closing the Add scale panel with entered data', async () => {
    configureEditableBlanketOicPackage()
    renderPermitDetails()
    await selectPermitDetailTab('Items')

    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    const panel = screen.getByRole('complementary', { name: 'Add scale' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText('Timber mark')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))
    await userEvent.type(await screen.findByLabelText('Timber mark'), 'TM-NEW')
    await userEvent.click(
      within(screen.getByRole('complementary', { name: 'Add scale' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discard).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Timber mark')).toHaveValue('TM-NEW')
  })

  it('closes an unchanged Ministerial scale selection without saving it', async () => {
    configureMinisterialActivePermit()
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      packages: [{ ...editableBlanketOicPackage, packageNumber: 'MIN-1' }],
      items: [
        {
          id: 'SCALE-1',
          packageNumber: 'MIN-1',
          timberMark: 'TEST',
          scaleType: 'C',
          species: 'HE',
          grade: 'U',
          pieces: 1,
          volume: 1,
          permitNumber: '777',
          includedInPermit: true,
        },
      ],
    })
    renderPermitDetails()
    await selectPermitDetailTab('Scale')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit scale selection' }))
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Summary of scale' })).getByRole('button', {
        name: 'Save changes',
      }),
    )

    expect(mockedUpdatePermitScaleSelection).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit scale selection' })).toHaveFocus(),
    )
  })
})
