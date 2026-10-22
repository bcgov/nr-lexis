import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import type { ApplicationReviewSearchResponse } from '@/interfaces/ApplicationReviewSearch'
import ProvincialReviewPage from '@/pages/ProvincialReview'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import {
  approveApplicationReview,
  countApplicationReviews,
  searchApplicationReviews,
  sendApplicationReviewStatusEmail,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import { fetchApplicationSummarySnapshot } from '@/service/provincial-application-items-service'
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'
import { fetchApplicationReviewOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  countApplicationReviews: vi.fn(),
  searchApplicationReviews: vi.fn(),
  approveApplicationReview: vi.fn(),
  updateApplicationReviewStatus: vi.fn(),
  sendApplicationReviewStatusEmail: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchApplicationReviewOptions: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationSummarySnapshot: vi.fn(),
}))

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentApplicationRecordVersion: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedCountApplicationReviews = vi.mocked(countApplicationReviews)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
const mockedApproveApplicationReview = vi.mocked(approveApplicationReview)
const mockedUpdateApplicationReviewStatus = vi.mocked(updateApplicationReviewStatus)
const mockedSendApplicationReviewStatusEmail = vi.mocked(sendApplicationReviewStatusEmail)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationSummarySnapshot = vi.mocked(fetchApplicationSummarySnapshot)
const mockedFetchCurrentApplicationRecordVersion = vi.mocked(fetchCurrentApplicationRecordVersion)
const mockedFetchApplicationReviewOptions = vi.mocked(fetchApplicationReviewOptions)

const reviewRow = (applicationNumber: string, overrides = {}) => ({
  applicationNumber,
  volume: 1,
  speciesEndUse: 'LOG',
  listingDate: '2026-02-01',
  status: 'New',
  region: 'RSC',
  showInfoIcon: false,
  ...overrides,
})

const pageOf = (
  content: ReturnType<typeof reviewRow>[],
  totalElements = content.length,
): ApplicationReviewSearchResponse => ({
  content,
  page: { number: 0, size: 100, totalElements, totalPages: 1 },
})

const reviewResponse = pageOf([
  reviewRow('1000123'),
  reviewRow('1000456', {
    volume: 1212,
    speciesEndUse: 'LUM',
    listingDate: '2026-02-26',
    status: 'Pending',
    region: 'RWC',
  }),
])

const threeRowResponse = pageOf([reviewRow('2000001'), reviewRow('2000002'), reviewRow('2000003')])

const applicationSummary = {
  applicationNumber: '1000123',
  federalApplicationNumber: '',
  applicationDate: '2026-02-01',
  termDays: '14',
  receivedDate: '2026-02-01',
  applicationVolume: '210.5',
  averageLogVolume: '1.2',
  productLocation: 'BC',
  exportScheduleId: '1001',
  agentClientNumber: '',
  agentClientLocationCode: '',
  ownerClientNumber: '00012345',
  ownerClientLocationCode: '00',
  exemptionNumber: '',
  exemptionReasonCode: 'S',
  applicationStatusCode: 'NEW',
  applicantTypeCode: 'O',
  orgUnitNumber: '1903',
  productTypeCode: 'H',
  jurisdictionCode: 'P',
  growthTypeCode: 'S',
  agentContactName: '',
  ownerContactName: 'Owner Contact',
  oicIndicator: '',
  endUseCode: '',
  speciesCodes: [],
}

const agentSummary = {
  ...applicationSummary,
  applicantTypeCode: 'A',
  agentClientNumber: '00054321',
  agentClientLocationCode: '02',
}

const clientData = (clientNumber: string, email: string) => ({
  clientNumber,
  companyName: 'Client Ltd.',
  clientAcronym: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  country: '',
  phone: '',
  fax: '',
  email,
  notfound: '',
})

const statusSaved = {
  updated: true,
  valid: true,
  statusCode: 'REJ',
  clientEmail: '',
  remark: 'Reason',
  message: 'Application status updated.',
}

const QUEUE_URL =
  '/provincial/review?region=&page=1&pageSize=100&sortField=applicationNumber&sortDirection=desc'

const renderPage = (initialEntry = QUEUE_URL) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/provincial/review" element={<ProvincialReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )

Element.prototype.scrollIntoView = vi.fn()

// Notifications take focus only once they are laid out.
const mockLaidOutElements = () =>
  vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)

// A title with a record link is split around the link, so match the notification's whole text.
const notice = (text: string) => {
  const match = Array.from(document.querySelectorAll<HTMLElement>('.app-inline-notification')).find(
    (notification) => notification.textContent?.includes(text),
  )
  if (!match) throw new Error(`No notification shows "${text}"`)
  return match
}

const recordList = (notification: HTMLElement) =>
  notification.querySelector('.action-result-notification__records')?.textContent

const rowOf = (applicationNumber: string) =>
  screen.getByText(applicationNumber).closest('tr') as HTMLTableRowElement

const openDisapprove = async (applicationNumber: string) => {
  await userEvent.click(
    screen.getByRole('button', { name: `Disapprove application ${applicationNumber}` }),
  )
  return screen.findByRole('dialog', { name: `Disapprove application ${applicationNumber}` })
}

