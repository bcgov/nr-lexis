import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { FederalApplicationDetail, ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import FederalApplicationDetailsPage from '@/pages/FederalApplicationDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchFederalApplicationDetail,
  fetchProvincialExemptionDetail,
} from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
} from '@/service/federal-application-documents-service'
import {
  fetchExemptionDocuments,
  openExemptionDocument,
  removeExemptionDocument,
} from '@/service/provincial-exemption-documents-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchFederalApplicationDetail: vi.fn(),
  fetchProvincialExemptionDetail: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn(),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
}))

vi.mock('@/service/federal-application-documents-service', () => ({
  fetchFederalApplicationDocuments: vi.fn(),
  openFederalApplicationDocument: vi.fn(),
  removeFederalApplicationDocument: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchFederalApplicationDetail = vi.mocked(fetchFederalApplicationDetail)
const mockedFetchProvincialExemptionDetail = vi.mocked(fetchProvincialExemptionDetail)
const mockedFetchFederalApplicationDocuments = vi.mocked(fetchFederalApplicationDocuments)
const mockedOpenFederalApplicationDocument = vi.mocked(openFederalApplicationDocument)
const mockedRemoveFederalApplicationDocument = vi.mocked(removeFederalApplicationDocument)
const mockedFetchExemptionDocuments = vi.mocked(fetchExemptionDocuments)
const mockedOpenExemptionDocument = vi.mocked(openExemptionDocument)
const mockedRemoveExemptionDocument = vi.mocked(removeExemptionDocument)

const selectDetailTab = async (name: string) => {
  const tab = await screen.findByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') {
    await userEvent.click(tab)
  }
}

const exemptionDetail: ProvincialExemptionDetail = {
  exemptionNumber: 'EX-777',
  exemptionTypeCode: 'TYPE1',
  exemptionTypeDescription: 'Type 1',
  exemptionStatusCode: 'ACTIVE',
  exemptionStatusDescription: 'Active',
  ownerClientNumber: '00055566',
  agentClientNumber: '00077788',
  applicationNumber: 654,
  applicationStatus: 'OPEN',
  approvalDate: '2026-02-01',
  expiryDate: '2026-12-31',
  approvedVolume: 99,
  usedVolume: 5,
  remainingVolume: 94,
  otherConditions: 'none',
  blanketOic: false,
  permitNumbers: ['P1'],
  remarks: [{ title: 'Remark', remark: 'ok' }],
}

const federalDetail: FederalApplicationDetail = {
  applicationNumber: 888,
  federalApplicationNumber: 'FED-888',
  statusCode: 'SUBMITTED',
  statusDescription: 'Submitted',
  ownerClientNumber: '00021234',
  ownerClientLocationCode: '01',
  ownerApplicantType: 'Owner',
  ownerContactName: 'Owner Contact',
  ownerCompanyName: 'Owner Company',
  agentClientNumber: '00011234',
  agentClientLocationCode: '01',
  agentApplicantType: 'Agent',
  agentContactName: 'Agent Contact',
  agentCompanyName: 'Agent Company',
  exemptionNumber: 'EX-555',
  exemptionType: 'Section 1',
  exemptionReason: 'Economic',
  region: 'RSC',
  productType: 'Standing Timber',
  applicationDate: '2026-01-10',
  receivedDate: '2026-01-11',
  listingDate: '2026-01-12',
  termDays: 14,
  logLocation: 'Forest service road',
  ageClass: 'Mature',
  averageLogVolume: 12.5,
  applicationVolume: 42,
  endUse: 'HE/PL',
  author: 'IDIR\\TESTER',
  readOnly: false,
  packages: ['PKG-1'],
  remarks: ['Remark'],
  offers: ['OFF-1'],
  federalPermit: {
    permitNumber: 90001,
    permitIssueDate: '2026-02-01',
    destinationCountry: 'United States',
    transportType: 'TRUCK',
    transportName: 'Truck',
    shippingDate: '2026-02-10',
    portOfExport: 'Vancouver',
    otherPortOfExport: null,
  },
}

describe('Exemption and Federal Detail Document Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialExemptionDetail.mockResolvedValue(exemptionDetail)
    mockedFetchFederalApplicationDetail.mockResolvedValue(federalDetail)
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedOpenExemptionDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'exemption-doc.pdf',
    })
    mockedOpenFederalApplicationDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'federal-doc.pdf',
    })
    mockedRemoveExemptionDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedRemoveFederalApplicationDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
  })

  it('shows the embedded exemption upload panel on the documents tab without header actions', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    for (const tabName of ['Summary', 'Permits', 'Documents', 'Remarks']) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }
    const exemptionHighlights = screen.getByLabelText('Exemption highlights')
    expect(within(exemptionHighlights).getByText('Status')).toBeInTheDocument()
    expect(within(exemptionHighlights).getByText('Active')).toBeInTheDocument()
    expect(within(exemptionHighlights).getByText('Type')).toBeInTheDocument()
    expect(within(exemptionHighlights).getByText('Type 1')).toBeInTheDocument()
    expect(within(exemptionHighlights).getByText('Permits')).toBeInTheDocument()
    expect(within(exemptionHighlights).getByText('1')).toBeInTheDocument()
    const exemptionSummaryTile = screen
      .getByRole('heading', { name: 'Exemption summary' })
      .closest('.cds--tile')
    expect(exemptionSummaryTile).toBeTruthy()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Exemption number'),
    ).toBeInTheDocument()
    expect(within(exemptionSummaryTile as HTMLElement).getByText('EX-777')).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Application status'),
    ).toBeInTheDocument()
    expect(within(exemptionSummaryTile as HTMLElement).getByText('OPEN')).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Approved volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Remaining volume (m³)'),
    ).toBeInTheDocument()
    expect(
      within(exemptionSummaryTile as HTMLElement).getByText('Blanket Order in Council'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Exemption Document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Approved Exemption Report' })).toBeNull()

    await selectDetailTab('Documents')
    expect(await screen.findByText('Upload exemption documents')).toBeInTheDocument()
  })

  it('opens exemption document from API response', async () => {
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '700',
          name: 'exemption-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenExemptionDocument).toHaveBeenCalledWith('700', 'exemption-doc.pdf')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes exemption documents and refreshes rows', async () => {
    mockedFetchExemptionDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '700',
            name: 'exemption-doc.pdf',
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
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveExemptionDocument).toHaveBeenCalledWith('700')
      expect(mockedFetchExemptionDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('exemption-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('disables exemption upload and delete without file upload permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileExemptionUpload',
      }),
    )
    mockedFetchExemptionDocuments.mockResolvedValue({
      rows: [
        {
          id: '701',
          name: 'locked-exemption-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    expect(screen.queryByRole('button', { name: 'Upload Exemption Document' })).toBeNull()
    expect(screen.queryByText('Upload exemption documents')).not.toBeInTheDocument()
    const documentName = await screen.findByText('locked-exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
  })

  it('renders federal application details with the legacy tab structure', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    for (const tabName of [
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Offers',
      'Remarks',
      'Documents',
      'Shipping Details',
    ]) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument()
    }

    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Federal Search results' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Provincial Application' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload Application Document' })).toBeNull()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
    expect(await screen.findByText('Owner Contact')).toBeInTheDocument()

    await selectDetailTab('Application')
    expect(await screen.findByText('IDIR\\TESTER')).toBeInTheDocument()

    await selectDetailTab('Documents')
    expect(await screen.findByText('Upload application documents')).toBeInTheDocument()
  })

  it('opens federal document from API response', async () => {
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '800',
          name: 'federal-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenFederalApplicationDocument).toHaveBeenCalledWith('800', 'federal-doc.pdf')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes federal documents and refreshes rows', async () => {
    mockedFetchFederalApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '800',
            name: 'federal-doc.pdf',
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
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    const documentName = await screen.findByText('federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledWith('800', '888')
      expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('federal-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('disables federal upload and delete without file upload permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/fileApplicationUpload',
      }),
    )
    mockedFetchFederalApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '801',
          name: 'locked-federal-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectDetailTab('Documents')
    expect(screen.queryByText('Upload application documents')).not.toBeInTheDocument()
    const documentName = await screen.findByText('locked-federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveFederalApplicationDocument).not.toHaveBeenCalled()
  })

  it('shows detail error contract when exemption detail endpoint fails', async () => {
    mockedFetchProvincialExemptionDetail.mockRejectedValue(new Error('backend down'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Unable to retrieve provincial exemption detail.'),
    ).toBeInTheDocument()
    expect(mockedFetchExemptionDocuments).not.toHaveBeenCalled()
  })

  it('shows detail error contract when federal detail endpoint fails', async () => {
    mockedFetchFederalApplicationDetail.mockRejectedValue(new Error('backend down'))

    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Unable to retrieve federal application detail.'),
    ).toBeInTheDocument()
    expect(mockedFetchFederalApplicationDocuments).not.toHaveBeenCalled()
  })
})
