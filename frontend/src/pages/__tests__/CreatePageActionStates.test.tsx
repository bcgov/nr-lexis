import { render, screen } from '@testing-library/react'
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
import { fetchProvincialPermitOptions } from '@/service/search-options-service'

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
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialPermitCreate: vi.fn(),
  submitIndianReservePermitCreate: vi.fn(),
}))

const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)
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
    } as any)
  })

  it('keeps provincial permit submit disabled when required fields are empty', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/permit/create']}>
        <Routes>
          <Route path="/provincial/permit/create" element={<ProvincialPermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()
  })

  it('submits provincial permit prefilled form and navigates to permit details', async () => {
    mockedSubmitProvincialPermitCreate.mockResolvedValue(successfulCreate('9001'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/permit/create?permitNumber=100&applicationNumber=200&packageNumber=PKG-9&exemptionNumber=EX-1&permitStatus=Active&applicantClientNumber=300&ownerClientNumber=400&issueDate=2026-01-10&estimatedShippingDate=2026-01-11&permitVolume=12&remarks=Note',
        ]}
      >
        <Routes>
          <Route path="/provincial/permit/create" element={<ProvincialPermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialPermitCreate).toHaveBeenCalledWith({
      permitNumber: '100',
      applicationNumber: '200',
      packageNumber: 'PKG-9',
      exemptionNumber: 'EX-1',
      permitStatus: 'Active',
      applicantClientNumber: '300',
      ownerClientNumber: '400',
      issueDate: '2026-01-10',
      estimatedShippingDate: '2026-01-11',
      permitVolume: '12',
      remarks: 'Note',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/permit/9001')
  })

  it('keeps indigenous reserve permit submit disabled when required fields are empty', async () => {
    render(
      <MemoryRouter initialEntries={['/indian-reserve/permit/create']}>
        <Routes>
          <Route path="/indian-reserve/permit/create" element={<IndianReservePermitCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()
  })

  it('submits indigenous reserve permit prefilled form and navigates to permit details', async () => {
    mockedSubmitIndianReservePermitCreate.mockResolvedValue(successfulCreate('IRP-88'))

    render(
      <MemoryRouter
        initialEntries={[
          '/indian-reserve/permit/create?permitNumber=900&packageNumber=PKG-1&clientNumber=12345678&applicationDate=2026-03-01&permitIssueDate=2026-03-02&estimatedShippingDate=2026-03-03&destinationCountry=CA&transportTypeCode=TRK&transportName=Truck&portOfExport=VAN&remarks=Ready',
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
      applicationDate: '2026-03-01',
      permitIssueDate: '2026-03-02',
      estimatedShippingDate: '2026-03-03',
      destinationCountry: 'CA',
      transportTypeCode: 'TRK',
      transportName: 'Truck',
      portOfExport: 'VAN',
      remarks: 'Ready',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/indian-reserve/permit/IRP-88')
  })
})