describe('Application review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    clearAllPageDataCache()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSearchApplicationReviews.mockResolvedValue(reviewResponse)
    mockedFetchApplicationReviewOptions.mockResolvedValue({
      productTypes: [
        { value: 'LOG', label: 'Logs' },
        { value: 'LUM', label: 'Lumber' },
      ],
      regions: [
        { value: '11', label: 'Cariboo' },
        { value: '12', label: 'Coast' },
      ],
      reviewStatuses: [
        { value: 'REJ', label: 'Rejected' },
        { value: 'WDN', label: 'Withdrawn' },
        { value: 'EXP', label: 'Expired' },
      ],
    })
    mockedApproveApplicationReview.mockResolvedValue({
      updated: true,
      valid: true,
      statusCode: 'APP',
      clientEmail: '',
      remark: '',
      message: 'Application approved.',
    })
    mockedUpdateApplicationReviewStatus.mockResolvedValue(statusSaved)
    mockedSendApplicationReviewStatusEmail.mockResolvedValue({
      success: true,
      message: 'Application status email sent.',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue(applicationSummary)
    mockedFetchCurrentApplicationRecordVersion.mockImplementation((applicationNumber) =>
      Promise.resolve(`application-${applicationNumber}-version`),
    )
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) =>
      clientData(
        clientNumber,
        clientNumber === '00054321' ? 'agent@example.com' : 'owner@example.com',
      ),
    )
  })

  describe('queue and filters', () => {
    it('opens with the queue of every New and Pending application, with no Search needed', async () => {
      renderPage('/provincial/review')

      expect(await screen.findByText('1000123')).toBeInTheDocument()
      expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
      expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: {
            applicationNumber: '',
            productTypeCode: '',
            region: [],
            receivedFromDate: '',
            receivedToDate: '',
            listingFromDate: '',
            listingToDate: '',
          },
          page: 0,
          pageSize: 100,
          sortField: 'applicationNumber',
          sortDirection: 'desc',
        }),
        expect.any(Object),
      )
      expect(
        screen.getByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
      ).toBeVisible()
    })

    it('opens the queue on the default zone regions when one is set', async () => {
      mockedUseDefaultRegionPreference.mockReturnValue({
        defaultRegion: 'RNI',
        preferenceLoading: false,
      })
      mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
        productTypes: [],
        regions: [
          { value: '1903', label: 'Cariboo' },
          { value: '1905', label: 'Northeast' },
          { value: '1906', label: 'Omineca' },
          { value: '1908', label: 'Skeena' },
        ],
        reviewStatuses: [],
      })

      renderPage('/provincial/review')

      await waitFor(() =>
        expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({ region: ['1905', '1906', '1908'] }),
          }),
          expect.any(Object),
        ),
      )
      expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
      expect(
        await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*3/ }),
      ).toBeVisible()
    })

    it('shows the page title and its subtitle paragraph without a header action', async () => {
      renderPage()

      const heading = await screen.findByRole('heading', { name: 'Application review' })
      const subtitle = screen.getByText(
        'Approve or disapprove applications for the Advertising List',
      )
      expect(subtitle.tagName).toBe('P')
      expect(heading.closest('header')?.querySelector('button, a')).toBeNull()
    })

    it('places the search action last and includes the search icon', async () => {
      renderPage()
      await screen.findByText('1000123')

      const searchActions = screen.getByRole('group', { name: 'Review search actions' })
      expect(
        within(searchActions)
          .getAllByRole('button')
          .map((button) => button.textContent?.trim()),
      ).toEqual(['Clear all', 'Search'])
      expect(
        within(searchActions).getByRole('button', { name: 'Search' }).querySelector('svg'),
      ).not.toBeNull()
    })

    it('gives Region one grid column like the other filters', async () => {
      const { container } = renderPage()
      await screen.findByText('1000123')

      const grid = container.querySelector('.provincial-review-search-grid') as HTMLElement
      const region = screen.getByRole('combobox', { name: /^Region/ })
      const regionCell = Array.from(grid.children).find((child) => child.contains(region))
      expect(regionCell).toBeDefined()
      expect(getComputedStyle(regionCell as Element).gridColumn).not.toContain('span 2')
    })

    it('resets the filters with Clear all and reloads the queue', async () => {
      mockedUseDefaultRegionPreference.mockReturnValue({
        defaultRegion: 'RNI',
        preferenceLoading: false,
      })
      mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
        productTypes: [],
        regions: [
          { value: '1903', label: 'Cariboo' },
          { value: '1905', label: 'Northeast' },
        ],
        reviewStatuses: [],
      })
      renderPage('/provincial/review?applicationNumber=46053&region=1903&pageSize=100')
      await screen.findByText('1000123')
      mockedSearchApplicationReviews.mockClear()

      await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

      await waitFor(() =>
        expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({ applicationNumber: '', region: ['1905'] }),
          }),
          expect.any(Object),
        ),
      )
      expect(screen.getByLabelText('Application number')).toHaveValue('')
      expect(await screen.findByText('1000123')).toBeVisible()
      expect(screen.getByRole('region', { name: 'Search results table' })).toBeVisible()
    })

    it('reloads the queue with Clear all when the filters are already the defaults', async () => {
      renderPage()
      await screen.findByText('1000123')
      mockedSearchApplicationReviews.mockClear()

      await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

      await waitFor(() => expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('1000123')).toBeVisible()
    })

    it('waits for explicit submission while the application number is typed', async () => {
      renderPage()
      await screen.findByText('1000123')
      mockedSearchApplicationReviews.mockClear()

      const applicationNumberInput = screen.getByLabelText('Application number')
      for (const value of ['4', '46', '460', '4605', '46053']) {
        fireEvent.change(applicationNumberInput, { target: { value } })
      }

      expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Search' }))

      await waitFor(() => {
        expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
        expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({ applicationNumber: '46053' }),
          }),
          expect.any(Object),
        )
      })
    })

    it('sends selected region org unit numbers to the review search request', async () => {
      mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
        productTypes: [{ value: 'LOG', label: 'Logs' }],
        regions: [
          { value: '1818', label: 'TST' },
          { value: '1919', label: 'OTHER' },
        ],
        reviewStatuses: [{ value: 'REJ', label: 'Rejected' }],
      })

      renderPage('/provincial/review?applicationNumber=1000123&region=')
      await screen.findByText('1000123')
      mockedSearchApplicationReviews.mockClear()

      const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
      await userEvent.click(regionComboBox)
      fireEvent.change(regionComboBox, { target: { value: 'TST' } })
      await userEvent.click(await screen.findByRole('option', { name: 'TST' }))

      expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Search' }))

      await waitFor(() => {
        expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({ applicationNumber: '1000123', region: ['1818'] }),
          }),
          expect.any(Object),
        )
      })
    })

    it.each([
      ['Received date from', 'Received date to'],
      ['List date from', 'List date to'],
    ])(
      'keeps Search enabled with a reversed %s range and focuses the error instead of searching',
      async (fromLabel, toLabel) => {
        renderPage()
        await screen.findByText('1000123')
        const search = screen.getByRole('button', { name: 'Search' })
        const callsBeforeEdit = mockedSearchApplicationReviews.mock.calls.length
        const from = screen.getByLabelText(fromLabel)
        const to = screen.getByLabelText(toLabel)
        fireEvent.change(from, { target: { value: '2026-10-12' } })
        fireEvent.change(to, { target: { value: '2026-10-01' } })
        expect(to).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText(`Must be on or after ${fromLabel}.`)).toBeVisible()
        expect(search).toBeEnabled()

        await userEvent.click(search)

        await waitFor(() => expect(to).toHaveFocus())
        expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(callsBeforeEdit)
        expect(screen.getByText('1000123')).toBeVisible()

        fireEvent.change(to, { target: { value: '2026-10-12' } })
        expect(to).not.toHaveAttribute('aria-invalid', 'true')
        await userEvent.click(search)
        await waitFor(() =>
          expect(mockedSearchApplicationReviews.mock.calls.length).toBeGreaterThan(callsBeforeEdit),
        )
      },
    )

    it('does not request a reversed date range restored from a saved link', async () => {
      renderPage('/provincial/review?listingFromDate=2026-10-12&listingToDate=2026-10-01')
      await waitFor(() =>
        expect(screen.getByLabelText('List date to')).toHaveAttribute('aria-invalid', 'true'),
      )
      expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
      expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()
      expect(screen.queryByRole('region', { name: 'Applications to review' })).toBeNull()
    })
  })

  describe('results', () => {
    it('renders the latest review response when the cache is invalidated in flight', async () => {
      let resolveSearch: (response: ApplicationReviewSearchResponse) => void = () => {}
      mockedSearchApplicationReviews.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
      )

      renderPage()
      await waitFor(() => expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1))

      clearAllPageDataCache()
      await act(async () => {
        resolveSearch(reviewResponse)
      })

      expect(await screen.findByText('1000123')).toBeInTheDocument()
      expect(screen.queryByText('No results found')).not.toBeInTheDocument()
    })

    it('shows Searching above a skeleton with one column per result column', async () => {
      mockedSearchApplicationReviews.mockReturnValueOnce(new Promise(() => {}))

      const { container } = renderPage()
      await waitFor(() => expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1))

      expect(screen.getByText('Searching')).toBeInTheDocument()
      const skeleton = screen.getByRole('table', { name: 'Searching' })
      // Application, Status, volume, species, List date, Region and Actions; no selection column.
      expect(within(skeleton).getAllByRole('columnheader')).toHaveLength(7)
      expect(container.querySelectorAll('.legacy-search-table-toolbar')).toHaveLength(1)
    })

    it('leaves the Actions column out of the skeleton for a user who cannot approve', async () => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          canPerform: (action: string) =>
            action === '/applicationSearch' || action === '/applicationDetails',
        }),
      )
      mockedSearchApplicationReviews.mockReturnValueOnce(new Promise(() => {}))

      renderPage()
      await waitFor(() => expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1))

      const skeleton = screen.getByRole('table', { name: 'Searching' })
      expect(within(skeleton).getAllByRole('columnheader')).toHaveLength(6)
    })

    it('shows the count in the toolbar and the pagination only', async () => {
      const rows = Array.from({ length: 10 }, (_, index) => reviewRow(String(3000000 + index)))
      mockedSearchApplicationReviews.mockResolvedValueOnce({
        content: rows,
        page: { number: 0, size: 10, totalElements: 11, totalPages: 2 },
      })
      let resolveCount!: (total: number) => void
      mockedCountApplicationReviews.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCount = resolve
        }),
      )

      const { container } = renderPage(
        '/provincial/review?region=&page=1&pageSize=10&sortField=applicationNumber&sortDirection=desc',
      )

      await waitFor(() => expect(mockedCountApplicationReviews).toHaveBeenCalledOnce())
      expect(await screen.findByText('3000000')).toBeInTheDocument()
      await act(async () => {
        resolveCount(125)
      })

      expect(await screen.findAllByText('125 applications found')).toHaveLength(1)
      expect(screen.getByText(/of 125 items/)).toBeInTheDocument()
      expect(container.querySelector('.legacy-search-result-count--footer')).toBeNull()
    })

    it('uses the singular result label once for one matching application', async () => {
      mockedSearchApplicationReviews.mockResolvedValueOnce(pageOf([reviewRow('1000123')]))

      renderPage()

      expect(await screen.findAllByText('1 application found')).toHaveLength(1)
      expect(
        screen.getByText('1 application found').closest('[aria-live="polite"]'),
      ).toBeInTheDocument()
    })

    it('keeps the rows out of the live region so only the count is announced', async () => {
      const { container } = renderPage()
      await screen.findByText('1000123')

      expect(container.querySelector('tbody')).toHaveAttribute('aria-live', 'off')
    })

    it('renders the columns in order with sentence case statuses, words for dates and region codes', async () => {
      renderPage()
      await screen.findByText('1000123')

      const headers = screen
        .getAllByRole('columnheader')
        .slice(1)
        .map((header) =>
          (header.querySelector('.cds--table-header-label') ?? header).textContent
            ?.replace(/\s+/g, ' ')
            .trim(),
        )
      expect(headers).toEqual([
        'Application',
        'Status',
        'Application volume (m³)',
        'Species end use sort',
        'List date',
        'Region',
        'Actions',
      ])
      expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument()
      expect(within(rowOf('1000456')).getByText('Pending')).toBeVisible()
      expect(within(rowOf('1000456')).getByText('RWC')).toBeVisible()
      expect(screen.getByText('1.0')).toBeInTheDocument()
      expect(screen.getByText('1,212.0')).toBeInTheDocument()
    })

    it.each([
      ['List date', 'listingDate'],
      ['Region', 'regionCode'],
    ] as const)('dispatches the legacy review %s sort key', async (header, expectedSortField) => {
      renderPage()
      await screen.findByText('1000123')
      mockedSearchApplicationReviews.mockClear()

      await userEvent.click(screen.getByRole('button', { name: header }))

      await waitFor(() => {
        expect(
          mockedSearchApplicationReviews.mock.calls.some(
            ([request]) =>
              request.sortField === expectedSortField && request.sortDirection === 'asc',
          ),
        ).toBe(true)
      })
    })

    it('toggles the default review application sort to ascending', async () => {
      renderPage()
      await screen.findByText('1000123')

      const applicationSortButton = screen.getByRole('button', { name: 'Application' })
      expect(applicationSortButton.closest('th')).toHaveAttribute('aria-sort', 'descending')

      await userEvent.click(applicationSortButton)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Application' }).closest('th')).toHaveAttribute(
          'aria-sort',
          'ascending',
        ),
      )
    })

    it.each([true, false])(
      'identifies MU44 timber marks with detail access %s',
      async (canOpenDetails) => {
        mockedUseAuth.mockReturnValue(
          createTestAuthContext({
            canPerform: (action) => action !== '/applicationDetails' || canOpenDetails,
          }),
        )
        mockedSearchApplicationReviews.mockResolvedValue(
          pageOf([reviewRow('1000123', { showInfoIcon: true }), reviewRow('1000456')]),
        )
        renderPage()
        await screen.findByText('1000123')

        const note = 'Application contains timber mark(s) from MU44'
        expect(within(rowOf('1000123')).getByRole('button', { name: note })).toBeVisible()
        expect(within(rowOf('1000456')).queryByRole('button', { name: note })).toBeNull()
        if (canOpenDetails) {
          expect(within(rowOf('1000123')).getByRole('link', { name: '1000123' })).toHaveAttribute(
            'href',
            expect.stringContaining('/provincial/application/1000123'),
          )
        } else {
          expect(within(rowOf('1000123')).queryByRole('link')).not.toBeInTheDocument()
        }
      },
    )

    it('opens review with 100 rows and the shared page size options', async () => {
      renderPage()
      await screen.findByText('1000123')

      const rowsPerPage = screen.getByLabelText('Items per page:')
      expect(rowsPerPage).toHaveValue('100')
      expect(
        Array.from(rowsPerPage.querySelectorAll('option')).map((option) => option.value),
      ).toEqual(['10', '25', '50', '100', '200'])
    })

    it.each([10, 200])(
      'accepts the supported review page size %i from the URL',
      async (pageSize) => {
        renderPage(`/provincial/review?pageSize=${pageSize}`)
        await screen.findByText('1000123')

        expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
          expect.objectContaining({ page: 0, pageSize }),
          expect.any(Object),
        )
      },
    )

    it('replaces the table and toolbar with the shared empty state when filters match nothing', async () => {
      mockedSearchApplicationReviews.mockResolvedValue(pageOf([]))
      renderPage('/provincial/review?applicationNumber=9999999&region=')

      expect(await screen.findByRole('heading', { name: 'No results found' })).toBeVisible()
      expect(
        screen.getByText(
          'No records match your search criteria. Try adjusting your filters and searching again.',
        ),
      ).toBeVisible()
      expect(
        screen.getByText('0 applications found').closest('.cds--visually-hidden'),
      ).not.toBeNull()
      expect(screen.queryByLabelText('Items per page:')).not.toBeInTheDocument()
      expect(screen.queryByRole('table', { name: /./ })).toBeNull()
    })

    it('says the queue is empty when the default queue has no applications', async () => {
      mockedSearchApplicationReviews.mockResolvedValue(pageOf([]))
      renderPage('/provincial/review')

      expect(
        await screen.findByRole('heading', { name: 'No applications to review' }),
      ).toBeVisible()
      expect(
        screen.getByText('New and pending applications show here when clients submit them.'),
      ).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'No results found' })).toBeNull()
    })

    it('shows the review error as an alert in place of the table and toolbar', async () => {
      mockedSearchApplicationReviews.mockRejectedValue(new Error('Oracle unavailable'))

      const { container } = renderPage()

      const heading = await screen.findByRole('heading', { name: 'Application review unavailable' })
      const alert = heading.closest('[role="alert"]') as HTMLElement
      expect(alert).not.toBeNull()
      expect(
        within(alert).getByText('Unable to retrieve applications for review. Try again.'),
      ).toBeVisible()
      expect(container.querySelector('.legacy-search-table-toolbar')).toBeNull()
      expect(screen.queryByText('Results unavailable')).toBeNull()
    })

    it('leaves out the checkbox column and row actions for a user who cannot approve', async () => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          canPerform: (action: string) =>
            action === '/applicationSearch' || action === '/applicationDetails',
        }),
      )

      renderPage()
      await screen.findByText('1000123')

      expect(screen.queryByRole('checkbox')).toBeNull()
      expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Disapprove/ })).toBeNull()
    })
  })

  describe('selection and batch approval', () => {
    it('makes every row selectable and announces the selected count', async () => {
      renderPage()
      await screen.findByText('1000123')

      const selectAll = screen.getByRole('checkbox', { name: 'Select all rows on this page' })
      const first = screen.getByRole('checkbox', { name: 'Select application 1000123' })
      const second = screen.getByRole('checkbox', { name: 'Select application 1000456' })
      expect(first).toBeEnabled()
      expect(second).toBeEnabled()
      expect(first).not.toHaveAttribute('aria-disabled')

      await userEvent.click(first)

      expect(selectAll).toHaveProperty('indeterminate', true)
      expect(selectAll).not.toBeChecked()
      const announced = screen
        .getAllByText('1 application selected')
        .find((element) => element.getAttribute('aria-live') === 'polite')
      expect(announced).toBeDefined()

      await userEvent.click(selectAll)
      expect(first).toBeChecked()
      expect(second).toBeChecked()
      expect(selectAll).toHaveProperty('indeterminate', false)
      expect(screen.getAllByText('2 applications selected').length).toBeGreaterThan(0)
    })

    it('replaces the toolbar with the batch actions bar and disables row actions while it is open', async () => {
      renderPage()
      await screen.findByText('1000123')
      const approveRow = screen.getByRole('button', { name: 'Approve application 1000123' })
      const disapproveRow = screen.getByRole('button', { name: 'Disapprove application 1000123' })
      expect(approveRow).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Approve selected applications' })).toBeNull()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 1000456' }))

      const batchApprove = screen.getByRole('button', { name: 'Approve' })
      expect(batchApprove.querySelector('svg')).not.toBeNull()
      expect(approveRow).toBeDisabled()
      expect(disapproveRow).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByRole('checkbox', { name: 'Select application 1000456' })).not.toBeChecked()
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
      expect(approveRow).toBeEnabled()
      expect(disapproveRow).toBeEnabled()
    })

    it('returns batch Cancel focus to the select-all checkbox without searching again', async () => {
      renderPage()
      await screen.findByText('1000123')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 1000123' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 1000456' }))
      expect(screen.getAllByText('2 applications selected').length).toBeGreaterThan(0)
      const searchCalls = mockedSearchApplicationReviews.mock.calls.length

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() =>
        expect(
          screen.getByRole('checkbox', { name: 'Select all rows on this page' }),
        ).toHaveFocus(),
      )
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
      expect(screen.getByRole('checkbox', { name: 'Select application 1000123' })).not.toBeChecked()
      expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(searchCalls)
    })

    it('names each row action and shows its icon after the label', async () => {
      renderPage()
      await screen.findByText('1000123')

      const approve = screen.getByRole('button', { name: 'Approve application 1000123' })
      const disapprove = screen.getByRole('button', { name: 'Disapprove application 1000123' })
      for (const button of [approve, disapprove]) {
        expect(button).toHaveClass('cds--btn--ghost')
        expect(button.lastElementChild?.tagName.toLowerCase()).toBe('svg')
      }
      expect(approve).toHaveTextContent('Approve')
      expect(disapprove).toHaveTextContent('Disapprove')
    })

    it('confirms a batch approval with the numbers as a bold list', async () => {
      mockedSearchApplicationReviews.mockResolvedValue(threeRowResponse)
      renderPage()
      await screen.findByText('2000001')

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 2000001' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 2000003' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

      const dialog = await screen.findByRole('dialog', { name: 'Approve applications' })
      expect(
        within(dialog).getByText('You are about to approve the following applications:'),
      ).toBeVisible()
      const list = within(dialog).getByRole('list', { name: 'Applications to approve' })
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.querySelector('strong')?.textContent),
      ).toEqual(['2000001', '2000003'])
      expect(within(dialog).queryByText(/selected/)).toBeNull()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('checkbox', { name: 'Select application 2000001' })).toBeChecked()
      expect(mockedApproveApplicationReview).not.toHaveBeenCalled()
    })

    it('approves selected applications one at a time and lists them as links', async () => {
      const layout = mockLaidOutElements()
      mockedSearchApplicationReviews.mockResolvedValue(threeRowResponse)
      renderPage()
      await screen.findByText('2000001')

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
      const dialog = await screen.findByRole('dialog', { name: 'Approve applications' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

      const banner = await waitFor(() => notice('3 applications approved.'))
      expect(mockedApproveApplicationReview.mock.calls.map(([number]) => number)).toEqual([
        '2000001',
        '2000002',
        '2000003',
      ])
      expect(mockedApproveApplicationReview).toHaveBeenNthCalledWith(
        2,
        '2000002',
        'application-2000002-version',
      )
      expect(within(banner).queryByRole('list')).toBeNull()
      expect(recordList(banner)).toBe('2000001, 2000002, 2000003')
      expect(within(banner).getByRole('link', { name: '2000002' })).toHaveAttribute(
        'href',
        expect.stringContaining('/provincial/application/2000002'),
      )
      await waitFor(() =>
        expect(document.activeElement).toHaveClass('provincial-review-results-notifications'),
      )
      expect(document.activeElement).toContainElement(banner)
      expect(
        screen.getByRole('checkbox', { name: 'Select all rows on this page' }),
      ).not.toBeChecked()
      layout.mockRestore()
    })

    it('clears the selection after a partial approval and lists each failure with its reason', async () => {
      mockedSearchApplicationReviews.mockResolvedValue(threeRowResponse)
      mockedApproveApplicationReview
        .mockResolvedValueOnce({
          updated: true,
          valid: true,
          statusCode: 'APP',
          clientEmail: '',
          remark: '',
          message: 'Application approved.',
        })
        .mockResolvedValueOnce({
          updated: false,
          valid: false,
          statusCode: 'APP',
          clientEmail: '',
          remark: '',
          message: 'Application owner location does not exist',
        })
      renderPage()
      await screen.findByText('2000001')

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 2000001' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 2000002' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
      const dialog = await screen.findByRole('dialog', { name: 'Approve applications' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

      const failed = await waitFor(() => notice('1 application was not approved'))
      expect(
        within(failed).getByText(
          'It stays in its current status. Correct the details below, then approve again.',
        ),
      ).toBeVisible()
      expect(
        within(failed)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['2000002: Application owner location does not exist.'])
      expect(within(failed).getByRole('link', { name: '2000002' })).toBeVisible()
      expect(notice('1 application approved.')).toBeVisible()
      expect(screen.getByRole('checkbox', { name: 'Select application 2000002' })).not.toBeChecked()
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Approve application 2000002' })).toBeEnabled()
    })

    it('keeps approval results through selection, paging and searching until they are closed', async () => {
      renderPage()
      await screen.findByText('1000123')
      await userEvent.click(screen.getByRole('button', { name: 'Approve application 1000123' }))
      const banner = await waitFor(() => notice('Application 1000123 approved.'))

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 1000456' }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: 'Search' }))
      await waitFor(() =>
        expect(mockedSearchApplicationReviews.mock.calls.length).toBeGreaterThan(2),
      )
      expect(banner).toBeInTheDocument()

      await userEvent.click(within(banner).getByRole('button', { name: /close/i }))
      expect(() => notice('Application 1000123 approved.')).toThrow()
    })
  })

  describe('approve on a row', () => {
    it('approves straight away and moves focus to Approve on the next row', async () => {
      mockedSearchApplicationReviews
        .mockResolvedValueOnce(threeRowResponse)
        .mockResolvedValue(pageOf([reviewRow('2000001'), reviewRow('2000003')]))
      renderPage()
      await screen.findByText('2000002')

      await userEvent.click(screen.getByRole('button', { name: 'Approve application 2000002' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      const banner = await waitFor(() => notice('Application 2000002 approved.'))
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith(
        '2000002',
        'application-2000002-version',
      )
      expect(within(banner).getByRole('link', { name: '2000002' })).toHaveAttribute(
        'href',
        expect.stringContaining('/provincial/application/2000002'),
      )
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Approve application 2000003' })).toHaveFocus(),
      )
      expect(
        screen
          .getAllByText('Application 2000002 approved.')
          .some((element) => element.getAttribute('aria-live') === 'polite'),
      ).toBe(true)
    })
  })

  describe('disapprove', () => {
    it('opens a Disapprove modal with Rejected or Withdrawn, a remark and the owner email', async () => {
      renderPage()
      await screen.findByText('1000123')

      const dialog = await openDisapprove('1000123')

      const status = within(dialog).getByRole('combobox', { name: 'Application status' })
      expect(status).toHaveValue('Rejected')
      expect(status).toHaveAttribute('aria-required', 'true')
      await userEvent.click(status)
      const listbox = document.getElementById(status.getAttribute('aria-controls') as string)
      expect(
        within(listbox as HTMLElement)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Rejected', 'Withdrawn'])
      await userEvent.keyboard('{Escape}')

      const remark = within(dialog).getByRole('textbox', { name: 'Remark' })
      expect(remark).toHaveAttribute('maxlength', '250')
      expect(within(dialog).getByText('Included in the email to the applicant.')).toBeVisible()
      expect(within(dialog).getByText('0/250')).toBeInTheDocument()

      const send = within(dialog).getByRole('checkbox', { name: 'Send disapproval email' })
      expect(send).toBeChecked()
      expect(
        within(dialog).getByText(
          'Disapproval emails go to the recipients below. At least one email address is needed.',
        ),
      ).toBeVisible()
      expect(await within(dialog).findByText('owner@example.com')).toBeVisible()
      expect(within(dialog).getByText('Owner email')).toBeVisible()
      expect(within(dialog).queryByText('Agent email')).toBeNull()
      expect(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      ).toBeEnabled()

      await userEvent.click(send)
      expect(within(dialog).queryByText(/Disapproval emails go to/)).toBeNull()
      expect(within(dialog).queryByText('owner@example.com')).toBeNull()
      expect(within(dialog).getByRole('button', { name: 'Disapprove application' })).toBeEnabled()
    })

    it('validates on the primary button and focuses the first error', async () => {
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('owner@example.com')

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      const remark = within(dialog).getByRole('textbox', { name: 'Remark' })
      expect(within(dialog).getByText('Remark is required')).toBeVisible()
      await waitFor(() => expect(remark).toHaveFocus())
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    })

    it('rejects with the email to the owner and the agent, then moves focus to the next row', async () => {
      mockedFetchApplicationSummarySnapshot.mockResolvedValue(agentSummary)
      mockedSearchApplicationReviews
        .mockResolvedValueOnce(reviewResponse)
        .mockResolvedValue(pageOf([reviewRow('1000456', { status: 'Pending' })]))
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')

      expect(await within(dialog).findByText('agent@example.com')).toBeVisible()
      expect(within(dialog).getByText('owner@example.com')).toBeVisible()
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      await waitFor(() =>
        expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('1000123', {
          statusCode: 'REJ',
          remark: 'Missing docs',
          clientEmailAddress: '',
          ownerEmail: 'owner@example.com',
          agentEmail: 'agent@example.com',
        }),
      )
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        { statusCode: 'REJ', remark: 'Missing docs', clientEmailAddress: '' },
        'application-1000123-version',
      )
      const banner = await waitFor(() => notice('Application 1000123 rejected.'))
      expect(
        within(banner).getByText(
          'Disapproval email sent to the owner (owner@example.com) and the agent (agent@example.com).',
        ),
      ).toBeVisible()
      expect(within(banner).getByRole('link', { name: '1000123' })).toBeVisible()
      expect(screen.queryByRole('dialog', { name: /Disapprove application/ })).toBeNull()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Approve application 1000456' })).toHaveFocus(),
      )
    })

    it('edits recipients for this email only and sends to the address that is left', async () => {
      mockedFetchApplicationSummarySnapshot.mockResolvedValue(agentSummary)
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('agent@example.com')

      await userEvent.click(within(dialog).getByRole('button', { name: 'Edit recipients' }))

      const owner = within(dialog).getByRole('textbox', { name: 'Owner email' })
      const agent = within(dialog).getByRole('textbox', { name: 'Agent email' })
      await waitFor(() => expect(owner).toHaveFocus())
      expect(within(dialog).getAllByText('Changes apply to this email only.')).toHaveLength(2)
      await userEvent.clear(agent)
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      await waitFor(() =>
        expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
          '1000123',
          expect.objectContaining({ ownerEmail: 'owner@example.com', agentEmail: '' }),
        ),
      )
      expect(
        await screen.findByText('Disapproval email sent to the owner (owner@example.com).'),
      ).toBeVisible()
    })

    it('needs at least one address and a correct format before saving', async () => {
      mockedFetchApplicationSummarySnapshot.mockResolvedValue(agentSummary)
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('agent@example.com')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Edit recipients' }))
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
      const owner = within(dialog).getByRole('textbox', { name: 'Owner email' })
      const agent = within(dialog).getByRole('textbox', { name: 'Agent email' })

      await userEvent.clear(owner)
      await userEvent.clear(agent)
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      expect(
        within(dialog).getByText(
          'Enter at least one email address, or clear Send disapproval email to notify the applicant another way.',
        ),
      ).toBeVisible()
      await waitFor(() => expect(owner).toHaveFocus())

      await userEvent.type(owner, 'owner@example')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )
      expect(
        within(dialog).getByText(
          'Enter an email address in the correct format, like name@example.com.',
        ),
      ).toBeVisible()
      expect(owner).toHaveAttribute('aria-invalid', 'true')
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    })

    it('opens a contact with no email on file as an input', async () => {
      mockedFetchApplicationClientData.mockResolvedValue(clientData('00012345', 'Not on file'))
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')

      const owner = await within(dialog).findByRole('textbox', { name: 'Owner email' })
      expect(owner).toHaveValue('')
      expect(
        within(dialog).getByText(
          'No email on file. The email you enter applies to this email only.',
        ),
      ).toBeVisible()
      expect(within(dialog).queryByRole('button', { name: 'Edit recipients' })).toBeNull()
    })

    it('withdraws without an email when Send disapproval email is cleared', async () => {
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')

      const status = within(dialog).getByRole('combobox', { name: 'Application status' })
      await userEvent.click(status)
      const listbox = document.getElementById(status.getAttribute('aria-controls') as string)
      await userEvent.click(
        within(listbox as HTMLElement).getByRole('option', { name: 'Withdrawn' }),
      )
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: 'Remark' }),
        'Withdrawn by client',
      )
      await userEvent.click(
        within(dialog).getByRole('checkbox', { name: 'Send disapproval email' }),
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Disapprove application' }))

      const banner = await waitFor(() => notice('Application 1000123 withdrawn.'))
      expect(within(banner).getByText('No disapproval email was sent.')).toBeVisible()
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        { statusCode: 'WDN', remark: 'Withdrawn by client', clientEmailAddress: '' },
        'application-1000123-version',
      )
      expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    })

    it('keeps the status saved and warns when the email could not be sent', async () => {
      mockedSendApplicationReviewStatusEmail.mockResolvedValueOnce({
        success: false,
        message: 'Application status email could not be prepared.',
      })
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('owner@example.com')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      const banner = await waitFor(() => notice('Application 1000123 rejected.'))
      expect(banner).toHaveClass('cds--actionable-notification--warning')
      expect(within(banner).getByText('The disapproval email could not be sent.')).toBeVisible()
    })

    it('warns that the email is unconfirmed when the send gets no answer', async () => {
      mockedSendApplicationReviewStatusEmail.mockRejectedValueOnce(new Error('Network Error'))
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('owner@example.com')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Missing docs')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      const banner = await waitFor(() => notice('Application 1000123 rejected.'))
      expect(
        within(banner).getByText(
          'The disapproval email status could not be confirmed. Check whether it was sent before sending it again.',
        ),
      ).toBeVisible()
    })

    it('keeps the modal open when Escape closes the status list', async () => {
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      const status = within(dialog).getByRole('combobox', { name: 'Application status' })

      await userEvent.click(status)
      expect(status).toHaveAttribute('aria-expanded', 'true')
      const escape = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 }
      fireEvent.keyDown(status, escape)

      expect(status).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('dialog', { name: 'Disapprove application 1000123' })).toBeVisible()
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve))
      })
      fireEvent.keyDown(status, escape)
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Disapprove application 1000123' })).toBeNull(),
      )
    })

    it('shows a failed save inside the modal and keeps the entries', async () => {
      let resolveUpdate!: (value: typeof statusSaved) => void
      mockedUpdateApplicationReviewStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUpdate = resolve
        }),
      )
      renderPage()
      await screen.findByText('1000123')
      const dialog = await openDisapprove('1000123')
      await within(dialog).findByText('owner@example.com')
      const remark = within(dialog).getByRole('textbox', { name: 'Remark' })
      await userEvent.type(remark, 'Draft reason')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      )

      expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()

      await act(async () =>
        resolveUpdate({
          ...statusSaved,
          updated: false,
          valid: false,
          message: 'Application is in use by another user.',
        }),
      )

      expect(
        await within(dialog).findByText('Application is in use by another user.'),
      ).toBeVisible()
      expect(within(dialog).getByText('Disapproval failed')).toBeVisible()
      expect(remark).toHaveValue('Draft reason')
      expect(
        within(dialog).getByRole('button', { name: 'Disapprove and send email' }),
      ).toBeEnabled()
      expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    })

    it('returns focus to Disapprove when the modal is cancelled', async () => {
      renderPage()
      await screen.findByText('1000123')
      const launcher = screen.getByRole('button', { name: 'Disapprove application 1000123' })
      const dialog = await openDisapprove('1000123')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Remark' }), 'Not sent')

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog', { name: 'Disapprove application 1000123' })).toBeNull()
      await waitFor(() => expect(launcher).toHaveFocus())
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    })
  })
})
