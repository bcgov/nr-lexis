import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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

const RecordBackLink = () => {
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: { label: string; to: string } } | null)?.returnTo
  return <p>{`Back to ${returnTo?.label} at ${returnTo?.to}`}</p>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/summary']}>
      <Routes>
        <Route path="/provincial/summary" element={<ProvincialSummaryPage />} />
        <Route path="*" element={<RecordBackLink />} />
      </Routes>
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
          forestClientNumber: '11111111',
          availableForestClientNumbers: ['11111111'],
        }),
        defaultRoute: '/provincial/summary',
        canPerform: (action: string) => action === '/summary',
      }),
    )
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '11111111',
      companyName: 'SYNTHETIC FOREST CLIENT',
      clientAcronym: '',
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
          application: 12345,
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
          offerNumber: 54321,
          application: 12345,
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
          ownerClientNumber: '11111111',
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
          ownerClientNumber: '11111111',
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

    expect(await screen.findByText('SYNTHETIC FOREST CLIENT')).toBeInTheDocument()
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('11111111', '00')
    expect(mockedFetchSummaryApplications).toHaveBeenCalledWith(0, 10, 'applicationNumber DESC')
    expect(mockedFetchSummaryOffers).toHaveBeenCalledWith(0, 10, 'offerNumber DESC')
    expect(mockedFetchSummaryExemptions).toHaveBeenCalledWith(0, 10, 'exemptionNumber DESC')
    expect(mockedFetchSummaryPermits).toHaveBeenCalledWith(0, 10, 'permitNumber DESC')
    expect(mockedFetchSummaryOffersPlaced).toHaveBeenCalledWith(0, 10, 'offerNumber DESC')
    expect(mockedFetchSummaryFees).not.toHaveBeenCalled()

    expect(screen.getByRole('heading', { name: 'My applications' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My offers' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My exemptions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My permits' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My fees' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Offers placed' })).toBeInTheDocument()

    expect(screen.getAllByRole('link', { name: '12345' })[0]).toHaveAttribute(
      'href',
      '/provincial/application/12345',
    )
    expect(screen.getByRole('link', { name: '54321' })).toHaveAttribute(
      'href',
      '/provincial/offers/54321',
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
    expect(
      within(screen.getByRole('region', { name: 'My exemptions table' })).getByRole(
        'columnheader',
        { name: 'Approval volume (m³)' },
      ),
    ).toBeInTheDocument()
  })

  it('links each section to its search, except Offers placed', async () => {
    renderPage()
    await screen.findByText('SYNTHETIC FOREST CLIENT')

    for (const [section, label, href] of [
      ['My applications', 'Search applications', '/provincial/application'],
      ['My offers', 'Search offers', '/provincial/offers'],
      ['My exemptions', 'Search exemptions', '/provincial/exemption'],
      ['My permits', 'Search permits', '/provincial/permit'],
      ['My fees', 'Search fees by permit', '/provincial/permit'],
    ]) {
      expect(
        within(screen.getByRole('region', { name: section })).getByRole('link', { name: label }),
      ).toHaveAttribute('href', href)
    }
    expect(
      within(screen.getByRole('region', { name: 'Offers placed' })).queryByRole('link', {
        name: /^Search/,
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the item count under every table, even with one page', async () => {
    renderPage()

    const offers = await screen.findByRole('region', { name: 'My offers' })
    await within(offers).findByRole('table')
    expect(within(offers).getByText('1–1 of 1 item')).toBeInTheDocument()
    expect(within(offers).getByText('of 1 page')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'My applications' })).getByText('1–10 of 11 items'),
    ).toBeInTheDocument()
  })

  it('opens records with a Back link to Summary', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('link', { name: '7000123' }))

    expect(screen.getByText('Back to Summary at /provincial/summary')).toBeInTheDocument()
  })

  it('marks Active permits as pending and shows a fee with no amount as empty', async () => {
    const permitRow = {
      ownerClientNumber: '11111111',
      agentClientNumber: null,
      exemption: 'EX-205',
      totalPieces: 1,
      totalVolume: 87,
      receipt: null,
      issueDate: null,
    }
    mockedFetchSummaryPermits.mockResolvedValue({
      results: [
        { ...permitRow, permit: 9021098, status: 'Active' },
        { ...permitRow, permit: 9021097, status: 'Payment Pending' },
      ],
      total: 2,
      page: 0,
      size: 10,
    })
    mockedFetchSummaryFees.mockResolvedValue({
      results: [{ permit: 9021098, status: 'Active', volume: 4387, fees: null, receipt: null }],
      total: 1,
      page: 0,
      size: 10,
    })

    renderPage()

    const permitsTable = await screen.findByRole('region', { name: 'My permits table' })
    expect(within(permitsTable).getByRole('link', { name: '9021098 (Pending)' })).toHaveAttribute(
      'href',
      '/provincial/permit/9021098',
    )
    expect(within(permitsTable).getByRole('link', { name: '9021097' })).toBeInTheDocument()
    expect(within(permitsTable).getByText('Payment pending')).toBeInTheDocument()
    expect(within(permitsTable).queryByText('Payment Pending')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Display fees' }))

    const feesTable = await screen.findByRole('region', { name: 'My fees table' })
    const feeRow = within(feesTable)
      .getByRole('link', { name: '9021098 (Pending)' })
      .closest('tr') as HTMLElement
    expect(within(feeRow).getAllByRole('cell')[2]).toHaveTextContent('—Not provided')
    expect(within(feesTable).queryByText('Not available')).not.toBeInTheDocument()
  })

  it('loads fees only when Display fees is selected', async () => {
    renderPage()

    await screen.findByText('SYNTHETIC FOREST CLIENT')
    const feesSection = screen.getByRole('region', { name: 'My fees' })
    expect(
      within(feesSection).getByRole('heading', { name: 'View your permit fees' }),
    ).toBeInTheDocument()
    expect(within(feesSection).getByText('Fee totals are calculated on request.')).toBeVisible()
    expect(
      within(feesSection).queryByRole('button', { name: 'Refresh fees' }),
    ).not.toBeInTheDocument()

    await userEvent.click(within(feesSection).getByRole('button', { name: 'Display fees' }))

    await waitFor(() =>
      expect(mockedFetchSummaryFees).toHaveBeenCalledWith(0, 10, 'permitNumber DESC'),
    )
    const feesTable = screen.getByRole('region', { name: 'My fees table' })
    expect(within(feesTable).getByText('$182.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh fees' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Display fees' })).not.toBeInTheDocument()
    await userEvent.click(within(feesTable).getByRole('button', { name: 'Permit number' }))
    await waitFor(() =>
      expect(mockedFetchSummaryFees).toHaveBeenLastCalledWith(0, 10, 'permitNumber ASC'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Refresh fees' }))
    expect(mockedFetchSummaryFees).toHaveBeenLastCalledWith(0, 10, 'permitNumber ASC')
  })

  it('shows application and exemption numbers in offer and permit tables as plain text', async () => {
    mockedFetchSummaryOffersPlaced.mockResolvedValue({
      results: [
        {
          offerNumber: 123,
          application: 45678,
          packageNumber: 'PKG-OTHER-CLIENT',
          listingDate: '2026-08-20',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })

    renderPage()

    const offersPlacedTable = await screen.findByRole('region', { name: 'Offers placed table' })
    expect(within(offersPlacedTable).getByRole('cell', { name: '45678' })).toBeVisible()
    expect(within(offersPlacedTable).queryByRole('link', { name: '45678' })).not.toBeInTheDocument()
    expect(within(offersPlacedTable).getByRole('link', { name: '123' })).toHaveAttribute(
      'href',
      '/provincial/offers/123',
    )

    const myOffersTable = screen.getByRole('region', { name: 'My offers table' })
    expect(within(myOffersTable).getByRole('cell', { name: '12345' })).toBeVisible()
    expect(within(myOffersTable).queryByRole('link', { name: '12345' })).not.toBeInTheDocument()

    const myPermitsTable = screen.getByRole('region', { name: 'My permits table' })
    expect(within(myPermitsTable).getByRole('cell', { name: 'EX-205' })).toBeVisible()
    expect(within(myPermitsTable).queryByRole('link', { name: 'EX-205' })).not.toBeInTheDocument()
  })

  it('pages one summary section independently', async () => {
    mockedFetchSummaryApplications
      .mockResolvedValueOnce({
        results: [
          {
            application: 12345,
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
            application: 12344,
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
    expect(within(applicationTable).getByRole('link', { name: '12345' })).toBeInTheDocument()
    await userEvent.click(
      within(screen.getByRole('region', { name: 'My applications' })).getByLabelText('Next page'),
    )

    await waitFor(() =>
      expect(mockedFetchSummaryApplications).toHaveBeenLastCalledWith(
        1,
        10,
        'applicationNumber DESC',
      ),
    )
    expect(
      within(await screen.findByRole('region', { name: 'My applications table' })).getByRole(
        'link',
        { name: '12344' },
      ),
    ).toBeInTheDocument()
  })

  it.each([
    [
      'My applications',
      mockedFetchSummaryApplications,
      [
        ['Application', 'applicationNumber'],
        ['Package number', 'packageNumber'],
        ['Received date', 'receivedDate'],
        ['List date', 'listingDate'],
      ],
    ],
    [
      'My offers',
      mockedFetchSummaryOffers,
      [
        ['Application', 'applicationNumber'],
        ['Package', 'packageNumber'],
        ['List date', 'listingDate'],
      ],
    ],
    [
      'My exemptions',
      mockedFetchSummaryExemptions,
      [
        ['Exemption', 'exemptionNumber'],
        ['Approval date', 'exemptionApprovalDate'],
      ],
    ],
    [
      'My permits',
      mockedFetchSummaryPermits,
      [
        ['Permit', 'permitNumber'],
        ['Exemption', 'exemptionNumber'],
      ],
    ],
    ['My fees', mockedFetchSummaryFees, [['Permit number', 'permitNumber']]],
    [
      'Offers placed',
      mockedFetchSummaryOffersPlaced,
      [
        ['Application', 'applicationNumber'],
        ['Package', 'packageNumber'],
        ['List date', 'listingDate'],
      ],
    ],
  ] as const)('maps only the legacy sortable columns in %s', async (title, loader, fields) => {
    mockedFetchSummaryOffersPlaced.mockResolvedValue({
      results: [
        {
          offerNumber: 123,
          application: 12345,
          packageNumber: 'SYNTH-1',
          listingDate: '2026-08-20',
        },
      ],
      total: 1,
      page: 0,
      size: 10,
    })
    renderPage()
    const section = screen.getByRole('region', { name: title })
    if (title === 'My fees')
      await userEvent.click(within(section).getByRole('button', { name: 'Display fees' }))
    await within(section).findByRole('table')
    expect(within(within(section).getByRole('table')).getAllByRole('button')).toHaveLength(
      fields.length,
    )

    for (const [label, field] of fields) {
      await userEvent.click(within(section).getByRole('button', { name: label }))
      await waitFor(() => expect(loader).toHaveBeenLastCalledWith(0, 10, `${field} ASC`))
      expect(
        within(section).getByRole('columnheader', { name: new RegExp(`${label}$`) }),
      ).toHaveAttribute('aria-sort', 'ascending')
      await userEvent.click(within(section).getByRole('button', { name: label }))
      await waitFor(() => expect(loader).toHaveBeenLastCalledWith(0, 10, `${field} DESC`))
      expect(
        within(section).getByRole('columnheader', { name: new RegExp(`${label}$`) }),
      ).toHaveAttribute('aria-sort', 'descending')
    }
  })

  it('resets only the sorted section page and retains its sort during paging and retry', async () => {
    const applicationRow = {
      application: 12345,
      status: 'New',
      reason: null,
      exemptionType: null,
      exemptionNumber: null,
      receivedDate: '2026-08-01',
      listingDate: null,
      packageNumberAry: ['SYNTH-1'],
    }
    const permitRow = {
      permit: 7000123,
      status: 'Active',
      ownerClientNumber: '11111111',
      agentClientNumber: null,
      exemption: 'EX-205',
      totalPieces: 10,
      totalVolume: 10,
      receipt: null,
      issueDate: null,
    }
    mockedFetchSummaryApplications.mockImplementation(async (page = 0) => ({
      results: [applicationRow],
      total: 21,
      page,
      size: 10,
    }))
    mockedFetchSummaryPermits.mockImplementation(async (page = 0) => ({
      results: [permitRow],
      total: 21,
      page,
      size: 10,
    }))
    renderPage()
    const applications = screen.getByRole('region', { name: 'My applications' })
    const permits = screen.getByRole('region', { name: 'My permits' })
    await within(applications).findByRole('table')
    await within(permits).findByRole('table')
    await userEvent.click(within(applications).getByRole('button', { name: 'Next page' }))
    await userEvent.click(within(permits).getByRole('button', { name: 'Next page' }))
    expect(mockedFetchSummaryApplications).toHaveBeenLastCalledWith(1, 10, 'applicationNumber DESC')
    expect(mockedFetchSummaryPermits).toHaveBeenLastCalledWith(1, 10, 'permitNumber DESC')
    const permitCalls = mockedFetchSummaryPermits.mock.calls.length

    mockedFetchSummaryApplications.mockRejectedValueOnce(new Error('offline'))
    await userEvent.click(within(applications).getByRole('button', { name: 'Received date' }))
    await within(applications).findByRole('heading', { name: 'My applications unavailable' })
    await userEvent.click(within(applications).getByRole('button', { name: 'Try again' }))
    await within(applications).findByRole('table')
    expect(mockedFetchSummaryApplications).toHaveBeenLastCalledWith(0, 10, 'receivedDate ASC')
    expect(
      within(applications).getByRole('columnheader', { name: /Received date$/ }),
    ).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(applications).getByRole('button', { name: 'Next page' }))
    expect(mockedFetchSummaryApplications).toHaveBeenLastCalledWith(1, 10, 'receivedDate ASC')
    expect(mockedFetchSummaryPermits).toHaveBeenCalledTimes(permitCalls)
    expect(mockedFetchSummaryPermits).toHaveBeenLastCalledWith(1, 10, 'permitNumber DESC')
    expect(within(permits).getByRole('columnheader', { name: /Permit$/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(mockedFetchSummaryFees).not.toHaveBeenCalled()
  })

  it('allows a failed section to be retried without hiding the others', async () => {
    mockedFetchSummaryApplications.mockRejectedValue(new Error('offline'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'My applications unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My offers' })).toBeInTheDocument()

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
    mockedFetchApplicationClientData.mockRejectedValueOnce(new Error('client endpoint unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Client details unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Client details could not be retrieved. Please try again.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'My applications' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('SYNTHETIC FOREST CLIENT')).toBeInTheDocument()
    expect(mockedFetchApplicationClientData).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('heading', { name: 'Client details unavailable' }),
    ).not.toBeInTheDocument()
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
