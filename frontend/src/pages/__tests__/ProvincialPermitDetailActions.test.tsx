import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import ProvincialPermitDetailsPage from '@/pages/ProvincialPermitDetails'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  addApplicationsToPermit,
  addBlanketOicScale,
  deleteBlanketOicScale,
  fetchAvailablePermitApplications,
  fetchProvincialPermitDetailTabs,
  removeApplicationFromPermit,
  updatePermitScaleAttachment,
  type ProvincialPermitDetailTabsData,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  addPermitInvoice,
  fetchPermitDocuments,
  fetchPermitInvoiceConversionRate,
  fetchPermitInvoices,
  openPermitDocument,
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
  updatePermitDetail,
  updatePermitShipping,
} from '@/service/provincial-permit-documents-invoices-service'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'
import { runReport } from '@/service/report-service'
import { openBlobInNewTab, triggerBrowserDownload } from '@/utils/download'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialPermitDetail: vi.fn(),
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
  addBlanketOicScale: vi.fn(),
  deleteBlanketOicScale: vi.fn(),
  fetchAvailablePermitApplications: vi.fn(),
  fetchProvincialPermitDetailTabs: vi.fn(),
  removeApplicationFromPermit: vi.fn(),
  updatePermitScaleAttachment: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  addPermitInvoice: vi.fn(),
  fetchPermitDocuments: vi.fn(),
  fetchPermitInvoices: vi.fn(),
  fetchPermitInvoiceConversionRate: vi.fn(),
  openPermitDocument: vi.fn(),
  removePermitApplicationDocument: vi.fn(),
  removePermitDocument: vi.fn(),
  removePermitInvoiceDocument: vi.fn(),
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

