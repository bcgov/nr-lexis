import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'
import { fetchProvincialApplicationDetail } from '@/service/lexis-detail-service'
import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
} from '@/service/provincial-application-documents-service'
import {
  addApplicationScaleToPackage,
  deleteApplicationScale,
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationGradeCodes,
  fetchApplicationPackageDetails,
  fetchApplicationPackageScales,
  fetchApplicationPackageSpecies,
  fetchApplicationRemainingSpecies,
  fetchApplicationScaleDetails,
  fetchApplicationSpeciesCodes,
  updateApplicationPackage,
} from '@/service/provincial-application-items-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialApplicationDetail: vi.fn(),
}))

vi.mock('@/service/provincial-application-documents-service', () => ({
  fetchApplicationDocuments: vi.fn(),
  openApplicationDocument: vi.fn(),
  removeApplicationDocument: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  addApplicationPackage: vi.fn(),
  addApplicationScaleToPackage: vi.fn(),
  deleteApplicationPackage: vi.fn(),
  deleteApplicationScale: vi.fn(),
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
  fetchApplicationGradeCodes: vi.fn(),
  fetchApplicationPackageDetails: vi.fn(),
  fetchApplicationPackageScales: vi.fn(),
  fetchApplicationPackageSpecies: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
  fetchApplicationScaleDetails: vi.fn(),
  fetchApplicationSpeciesCodes: vi.fn(),
  updateApplicationPackage: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchProvincialApplicationDetail = vi.mocked(fetchProvincialApplicationDetail)
const mockedFetchApplicationDocuments = vi.mocked(fetchApplicationDocuments)
const mockedOpenApplicationDocument = vi.mocked(openApplicationDocument)
const mockedRemoveApplicationDocument = vi.mocked(removeApplicationDocument)
const mockedAddApplicationScaleToPackage = vi.mocked(addApplicationScaleToPackage)
const mockedDeleteApplicationScale = vi.mocked(deleteApplicationScale)
const mockedFetchApplicationEndUsesForSpeciesRegion = vi.mocked(
  fetchApplicationEndUsesForSpeciesRegion,
)
const mockedFetchApplicationGradeCodes = vi.mocked(fetchApplicationGradeCodes)
const mockedFetchApplicationPackageDetails = vi.mocked(fetchApplicationPackageDetails)
const mockedFetchApplicationPackageScales = vi.mocked(fetchApplicationPackageScales)
const mockedFetchApplicationPackageSpecies = vi.mocked(fetchApplicationPackageSpecies)
const mockedFetchApplicationRemainingSpecies = vi.mocked(fetchApplicationRemainingSpecies)
const mockedFetchApplicationScaleDetails = vi.mocked(fetchApplicationScaleDetails)
const mockedFetchApplicationSpeciesCodes = vi.mocked(fetchApplicationSpeciesCodes)
const mockedUpdateApplicationPackage = vi.mocked(updateApplicationPackage)

const applicationDetail: ProvincialApplicationDetail = {
  applicationNumber: 321,
  exemptionNumber: 'EX-555',
  applicationStatusCode: 'ACTIVE',
  statusDescription: 'Active',
  ownerClientNumber: '00011122',
  agentClientNumber: '00033344',
  orgUnitNumber: 12,
  orgUnitName: 'Coast',
  productTypeCode: 'LOG',
  exemptionReasonCode: 'R1',
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
  locked: false,
  packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 5 }],
  remarks: [{ title: 'Note', remark: 'ok' }],
  offers: [],
}

const LocationProbe = () => {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

describe('Provincial Application Detail Document Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchProvincialApplicationDetail.mockResolvedValue(applicationDetail)
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [],
      source: 'api',
    })
    mockedOpenApplicationDocument.mockResolvedValue({
      source: 'api',
      blob: new Blob(['test']),
      filename: 'app-doc.pdf',
    })
    mockedRemoveApplicationDocument.mockResolvedValue({
      success: true,
      source: 'api',
    })
    mockedFetchApplicationPackageDetails.mockResolvedValue({
      success: true,
      packageNumber: 'PKG-1',
      volume: '100.0',
      scaledVolume: 20,
      length: '12.0',
      diameter: '24.0',
      status: 'A',
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
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 5,
        volume: '20.0',
        id: '55',
        cascadeSplitCode: '',
      },
    ])
    mockedFetchApplicationSpeciesCodes.mockResolvedValue([
      { code: 'FI', description: 'Douglas-fir' },
      { code: 'CE', description: 'Cedar' },
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
        cascadeSplitCode: '',
      },
      errors: [],
      warnings: [],
    })
    mockedDeleteApplicationScale.mockResolvedValue({ success: true })
  })

  it('navigates to upload center with application context', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/admin/uploads" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const uploadButton = await screen.findByRole('button', { name: 'Upload Application Document' })
    expect(uploadButton).toBeEnabled()
    await userEvent.click(uploadButton)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/admin/uploads?type=application&applicationNumber=321')
  })

  it('opens application document from API response', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '100',
          name: 'app-doc.pdf',
          description: 'API file',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const openDocumentButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Open',
    })
    await userEvent.click(openDocumentButton)

    await waitFor(() => {
      expect(mockedOpenApplicationDocument).toHaveBeenCalledWith('100', 'app-doc.pdf')
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('removes application documents and refreshes rows', async () => {
    mockedFetchApplicationDocuments
      .mockResolvedValueOnce({
        rows: [
          {
            id: '100',
            name: 'app-doc.pdf',
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
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const documentName = await screen.findByText('app-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockedRemoveApplicationDocument).toHaveBeenCalledWith('100')
      expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('app-doc.pdf')).not.toBeInTheDocument()
    })
  })

  it('edits package species and saves application item details', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })

    await userEvent.selectOptions(screen.getAllByLabelText('Species')[0], 'CE')
    await userEvent.click(screen.getByRole('button', { name: 'Add Species' }))
    await waitFor(() => {
      expect(screen.getAllByText('CE - Cedar').some((element) => element.tagName === 'TD')).toBe(
        true,
      )
    })

    await userEvent.clear(screen.getByLabelText('Package Comments'))
    await userEvent.type(screen.getByLabelText('Package Comments'), 'Updated package')
    await userEvent.click(screen.getByRole('button', { name: 'Save Package' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          comments: 'Updated package',
          endUseCode: 'LU',
          speciesCodes: ['FI', 'CE'],
        }),
      )
    })
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()
  })

  it('adds, looks up, and deletes package scales', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Timber Mark'), 'TM002')
    await userEvent.selectOptions(screen.getAllByLabelText('Species')[1], 'FI')
    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('12', 'FI')
    })
    await userEvent.selectOptions(screen.getByLabelText('Grade'), '1')
    await userEvent.type(screen.getByLabelText('Pieces'), '2')
    await userEvent.type(screen.getByLabelText('Scale Volume'), '8.0')
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    await waitFor(() => {
      expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          timberMark: 'TM002',
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          pieces: '2',
          volume: '8.0',
        }),
      )
    })

    await userEvent.type(screen.getByLabelText('Scale ID'), '55')
    await userEvent.click(screen.getByRole('button', { name: 'Lookup Scale' }))
    expect(await screen.findByText('TM001 FI/1 5 pcs 20.0 m3')).toBeInTheDocument()

    const scaleRow = screen.getByText('TM001').closest('tr')
    expect(scaleRow).toBeTruthy()
    await userEvent.click(within(scaleRow as HTMLElement).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockedDeleteApplicationScale).toHaveBeenCalledWith('55')
    })
  })

  it('disables upload and delete without file upload permission', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action !== '/fileApplicationUpload',
    } as any)
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '101',
          name: 'locked-doc.pdf',
          description: 'locked',
          type: 'Attachment',
        },
      ],
      source: 'api',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const uploadButton = await screen.findByRole('button', { name: 'Upload Application Document' })
    expect(uploadButton).toBeDisabled()

    const documentName = await screen.findByText('locked-doc.pdf')
    const documentRow = documentName.closest('tr')
    expect(documentRow).toBeTruthy()
    const deleteButton = within(documentRow as HTMLElement).getByRole('button', {
      name: 'Delete',
    })
    expect(deleteButton).toBeDisabled()
    expect(mockedRemoveApplicationDocument).not.toHaveBeenCalled()
  })

  it('shows detail error contract when application detail endpoint fails', async () => {
    mockedFetchProvincialApplicationDetail.mockRejectedValue(new Error('backend down'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Unable to retrieve provincial application detail.'),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).not.toHaveBeenCalled()
  })
})
