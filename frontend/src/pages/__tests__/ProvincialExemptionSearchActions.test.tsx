import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionSearchResponse } from '@/interfaces/ProvincialExemptionSearch'
import ProvincialExemptionPage from '@/pages/ProvincialExemption'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-search-service', () => ({
  searchProvincialExemptions: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)

const exemptionSearchResponse = (
  content: ProvincialExemptionSearchResponse['content'],
): ProvincialExemptionSearchResponse => ({
  content,
  page: {
    number: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
  },
})

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/provincial/exemption']}>
      <Routes>
        <Route path="/provincial/exemption" element={<ProvincialExemptionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Exemption Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })
    mockedSearchProvincialExemptions.mockResolvedValue(
      exemptionSearchResponse([
        {
          exemptionNumber: 'EX-1001',
          type: 'Section 1',
          typeCode: 'SECTION_1',
          status: 'New',
          statusCode: 'NEW',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 100,
          balanceRemaining: 100,
          listingDate: '2026-01-10',
          expiryDate: '2026-12-31',
          region: '11',
          canApprove: true,
          isLocked: false,
          canViewExemption: true,
          applicationNumber: '3001',
          packageNumber: 'PKG-1',
        },
        {
          exemptionNumber: 'EX-2002',
          type: 'Section 2',
          typeCode: 'SECTION_2',
          status: 'Approved',
          statusCode: 'APPROVED',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          approvedVolume: 200,
          balanceRemaining: 10,
          listingDate: '2026-01-11',
          expiryDate: '2026-12-31',
          region: '12',
          canApprove: false,
          isLocked: true,
          canViewExemption: true,
          applicationNumber: '3002',
          packageNumber: 'PKG-2',
        },
      ]),
    )
  })

  it('gates row selection to approvable NEW rows and enables approve action', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === 'approveExemption' || action === '/createExemption',
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    const approveButton = screen.getByRole('button', { name: 'Approve Selected Exemption' })
    expect(approveButton).toBeDisabled()

    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select EX-2002' })).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EX-1001' }))
    expect(approveButton).toBeEnabled()

    await userEvent.click(approveButton)

    await waitFor(() => {
      expect(screen.getByText('Selection ready')).toBeInTheDocument()
      expect(screen.getByText('Ready to approve 1 selected exemption(s).')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Add Exemption' })).toHaveAttribute(
      'href',
      '/provincial/exemption/create',
    )
  })

  it('hides add exemption link and disables selection when approval permission is missing', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('EX-1001')

    expect(screen.queryByRole('link', { name: 'Add Exemption' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select EX-1001' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Selected Exemption' })).toBeDisabled()
  })

  it('does not default exemption approvers to their session region', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['EXEMPTION_APPROVER'],
          orgUnitNo: '11',
        }),
        canPerform: () => true,
      }),
    )

    renderPage()
    await screen.findByText('EX-1001')

    await waitFor(() => {
      expect(mockedSearchProvincialExemptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            exemptionStatusCode: 'NEW',
            exemptionTypeCode: 'M',
            region: [],
          }),
        }),
      )
    })
  })

  it('disables search button for invalid date filters', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('EX-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('List from date (YYYY-MM-DD)'), '2026-99-99')

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })
})
