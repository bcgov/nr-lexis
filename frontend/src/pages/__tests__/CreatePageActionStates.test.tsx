import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndianReservePermitCreatePage from '@/pages/IndianReservePermitCreate'
import ProvincialPermitCreatePage from '@/pages/ProvincialPermitCreate'
import {
  submitIndianReservePermitCreate,
  submitProvincialPermitCreate,
  type CreateSubmissionResult,
} from '@/service/create-submit-service'
import { fetchApplicationClientLocations } from '@/service/application-client-lookup-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { fetchProvincialPermitOptions, fetchReportOptions } from '@/service/search-options-service'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialPermitOptions: vi.fn(),
  fetchReportOptions: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialPermitCreate: vi.fn(),
  submitIndianReservePermitCreate: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  searchProvincialApplicationNumberOptions: vi.fn(),
}))

const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)
const mockedFetchReportOptions = vi.mocked(fetchReportOptions)
const mockedFetchApplicationClientLocations = vi.mocked(fetchApplicationClientLocations)
const mockedSearchProvincialApplicationNumberOptions = vi.mocked(
  searchProvincialApplicationNumberOptions,
)
const mockedSubmitProvincialPermitCreate = vi.mocked(submitProvincialPermitCreate)
const mockedSubmitIndianReservePermitCreate = vi.mocked(submitIndianReservePermitCreate)

const successfulCreate = (createdId: string): CreateSubmissionResult => ({
  success: true,
  message: 'ok',
  createdId,
  errors: [],
  warnings: [],
})

describe('Create Page Action State Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [{ value: 'Active', label: 'Active' }],
      regions: [{ value: '1833', label: 'Northern Interior' }],
    } as any)
    mockedFetchReportOptions.mockResolvedValue({
      regions: [{ value: '1833', label: 'Northern Interior' }],
      allDestinationCountries: [{ value: 'CA', label: 'Canada' }],
      portsOfExport: [{ value: 'VAN', label: 'Vancouver' }],
    } as any)
    mockedFetchApplicationClientLocations.mockResolvedValue([
      { locationCode: '00', locationName: 'Main Location', selected: true },
    ])
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '200',
        label: '200 - Approved - Owner 400 - Region Northern Interior',
        status: 'Approved',
        applicantClientNumber: '300',
        ownerClientNumber: '400',
        region: 'Northern Interior',
        listingDate: '2026-01-09',
        exemptionNumber: 'EX-1',
      },
    ])
  })

  it('shows provincial permit field validation when required fields are empty', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/create']}>
        <Routes>
          <Route path="/provincial/permit/create" element={<ProvincialPermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(screen.getAllByText('Permit number is required.')).not.toHaveLength(0)
    expect(screen.getByText('Application number is required.')).toBeInTheDocument()
    expect(screen.getByText('Permit status is required.')).toBeInTheDocument()
    expect(mockedSubmitProvincialPermitCreate).not.toHaveBeenCalled()
  })

  it('submits provincial permit prefilled form and navigates to permit details', async () => {
    mockedSubmitProvincialPermitCreate.mockResolvedValue(successfulCreate('9001'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/permit/create?permitNumber=100&applicationNumber=200&packageNumber=PKG-9&exemptionNumber=EX-1&region=1833&permitStatus=Active&applicantClientNumber=300&ownerClientNumber=400&submitDate=2026-01-09&issueDate=2026-01-10&estimatedShippingDate=2026-01-11&permitVolume=12&remarks=Note',
        ]}
      >
        <Routes>
          <Route path="/provincial/permit/create" element={<ProvincialPermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialPermitCreate).toHaveBeenCalledWith({
      permitNumber: '100',
      applicationNumber: '200',
      packageNumber: 'PKG-9',
      exemptionNumber: 'EX-1',
      region: '1833',
      permitStatus: 'Active',
      applicantClientNumber: '300',
      ownerClientNumber: '400',
      submitDate: '2026-01-09',
      issueDate: '2026-01-10',
      estimatedShippingDate: '2026-01-11',
      permitVolume: '12',
      remarks: 'Note',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/permit/9001')
  })

  it('shows indigenous reserve permit field validation when required fields are empty', async () => {
    render(
      <MemoryRouter initialEntries={['/indian-reserve/permit/create']}>
        <Routes>
          <Route path="/indian-reserve/permit/create" element={<IndianReservePermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(screen.getAllByText('Permit number is required.')).not.toHaveLength(0)
    expect(screen.getByText('Package number is required.')).toBeInTheDocument()
    expect(screen.getByText('Client number is required.')).toBeInTheDocument()
    expect(screen.getByText('Region is required.')).toBeInTheDocument()
    expect(screen.getByText('Transport name is required.')).toBeInTheDocument()
    expect(mockedSubmitIndianReservePermitCreate).not.toHaveBeenCalled()
  })

  it('submits indigenous reserve permit prefilled form and navigates to permit details', async () => {
    mockedSubmitIndianReservePermitCreate.mockResolvedValue(successfulCreate('IRP-88'))

    render(
      <MemoryRouter
        initialEntries={[
          '/indian-reserve/permit/create?permitNumber=900&packageNumber=PKG-1&clientNumber=12345678&clientLocation=00&region=1833&applicationDate=2026-03-01&permitIssueDate=2026-03-02&estimatedShippingDate=2026-03-03&destinationCountry=CA&transportTypeCode=TRK&transportName=Truck&portOfExport=VAN&otherPortOfExport=Other&remarks=Ready',
        ]}
      >
        <Routes>
          <Route path="/indian-reserve/permit/create" element={<IndianReservePermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitIndianReservePermitCreate).toHaveBeenCalledWith({
      permitNumber: '900',
      packageNumber: 'PKG-1',
      clientNumber: '12345678',
      clientLocation: '00',
      region: '1833',
      applicationDate: '2026-03-01',
      permitIssueDate: '2026-03-02',
      estimatedShippingDate: '2026-03-03',
      destinationCountry: 'CA',
      transportTypeCode: 'TRK',
      transportName: 'Truck',
      portOfExport: 'VAN',
      otherPortOfExport: 'Other',
      remarks: 'Ready',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/indian-reserve/permit/IRP-88')
  })
})
