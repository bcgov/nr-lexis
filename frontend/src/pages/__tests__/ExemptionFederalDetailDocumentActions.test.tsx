import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  agentClientNumber: '00011234',
  agentClientLocationCode: '01',
  exemptionNumber: 'EX-555',
  exemptionType: 'Section 1',
  exemptionReason: 'Economic',
  receivedDate: '2026-01-11',
  listingDate: '2026-01-12',
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

const LocationProbe = () => {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

describe('Exemption and Federal Detail Document Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
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

  it('navigates to upload center with exemption context', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-777']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
          <Route path="/admin/uploads" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const uploadButton = await screen.findByRole('button', { name: 'Upload Exemption Document' })
    expect(uploadButton).toBeEnabled()
    await userEvent.click(uploadButton)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/admin/uploads?type=exemption&exemptionNumber=EX-777')
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
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action !== '/fileExemptionUpload',
    } as any)
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

    const uploadButton = await screen.findByRole('button', { name: 'Upload Exemption Document' })
    expect(uploadButton).toBeDisabled()

    const documentName = await screen.findByText('locked-exemption-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveExemptionDocument).not.toHaveBeenCalled()
  })

  it('navigates to upload center with federal application context', async () => {
    render(
      <MemoryRouter initialEntries={['/federal/888']}>
        <Routes>
          <Route path="/federal/:applicationNumber" element={<FederalApplicationDetailsPage />} />
          <Route path="/admin/uploads" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const uploadButton = await screen.findByRole('button', { name: 'Upload Application Document' })
    expect(uploadButton).toBeEnabled()
    await userEvent.click(uploadButton)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/admin/uploads?type=application&applicationNumber=888')
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

    const documentName = await screen.findByText('federal-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveFederalApplicationDocument).toHaveBeenCalledWith('800')
      expect(mockedFetchFederalApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('federal-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('disables federal upload and delete without file upload permission', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action !== '/fileApplicationUpload',
    } as any)
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

    const uploadButton = await screen.findByRole('button', { name: 'Upload Application Document' })
    expect(uploadButton).toBeDisabled()

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
