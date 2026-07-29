import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupApplicationDetailTests,
  LocationProbe,
  NavigateButton,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  clearComboBox,
  getApplicationSummaryTile,
  getSummaryComboBox,
  mockApplicationDetailAuth,
  mockedCheckApplicationVolumeUsage,
  mockedFetchApplicationClientContacts,
  mockedFetchApplicationClientData,
  mockedFetchApplicationClientLocations,
  mockedFetchApplicationDocuments,
  mockedFetchApplicationSpecies,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchProvincialApplicationDetail,
  mockedFetchProvincialApplicationOptions,
  mockedFetchProvincialExemptionDetail,
  mockedSaveApplicationRemark,
  mockedUpdateApplicationReviewStatus,
  mockedUpdateApplicationSummary,
  newExemptionDetail,
  selectApplicationDetailTab,
  selectApplicationReviewTile,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

const getOwnerClientDetailsTile = (): HTMLElement => {
  const title = screen.getByRole('heading', {
    name: 'Owner client details',
    level: 2,
  })
  const tile = title.closest('.cds--tile')
  expect(tile).toBeTruthy()
  return tile as HTMLElement
}

describe.sequential('Provincial Application Detail Actions - application', () => {
  beforeEach(setupApplicationDetailTests)

  it('does not render a top-right application highlights widget', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    expect(
      screen.queryByRole('group', {
        name: 'Application highlights',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows a green creation confirmation after redirecting from application creation', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/application/321',
            state: {
              applicationCreationNotice: {
                applicationNumber: '321',
              },
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Action complete')).toBeInTheDocument()
    expect(screen.getByText('Created application 321.')).toBeInTheDocument()
  })

  it('uses the legacy application detail tab order', async () => {
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

    const tabs = await screen.findAllByRole('tab')
    const pageHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Application 321',
    })
    const pageHeader = pageHeading.closest('.lexis-page-header')
    expect(pageHeader).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      within(pageHeader as HTMLElement).getByText('Check and manage this provincial application'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Provincial application search' })).toHaveAttribute(
      'href',
      '/provincial/application',
    )
    const status = within(pageHeader as HTMLElement).getByText('Approved')
    expect(status).toHaveClass('lexis-status-tag')
    expect(status).toHaveAttribute('data-status-variant', 'positive')
    expect(
      within(pageHeader as HTMLElement).queryByRole('group', {
        name: 'Page actions',
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Application highlights' })).not.toBeInTheDocument()
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('preserves the active detail tab across a page refresh', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: <ProvincialApplicationDetailsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: '/provincial/application/321',
            state: { lexisDetailTab: 'remarks' },
          },
        ],
      },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('tab', { name: 'Remarks' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await selectApplicationDetailTab('Application')

    await waitFor(() => {
      expect(router.state.location.state).toEqual({
        lexisDetailTab: 'application',
      })
    })
    expect(router.state.location.pathname).toBe('/provincial/application/321')
    expect(router.state.location.search).toBe('')
  })

  it('shows missing summary options only on the editable Application tab', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'APP', label: 'Approved' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    await waitFor(() => expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled())
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Missing required options: exemption reason. Summary changes cannot be saved.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Summary' })).toBeDisabled()

    await selectApplicationDetailTab('Owner')
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()
  })

  it('uses semantic empty states for unavailable clients and truly empty tab data', async () => {
    mockedFetchApplicationClientData.mockResolvedValue(null)
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [],
      remarks: [],
      offers: [],
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

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Owner details unavailable',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No agent assigned',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No permits found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No packages found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No documents found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No remarks found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Offers')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No offers found',
      }),
    ).toBeInTheDocument()
  })

  it('edits owner client details with plain applicant type labels', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerTile = getOwnerClientDetailsTile()
    const ownerControls = within(ownerTile)

    expect(
      ownerControls.queryByRole('heading', {
        name: 'Owner client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      ownerControls.getByRole('button', {
        name: 'Edit owner client details',
      }),
    )

    expect(ownerControls.getByLabelText('Client number')).toHaveValue('00011122')
    const applicantType = ownerControls
      .getAllByLabelText('Applicant type')
      .find((element) => element.getAttribute('role') === 'combobox')
    expect(applicantType).toBeTruthy()

    await chooseComboBoxOption(applicantType as HTMLElement, 'Ministerial')
    expect(applicantType).toHaveValue('Ministerial')
    expect(ownerControls.queryByDisplayValue('M - Ministerial')).not.toBeInTheDocument()
    expect(ownerControls.queryByDisplayValue('O - Owner')).not.toBeInTheDocument()
    expect(ownerControls.getByLabelText('I am an agent')).not.toBeChecked()

    await chooseComboBoxOption(
      ownerControls.getByRole('combobox', { name: 'Client location' }),
      '02 - Owner Alternate Location',
    )
    await waitFor(() =>
      expect(
        ownerControls.getByRole('combobox', {
          name: 'Contact name',
        }),
      ).toBeEnabled(),
    )
    await chooseComboBoxOption(
      ownerControls.getByRole('combobox', { name: 'Contact name' }),
      'Owner Alternate Contact',
    )

    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          ownerClientNumber: '00011122',
          ownerClientLocationCode: '02',
          ownerContactName: 'Owner Alternate Contact',
          applicantTypeCode: 'M',
          agentClientNumber: '',
          agentClientLocationCode: '',
          agentContactName: '',
        }),
      )
    })
    expect(
      await ownerControls.findByRole('button', {
        name: 'Edit owner client details',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Owner client details saved.')).toBeInTheDocument()
  })

  it('cancels owner client edits without changing the persisted summary', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(
      ownerControls.getByRole('button', {
        name: 'Edit owner client details',
      }),
    )
    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099988' },
    })
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(ownerControls.queryByLabelText('Client number')).not.toBeInTheDocument()
    const clientNumberField = ownerControls.getByText('Client number').closest('.detail-field-item')
    expect(clientNumberField).toBeTruthy()
    expect(within(clientNumberField as HTMLElement).getByText('00011122')).toBeInTheDocument()
  })

  it('loads complete application context without enabling edits for read-only viewers', async () => {
    mockApplicationDetailAuth((action) => action === '/applicationDetails', ['LEXIS_READ_ONLY'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      readOnly: true,
      canEditApplicationDetails: false,
      canEditPackages: false,
      canAddPackages: false,
      canAddScales: false,
      canUpdatePackageNumber: false,
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

    expect(await screen.findByText('Owner Contact')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00', {
      applicationNumber: '321',
    })
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
    expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
    expect(
      within(getOwnerClientDetailsTile()).queryByRole('button', {
        name: 'Edit owner client details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    const summaryTile = getApplicationSummaryTile()
    const expectSummaryField = (label: string, value: string) => {
      const field = within(summaryTile).getByText(label).closest('.detail-field-item')
      expect(field).toBeTruthy()
      expect(within(field as HTMLElement).getByText(value)).toBeInTheDocument()
    }
    await waitFor(() => {
      expectSummaryField('Product type', 'Harvested Timber')
      expectSummaryField('Org Unit', 'Coast')
      expectSummaryField('Applicant type', 'Agent')
      expectSummaryField('Owner client location', '00 - Owner Main Location')
      expectSummaryField('Owner contact name', 'Owner Contact')
      expectSummaryField('Agent client location', '01 - Agent Main Location')
      expectSummaryField('Growth type', 'Old Growth')
      expectSummaryField('Location of logs', 'BC')
      expectSummaryField('Application species', 'FI')
      expectSummaryField('Application end use', 'Lumber')
    })
    expect(within(summaryTile).queryByRole('button', { name: 'Save Summary' })).toBeNull()
  })

  it('shows offer company and received date from application detail', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      offers: [
        {
          offerNumber: 'OFF-77',
          companyName: 'Example Lumber',
          receivedDate: '2026-04-05',
          validOffer: true,
          withdrawalDate: null,
        },
      ],
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

    await selectApplicationDetailTab('Offers')

    expect(await screen.findByRole('region', { name: 'Application offers' })).toBeInTheDocument()
    expect(await screen.findByText('Example Lumber')).toBeInTheDocument()
    expect(screen.getByText('2026-04-05')).toBeInTheDocument()
    expect(screen.getByText('OFF-77')).toBeInTheDocument()
  })

  it('links to the contextual exemption and preserves current query parameters', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/provincial/exemption/:exemptionNumber" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const summaryTile = await selectApplicationSummaryTile()
    const exemptionLink = within(summaryTile).getByRole('link', {
      name: 'EX-555',
    })
    await userEvent.click(exemptionLink)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/exemption/EX-555?packageFilter=PKG-1')
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('renders the exemption number as plain text without exemption route capabilities', async () => {
    mockApplicationDetailAuth(
      (action: string) => action !== '/exemptionSearch' && action !== '/exemptionDetails',
    )

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

    const summaryTile = await selectApplicationSummaryTile()
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('keeps an industry-linked NEW exemption as plain text', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue(newExemptionDetail)

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

    const summaryTile = await selectApplicationSummaryTile()
    await waitFor(() => {
      expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
    })
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
  })

  it('links an industry application after non-NEW exemption access is verified', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...newExemptionDetail,
      exemptionStatusCode: 'ACT',
      exemptionStatusDescription: 'Active',
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

    const summaryTile = await selectApplicationSummaryTile()
    expect(await within(summaryTile).findByRole('link', { name: 'EX-555' })).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-555',
    )
    expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
  })

  it('hides expired application mutation actions even when server edit flags are true', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      canEditApplicationDetails: true,
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary')).toBeInTheDocument()
    expect(
      within(getApplicationSummaryTile()).queryByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeNull()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset package drafts' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Species' })).toBeNull()
    expect(screen.queryByText('Create Package')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset scale' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lookup Scale' })).toBeNull()

    await selectApplicationDetailTab('Offers')
    expect(screen.queryByRole('button', { name: 'Create offer' })).toBeNull()
  })

  it('blocks application edits when another user holds the edit lock', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      locked: true,
      lockedBy: 'Reviewer One',
      lockMessage:
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '900',
          name: 'locked-doc.pdf',
          description: 'Locked document',
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application locked')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')

    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
    await selectApplicationDetailTab('Documents')
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(await screen.findByText('locked-doc.pdf')).toBeInTheDocument()
    screen
      .getAllByRole('button', { name: 'Delete' })
      .forEach((button) => expect(button).toBeDisabled())
    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
  })

  it('ignores stale detail responses after navigating to another application', async () => {
    const secondApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationNumber: 654,
      exemptionNumber: 'EX-654',
      statusDescription: 'Second status',
      ownerClientNumber: '00099988',
      agentClientNumber: '00077766',
    }
    let resolveFirstDetail: ((value: ProvincialApplicationDetail) => void) | undefined
    mockedFetchProvincialApplicationDetail
      .mockImplementationOnce(
        () =>
          new Promise<ProvincialApplicationDetail>((resolve) => {
            resolveFirstDetail = resolve
          }),
      )
      .mockResolvedValueOnce(secondApplicationDetail)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={
              <>
                <NavigateButton to="/provincial/application/654" />
                <ProvincialApplicationDetailsPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('321')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Navigate application' }))

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('654')
    })
    expect(
      await screen.findByText('Second status', {
        selector: '.lexis-status-tag',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)

    await act(async () => {
      resolveFirstDetail?.(applicationDetail)
    })

    expect(screen.getByText('Second status', { selector: '.lexis-status-tag' })).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)
    expect(screen.queryByText('00011122')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(1)
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('saves application summary edits and refreshes detail', async () => {
    const detailAfterSummarySave: ProvincialApplicationDetail = {
      ...applicationDetail,
      termDays: 430,
      applicationVolume: 125.5,
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterSummarySave)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'S',
      productLocation: 'BC',
      exportScheduleId: '988',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '02',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '13',
      productTypeCode: 'TIMBER',
      jurisdictionCode: 'F',
      growthTypeCode: 'S',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Alternate Contact',
      oicIndicator: 'Y',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    await selectApplicationDetailTab('Application')
    const summaryControls = within(await waitFor(() => getApplicationSummaryTile()))
    expect(summaryControls.getByLabelText('Application status')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveValue('F - Federal')
    expect(getSummaryComboBox(summaryControls, 'Applicant type')).toBeInTheDocument()
    const termInput = await screen.findByLabelText('Term (days)')
    fireEvent.change(termInput, { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Term (months)'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Term (years)'), {
      target: { value: '1' },
    })

    const volumeInput = screen.getByLabelText('Application volume (m³)')
    fireEvent.change(volumeInput, { target: { value: '125.5' } })

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00011122',
        '02',
        'owner',
        '321',
      )
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00033344',
        '01',
        'agent',
        '321',
      )
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '02', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01', {
        applicationNumber: '321',
      })
    })
    await selectApplicationDetailTab('Owner')
    expect(await screen.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(screen.getByText('Agent Export Services')).toBeInTheDocument()
    expect(screen.getByText('agent@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm application accuracy' })).toBeNull()

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith({
        applicationNumber: '321',
        applicationDate: '2026-01-01',
        receivedDate: '2026-01-02',
        termDays: '430',
        applicationVolume: '125.5',
        averageLogVolume: '2',
        exemptionReasonCode: 'S',
        productLocation: 'BC',
        exportScheduleId: '988',
        agentClientNumber: '00033344',
        agentClientLocationCode: '01',
        ownerClientNumber: '00011122',
        ownerClientLocationCode: '02',
        applicantTypeCode: 'A',
        orgUnitNumber: '13',
        productTypeCode: 'TIMBER',
        growthTypeCode: 'S',
        agentContactName: 'Agent Contact',
        ownerContactName: 'Owner Alternate Contact',
        oicIndicator: 'Y',
        endUseCode: 'LU',
        speciesCodes: ['FI'],
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The application was saved successfully.')).toBeInTheDocument()
  }, 30000)

  it('hides and clears stale agent fields when editing an owner application summary', async () => {
    const ownerApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      agentClientNumber: null,
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(ownerApplicationDetail)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'O',
      orgUnitNumber: '12',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    await waitFor(() => {
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Owner',
        'Application',
        'Items',
        'Documents',
        'Remarks',
        'Offers',
        'Review',
      ])
    })
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)

    await waitFor(() => {
      expect(summaryControls.queryByLabelText('Agent client number')).not.toBeInTheDocument()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
    })
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith(
      '00033344',
      'agent',
      '321',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantTypeCode: 'O',
          agentClientNumber: '',
          agentClientLocationCode: '',
          agentContactName: '',
        }),
      )
    })
  })

  it('keeps applicant type and workflow fields read-only for scoped submitters', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )

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

    const summaryControls = within(await selectApplicationSummaryTile())
    const applicantType = await summaryControls.findByLabelText('Applicant type')
    expect(applicantType).toHaveAttribute('readonly')
    expect(applicantType).toHaveValue('Agent')
    expect(summaryControls.getByLabelText('Application status')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(getSummaryComboBox(summaryControls, 'Applicant type')).toBeUndefined()

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const accuracyDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    await userEvent.click(within(accuracyDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(accuracyDialog).getByRole('button', { name: 'Save summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicantTypeCode: undefined }),
      )
    })
  })

  it('validates application summary edits before saving', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    fireEvent.change(productLocationInput, { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(screen.getAllByText('Location of logs is required.').length).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('preserves historical region and listing values during an unrelated summary edit', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      orgUnitNumber: 1834,
      orgUnitName: 'Historic Natural Resource Region',
      listingDate: '2011-11-25',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      orgUnitNumber: '1834',
      exportScheduleId: '31885',
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue(
        'Historic Natural Resource Region',
      )
      expect(getSummaryComboBox(summaryControls, 'Listing date')).toHaveValue('2011-11-25')
    })

    fireEvent.change(productLocationInput, {
      target: { value: 'Updated location' },
    })
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          productLocation: 'Updated location',
          orgUnitNumber: '1834',
          exportScheduleId: '31885',
        }),
      )
    })
  })

  it('removes application species through individually labelled dismiss controls', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummarySnapshot,
      speciesCodes: ['FI', 'CE'],
    })
    mockedFetchApplicationSpecies.mockResolvedValueOnce([
      { species: 'FI', endUse: 'LU', endUseDescription: 'Lumber' },
      { species: 'CE', endUse: 'LU', endUseDescription: 'Lumber' },
    ])

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

    const summaryControls = within(await selectApplicationSummaryTile())
    const selectedSpecies = summaryControls.getByRole('list', {
      name: 'Selected application species',
    })
    const removeFir = within(selectedSpecies).getByRole('button', {
      name: 'Remove FI from application',
    })

    expect(
      within(selectedSpecies).getByRole('button', {
        name: 'Remove CE from application',
      }),
    ).toBeInTheDocument()
    expect(within(selectedSpecies).queryByRole('button', { name: 'Remove' })).toBeNull()

    await userEvent.click(removeFir)

    expect(
      within(selectedSpecies).queryByRole('button', {
        name: 'Remove FI from application',
      }),
    ).toBeNull()
    expect(
      within(selectedSpecies).getByRole('button', {
        name: 'Remove CE from application',
      }),
    ).toBeInTheDocument()
  })

  it('uses natural resource region names in application summary edits', async () => {
    const detailWithNaturalResourceRegion: ProvincialApplicationDetail = {
      ...applicationDetail,
      orgUnitNumber: 1903,
      orgUnitName: 'Cariboo Natural Resource Region',
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(detailWithNaturalResourceRegion)
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '1903',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const regionComboBox = getSummaryComboBox(summaryControls, 'Region')

    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'Skeena Natural Resource Region')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          orgUnitNumber: '1908',
        }),
      )
    })
  })

  it('can clear application summary listing date with the blank schedule option', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [
        { value: '987', label: '2026-01-11' },
        { value: '988', label: '2026-01-25' },
        { value: '989', label: '2026-02-08' },
        { value: '', label: 'Blank' },
      ],
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const listingDateComboBox = getSummaryComboBox(summaryControls, 'Listing date')

    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-01-11')
    })

    await chooseComboBoxOption(listingDateComboBox, '2026-02-08')
    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-02-08')
    })
    await chooseComboBoxOption(listingDateComboBox, 'Blank')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '',
        }),
      )
    })
  })

  it('validates application summary volume ranges before saving', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const applicationVolumeInput = await summaryControls.findByLabelText('Application volume (m³)')
    const averageLogVolumeInput = await summaryControls.findByLabelText('Average log volume')

    await waitFor(() => {
      expect(applicationVolumeInput).toHaveValue(100)
    })

    fireEvent.change(applicationVolumeInput, { target: { value: '10000000' } })
    fireEvent.change(averageLogVolumeInput, { target: { value: '100' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Average log volume must be 99.9 or less.').length).toBeGreaterThan(
      0,
    )
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('rejects three application-volume decimals and accepts the exact Oracle maximum', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const applicationVolume = await summaryControls.findByLabelText('Application volume (m³)')
    const saveSummary = summaryControls.getByRole('button', {
      name: 'Save Summary',
    })

    fireEvent.change(applicationVolume, { target: { value: '250.999' } })
    await userEvent.click(saveSummary)

    expect(
      screen.getAllByText('Application volume must have no more than two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    fireEvent.change(applicationVolume, { target: { value: '9999999.99' } })
    await userEvent.click(saveSummary)

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  })

  it('applies H, S, and T summary fields without hidden stale-value validation', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const productType = getSummaryComboBox(summaryControls, 'Product type')
    const averageLogVolume = await summaryControls.findByLabelText('Average log volume')
    const productLocation = summaryControls.getByLabelText('Location of logs')

    expect(getSummaryComboBox(summaryControls, 'Growth type')).toBeInTheDocument()
    fireEvent.change(averageLogVolume, { target: { value: '-0.1' } })
    fireEvent.change(productLocation, { target: { value: '' } })

    await chooseComboBoxOption(productType, 'Standing Timber')
    expect(getSummaryComboBox(summaryControls, 'Growth type')).toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Average log volume')).not.toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Location of logs')).not.toBeInTheDocument()

    await clearComboBox(getSummaryComboBox(summaryControls, 'Growth type'))
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))
    expect(screen.getAllByText('Growth type is required.').length).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await chooseComboBoxOption(productType, 'Timber')
    expect(summaryControls.queryByRole('combobox', { name: 'Growth type' })).not.toBeInTheDocument()
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeCode: 'T',
          growthTypeCode: '',
          productLocation: '',
          averageLogVolume: '-0.1',
        }),
      )
    })
  })

  it('requires submitter accuracy confirmation while preserving the volume warning', async () => {
    mockApplicationDetailAuth(() => true, ['PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedCheckApplicationVolumeUsage.mockResolvedValue({
      volumeUsed: false,
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

    await selectApplicationDetailTab('Application')
    await screen.findByLabelText('Application volume (m³)')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const firstDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const firstAcknowledgement = within(firstDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    const firstConfirm = within(firstDialog).getByRole('button', {
      name: 'Save summary',
    })
    expect(firstAcknowledgement).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    await userEvent.click(firstConfirm)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(firstAcknowledgement)
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const reopenedDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const reopenedAcknowledgement = within(reopenedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(reopenedAcknowledgement).not.toBeChecked()
    await userEvent.click(reopenedAcknowledgement)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Save summary' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'Confirm application accuracy',
        }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    const warningAcceptedDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const warningAcceptedAcknowledgement = within(warningAcceptedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(warningAcceptedAcknowledgement).not.toBeChecked()
    await userEvent.click(warningAcceptedAcknowledgement)
    await userEvent.click(
      within(warningAcceptedDialog).getByRole('button', {
        name: 'Save summary',
      }),
    )

    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))
  })

  it('resets application summary edits from the editable snapshot', async () => {
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
      expect(getSummaryComboBox(summaryControls, 'Owner client location')).toHaveValue(
        '00 - Owner Main Location',
      )
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue('Coast')
    })

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    await chooseComboBoxOption(
      getSummaryComboBox(summaryControls, 'Owner client location'),
      '02 - Owner Alternate Location',
    )
    await chooseComboBoxOption(getSummaryComboBox(summaryControls, 'Region'), 'Interior')
    await userEvent.click(summaryControls.getByRole('button', { name: 'Reset Summary' }))

    await waitFor(() => {
      expect(summaryControls.getByLabelText('Location of logs')).toHaveValue('BC')
      expect(getSummaryComboBox(summaryControls, 'Owner client location')).toHaveValue(
        '00 - Owner Main Location',
      )
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue('Coast')
    })
  })

  it('guards unload only after an application summary differs from its persisted baseline', async () => {
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const productLocationInput = await summaryControls.findByLabelText('Location of logs')
    await waitFor(() => expect(productLocationInput).toHaveValue('BC'))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(summaryControls.getByRole('button', { name: 'Reset Summary' }))
    const resetUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(resetUnload)
    expect(resetUnload.defaultPrevented).toBe(false)
  })

  it('saves all dirty application sections sequentially before leaving', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'NEW',
      statusDescription: 'New',
    })
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: (
            <>
              <ProvincialApplicationDetailsPage />
              <Link to="/next">Leave application</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/application/321'] },
    )
    render(<RouterProvider router={router} />)

    await selectApplicationDetailTab('Application')
    fireEvent.change(await screen.findByLabelText('Location of logs'), {
      target: { value: 'AB' },
    })
    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Sequential remark' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await chooseComboBoxOption(
      reviewTile.getByRole('combobox', { name: 'Application status' }),
      'Rejected',
    )
    fireEvent.change(reviewTile.getByLabelText('Status change remark'), {
      target: { value: 'Needs correction' },
    })

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationSummary.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSaveApplicationRemark.mock.invocationCallOrder[0],
    )
    expect(mockedSaveApplicationRemark.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdateApplicationReviewStatus.mock.invocationCallOrder[0],
    )
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
  })

  it('allows manual summary contact entry when lookup has no contacts', async () => {
    mockedFetchApplicationClientContacts.mockResolvedValue([])

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

    await selectApplicationDetailTab('Application')
    const ownerContactInput = await screen.findByLabelText('Owner contact name')
    fireEvent.change(ownerContactInput, { target: { value: 'Typed Owner' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'Typed Owner',
        }),
      )
    })
  })

  it('debounces owner client lookups while the client number is typed', async () => {
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

    await selectApplicationDetailTab('Application')
    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00011122',
        '00',
        'owner',
        '321',
      )
    })
    mockedFetchApplicationClientData.mockClear()
    mockedFetchApplicationClientLocations.mockClear()
    mockedFetchApplicationClientContacts.mockClear()

    const ownerClientNumberInput = screen.getByLabelText('Owner client number')
    for (const value of ['0', '00', '000', '0004', '00044', '000444', '0004444', '00044444']) {
      fireEvent.change(ownerClientNumberInput, { target: { value } })
    }

    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalled()
    expect(mockedFetchApplicationClientContacts).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00044444', '00', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00044444', 'owner', '321')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00044444',
        '00',
        'owner',
        '321',
      )
    })
  })

  it('does not substitute the owner email when an agent applicant has no email', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: clientNumber === '00033344' ? 'Agent without email' : 'Owner Forestry Ltd.',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: clientNumber === '00033344' ? '' : 'owner@example.test',
      notfound: '',
    }))

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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() =>
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(''),
    )
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