vi.mock('@/utils/download', () => ({
  openBlobInNewTab: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialPermitDetail = vi.mocked(fetchProvincialPermitDetail)
const mockedFetchProvincialPermitDetailTabs = vi.mocked(fetchProvincialPermitDetailTabs)
const mockedUpdatePermitScaleAttachment = vi.mocked(updatePermitScaleAttachment)
const mockedFetchAvailablePermitApplications = vi.mocked(fetchAvailablePermitApplications)
const mockedAddApplicationsToPermit = vi.mocked(addApplicationsToPermit)
const mockedRemoveApplicationFromPermit = vi.mocked(removeApplicationFromPermit)
const mockedAddBlanketOicScale = vi.mocked(addBlanketOicScale)
const mockedDeleteBlanketOicScale = vi.mocked(deleteBlanketOicScale)
const mockedAddPermitInvoice = vi.mocked(addPermitInvoice)
const mockedFetchPermitDocuments = vi.mocked(fetchPermitDocuments)
const mockedFetchPermitInvoices = vi.mocked(fetchPermitInvoices)
const mockedFetchPermitInvoiceConversionRate = vi.mocked(fetchPermitInvoiceConversionRate)
const mockedOpenPermitDocument = vi.mocked(openPermitDocument)
const mockedRemovePermitApplicationDocument = vi.mocked(removePermitApplicationDocument)
const mockedRemovePermitDocument = vi.mocked(removePermitDocument)
const mockedRemovePermitInvoiceDocument = vi.mocked(removePermitInvoiceDocument)
const mockedUpdatePermitDetail = vi.mocked(updatePermitDetail)
const mockedUpdatePermitShipping = vi.mocked(updatePermitShipping)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateAdminUpload = vi.mocked(validateAdminUpload)
const mockedRunReport = vi.mocked(runReport)
const mockedOpenBlobInNewTab = vi.mocked(openBlobInNewTab)
const mockedTriggerBrowserDownload = vi.mocked(triggerBrowserDownload)

const permitDetail: ProvincialPermitDetail = {
  permitNumber: 777,
  applicationNumber: 111,
  packageNumber: 'PKG-9',
  exemptionNumber: 'EX-9',
  permitStatusCode: 'COM',
  permitStatusDescription: 'Completed',
  applicantClientNumber: '00012345',
  agentClientLocationCode: '01',
  ownerClientNumber: '00067890',
  ownerClientLocationCode: '03',
  destinationCompanyName: 'Acme',
  destinationCountryCode: 'CA',
  transportTypeCode: 'TRK',
  transportName: 'Truck',
  portOfExportCode: 'VAN',
  otherPortOfExport: null,
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
  region: '12',
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

const selectPermitDetailTab = async (name: string) => {
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const chooseComboBoxOption = async (combobox: HTMLElement, optionName: string) => {
  await userEvent.click(combobox)
  await userEvent.clear(combobox)
  await userEvent.type(combobox, optionName)
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

describe('Provincial Permit Detail Action Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialPermitDetail.mockResolvedValue(permitDetail)
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
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
    mockedAddPermitInvoice.mockResolvedValue({
      success: true,
      message: 'Invoice saved successfully.',
      errors: [],
      warnings: [],
      source: 'api',
    })
    mockedFetchPermitDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchPermitInvoices.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchPermitInvoiceConversionRate.mockResolvedValue({
      conversionRate: '1.00',
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
    mockedOpenBlobInNewTab.mockReturnValue(true)
  })

  it('adds invoice and refreshes invoice rows', async () => {
    mockedFetchPermitInvoiceConversionRate.mockResolvedValue({
      conversionRate: '1.25',
      source: 'api',
    })
    mockedFetchPermitInvoices
      .mockResolvedValueOnce({
        rows: [],
        source: 'api',
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'INV-NEW-1',
            invoiceNumber: 'INV-NEW',
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
    const permitHighlights = screen.getByLabelText('Permit highlights')
    expect(within(permitHighlights).getByText('Status')).toBeInTheDocument()
    expect(within(permitHighlights).getByText('Completed')).toBeInTheDocument()
    expect(within(permitHighlights).getByText('Application')).toBeInTheDocument()
    expect(within(permitHighlights).getByText('111')).toBeInTheDocument()
    expect(within(permitHighlights).getByText('Exemption')).toBeInTheDocument()
    expect(within(permitHighlights).getByText('EX-9')).toBeInTheDocument()
    const permitSummaryTile = screen
      .getByRole('heading', { name: 'Permit summary' })
      .closest('.cds--tile')
    expect(permitSummaryTile).toBeTruthy()
    expect(within(permitSummaryTile as HTMLElement).getByText('Permit number')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('777')).toBeInTheDocument()
    expect(
      within(permitSummaryTile as HTMLElement).getByText('Application number'),
    ).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('Package number')).toBeInTheDocument()
    expect(within(permitSummaryTile as HTMLElement).getByText('PKG-9')).toBeInTheDocument()
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
    await selectPermitDetailTab('Owner')
    expect(await screen.findByText('Owner Co')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    await selectPermitDetailTab('Agent')
    expect(await screen.findByText('Agent Co')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00067890', '03')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00012345', '01')
    await selectPermitDetailTab('Invoices')
    const invoiceNumberInput = await screen.findByLabelText('Invoice number')
    const exportValueInput = await screen.findByLabelText('Export value')
    const addInvoiceButton = await screen.findByRole('button', { name: 'Add Invoice' })
    await userEvent.type(invoiceNumberInput, 'INV-NEW')
    await userEvent.type(exportValueInput, '100')
    await userEvent.click(addInvoiceButton)

    await waitFor(() => {
      expect(mockedAddPermitInvoice).toHaveBeenCalledWith({
        permitNumber: '777',
        salesInvoiceNumber: 'INV-NEW',
        invoiceExportValue: '100',
        invoiceConversionRate: '1.25',
        invoiceFeeInLieu: '100',
      })
      expect(mockedFetchPermitInvoices).toHaveBeenCalledTimes(2)
      expect(screen.getByText('INV-NEW')).toBeInTheDocument()
    })
  }, 15000)

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
      await screen.findByRole('columnheader', { name: 'Species and end use sort' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coast' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'HE/PL' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Second growth' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '120.5' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Unmanufactured' })).toBeInTheDocument()
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
    })
    expect(await screen.findByText('Scale detail was added to the permit.')).toBeInTheDocument()
  })

  it('does not allow normal permit scale membership changes for expired permits', async () => {
    mockedFetchProvincialPermitDetail.mockResolvedValue({
      ...permitDetail,
      permitStatusCode: 'EXP',
      permitStatusDescription: 'Expired',
    })
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue({
      ...tabsResult,
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
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
    expect(screen.queryByRole('columnheader', { name: 'Include in permit' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Include scale SCALE-1 in permit' }),
    ).not.toBeInTheDocument()
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
    expect(within(applicationsTile).getByText('1000456')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchAvailablePermitApplications).toHaveBeenCalledWith('EX-9', ['1000456'])
    })

    await chooseComboBoxOption(
      within(applicationsTile).getByRole('combobox', { name: 'Available application' }),
      '1000457',
    )
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
    expect(screen.getByRole('cell', { name: 'APP - Approved' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Current OIC package' })).toBeInTheDocument()
    expect(mockedFetchProvincialPermitDetailTabs).toHaveBeenCalledWith({
      permitNumber: '777',
      receiptNumber: 'R-1',
      blanketOic: true,
    })
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

  it('shows field validation when adding invoice without required values', async () => {
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
    const addInvoiceButton = await screen.findByRole('button', { name: 'Add Invoice' })
    await userEvent.click(addInvoiceButton)

    expect(screen.getAllByText('Invoice number is required.').length).toBeGreaterThan(0)
    expect(screen.getByText('Invoice export value is required.')).toBeInTheDocument()
    expect(mockedAddPermitInvoice).not.toHaveBeenCalled()
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
    await userEvent.clear(screen.getByLabelText('Permit status'))
    await userEvent.type(screen.getByLabelText('Permit status'), 'ACT')
    await userEvent.clear(screen.getByLabelText('Receipt number'))
    await userEvent.type(screen.getByLabelText('Receipt number'), 'R-2')
    await userEvent.clear(screen.getByLabelText('Remarks'))
    await userEvent.type(screen.getByLabelText('Remarks'), 'updated remarks')
    await userEvent.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => {
      expect(mockedUpdatePermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '777',
          permitStatus: 'ACT',
          permitReceiptNo: 'R-2',
          permitRemarks: 'updated remarks',
          ownerClientNumber: '00067890',
          ownerClientLocation: '03',
          agentClientNumber: '00012345',
          agentClientLocation: '01',
        }),
      )
    })
    expect(await screen.findByText('The permit was updated successfully.')).toBeInTheDocument()
    expect(screen.getAllByText('ACT').length).toBeGreaterThan(0)
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

  it('opens completed permit report with the legacy permit report request', async () => {
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
      expect(mockedOpenBlobInNewTab).toHaveBeenCalledWith(expect.any(Blob), 'Permit')
      expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    })
  })

  it('downloads completed permit report when the popup is blocked', async () => {
    mockedOpenBlobInNewTab.mockReturnValue(false)

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

    await waitFor(() => {
      expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(
        expect.any(Blob),
        'permit-report.pdf',
      )
    })
    expect(
      await screen.findByText(
        'Popup blocked while opening permit report. Downloaded the report instead.',
      ),
    ).toBeInTheDocument()
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

  it('blocks add invoice when invoice number exceeds the legacy length limit', async () => {
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
    await userEvent.type(await screen.findByLabelText('Invoice number'), '1234567890')
    await userEvent.type(screen.getByLabelText('Export value'), '100')
    await userEvent.click(await screen.findByRole('button', { name: 'Add Invoice' }))

    expect(
      screen.getAllByText('Invoice number must be 9 characters or fewer.').length,
    ).toBeGreaterThan(0)
    expect(mockedAddPermitInvoice).not.toHaveBeenCalled()
  })

  it('shows the embedded permit document upload panel on the documents tab without header actions', async () => {
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
    expect(await screen.findByText('Upload permit documents')).toBeInTheDocument()
  })

  it('shows the embedded invoice upload panel on the invoices tab without header actions', async () => {
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
    expect(screen.getByLabelText('Upload invoice conversion rate')).toHaveValue('1.00')
    expect(mockedFetchPermitInvoiceConversionRate).not.toHaveBeenCalled()
  })

  it('uploads invoice files inline and refreshes permit document data', async () => {
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
    const invoicePanel = (await screen.findByText('Upload invoices')).closest(
      '.detail-document-upload',
    )
    expect(invoicePanel).toBeTruthy()
    const invoiceControls = within(invoicePanel as HTMLElement)
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
    expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
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
      expect(mockedOpenPermitDocument).toHaveBeenCalledWith('500', 'permit-doc.pdf')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes invoice document rows and refreshes tables', async () => {
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
    await screen.findByText('permit-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemovePermitInvoiceDocument).toHaveBeenCalledWith('500')
      expect(mockedFetchPermitDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('permit-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('disables invoice document delete when invoice upload permission is missing', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileInvoiceUpload',
      }),
    )
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
    await screen.findByText('locked-invoice-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
  })

  it('removes application-linked documents with application delete endpoint', async () => {
    mockedFetchPermitDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '7777',
            name: 'application-doc.pdf',
            description: 'Linked application document',
            type: 'Application',
            typeCode: 'INS',
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
    await screen.findByText('application-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemovePermitApplicationDocument).toHaveBeenCalledWith('7777')
      expect(mockedRemovePermitDocument).not.toHaveBeenCalledWith('7777')
      expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalledWith('7777')
    })
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

  it('keeps permit table tabs available without an unavailable warning when tab data fails', async () => {
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
    expect(screen.queryByText('Permit Tables Unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('No permit item rows matched the current filter.')).toBeInTheDocument()
  })
})
