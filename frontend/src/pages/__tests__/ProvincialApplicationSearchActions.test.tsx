import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import ProvincialApplicationPage from '@/pages/ProvincialApplication'
import {
  countProvincialApplications,
  searchProvincialApplications,
} from '@/service/provincial-application-search-service'
import { fetchProvincialApplicationOptions } from '@/service/search-options-service'
import {
  fetchProvincialExemptionCreatePreview,
  submitProvincialExemptionCreate,
} from '@/service/create-submit-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  countProvincialApplications: vi.fn(),
  searchProvincialApplications: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  fetchProvincialExemptionCreatePreview: vi.fn(),
  submitProvincialExemptionCreate: vi.fn(),
}))

const mockedFetchExemptionCreatePreview = vi.mocked(fetchProvincialExemptionCreatePreview)
const mockedSubmitExemptionCreate = vi.mocked(submitProvincialExemptionCreate)
const exemptionPreview = (applicationNumbers: string[]) => ({
  exemptionTypeCode: 'M',
  exemptionStatusCode: 'NEW',
  approvedVolume: '150.0',
  expiryDate: '2027-03-31',
  applicationNumbers,
})

vi.mock('@/components/ForestClientComboBox', () => ({
  default: ({
    id,
    labelText,
    value,
    onChange,
  }: {
    id: string
    labelText: string
    value: string
    onChange: (value: string) => void
  }) => (
    <div>
      <label htmlFor={id}>{labelText}</label>
      <input id={id} readOnly value={value} />
      <button
        type="button"
        onClick={() => onChange(labelText.startsWith('Owner') ? '00054321' : '00012345')}
      >
        Select {labelText}
      </button>
    </div>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedCountProvincialApplications = vi.mocked(countProvincialApplications)
const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)

const LocationSearch = () => <span data-testid="location-search">{useLocation().search}</span>

const appliedSearch = () => screen.getByTestId('location-search').textContent ?? ''

const renderPage = (
  path = '/provincial/application?region=11&page=1&pageSize=10&sortField=applicationNumber&sortDirection=desc',
) => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/provincial/application"
          element={
            <>
              <ProvincialApplicationPage />
              <LocationSearch />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const searchRowsWithMixedEligibility = [
  {
    applicationNumber: '321',
    status: 'NEW',
    applicantClientNumber: '11111111',
    ownerClientNumber: '22222222',
    agentClientNumber: '11111111',
    region: '11',
    applicationVolume: 100,
    exemptionNumber: '',
    listingDate: '2026-01-10',
    packageNumber: 'PKG-1',
    exemptionType: 'FEE',
    productTypeCode: 'LOG',
    locked: false,
    allowCreateExemption: true,
  },
  {
    applicationNumber: '654',
    status: 'PER',
    applicantClientNumber: '11111111',
    ownerClientNumber: '22222222',
    agentClientNumber: '11111111',
    region: '12',
    applicationVolume: 50,
    exemptionNumber: 'EX-9',
    listingDate: '2026-01-11',
    packageNumber: 'PKG-2',
    exemptionType: 'APP',
    productTypeCode: 'LUM',
    locked: true,
    allowCreateExemption: false,
  },
]

// The batch bar's summary, apart from the live region that announces the same count.
const batchSummary = () => document.querySelector('.cds--batch-summary__para')
// The create exemption error, which Carbon text inputs' empty alert regions sit beside.
const exemptionError = () =>
  screen.getByText('Exemption not created').closest('[role="alert"]') as HTMLElement

describe('Provincial Application Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === '/createExemption' ||
          action === 'createApplication' ||
          action === 'uploadApplicationSubmission',
      }),
    )
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [
        { value: 'NULL', label: 'None' },
        { value: 'FEE', label: 'Fee in Lieu' },
      ],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [],
    })
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility,
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })
  })

  it('shows application result list dates in words', async () => {
    renderPage()
    const application = await screen.findByText('321')
    const row = within(application.closest('tr') as HTMLElement)
    expect(row.getByRole('cell', { name: 'Jan 10, 2026' })).toBeVisible()
    expect(row.queryByRole('cell', { name: '2026-01-10' })).not.toBeInTheDocument()
  })

  it('submits and restores None as literal NULL', async () => {
    const page = renderPage()
    await screen.findByText('321')
    expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalledWith(true)

    const exemptionType = screen.getByRole('combobox', { name: 'Exemption type' })
    expect(exemptionType).toHaveValue('All')
    await userEvent.click(exemptionType)
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ exemptionType: 'NULL' }) }),
        expect.any(Object),
      )
    })
    const search = appliedSearch()
    expect(new URLSearchParams(search).get('exemptionType')).toBe('NULL')

    page.unmount()
    mockedSearchProvincialApplications.mockClear()
    renderPage(`/provincial/application${search}`)
    await screen.findByText('321')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('None')
  })

  it('opens from the menu with filters only, even after an earlier search', async () => {
    const page = renderPage()
    await screen.findByText('321')
    page.unmount()
    mockedSearchProvincialApplications.mockClear()

    renderPage('/provincial/application')

    expect(await screen.findByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.queryByText('321')).not.toBeInTheDocument()
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(appliedSearch()).toBe('')
    // Arriving with nothing focused, as after Cancel on Create application, focus starts on the title.
    expect(screen.getByRole('heading', { level: 1, name: 'Application search' })).toHaveFocus()
  })

  it('clears a restored None filter to All and submits an unfiltered search', async () => {
    // A complete query makes Search refresh results instead of normalizing the URL.
    renderPage(
      '/provincial/application?exemptionType=NULL&region=11&sortField=applicationNumber&sortDirection=desc&page=1&pageSize=10',
    )
    await screen.findByText('321')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('None')

    mockedSearchProvincialApplications.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ exemptionType: 'NULL' }) }),
        expect.any(Object),
      )
    })

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('All')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveAttribute(
      'placeholder',
      'All',
    )
    expect(new URLSearchParams(appliedSearch()).has('exemptionType')).toBe(false)
    mockedSearchProvincialApplications.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ exemptionType: '' }) }),
        expect.any(Object),
      )
    })
  })

  it('displays the pending exemption status supplied by the backend', async () => {
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: [
        {
          ...searchRowsWithMixedEligibility[1],
          applicationNumber: '108826',
          status: 'Exempted - New',
          exemptionNumber: '20-8562',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()

    expect(await screen.findByText('Exempted - New')).toBeVisible()
  })

  it('shows grey header bars for the result columns only on the loading skeleton', async () => {
    mockedSearchProvincialApplications.mockReturnValue(new Promise(() => {}))

    renderPage()

    const skeleton = await screen.findByRole('table', { name: 'Searching' })
    const headers = Array.from(skeleton.querySelectorAll('thead th'))
    // Application number, Status, both client numbers, volume, exemption, List date and Region.
    expect(headers).toHaveLength(8)
    headers.forEach((header) => expect(header.textContent).toBe(''))
    expect(skeleton.querySelector('tbody tr')?.querySelectorAll('td')).toHaveLength(8)
  })

  it('shows the Figma result columns with the recorded agent', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicantClientNumber: '',
          agentClientNumber: '33333333',
        },
      ],
      page: { number: 0, size: 10, totalElements: 1, totalPages: 1 },
    })

    renderPage()
    await screen.findByText('321')

    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) =>
          (header.querySelector('.cds--table-header-label') ?? header).textContent?.trim(),
        ),
    ).toEqual([
      'Select all eligible rows on this page',
      'Application number',
      'Status',
      'Owner client number',
      'Agent client number',
      'Application volume (m³)',
      'Exemption number',
      'List date',
      'Region',
    ])
    const row = screen.getByText('321').closest('tr') as HTMLElement
    expect(within(row).getByText('33333333')).toBeInTheDocument()
  })

  it('only allows selecting eligible rows and creates the exemption after confirmation', async () => {
    renderPage()
    await screen.findByText('321')

    expect(
      screen.queryByRole('button', {
        name: 'Create exemption',
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).not.toHaveAttribute(
      'aria-disabled',
    )
    const ineligibleCheckbox = screen.getByRole('checkbox', { name: 'Select application 654' })
    expect(ineligibleCheckbox).toHaveAttribute('aria-disabled', 'true')
    expect(ineligibleCheckbox).toHaveAccessibleDescription(
      expect.stringContaining('This application already has an exemption.'),
    )
    expect(
      screen.queryByRole('link', { name: 'Upload Application Submission' }),
    ).not.toBeInTheDocument()
    const createApplicationAction = screen.getByRole('link', { name: 'Create application' })
    expect(createApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(createApplicationAction).toHaveClass('cds--btn--tertiary')
    expect(createApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()

    expect(
      screen.getAllByText('This application already has an exemption.').length,
    ).toBeGreaterThan(0)

    // jsdom flips a cancelled checkbox click instead of restoring it, so assert the
    // cancelled click and the unchanged selection rather than the DOM checked state.
    expect(fireEvent.click(ineligibleCheckbox)).toBe(false)
    expect(screen.queryByText('1 application selected')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    expect(batchSummary()).toHaveTextContent('1 application selected')
    expect(screen.getByRole('button', { name: 'Create exemption' })).toBeEnabled()
    expect(fireEvent.click(ineligibleCheckbox)).toBe(false)
    expect(batchSummary()).toHaveTextContent('1 application selected')

    mockedFetchExemptionCreatePreview.mockResolvedValueOnce(exemptionPreview(['321']))
    mockedSubmitExemptionCreate.mockResolvedValueOnce({
      success: true,
      message: '',
      createdId: '26-9001',
      errors: [],
      warnings: [],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))

    // Figma 3474:66267: confirm the applications before the exemption is created.
    const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
    expect(confirmation).toHaveTextContent(
      'You are about to create a new exemption with the following applications:',
    )
    expect(within(confirmation).getByRole('listitem')).toHaveTextContent('321')
    expect(confirmation).toHaveTextContent('This action cannot be undone.')
    expect(mockedFetchExemptionCreatePreview).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/26-9001', {
        state: {
          exemptionCreationNotice: { exemptionNumber: '26-9001', applicationNumbers: ['321'] },
          returnTo: {
            label: 'Application search',
            to: expect.stringMatching(/^\/provincial\/application\?.*region=11/),
          },
        },
      }),
    )
    expect(mockedFetchExemptionCreatePreview).toHaveBeenCalledWith(['321'])
    expect(mockedSubmitExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '321',
      linkedApplicationNumbers: ['321'],
      exemptionNumber: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvalDate: '',
      expiryDate: '2027-03-31',
      approvedVolume: '150.0',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
  })

  it.each([
    {
      failure: 'a rejected preview',
      arrange: () =>
        mockedFetchExemptionCreatePreview.mockRejectedValueOnce(
          new Error('Application 321 is not eligible for an exemption.'),
        ),
      serverText: 'Application 321 is not eligible for an exemption.',
    },
    {
      failure: 'an unknown create outcome',
      arrange: () => {
        mockedFetchExemptionCreatePreview.mockResolvedValueOnce(exemptionPreview(['321']))
        mockedSubmitExemptionCreate.mockResolvedValueOnce({
          success: false,
          message: 'Exemption submission failed.',
          createdId: undefined,
          errors: ['ORA-20001: unexpected'],
          warnings: [],
          outcomeUnknown: true,
        })
      },
      serverText: 'ORA-20001: unexpected',
    },
  ])(
    'closes the confirmation and shows the generic error above the results after $failure',
    async ({ arrange, serverText }) => {
      arrange()
      renderPage()
      await screen.findByText('321')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
      const createExemption = screen.getByRole('button', { name: 'Create exemption' })
      await userEvent.click(createExemption)
      const searchCalls = mockedSearchProvincialApplications.mock.calls.length
      const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Create new exemption' }),
        ).not.toBeInTheDocument(),
      )
      const alert = exemptionError()
      expect(alert).toHaveAttribute('role', 'alert')
      expect(alert).toHaveTextContent(
        'The exemption could not be created. Please try again. If the problem persists, contact support.',
      )
      expect(screen.queryByText(serverText)).not.toBeInTheDocument()
      expect(alert.closest('form')).toBeNull()
      expect(
        alert.compareDocumentPosition(screen.getByRole('region', { name: 'Search results' })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toBeChecked()
      expect(batchSummary()).toHaveTextContent('1 application selected')
      await waitFor(() => expect(createExemption).toHaveFocus())
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(searchCalls)
      expect(mockNavigate).not.toHaveBeenCalled()

      // The error closes when the selection changes.
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
      expect(screen.queryByText('Exemption not created')).not.toBeInTheDocument()
    },
  )

  it.each([
    {
      applicationNumber: '777',
      locked: true,
      expected: 'This application is currently locked and cannot be selected.',
    },
    {
      applicationNumber: '888',
      locked: false,
      expected:
        'Eligible applications must be approved, have no existing exemption or active valid offer, and not have a future listing date unless they are standing timber.',
    },
  ])('explains why application $applicationNumber cannot be selected', async (rowState) => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicationNumber: rowState.applicationNumber,
          exemptionNumber: '',
          locked: rowState.locked,
          allowCreateExemption: false,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText(rowState.applicationNumber)

    const checkbox = screen.getByRole('checkbox', {
      name: `Select application ${rowState.applicationNumber}`,
    })
    expect(checkbox).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox).toHaveAccessibleDescription(expect.stringContaining(rowState.expected))
    expect(screen.getAllByText(rowState.expected).length).toBeGreaterThan(0)
    expect(checkbox).not.toBeChecked()
    // jsdom flips a cancelled checkbox click instead of restoring it, so assert the
    // cancelled click and the unchanged selection rather than the DOM checked state.
    expect(fireEvent.click(checkbox)).toBe(false)
    expect(screen.queryByText('1 application selected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create exemption' })).not.toBeInTheDocument()
  })

  it('paints application rows before the exact result count is available', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...searchRowsWithMixedEligibility[0],
      applicationNumber: String(8000 + index),
      packageNumber: `PKG-${index + 1}`,
    }))
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: rows,
      page: {
        number: 0,
        size: 10,
        totalElements: 11,
        totalPages: 2,
      },
    })
    let resolveCount!: (total: number) => void
    mockedCountProvincialApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCount = resolve
      }),
    )

    renderPage()

    await waitFor(() => expect(mockedCountProvincialApplications).toHaveBeenCalledOnce())
    expect(await screen.findByText('8000')).toBeInTheDocument()
    expect(screen.getAllByRole('status', { name: 'Counting search results' })).toHaveLength(1)
    expect(screen.queryByText(/counting/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Searching')).not.toBeInTheDocument()

    await act(async () => {
      resolveCount(125)
    })

    expect(await screen.findAllByText('125 applications found')).toHaveLength(1)
    expect(screen.getByText('1–10 of 125 items')).toBeInTheDocument()
    expect(screen.getByText('8000')).toBeInTheDocument()
  })

  it('keeps application rows and marks the exact count unavailable when counting fails', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...searchRowsWithMixedEligibility[0],
      applicationNumber: String(8100 + index),
      packageNumber: `PKG-${index + 1}`,
    }))
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: rows,
      page: { number: 0, size: 10, totalElements: 11, totalPages: 2 },
    })
    mockedCountProvincialApplications.mockRejectedValueOnce(new Error('count unavailable'))

    renderPage()

    expect(await screen.findByText('8100')).toBeInTheDocument()
    expect(
      await screen.findAllByText('At least 10 applications found — exact count unavailable'),
    ).toHaveLength(1)
    expect(screen.getByText('8100')).toBeInTheDocument()
  })

  it('creates one exemption from every selected eligible application', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('321')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 654' }))
    mockedFetchExemptionCreatePreview.mockResolvedValueOnce(exemptionPreview(['321', '654']))
    mockedSubmitExemptionCreate.mockResolvedValueOnce({
      success: true,
      message: '',
      createdId: '26-9002',
      errors: [],
      warnings: [],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))

    const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
    expect(
      within(confirmation)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['321', '654'])
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

    await waitFor(() =>
      expect(mockedFetchExemptionCreatePreview).toHaveBeenCalledWith(['321', '654']),
    )
    expect(mockedSubmitExemptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ linkedApplicationNumbers: ['321', '654'] }),
    )
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/provincial/exemption/26-9002',
        expect.objectContaining({
          state: expect.objectContaining({
            exemptionCreationNotice: {
              exemptionNumber: '26-9002',
              applicationNumbers: ['321', '654'],
            },
          }),
        }),
      ),
    )
  })

  it('keeps authoritative filters disabled with a persistent warning when options fail', async () => {
    mockedFetchProvincialApplicationOptions.mockRejectedValueOnce(new Error('private failure'))

    renderPage()

    expect(await screen.findByText('Options unavailable')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Application status' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Product type' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Region/ })).toBeDisabled()
    expect(screen.getByLabelText('Application number')).toBeEnabled()
    expect(
      screen.getByText('Options unavailable').closest('[role="status"]')?.querySelector('button'),
    ).toBeNull()
  })

  it('explains why the select-all checkbox is disabled when this page has no eligible rows', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[1],
          allowCreateExemption: false,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('654')

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all eligible rows on this page',
    })
    expect(selectAllCheckbox).toBeDisabled()

    const selectAllTooltipTrigger = selectAllCheckbox.closest(
      '.disabled-button-tooltip',
    ) as HTMLElement
    expect(selectAllTooltipTrigger).toBeTruthy()

    await userEvent.hover(selectAllTooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No eligible applications are available on this page.',
    )
  })

  it('groups legacy application criteria and modern date ranges in reading order', async () => {
    renderPage()
    await screen.findByText('321')

    const filterGrid = document.querySelector('.provincial-application-search-grid')
    expect(filterGrid).toBeTruthy()
    const fieldLabels = Array.from(
      (filterGrid as HTMLElement).querySelectorAll('label, .cds--label'),
    ).map((field) => field?.textContent?.replace(/Total items selected:.*/, '').trim())

    expect(fieldLabels).toEqual([
      'Application number',
      'Package number',
      'Exemption number',
      'Region',
      'List date from',
      'List date to',
      'Exemption type',
      'Application status',
      'Owner client',
      'Agent client',
      'Product type',
    ])
  })

  it('clears URL-backed filters and removes results without searching again', async () => {
    // Figma has no received-date filter, so an old link's received dates are ignored.
    renderPage(
      '/provincial/application?receivedFromDate=2026-01-01&listingFromDate=2026-01-01&listingToDate=2026-01-31&region=11',
    )
    await screen.findByText('321')

    expect(screen.queryByLabelText('Received from date')).not.toBeInTheDocument()
    expect(screen.getByLabelText('List date from')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-31')
    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          receivedFromDate: '',
          listingFromDate: '2026-01-01',
          listingToDate: '2026-01-31',
        }),
      }),
      expect.any(Object),
    )
    const resultsTable = screen.getByRole('region', { name: 'Search results table' })
    const searchCallsBeforeClear = mockedSearchProvincialApplications.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(screen.getByLabelText('List date from')).toHaveValue('')
    expect(screen.getByLabelText('List date to')).toHaveValue('')
    await waitFor(() => {
      expect(resultsTable).not.toBeVisible()
    })
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(searchCallsBeforeClear)
  })

  it('keeps search enabled for an invalid list date and focuses it instead of searching', async () => {
    renderPage()
    await screen.findByText('321')
    const callsBeforeEdit = mockedSearchProvincialApplications.mock.calls.length

    const searchButton = screen.getByRole('button', { name: 'Search' })
    const listDateFrom = screen.getByLabelText('List date from')
    fireEvent.change(listDateFrom, { target: { value: '2026-02-30' } })
    fireEvent.blur(listDateFrom)
    expect(screen.getByText('Date must be YYYY-MM-DD')).toBeVisible()

    await userEvent.click(searchButton)
    expect(searchButton).toBeEnabled()
    expect(listDateFrom).toHaveAttribute('aria-invalid', 'true')
    expect(listDateFrom).toHaveFocus()

    await userEvent.type(screen.getByLabelText('Application number'), '{Enter}')
    expect(listDateFrom).toHaveFocus()
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(callsBeforeEdit)
  })

  it('hides staff client filters and exemption actions but shows the agent for an industry session', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: () => false,
        capabilities: createTestCapabilities({ roles: ['PROVINCIAL_SUBMITTER_00012345'] }),
      }),
    )

    renderPage()
    await screen.findByText('321')

    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Owner client')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create exemption' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select all eligible rows on this page' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select application 321' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Owner client number' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent client number' })).toBeInTheDocument()
    const row = screen.getByText('321').closest('tr') as HTMLElement
    expect(within(row).getByText('11111111')).toBeInTheDocument()
  })

  it('shows a restored submitter search as loading, not as zero results, until it runs', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: () => false,
        capabilities: createTestCapabilities({ roles: ['PROVINCIAL_SUBMITTER_00012345'] }),
      }),
    )
    let resolveOptions: (
      options: Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>,
    ) => void = () => undefined
    mockedFetchProvincialApplicationOptions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOptions = resolve
      }),
    )
    renderPage(
      '/provincial/application?page=1&pageSize=10&sortField=applicationNumber&sortDirection=desc',
    )

    expect(await screen.findByText('Searching')).toBeInTheDocument()
    expect(screen.queryByText('0 applications found')).not.toBeInTheDocument()
    expect(screen.queryByText('No results found')).not.toBeInTheDocument()
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await act(async () => {
      resolveOptions({
        exemptionTypes: [],
        exemptionReasons: [],
        applicationStatuses: [],
        productTypes: [],
        growthTypes: [],
        regions: [{ value: '11', label: 'Cariboo' }],
        currentSchedules: [],
      })
    })
    expect(await screen.findByText('321')).toBeInTheDocument()
  })

  it('uses independent canonical owner and agent client selections in the search request', async () => {
    renderPage('/provincial/application')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Select Agent client' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select Owner client' }))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) =>
            request.filters.agentClientNumber === '00012345' &&
            request.filters.applicantClientNumber === '' &&
            request.filters.ownerClientNumber === '00054321',
        ),
      ).toBe(true)
    })
  })

  it('keeps a restored Applicant criterion separate from Agent and removable from the URL', async () => {
    renderPage('/provincial/application?applicantClientNumber=00011111&agentClientNumber=00022222')
    await screen.findByText('321')
    expect(screen.getByText('Applicant client: 00011111')).toBeVisible()
    expect(screen.getByLabelText('Agent client')).toHaveValue('00022222')
    expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          applicantClientNumber: '00011111',
          agentClientNumber: '00022222',
        }),
      }),
      expect.any(Object),
    )

    mockedSearchProvincialApplications.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Remove applicant client filter' }))
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Agent client')).toHaveValue('00022222')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicantClientNumber: '',
            agentClientNumber: '00022222',
          }),
        }),
        expect.any(Object),
      ),
    )
  })

  it('renders readable results with the count in the toolbar and the pagination', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: '321' })
    const row = within(link.closest('tr')!)
    expect(screen.getByRole('heading', { name: 'Application search' })).toBeVisible()
    expect(screen.getByText('Find applications and check their status')).toBeVisible()
    expect(row.getByText('New')).toBeVisible()
    expect(row.getByText('100.0')).toBeVisible()
    expect(row.getByText('Jan 10, 2026')).toBeVisible()
    expect(screen.getByText('Application volume (m³)')).toBeVisible()
    // The count shows once in the toolbar and once in the pagination below the table.
    expect(screen.getAllByText('2 applications found')).toHaveLength(1)
    expect(screen.getByText('1–2 of 2 items')).toBeVisible()
    expect(document.querySelector('.legacy-search-result-count--footer')).toBeNull()
    // Only the count is announced; the rows aren't read out after each search.
    expect(link.closest('tbody')).toHaveAttribute('aria-live', 'off')
  })

  it('restores and submits independently optional list-date bounds from a range control', async () => {
    renderPage('/provincial/application?listingToDate=2026-01-31')
    await screen.findByText('321')
    await waitFor(() => expect(screen.getByLabelText('List date from')).toHaveValue(''))
    expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-31')
    fireEvent.change(screen.getByLabelText('List date from'), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            listingFromDate: '2026-01-01',
            listingToDate: '2026-01-31',
          }),
        }),
        expect.any(Object),
      ),
    )
  })

  it('renders legacy non-sortable application result headers as plain text', async () => {
    renderPage()
    await screen.findByText('321')

    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Application volume (m³)' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['Owner client number', 'displayOwnerClientNumber'],
    ['Agent client number', 'agentClientNumber'],
    ['Exemption number', 'exemptionNumber'],
    ['List date', 'listingDate'],
    ['Region', 'regionCode'],
  ] as const)('dispatches the legacy %s sort key', async (header, expectedSortField) => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    await userEvent.click(screen.getByRole('button', { name: header }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) => request.sortField === expectedSortField && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('toggles the default application sort to ascending', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Application number' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) =>
            request.sortField === 'applicationNumber' && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it.each(['List date', 'Next page'])(
    'returns focus to the %s control after the search reloads',
    async (controlName) => {
      const rows = Array.from({ length: 10 }, (_, index) => ({
        ...searchRowsWithMixedEligibility[0],
        applicationNumber: String(8000 + index),
      }))
      const initialResponse = {
        content: rows,
        page: { number: 0, size: 10, totalElements: 30, totalPages: 3 },
      }
      let finishSearch!: (response: typeof initialResponse) => void
      const pendingSearch = new Promise<typeof initialResponse>((resolve) => {
        finishSearch = resolve
      })
      mockedCountProvincialApplications.mockResolvedValue(30)
      mockedSearchProvincialApplications.mockImplementation((request) =>
        request.page === 0 && request.sortField === 'applicationNumber'
          ? Promise.resolve(initialResponse)
          : pendingSearch,
      )
      renderPage()
      await screen.findByText('8000')
      const control = await screen.findByRole('button', { name: controlName })
      act(() => control.focus())
      await userEvent.keyboard('{Enter}')

      await screen.findByRole('table', { name: 'Searching' })
      expect(control).not.toBeInTheDocument()
      expect(document.body).toHaveFocus()
      await act(async () => {
        finishSearch({
          content: rows.map((row, index) => ({ ...row, applicationNumber: String(9000 + index) })),
          page: { ...initialResponse.page, number: controlName === 'Next page' ? 1 : 0 },
        })
      })

      expect(await screen.findByText('9000')).toBeVisible()
      await waitFor(() => expect(screen.getByRole('button', { name: controlName })).toHaveFocus())
    },
  )

  it('keeps the selection and focus when selected rows have a different owner or agent', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          allowCreateExemption: true,
          applicantClientNumber: '11111111',
        },
        {
          ...searchRowsWithMixedEligibility[1],
          allowCreateExemption: true,
          applicantClientNumber: '33333333',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('321')

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select all eligible rows on this page' }),
    )
    const createExemption = screen.getByRole('button', { name: 'Create exemption' })
    await userEvent.click(createExemption)

    await screen.findByText('Exemption not created')
    const alert = exemptionError()
    expect(alert).toHaveTextContent(
      'The selected applications must have the same owner and agent. Change your selection and try again.',
    )
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument()
    // The error sits above the results, outside the filters.
    expect(alert.closest('form')).toBeNull()
    expect(
      alert.compareDocumentPosition(screen.getByRole('region', { name: 'Search results' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Create new exemption' })).not.toBeInTheDocument()
    expect(mockedFetchExemptionCreatePreview).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select application 654' })).toBeChecked()
    expect(batchSummary()).toHaveTextContent('2 applications selected')
    expect(createExemption).toHaveFocus()
  })

  it.each([
    {
      serverMessage: 'Application 321 is already assigned to exemption 26-8849.',
      expected:
        'Application 321 is already in exemption 26-8849. Remove it from your selection and try again.',
      refreshes: true,
    },
    {
      serverMessage: 'Application 321 has valid offers and cannot be added to an exemption.',
      expected:
        "Application 321 has a valid offer, so it can't be exempted. Remove it from your selection and try again.",
      refreshes: true,
    },
    {
      serverMessage: 'Application 321 listing date has not passed.',
      expected:
        "Application 321 can't be exempted until its list date has passed. Remove it from your selection and try again.",
      refreshes: false,
    },
    {
      serverMessage:
        'Application 321 cannot be added to this exemption because its owner or agent client details do not match the other applications.',
      expected:
        'The selected applications must have the same owner and agent. Change your selection and try again.',
      refreshes: false,
    },
    {
      serverMessage: 'Insufficient privileges to add application 321.',
      expected: "You don't have permission to create this exemption.",
      refreshes: false,
    },
  ])(
    'closes the confirmation and explains "$serverMessage" above the results',
    async ({ serverMessage, expected, refreshes }) => {
      mockedFetchExemptionCreatePreview.mockRejectedValueOnce(new Error(serverMessage))
      renderPage()
      await screen.findByText('321')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
      const createExemption = screen.getByRole('button', { name: 'Create exemption' })
      await userEvent.click(createExemption)
      const searchCalls = mockedSearchProvincialApplications.mock.calls.length
      const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Create new exemption' }),
        ).not.toBeInTheDocument(),
      )
      const alert = exemptionError()
      expect(alert).toHaveTextContent(expected)
      expect(screen.queryByText(serverMessage)).not.toBeInTheDocument()
      expect(alert.closest('form')).toBeNull()
      expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toBeChecked()
      expect(batchSummary()).toHaveTextContent('1 application selected')
      await waitFor(() => expect(createExemption).toHaveFocus())
      // A record that changed after the search is refreshed so its row shows its current state.
      await waitFor(() =>
        expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(
          searchCalls + (refreshes ? 1 : 0),
        ),
      )
      expect(exemptionError()).toHaveTextContent(expected)
      expect(batchSummary()).toHaveTextContent('1 application selected')
      expect(mockedSubmitExemptionCreate).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    },
  )

  it('refreshes the results when a selected application is no longer approved', async () => {
    renderPage()
    await screen.findByText('321')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    const searchCalls = mockedSearchProvincialApplications.mock.calls.length
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        { ...searchRowsWithMixedEligibility[0], status: 'PND', allowCreateExemption: false },
        searchRowsWithMixedEligibility[1],
      ],
      page: { number: 0, size: 10, totalElements: 2, totalPages: 1 },
    })
    mockedFetchExemptionCreatePreview.mockResolvedValueOnce(exemptionPreview(['321']))
    mockedSubmitExemptionCreate.mockResolvedValueOnce({
      success: false,
      message: '',
      createdId: undefined,
      errors: ['Application 321 must have a status of approved.'],
      warnings: [],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))
    const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

    await screen.findByText('Exemption not created')
    expect(exemptionError()).toHaveTextContent(
      'Application 321 is no longer Approved. Its current status now shows in the results.',
    )
    expect(screen.queryByRole('dialog', { name: 'Create new exemption' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mockedSearchProvincialApplications.mock.calls.length).toBeGreaterThan(searchCalls),
    )
    expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 0,
        pageSize: 10,
        sortField: 'applicationNumber',
        sortDirection: 'desc',
        filters: expect.objectContaining({ region: ['11'] }),
      }),
      expect.any(Object),
    )
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(exemptionError()).toHaveTextContent(
      'Application 321 is no longer Approved. Its current status now shows in the results.',
    )
    expect(batchSummary()).toHaveTextContent('1 application selected')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows the select-all checkbox as partly selected when some eligible rows are selected', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: { number: 0, size: 10, totalElements: 2, totalPages: 1 },
    })
    renderPage()
    await screen.findByText('321')
    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all eligible rows on this page',
    })
    expect(selectAll).not.toBePartiallyChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    expect(selectAll).toBePartiallyChecked()
    expect(selectAll).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 654' }))
    expect(selectAll).not.toBePartiallyChecked()
    expect(selectAll).toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 654' }))
    expect(selectAll).toBePartiallyChecked()
    await userEvent.click(selectAll)
    expect(selectAll).toBeChecked()
    expect(batchSummary()).toHaveTextContent('2 applications selected')
  })

  it('announces the selected count without moving focus', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: { number: 0, size: 10, totalElements: 2, totalPages: 1 },
    })
    renderPage()
    await screen.findByText('321')
    const results = screen.getByRole('region', { name: 'Search results' })
    const announcement = results.querySelector('.cds--visually-hidden[aria-live="polite"]')
    expect(announcement).toBeEmptyDOMElement()
    expect(announcement?.closest('.cds--batch-actions')).toBeNull()

    const first = screen.getByRole('checkbox', { name: 'Select application 321' })
    await userEvent.click(first)
    expect(announcement).toHaveTextContent('1 application selected')
    expect(first).toHaveFocus()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 654' }))
    expect(announcement).toHaveTextContent('2 applications selected')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(announcement).toBeEmptyDOMElement()
  })

  it('returns batch Cancel focus to the select-all checkbox without searching again', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: { number: 0, size: 10, totalElements: 2, totalPages: 1 },
    })
    renderPage()
    await screen.findByText('321')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 654' }))
    expect(batchSummary()).toHaveTextContent('2 applications selected')
    const searchCalls = mockedSearchProvincialApplications.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Select all eligible rows on this page' }),
      ).toHaveFocus(),
    )
    expect(batchSummary()).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).not.toBeChecked()
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(searchCalls)
  })

  it('moves batch Cancel focus to the results when the select-all checkbox is unavailable', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: { number: 0, size: 10, totalElements: 2, totalPages: 1 },
    })
    const { container } = renderPage()
    await screen.findByText('321')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all eligible rows on this page',
    })
    selectAll.setAttribute('disabled', '')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(container.querySelector('.legacy-search-table-frame')).toHaveFocus())
  })

  it('shows only the empty state when a search finds no applications', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [],
      page: { number: 0, size: 10, totalElements: 0, totalPages: 0 },
    })
    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'No results found' })).toBeVisible()
    expect(container.querySelector('.legacy-search-table-toolbar')).toHaveClass(
      'cds--visually-hidden',
    )
    expect(container.querySelector('.legacy-search-result-count--footer')).toBeNull()
    expect(container.querySelector('.cds--pagination')).toBeNull()
    expect(screen.queryByText('Items per page:')).not.toBeInTheDocument()
  })

  it('clears selected rows when filters change', async () => {
    renderPage()
    await screen.findByText('321')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    expect(screen.getByRole('button', { name: 'Create exemption' })).toBeEnabled()

    mockedSearchProvincialApplications.mockClear()
    await userEvent.type(screen.getByLabelText('Application number'), '9')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create exemption' })).not.toBeInTheDocument()
    })
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicationNumber: '9',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('leaves regions unfiltered without searching when no search has been applied', async () => {
    renderPage('/provincial/application')
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalledOnce()
    })

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    const createApplicationAction = screen.getByRole('link', { name: 'Create application' })
    expect(createApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(createApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()
    const resultsTable = screen.getByRole('region', { name: 'Search results table', hidden: true })
    expect(resultsTable.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(resultsTable).not.toBeVisible()
  })

  it('uses the saved region to preselect application search areas', async () => {
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RCO',
      preferenceLoading: false,
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1909', label: 'South Coast' },
        { value: '1910', label: 'West Coast' },
      ],
      currentSchedules: [],
    })

    renderPage('/provincial/application')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1909', '1910'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('ignores an export schedule in a saved link', async () => {
    renderPage('/provincial/application?exportScheduleId=1002&region=11')
    await screen.findByText('321')

    expect(screen.queryByText(/export schedule/i)).not.toBeInTheDocument()
    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.not.objectContaining({ exportScheduleId: expect.anything() }),
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )
  })

  it('waits for explicit submission while filters are typed', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['9', '98', '987']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicationNumber: '987',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('submits date filter changes explicitly', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    const listDateFrom = screen.getByLabelText('List date from')
    fireEvent.change(listDateFrom, { target: { value: '2026-07-24' } })
    fireEvent.blur(listDateFrom)

    await waitFor(() => expect(listDateFrom).toHaveValue('2026-07-24'))
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()
    expect(searchButton).toHaveAttribute('type', 'submit')
    expect(searchButton.closest('form')).toBeValid()
    await userEvent.click(searchButton)

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ listingFromDate: '2026-07-24' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('sends selected region org unit numbers to the application search request', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'FEE', label: 'Fee in Lieu' }],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [{ value: '1818', label: 'TST' }],
      currentSchedules: [],
    })

    renderPage('/provincial/application?region=1818')

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            region: ['1818'],
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('shows selected application search regions in the default Carbon multi-select', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'FEE', label: 'Fee in Lieu' }],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      currentSchedules: [],
    })

    renderPage('/provincial/application?region=1903,1908')
    await screen.findByText('321')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('prevents duplicate submissions while a search is in flight', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockReset()

    let resolveSearch: (value: Awaited<ReturnType<typeof searchProvincialApplications>>) => void
    mockedSearchProvincialApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )

    const applicationNumberInput = screen.getByLabelText('Application number')
    await userEvent.type(applicationNumberInput, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    })

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toHaveFocus()
    expect(searchButton).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(searchButton)
    await userEvent.type(applicationNumberInput, '2{Enter}')
    const searchForm = searchButton.closest('form')
    expect(searchForm).not.toBeNull()
    fireEvent.submit(searchForm!)
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)

    resolveSearch!({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicationNumber: '111',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })
    expect(await screen.findByText('111')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveAttribute('aria-disabled')
  })

  it('keeps Clear all enabled during a search and ignores the response that lands after it', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockReset()

    let resolveSearch: (value: Awaited<ReturnType<typeof searchProvincialApplications>>) => void
    mockedSearchProvincialApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )

    const applicationNumberInput = screen.getByLabelText('Application number')
    await userEvent.type(applicationNumberInput, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-disabled', 'true')

    const clearAll = screen.getByRole('button', { name: 'Clear all' })
    expect(clearAll).toBeEnabled()
    await userEvent.click(clearAll)

    expect(applicationNumberInput).toHaveValue('')
    expect(appliedSearch()).toBe('')
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveAttribute('aria-disabled')

    await act(async () => {
      resolveSearch!({
        content: [{ ...searchRowsWithMixedEligibility[0], applicationNumber: '111' }],
        page: { number: 0, size: 10, totalElements: 1, totalPages: 1 },
      })
    })

    expect(screen.queryByText('111')).not.toBeInTheDocument()
    expect(screen.queryByText('321')).not.toBeInTheDocument()
    expect(applicationNumberInput).toHaveValue('')
    expect(appliedSearch()).toBe('')
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveAttribute('aria-disabled')
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedSearchProvincialApplications.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Application search unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Unable to retrieve application search results. Try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No results found' })).not.toBeInTheDocument()
  })
  it.each([['List date from', 'List date to']])(
    'blocks a reversed %s range until To is corrected',
    async (fromLabel, toLabel) => {
      renderPage()
      await waitFor(() => expect(mockedSearchProvincialApplications).toHaveBeenCalled())
      const search = screen.getByRole('button', { name: 'Search' })
      await waitFor(() => expect(search).toBeEnabled())
      const callsBeforeEdit = mockedSearchProvincialApplications.mock.calls.length
      const from = screen.getByLabelText(fromLabel)
      const to = screen.getByLabelText(toLabel)
      fireEvent.change(from, { target: { value: '2026-10-12' } })
      fireEvent.change(to, { target: { value: '2026-10-01' } })
      expect(from).toHaveValue('2026-10-12')
      expect(to).toHaveValue('2026-10-01')
      expect(to).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(`Must be on or after ${fromLabel}.`)).toBeVisible()
      await userEvent.click(search)
      expect(to).toHaveFocus()
      fireEvent.submit(to.closest('form') as HTMLFormElement)
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(callsBeforeEdit)

      fireEvent.change(to, { target: { value: '2026-10-12' } })
      await waitFor(() => expect(to).not.toHaveAttribute('aria-invalid', 'true'))
      await userEvent.click(search)
      await waitFor(() =>
        expect(mockedSearchProvincialApplications.mock.calls.length).toBeGreaterThan(
          callsBeforeEdit,
        ),
      )
    },
  )

  it('does not request a reversed date range restored from a saved link', async () => {
    renderPage('/provincial/application?listingFromDate=2026-10-12&listingToDate=2026-10-01')
    await waitFor(() =>
      expect(screen.getByLabelText('List date to')).toHaveAttribute('aria-invalid', 'true'),
    )
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  })
})
