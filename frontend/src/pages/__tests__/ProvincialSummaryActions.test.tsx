import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialSummaryPage from '@/pages/ProvincialSummary'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import {
  fetchSummaryApplications,
  fetchSummaryExemptions,
  fetchSummaryFees,
  fetchSummaryOffers,
  fetchSummaryOffersPlaced,
  fetchSummaryPermits,
} from '@/service/summary-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
}))

vi.mock('@/service/summary-service', () => ({
  fetchSummaryApplications: vi.fn(),
  fetchSummaryOffers: vi.fn(),
  fetchSummaryExemptions: vi.fn(),
  fetchSummaryPermits: vi.fn(),
  fetchSummaryFees: vi.fn(),
  fetchSummaryOffersPlaced: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchSummaryApplications = vi.mocked(fetchSummaryApplications)
const mockedFetchSummaryOffers = vi.mocked(fetchSummaryOffers)
const mockedFetchSummaryExemptions = vi.mocked(fetchSummaryExemptions)
const mockedFetchSummaryPermits = vi.mocked(fetchSummaryPermits)
const mockedFetchSummaryFees = vi.mocked(fetchSummaryFees)
const mockedFetchSummaryOffersPlaced = vi.mocked(fetchSummaryOffersPlaced)

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/summary']}>
      <ProvincialSummaryPage />
    </MemoryRouter>,
  )

describe('Provincial Summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          grantedActions: ['/summary'],
          forestClientNumber: '00001074',
          availableForestClientNumbers: ['00001074'],
        }),
        defaultRoute: '/provincial/summary',
        canPerform: (action: string) => action === '/summary',
      }),
    )
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00001074',
      companyName: 'NORSKE SKOG CANADA LIMITED',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: '',
      notfound: '',
    })
    mockedFetchSummaryApplications.mockResolvedValue({
      results: [
        {
          application: 43278,
          status: 'New',
          reason: 'Surplus',
          exemptionType: 'Ministerial',
          exemptionNumber: 'EX-205',
          receivedDate: '2026-07-15',
          listingDate: '2026-08-20',
          packageNumberAry: ['PKG-1', 'PKG-2'],
        },
      ],
      total: 11,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryOffers.mockResolvedValue({
      results: [
        {
          offerNumber: 81009,
          application: 43278,
          packageNumber: 'PKG-1',
          listingDate: '2026-08-20',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryExemptions.mockResolvedValue({
      results: [
        {
          exemption: 'EX-205',
          exemptionType: 'Ministerial',
          ownerClientNumber: '00001074',
          agentClientNumber: null,
          status: 'Approved',
          approvedVolume: 95,
          balanceRemaining: 83,
          approvalDate: '2026-07-16',
          expiryDate: '2027-07-16',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryPermits.mockResolvedValue({
      results: [
        {
          permit: 7000123,
          status: 'Issued',
          ownerClientNumber: '00001074',
          agentClientNumber: null,
          exemption: 'EX-205',
          totalPieces: 28,
          totalVolume: 95,
          receipt: 'RCT-991',
          issueDate: '2026-07-17',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryFees.mockResolvedValue({
      results: [
        {
          permit: 7000123,
          status: 'Issued',
          volume: 95,
          fees: 182.5,
          receipt: 'RCT-991',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryOffersPlaced.mockResolvedValue({
      results: [],
      total: 0,
      page: 0,
      size: 10,
    })
  })

  it('renders the client-scoped legacy sections with modern detail links', async () => {
    renderPage()

    expect(await screen.findByText('NORSKE SKOG CANADA LIMITED')).toBeInTheDocument()
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00001074', '00')
    expect(mockedFetchSummaryApplications).toHaveBeenCalledWith(0, 10)
    expect(mockedFetchSummaryOffers).toHaveBeenCalledWith(0, 10)
    expect(mockedFetchSummaryExemptions).toHaveBeenCalledWith(0, 10)
    expect(mockedFetchSummaryPermits).toHaveBeenCalledWith(0, 10)
    expect(mockedFetchSummaryOffersPlaced).toHaveBeenCalledWith(0, 10)
    expect(mockedFetchSummaryFees).not.toHaveBeenCalled()

    expect(screen.getByRole('heading', { name: 'My Applications' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Offers' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Exemptions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Permits' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Fees' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Offers Placed' })).toBeInTheDocument()

    expect(screen.getAllByRole('link', { name: '43278' })[0]).toHaveAttribute(
      'href',
      '/provincial/application/43278',
    )
    expect(screen.getByRole('link', { name: '81009' })).toHaveAttribute(
      'href',
      '/provincial/offers/81009',
    )
    expect(screen.getAllByRole('link', { name: 'EX-205' })[0]).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-205',
    )
    expect(screen.getByRole('link', { name: '7000123' })).toHaveAttribute(
      'href',
      '/provincial/permit/7000123',
    )
    expect(screen.getByText('PKG-1, PKG-2')).toBeInTheDocument()
    expect(screen.getByText('No offers placed')).toBeInTheDocument()
  })

  it('loads fees only when Display fees is selected', async () => {
    renderPage()

    await screen.findByText('NORSKE SKOG CANADA LIMITED')
    expect(screen.getByText(/Select Display fees/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Display fees' }))

    await waitFor(() => expect(mockedFetchSummaryFees).toHaveBeenCalledWith(0, 10))
    const feesTable = screen.getByRole('region', { name: 'My fees table' })
    expect(within(feesTable).getByText('$182.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh fees' })).toBeInTheDocument()
  })

  it('pages one summary section independently', async () => {
    mockedFetchSummaryApplications
      .mockResolvedValueOnce({
        results: [
          {
            application: 43278,
            status: 'New',
            reason: 'Surplus',
            exemptionType: 'Ministerial',
            exemptionNumber: null,
            receivedDate: null,
            listingDate: null,
            packageNumberAry: [],
          },
        ],
        total: 11,
        page: 0,
        size: 10,
      })
      .mockResolvedValueOnce({
        results: [
          {
            application: 43267,
            status: 'New',
            reason: null,
            exemptionType: null,
            exemptionNumber: null,
            receivedDate: null,
            listingDate: null,
            packageNumberAry: [],
          },
        ],
        total: 11,
        page: 1,
        size: 10,
      })

    renderPage()

    const applicationTable = await screen.findByRole('region', {
      name: 'My applications table',
    })
    expect(within(applicationTable).getByRole('link', { name: '43278' })).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Next page'))

    await waitFor(() => expect(mockedFetchSummaryApplications).toHaveBeenLastCalledWith(1, 10))
    expect(
      within(await screen.findByRole('region', { name: 'My applications table' })).getByRole(
        'link',
        { name: '43267' },
      ),
    ).toBeInTheDocument()
  })

  it('allows a failed section to be retried without hiding the others', async () => {
    mockedFetchSummaryApplications.mockRejectedValue(new Error('offline'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'My Applications unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Offers' })).toBeInTheDocument()

    mockedFetchSummaryApplications.mockResolvedValue({
      results: [],
      total: 0,
      page: 0,
      size: 10,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { name: 'No applications found' }),
    ).toBeInTheDocument()
    expect(mockedFetchSummaryApplications).toHaveBeenCalledTimes(2)
  })

  it('shows client lookup failures without hiding summary sections', async () => {
    mockedFetchApplicationClientData.mockRejectedValue(new Error('client endpoint unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Client details unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Client details could not be retrieved. Please try again.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'My Applications' })).toBeInTheDocument()
  })

  it('does not request client data when no forest client is active', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          grantedActions: ['/summary'],
          forestClientNumber: null,
        }),
        defaultRoute: '/select-organization',
      }),
    )

    renderPage()

    expect(screen.getByRole('heading', { name: 'No active forest client' })).toBeInTheDocument()
    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    expect(mockedFetchSummaryApplications).not.toHaveBeenCalled()
    expect(mockedFetchSummaryFees).not.toHaveBeenCalled()
  })
})
