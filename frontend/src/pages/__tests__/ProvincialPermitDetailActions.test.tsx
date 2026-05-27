import { render, screen } from '@testing-library/react'
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

vi.mock('@/service/report-service', () => ({
  runReport: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialPermitDetail = vi.mocked(fetchProvincialPermitDetail)
const mockedFetchProvincialPermitDetailTabs = vi.mocked(fetchProvincialPermitDetailTabs)
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

  it('opens invoice upload popup with permit number and conversion-rate placeholder', async () => {
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

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/fileInvoiceUpload.do?actionMapping=view&permitNumber=777&invoiceConversionRate=1.00',
      ),
      'invoiceUploadWindow',
      expect.any(String),
    )
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
