import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import ProvincialPermitDetailsPage from '@/pages/ProvincialPermitDetails'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  fetchProvincialPermitDetailTabs,
  type ProvincialPermitDetailTabsResult,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  fetchPermitDocuments,
  fetchPermitInvoiceConversionRate,
  fetchPermitInvoices,
  openPermitDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
} from '@/service/provincial-permit-documents-invoices-service'
import { runReport } from '@/service/report-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialPermitDetail: vi.fn(),
}))

vi.mock('@/service/provincial-permit-detail-tabs-service', () => ({
  fetchProvincialPermitDetailTabs: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  fetchPermitDocuments: vi.fn(),
  fetchPermitInvoices: vi.fn(),
  fetchPermitInvoiceConversionRate: vi.fn(),
  openPermitDocument: vi.fn(),
  removePermitDocument: vi.fn(),
  removePermitInvoiceDocument: vi.fn(),
}))

vi.mock('@/service/report-service', () => ({
  runReport: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialPermitDetail = vi.mocked(fetchProvincialPermitDetail)
const mockedFetchProvincialPermitDetailTabs = vi.mocked(fetchProvincialPermitDetailTabs)
const mockedFetchPermitDocuments = vi.mocked(fetchPermitDocuments)
const mockedFetchPermitInvoices = vi.mocked(fetchPermitInvoices)
const mockedFetchPermitInvoiceConversionRate = vi.mocked(fetchPermitInvoiceConversionRate)
const mockedOpenPermitDocument = vi.mocked(openPermitDocument)
const mockedRemovePermitDocument = vi.mocked(removePermitDocument)
const mockedRemovePermitInvoiceDocument = vi.mocked(removePermitInvoiceDocument)
const mockedRunReport = vi.mocked(runReport)

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

const tabsResult: ProvincialPermitDetailTabsResult = {
  data: {
    items: [],
    fees: [],
    gbmsEvents: [],
    oicItems: [],
    boicItems: [],
  },
  sources: {
    items: 'api',
    fees: 'api',
    gbmsEvents: 'api',
    oicItems: 'api',
    boicItems: 'api',
  },
}

describe('Provincial Permit Detail Action Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchProvincialPermitDetail.mockResolvedValue(permitDetail)
    mockedFetchProvincialPermitDetailTabs.mockResolvedValue(tabsResult)
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
      legacyUrl: 'https://example.test/api/lexis/permitDetailsRPC',
    })
    mockedRemovePermitDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedRemovePermitInvoiceDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
  })

  it('opens permit document upload popup with permit number', async () => {
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

    const uploadButton = await screen.findByRole('button', { name: 'Upload Permit Document' })
    expect(uploadButton).toBeEnabled()
    await userEvent.click(uploadButton)

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/filePermitUpload.do?actionMapping=view&permitNumber=777'),
      'permitUploadWindow',
      expect.any(String),
    )
  })

  it('opens invoice upload popup with permit number and conversion rate lookup', async () => {
    mockedFetchPermitInvoiceConversionRate.mockResolvedValue({
      conversionRate: '1.37',
      source: 'api',
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

    const uploadInvoiceButton = await screen.findByRole('button', { name: 'Upload Invoice' })
    expect(uploadInvoiceButton).toBeEnabled()
    await userEvent.click(uploadInvoiceButton)

    await waitFor(() => {
      expect(mockedFetchPermitInvoiceConversionRate).toHaveBeenCalledTimes(1)
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '/fileInvoiceUpload.do?actionMapping=view&permitNumber=777&invoiceConversionRate=1.37',
        ),
        'invoiceUploadWindow',
        expect.any(String),
      )
    })
  })

  it('opens permit document via legacy fallback when document API is unavailable', async () => {
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
      source: 'legacy',
    })
    mockedOpenPermitDocument.mockResolvedValue({
      source: 'legacy',
      legacyUrl:
        'https://example.test/api/lexis/permitDetailsRPC?actionMapping=getDocument&fileID=500&fileName=permit-doc.pdf',
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

    await screen.findByText('permit-doc.pdf')
    const openDocumentButton = await screen.findByRole('button', { name: 'Open' })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenPermitDocument).toHaveBeenCalledWith('500', 'permit-doc.pdf')
      expect(openSpy).toHaveBeenCalledWith(
        'https://example.test/api/lexis/permitDetailsRPC?actionMapping=getDocument&fileID=500&fileName=permit-doc.pdf',
        'permitDocumentWindow',
      )
    })
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
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action !== '/fileInvoiceUpload',
    } as any)
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

    await screen.findByText('locked-invoice-doc.pdf')
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemovePermitInvoiceDocument).not.toHaveBeenCalled()
  })

  it('uses report service and legacy fallback URL when opening permit report', async () => {
    mockedRunReport.mockResolvedValue({
      source: 'legacy',
      legacyUrl: 'https://example.test/api/permitReport.do?actionMapping=generate&permitNumber=777',
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

    const reportButton = await screen.findByRole('button', { name: 'Open Permit Report' })
    expect(reportButton).toBeEnabled()
    await userEvent.click(reportButton)

    expect(mockedRunReport).toHaveBeenCalledWith({
      reportId: 'permitReport',
      legacyPath: '/permitReport.do',
      actionMapping: 'generate',
      values: {
        permitNumber: '777',
        outputFormat: 'PDF',
      },
    })
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.test/api/permitReport.do?actionMapping=generate&permitNumber=777',
      'permitReportWindow',
      expect.any(String),
    )
  })
})
