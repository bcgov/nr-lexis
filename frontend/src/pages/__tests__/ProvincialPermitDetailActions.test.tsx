import { act, render, screen, waitFor, within } from '@testing-library/react'
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
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'
import { runReport } from '@/service/report-service'
import { fetchProvincialPermitOptions } from '@/service/search-options-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import { triggerBrowserDownload } from '@/utils/download'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

const openDetailUploadModal = async (
  name: 'Add document' | 'Add invoice',
): Promise<HTMLElement> => {
  const editButtonName =
    name === 'Add document' ? 'Edit permit documents' : 'Edit invoice documents'
  const editButton = screen.queryByRole('button', { name: editButtonName })
  if (editButton) {
    await userEvent.click(editButton)
  }
  await userEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog', { name })
}

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
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateAdminUpload: vi.fn(),
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
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateAdminUpload = vi.mocked(validateAdminUpload)
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
  gbmsEvents: [],
  oicItems: [],
  boicItems: [],
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
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const enterPermitDocumentEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit permit documents' }))
}

const enterInvoiceDocumentEditMode = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit invoice documents' }))
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

const renderPermitDetails = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/permit/777']}>
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
  beforeEach(() => {
    vi.clearAllMocks()
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
    mockedFetchProvincialPermitFees.mockResolvedValue([])
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
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
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
    mockedSubmitAdminUpload.mockResolvedValue({
      status: 'success',
      message: 'Invoice upload submitted.',
    })
    mockedValidateAdminUpload.mockResolvedValue({
      status: 'validated',
      message: 'File passed validation and virus scanning.',
    })
    mockedRunReport.mockResolvedValue({
      source: 'api',
      blob: new Blob(['permit report']),
      filename: 'permit-report.pdf',
      contentType: 'application/pdf',
    })
  })

  it('renders permit details, client contacts, and invoice history', async () => {
    configureActivePermit()
    mockedFetchProvincialPermitGbmsEvents.mockResolvedValue([gbmsHistoryRow])
    mockedFetchPermitInvoices.mockResolvedValue({
      rows: [
        {
          id: 'INV-1',
          invoiceNumber: 'INV-001',
          exportValueCad: '$100.00',
          conversionRate: '1.25',
          feeInLieu: '$100.00',
          invoiceFound: true,
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

    for (const tabName of [
      'Permit',
      'Owner',
      'Agent',
      'Shipping',
      'Items',
      'Fees',
      'GBMS',
      'Documents',
      'Invoices',
    ]) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }
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
      within(permitSummaryTile as HTMLElement).getByText('Application number'),
    ).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('Package number')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('PKG-9')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByRole('link', { name: 'EX-9' }),
    ).toHaveAttribute('href', '/provincial/exemption/EX-9')
    expect(within(permitSummaryTile as HTMLElement).getByText('Submit date')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('2026-04-10')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('Received date')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('2026-04-15')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('Author')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByText('idir\\permit-author'),
    ).toBeInTheDocument()
    const permitFinancialTile = screen
      .getByRole('heading', { name: 'Financial and volume' })
      .closest('.cds--tile')
    expect(permitFinancialTile).toBeTruthy()
    expect(
      within(permitFinancialTile as HTMLElement).getByText('Permit volume (m³)'),
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
    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('Agent Co')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
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
    await selectPermitDetailTab('Invoices')
    expect(await screen.findByText('INV-001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Invoice' })).not.toBeInTheDocument()
    expect(mockedFetchPermitInvoices).toHaveBeenCalledTimes(1)
  }, 15000)

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

  it('defers fee, document, and invoice data until their tabs are opened', async () => {
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
      resolveFees?.([])
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

    await selectPermitDetailTab('Invoices')
    expect(
      await screen.findByRole('heading', { name: 'No invoices available', level: 3 }),
    ).toBeInTheDocument()
    expect(mockedFetchPermitInvoices).toHaveBeenCalledTimes(1)
    await selectPermitDetailTab('Permit')
    await selectPermitDetailTab('Invoices')
    expect(mockedFetchPermitInvoices).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByText('Loading provincial permit detail...')).not.toBeInTheDocument()
    expect(screen.getByText('Loading associated permit applications...')).toBeInTheDocument()
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
    expect(screen.queryByRole('tab', { name: 'GBMS' })).not.toBeInTheDocument()
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
    expect(screen.queryByText('Loading provincial permit detail...')).not.toBeInTheDocument()
    expect(mockedFetchProvincialPermitExemptionContext).toHaveBeenCalledWith('EX-9')
    expect(mockedFetchProvincialPermitDetailTabs).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit permit' })).not.toBeInTheDocument()

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

  it('shows unavailable fee summaries when the deferred fee request fails', async () => {
    mockedFetchProvincialPermitFees.mockRejectedValue(new Error('fees unavailable'))
    renderPermitDetails()

    await selectPermitDetailTab('Fees')

    expect(
      await screen.findByRole('heading', { name: 'Fee details unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Total volume (m³)')).toHaveValue('Unavailable')
    expect(screen.getByLabelText('Calculated fee (CAD)')).toHaveValue('Unavailable')
    expect(screen.getByLabelText('Effective fee (CAD)')).toHaveValue('Unavailable')
  })

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
    expect(screen.getByRole('cell', { name: 'Coast' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'HE/PL' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Second growth' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '120.5' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Unmanufactured' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Scale type' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Permit' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'C' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '777' })).toBeInTheDocument()
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

      expect(await screen.findByText('SCALE-1')).toBeInTheDocument()
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

  it('keeps every permit mutation action unavailable for an expired permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'EXP',
      permitStatusDescription: 'Expired',
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
    expect(screen.queryByRole('button', { name: 'Edit permit' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Invoices')
    expect(screen.queryByRole('button', { name: 'Add invoice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Invoice' })).not.toBeInTheDocument()

    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
    expect(mockedSendPermitApprovalEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['COM', 'Completed'],
    ['PPD', 'Payment pending'],
    ['CAN', 'Cancelled'],
  ])(
    'keeps invoice upload unavailable for a %s permit',
    async (permitStatusCode, permitStatusDescription) => {
      mockedFetchProvincialPermitDetail.mockResolvedValue({
        ...permitDetail,
        permitStatusCode,
        permitStatusDescription,
      })

      renderPermitDetails()

      await selectPermitDetailTab('Invoices')
      expect(screen.queryByRole('button', { name: 'Add invoice' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Invoice' })).not.toBeInTheDocument()
      expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    },
  )

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
    expect(screen.getByText('Loading associated permit applications...')).toBeInTheDocument()
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

    await selectPermitDetailTab('Invoices')
    expect(
      await screen.findByRole('heading', { name: 'No invoices available', level: 3 }),
    ).toBeInTheDocument()
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

    await selectPermitDetailTab('Invoices')
    expect(await screen.findByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
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

    expect(await screen.findByText('Documents/invoices unavailable')).toBeInTheDocument()
    expect(screen.getAllByText('Unable to retrieve permit documents.')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Permit highlights')).not.toBeInTheDocument()

    expect(
      await screen.findByRole('heading', { name: 'Permit documents unavailable', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No permit documents available', level: 3 }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'close notification' }))
    expect(screen.queryByText('Documents/invoices unavailable')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Permit documents unavailable', level: 3 }),
    ).toBeInTheDocument()
  })

  it('shows Blanket OIC package columns on the items tab', async () => {
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

    expect(await screen.findByText('Blanket OIC package details')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Current package volume (m³)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Reprocessed' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '118.5' })).toBeInTheDocument()
    const packageStatusCell = screen.getByRole('cell', { name: 'APP - Approved' })
    expect(packageStatusCell.querySelector('.lexis-status-tag')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Current OIC package' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: true,
    })
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

  it('confirms Blanket OIC package deletion once and refreshes the permit tabs', async () => {
    configureEditableBlanketOicPackage()
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
  })

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

  it('keeps Blanket OIC package editing closed when its edit context cannot be loaded', async () => {
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
    })
    mockedFetchBlanketOicPackageEditContext.mockRejectedValue(
      new Error('Unexpected Blanket OIC package edit context payload.'),
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

    await selectPermitDetailTab('Items')
    const packageRow = (await screen.findByRole('cell', { name: 'BOIC-9' })).closest('tr')
    expect(packageRow).toBeTruthy()
    await userEvent.click(within(packageRow as HTMLElement).getByRole('button', { name: 'Edit' }))

    expect(
      await screen.findByText('Unable to load the Blanket OIC package for editing.'),
    ).toBeInTheDocument()
    expect(mockedFetchBlanketOicPackageEditContext).toHaveBeenCalledWith('BOIC-9')
    expect(screen.getByRole('heading', { name: 'Create Blanket OIC package' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
    expect(mockedUpdateBlanketOicPackage).not.toHaveBeenCalled()
  })

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
    expect(await screen.findByText('Loading package...')).toBeInTheDocument()

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
    expect(screen.getByRole('textbox', { name: 'Package number' })).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Edit BOIC-9' })).not.toBeInTheDocument()
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

  it('lets an administrator create the first Blanket OIC package and hidden application', async () => {
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
    const heading = await screen.findByRole('heading', { name: 'Create Blanket OIC package' })
    const packageEditor = heading.closest('.application-detail-edit-section') as HTMLElement
    expect(packageEditor).toBeTruthy()

    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.type(
      within(packageEditor).getByLabelText('Species codes (comma separated)'),
      'fi, he',
    )
    await userEvent.type(within(packageEditor).getByLabelText('End use code'), 'lu')
    await userEvent.clear(within(packageEditor).getByLabelText('Package volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Package volume (m³)'), '100.0')
    await userEvent.type(within(packageEditor).getByLabelText('Average length'), '10.0')
    await userEvent.type(within(packageEditor).getByLabelText('Average top diameter'), '20.0')
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
    const packageEditor = (
      await screen.findByRole('heading', {
        name: 'Create Blanket OIC package',
      })
    ).closest('.application-detail-edit-section') as HTMLElement
    await userEvent.type(within(packageEditor).getByLabelText('Package number'), 'boic-new')
    await userEvent.type(
      within(packageEditor).getByLabelText('Species codes (comma separated)'),
      'fi',
    )
    await userEvent.type(within(packageEditor).getByLabelText('End use code'), 'lu')
    await userEvent.clear(within(packageEditor).getByLabelText('Package volume (m³)'))
    await userEvent.type(within(packageEditor).getByLabelText('Package volume (m³)'), '100.0')
    await userEvent.type(within(packageEditor).getByLabelText('Average length'), '10.0')
    await userEvent.type(within(packageEditor).getByLabelText('Average top diameter'), '20.0')
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
    await userEvent.type(screen.getByLabelText('Species code'), 'HE')
    await userEvent.type(screen.getByLabelText('Grade code'), 'A')
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

  it('adds and removes Blanket OIC scale rows from the items tab', async () => {
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
    await userEvent.type(screen.getByLabelText('Species code'), 'HE')
    await userEvent.type(screen.getByLabelText('Grade code'), 'A')
    await userEvent.type(screen.getByLabelText('Pieces'), '12')
    await userEvent.type(screen.getByLabelText('Volume (m³)'), '10.5')
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))

    await waitFor(() => {
      expect(mockedAddBlanketOicScale).toHaveBeenCalledWith({
        permitNumber: '777',
        packageNumber: 'BOIC-9',
        timberMark: 'TM-NEW',
        speciesCode: 'HE',
        gradeCode: 'A',
        scalePieces: '12',
        scaleVolume: '10.5',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(mockedDeleteBlanketOicScale).toHaveBeenCalledWith({
        scaleId: 'SCALE-9',
        permitNumber: '777',
      })
      expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledTimes(3)
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    expect(screen.getByLabelText('Submit date')).toHaveValue('2026-04-10')
    expect(screen.getByLabelText('Submit date')).toBeDisabled()
    const permitStatusSelect = screen.getByLabelText('Permit status')
    expect(permitStatusSelect).toHaveValue('COM')
    expect(within(permitStatusSelect).getByRole('option', { name: /Active/ })).toBeInTheDocument()
    expect(
      within(permitStatusSelect).queryByRole('option', { name: /Payment pending/ }),
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
    expect(mockedUpdatePermitDetail.mock.calls[0]?.[0]).not.toHaveProperty('permitSubmitDate')
    expect(await screen.findByText('The permit was updated successfully.')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  })

  it('allows an approver to expire a permit like legacy', async () => {
    configureActivePermit()
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
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

  it('does not submit hidden Blanket OIC request limits for a normal permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      oicRequestPieces: 250,
      oicRequestVolume: 125.75,
      blanketOic: false,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))

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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Updated permit remarks')
    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Destination company'))
    await userEvent.type(screen.getByLabelText('Destination company'), 'Updated Destination')

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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Slow permit save')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))
    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))

    await selectPermitDetailTab('Shipping')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.clear(screen.getByLabelText('Destination company'))
    await userEvent.type(screen.getByLabelText('Destination company'), 'Queued shipping change')
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
    await userEvent.click(await screen.findByRole('button', { name: 'Edit shipping' }))
    await userEvent.selectOptions(screen.getByLabelText('Destination country'), 'US')
    await selectPermitDetailTab('Permit')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.selectOptions(screen.getByLabelText('Region'), '1908')
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')

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
        orgUnitNumber: '1908',
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

  it('submits the selected numeric org unit for a Blanket OIC permit', async () => {
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    const regionSelect = screen.getByLabelText('Region')
    expect(regionSelect).toBeEnabled()
    expect(regionSelect).toHaveValue('1903')
    await userEvent.selectOptions(regionSelect, '1908')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          orgUnitNumber: '1908',
        }),
      )
    })
  })

  it('shows Blanket OIC request ceilings only for Blanket OIC permits', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
      oicRequestPieces: 250,
      oicRequestVolume: 125.75,
    })

    renderPermitDetails()

    const financialTile = (
      await screen.findByRole('heading', {
        name: 'Financial and volume',
      })
    ).closest('.cds--tile')
    expect(financialTile).toBeTruthy()
    const requestPiecesLabel = within(financialTile as HTMLElement).getByText(
      'Permit Request Pieces',
    )
    expect(requestPiecesLabel).toBeInTheDocument()
    expect(
      within(requestPiecesLabel.closest('.detail-field-item') as HTMLElement).getByText('250'),
    ).toBeInTheDocument()
    expect(
      within(financialTile as HTMLElement).getByText('Permit Request Volume (m³)'),
    ).toBeInTheDocument()
    expect(within(financialTile as HTMLElement).getByText('125.75')).toBeInTheDocument()
  })

  it('saves Blanket OIC request ceilings with the legacy mutation field names', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'ACT',
      permitStatusDescription: 'Active',
      blanketOic: true,
      oicRequestPieces: 200,
      oicRequestVolume: 120.5,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '250')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '999999999')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          oicPermitTotalPieces: '250',
          oicPermitTotalVolume: '999999999',
        }),
      )
    })
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.clear(screen.getByLabelText('Permit Request Pieces'))
    await userEvent.type(screen.getByLabelText('Permit Request Pieces'), '0')
    await userEvent.clear(screen.getByLabelText('Permit Request Volume (m³)'))
    await userEvent.type(screen.getByLabelText('Permit Request Volume (m³)'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      (await screen.findAllByText('Use a positive numeric value.')).length,
    ).toBeGreaterThanOrEqual(2)
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

      await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))

      expect(screen.getByLabelText('Permit Request Pieces')).toBeDisabled()
      expect(screen.getByLabelText('Permit Request Volume (m³)')).toBeDisabled()
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
    expect(screen.queryByRole('button', { name: 'Edit permit' })).not.toBeInTheDocument()
    expect(screen.getByText('Another user is editing this permit.')).toBeInTheDocument()
  })

  it('allows a cancelled permit to be reactivated before other edits', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'CAN',
      permitStatusDescription: 'Cancelled',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
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
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))
    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(mockedUpdatePermitDetail).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Fee Receipt Number should not be empty for a complete Permit/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('PPD').length).toBeGreaterThan(0)
  })

  it('only exposes the supported payment completion fields for a payment-pending permit', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'PPD',
      permitStatusDescription: 'Payment pending',
      receiptNumber: null,
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))

    expect(screen.getByLabelText('Permit status')).toBeEnabled()
    expect(screen.getByLabelText('Receipt number')).toBeEnabled()
    expect(screen.getByLabelText('Exemption number')).toBeDisabled()
    expect(screen.getByLabelText('Issue date')).toBeDisabled()
    expect(screen.getByLabelText('Region')).toBeDisabled()
    expect(screen.getByLabelText('Permit volume (m³)')).toBeDisabled()
    expect(screen.getByLabelText('Number of pieces')).toBeDisabled()
    expect(screen.getByLabelText('Agent client number')).toBeDisabled()
    expect(screen.getByLabelText('Owner client number')).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Permit status'), 'COM')
    await userEvent.type(screen.getByLabelText('Receipt number'), 'R-2')
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

  it('keeps an existing invoiced receipt read-only', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Completed',
      receiptNumber: 'R-1',
    })
    renderPermitDetails()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit permit' }))

    expect(screen.getByLabelText('Receipt number')).toBeDisabled()
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
    await userEvent.clear(screen.getByLabelText('Destination company'))
    await userEvent.type(screen.getByLabelText('Destination company'), 'Updated Destination')
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
    await userEvent.selectOptions(screen.getByLabelText('Port of export'), 'OT')
    await userEvent.type(screen.getByLabelText('Other port of export'), 'Boundary Bay')
    await userEvent.selectOptions(screen.getByLabelText('Port of export'), 'VA')

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

      expect(screen.getByLabelText('Destination country')).toBeDisabled()
      expect(screen.getByLabelText('Destination company')).toBeEnabled()
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
    expect(screen.queryByRole('button', { name: 'Edit permit' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Edit permit' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Shipping')
    expect(screen.queryByRole('button', { name: 'Edit shipping' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()

    await selectPermitDetailTab('Invoices')
    expect(screen.queryByRole('button', { name: 'Add Invoice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add invoice' })).not.toBeInTheDocument()

    expect(mockedUpdatePermitDetail).not.toHaveBeenCalled()
    expect(mockedUpdatePermitShipping).not.toHaveBeenCalled()
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
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
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

      expect(await screen.findByLabelText('Override fees?')).toBeDisabled()
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

    expect(await screen.findByLabelText('Override fees?')).toBeDisabled()
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

  it('shows the invoice document action on the invoices tab without header actions', async () => {
    configureActivePermit()
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

    await selectPermitDetailTab('Invoices')

    expect(screen.queryByRole('button', { name: 'Upload Invoice' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Invoice' })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Edit invoice documents' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add invoice' })).not.toBeInTheDocument()
    await enterInvoiceDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add invoice' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload invoice conversion rate')).not.toBeInTheDocument()
  })

  it('shows permit and invoice upload actions to a scoped Provincial Submitter', async () => {
    configureActivePermit()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\scoped-submitter',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00067890'],
        }),
        canPerform: (action: string) =>
          action === '/filePermitUpload' || action === '/fileInvoiceUpload',
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

    await selectPermitDetailTab('Invoices')
    await enterInvoiceDocumentEditMode()
    expect(await screen.findByRole('button', { name: 'Add invoice' })).toBeInTheDocument()
  })

  it('uploads invoice files inline and refreshes permit document data', async () => {
    configureActivePermit()
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

    await selectPermitDetailTab('Invoices')
    const invoiceControls = within(await openDetailUploadModal('Add invoice'))
    const file = new File(['invoice upload'], 'invoice.pdf', { type: 'application/pdf' })

    await userEvent.type(invoiceControls.getByLabelText('Upload invoice number'), 'INV123')
    await userEvent.type(invoiceControls.getByLabelText('Upload invoice export value'), '1000')
    await userEvent.upload(invoiceControls.getByLabelText('Document File'), file)
    await waitFor(() => {
      expect(invoiceControls.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(invoiceControls.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(invoiceControls.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedValidateAdminUpload).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({
          permitNumber: '777',
          salesInvoiceNumber: 'INV123',
          invoiceExportValue: '1000',
          invoiceConversionRate: '1.00',
          invoiceFeeInLieu: '1.00',
          file,
          fileDescription: '',
        }),
      )
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({
          permitNumber: '777',
          salesInvoiceNumber: 'INV123',
          invoiceExportValue: '1000',
          invoiceConversionRate: '1.00',
          invoiceFeeInLieu: '1.00',
          file,
        }),
      )
    })
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(1)
    expect(mockedFetchPermitInvoices).toHaveBeenCalledTimes(2)
  })

  it('opens permit document from API response', async () => {
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
    mockedOpenPermitDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
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
    const openDocumentButton = await screen.findByRole('button', { name: 'Open' })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenPermitDocument).toHaveBeenCalledWith('500', 'permit-doc.pdf', '777')
    })
    expect(openSpy).not.toHaveBeenCalled()
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

    await waitFor(() => {
      expect(mockedRemovePermitInvoiceDocument).toHaveBeenCalledWith('500', '777')
      expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('permit-doc.pdf')).not.toBeInTheDocument()
    })
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

  it('allows scoped submitters to delete active permit documents without upload access', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_PROVINCIAL_SUBMITTER_00067890'],
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
    expect(within(documentRow as HTMLElement).getAllByText('Unknown')).toHaveLength(2)
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
    expect(within(documentRow as HTMLElement).getAllByText('Application')).toHaveLength(2)
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
      await screen.findByText('Unable to retrieve provincial permit detail.'),
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
    expect(await screen.findByRole('heading', { name: /Permit items/ })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: false,
    })
    expect(screen.getByText('Permit tables unavailable')).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve permit table details.')).toBeInTheDocument()
    expect(
      screen.queryByText('No permit item rows matched the current filter.'),
    ).not.toBeInTheDocument()

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
    await selectPermitDetailTab('Items')

    expect(await screen.findByText('Permit tables unavailable')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Create Blanket OIC package' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
  })
})
