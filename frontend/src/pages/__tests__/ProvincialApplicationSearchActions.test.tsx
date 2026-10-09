import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

const renderPage = (
  path = '/provincial/application?region=11&page=1&pageSize=10&sortField=applicationNumber&sortDirection=desc',
) => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/provincial/application" element={<ProvincialApplicationPage />} />
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

  it('shows application result list dates in ISO format', async () => {
    renderPage()
    const application = await screen.findByText('321')
    const row = within(application.closest('tr') as HTMLElement)
    expect(row.getByRole('cell', { name: '2026-01-10' })).toBeVisible()
  })

  it('submits and restores None as literal NULL', async () => {
    const page = renderPage()
    await screen.findByText('321')
    expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalledWith(true)

    const exemptionType = screen.getByRole('combobox', { name: 'Exemption type' })
    expect(exemptionType).toHaveValue('')
    expect(exemptionType).toHaveAttribute('placeholder', 'All types')
    await userEvent.click(exemptionType)
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ exemptionType: 'NULL' }) }),
        expect.any(Object),
      )
    })
    const storageKey = 'lexis.search-state.v1.provincial-applications'
    expect(new URLSearchParams(sessionStorage.getItem(storageKey) ?? '').get('exemptionType')).toBe(
      'NULL',
    )

    page.unmount()
    mockedSearchProvincialApplications.mockClear()
    renderPage('/provincial/application')
    await screen.findByText('321')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('None')
  })

  it('clears a restored None filter to All types and submits an unfiltered search', async () => {
    const storageKey = 'lexis.search-state.v1.provincial-applications'
    // A complete saved query makes Search refresh results instead of normalizing the URL.
    sessionStorage.setItem(
      storageKey,
      'exemptionType=NULL&region=11&sortField=applicationNumber&sortDirection=desc&page=1&pageSize=10',
    )
    renderPage('/provincial/application')
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
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveAttribute(
      'placeholder',
      'All types',
    )
    expect(new URLSearchParams(sessionStorage.getItem(storageKey) ?? '').has('exemptionType')).toBe(
      false,
    )
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
      'Select all rows on this page',
      'Application',
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
    expect(
      screen.queryByRole('checkbox', { name: 'Select application 654' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Upload Application Submission' }),
    ).not.toBeInTheDocument()
    const addApplicationAction = screen.getByRole('link', { name: 'Add application' })
    expect(addApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(addApplicationAction).toHaveClass('cds--btn--primary')
    expect(addApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()

    expect(
      screen.getAllByText('This application already has an exemption.').length,
    ).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    expect(screen.getByText('1 application selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create exemption' })).toBeEnabled()

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

  it('asks the user to check before retrying when the create outcome is unknown', async () => {
    mockedFetchExemptionCreatePreview.mockResolvedValueOnce(exemptionPreview(['321']))
    mockedSubmitExemptionCreate.mockResolvedValueOnce({
      success: false,
      message: 'Exemption submission failed.',
      createdId: undefined,
      errors: [],
      warnings: [],
      outcomeUnknown: true,
    })
    renderPage()
    await screen.findByText('321')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))
    const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

    expect(
      await within(confirmation).findByText(
        'LEXIS could not confirm whether the exemption was created. Search for application 321 to check before trying again.',
      ),
    ).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('keeps the confirmation open with the reason when the exemption cannot be created', async () => {
    mockedFetchExemptionCreatePreview.mockRejectedValueOnce(
      new Error('Application 321 is not eligible for an exemption.'),
    )
    renderPage()
    await screen.findByText('321')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select application 321' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))
    const confirmation = screen.getByRole('dialog', { name: 'Create new exemption' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Create exemption' }))

    expect(
      await within(confirmation).findByText('Application 321 is not eligible for an exemption.'),
    ).toBeInTheDocument()
    expect(mockedSubmitExemptionCreate).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Create new exemption' }),
      ).not.toBeInTheDocument(),
    )
    // Cancel returns to the selection so it can be changed or confirmed again.
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).toBeChecked()
    expect(screen.getByText('1 application selected')).toBeInTheDocument()
  })

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

    expect(
      screen.queryByRole('checkbox', {
        name: `Select application ${rowState.applicationNumber}`,
      }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(rowState.expected).length).toBeGreaterThan(0)
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
    expect(screen.getAllByRole('status', { name: 'Counting search results' })).toHaveLength(2)
    expect(screen.queryByText(/counting/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Loading application search results…')).not.toBeInTheDocument()

    await act(async () => {
      resolveCount(125)
    })

    expect(await screen.findAllByText('125 results found')).toHaveLength(2)
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
      await screen.findAllByText('At least 10 results found — exact count unavailable'),
    ).toHaveLength(2)
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
      name: 'Select all rows on this page',
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

  it('disables search for an invalid list date', async () => {
    renderPage()
    await screen.findByText('321')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    const listDateFrom = screen.getByLabelText('List date from')
    fireEvent.change(listDateFrom, { target: { value: '2026-02-30' } })
    fireEvent.blur(listDateFrom)

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })

  it('hides staff client filters and exemption actions for an industry session', async () => {
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
      screen.queryByRole('checkbox', { name: 'Select all rows on this page' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select application 321' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByText('11111111')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Owner client number' })).toBeInTheDocument()
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

  it.each(['url', 'session'])(
    'keeps a restored Applicant criterion separate from Agent and removable from %s',
    async (source) => {
      const query = 'applicantClientNumber=00011111&agentClientNumber=00022222'
      if (source === 'session') {
        sessionStorage.setItem('lexis.search-state.v1.provincial-applications', query)
      }
      renderPage(source === 'url' ? `/provincial/application?${query}` : '/provincial/application')
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
    },
  )

  it('renders readable results and counts at both ends without changing application terminology', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: '321' })
    const row = within(link.closest('tr')!)
    expect(screen.getByRole('heading', { name: 'Application search' })).toBeVisible()
    expect(row.getByText('New')).toBeVisible()
    expect(row.getByText('100.0')).toBeVisible()
    expect(row.getByText('2026-01-10')).toBeVisible()
    expect(screen.getByText('Application volume (m³)')).toBeVisible()
    expect(screen.getAllByText('2 results found')).toHaveLength(2)
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

    await userEvent.click(screen.getByRole('button', { name: 'Application' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) =>
            request.sortField === 'applicationNumber' && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('shows validation when selected rows do not share client numbers', async () => {
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

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create exemption' }))

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Selected applications do not share the same client numbers. Multi-application exemptions require matching clients.',
        ),
      ).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Select application 321' })).not.toBeChecked()
    expect(
      screen.queryByRole('button', {
        name: 'Create exemption',
      }),
    ).not.toBeInTheDocument()
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
    const addApplicationAction = screen.getByRole('link', { name: 'Add application' })
    expect(addApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(addApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()
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

  it('loads an export schedule link and explicitly submits its removal', async () => {
    renderPage('/provincial/application?exportScheduleId=1002&region=11')
    await screen.findByText('321')

    expect(screen.getByText('Export schedule filter applied')).toBeInTheDocument()
    expect(
      screen.getByText('Showing applications assigned to export schedule 1002.'),
    ).toBeInTheDocument()
    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          exportScheduleId: '1002',
        }),
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )

    mockedSearchProvincialApplications.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /close notification/i }))
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            exportScheduleId: '',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
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

    await userEvent.type(applicationNumberInput, '2')
    const searchForm = screen.getByRole('button', { name: 'Searching...' }).closest('form')
    expect(searchForm).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Searching...' })).toBeDisabled()
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
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedSearchProvincialApplications.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Application search unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve application search results.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No applications found' })).not.toBeInTheDocument()
  })
})
