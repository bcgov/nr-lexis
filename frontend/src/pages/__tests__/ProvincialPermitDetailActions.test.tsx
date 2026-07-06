import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import ProvincialPermitDetailsPage from '@/pages/ProvincialPermitDetails'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  fetchProvincialPermitDetailTabs,
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
} from '@/service/provincial-permit-documents-invoices-service'
import { submitAdminUpload } from '@/service/admin-upload-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialPermitDetail: vi.fn(),
}))

vi.mock('@/service/provincial-permit-detail-tabs-service', () => ({
  EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS: {
    items: [],
    fees: [],
    gbmsEvents: [],
    oicItems: [],
    boicItems: [],
  },
  fetchProvincialPermitDetailTabs: vi.fn(),
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
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialPermitDetail = vi.mocked(fetchProvincialPermitDetail)
const mockedFetchProvincialPermitDetailTabs = vi.mocked(fetchProvincialPermitDetailTabs)
const mockedAddPermitInvoice = vi.mocked(addPermitInvoice)
const mockedFetchPermitDocuments = vi.mocked(fetchPermitDocuments)
const mockedFetchPermitInvoices = vi.mocked(fetchPermitInvoices)
const mockedFetchPermitInvoiceConversionRate = vi.mocked(fetchPermitInvoiceConversionRate)
const mockedOpenPermitDocument = vi.mocked(openPermitDocument)
const mockedRemovePermitApplicationDocument = vi.mocked(removePermitApplicationDocument)
const mockedRemovePermitDocument = vi.mocked(removePermitDocument)
const mockedRemovePermitInvoiceDocument = vi.mocked(removePermitInvoiceDocument)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)

const permitDetail: ProvincialPermitDetail = {
  permitNumber: 777,
  applicationNumber: 111,
  packageNumber: 'PKG-9',
  exemptionNumber: 'EX-9',
  permitStatusCode: 'COM',
  permitStatusDescription: 'Completed',
  applicantClientNumber: '00012345',
  ownerClientNumber: '00067890',
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
  numberOfPieces: 10,
  receiptNumber: 'R-1',
  federalPermitNumber: null,
  invoiceNumber: 'INV-1',
  remarks: 'ok',
  region: '12',
}

const tabsResult: ProvincialPermitDetailTabsData = {
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

describe('Provincial Permit Detail Action Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialPermitDetail.mockResolvedValue(permitDetail)
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
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
    mockedSubmitAdminUpload.mockResolvedValue({
      status: 'success',
      message: 'Invoice upload submitted.',
    })
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
      'Summary',
      'Items',
      'Fees',
      'Billing',
      'Orders',
      'Documents',
      'Invoices',
    ]) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }
    await selectPermitDetailTab('Items')
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

    await selectPermitDetailTab('Items')
    const addInvoiceButton = await screen.findByRole('button', { name: 'Add Invoice' })
    await userEvent.click(addInvoiceButton)

    expect(screen.getAllByText('Invoice number is required.').length).toBeGreaterThan(0)
    expect(screen.getByText('Invoice export value is required.')).toBeInTheDocument()
    expect(mockedAddPermitInvoice).not.toHaveBeenCalled()
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

    await selectPermitDetailTab('Items')
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
    await userEvent.click(invoiceControls.getByRole('button', { name: 'Save upload' }))

    await waitFor(() => {
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
    })
    expect(screen.queryByText('Permit Tables Unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('No permit item rows matched the current filter.')).toBeInTheDocument()
  })
})
