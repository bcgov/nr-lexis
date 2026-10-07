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
  NavigateButton,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  getApplicationSummaryTile,
  getSummaryComboBox,
  mockApplicationDetailAuth,
  mockedCheckApplicationVolumeUsage,
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
  selectApplicationDetailTab,
  selectApplicationItemDetailsTile,
  selectApplicationRemarksForEditing,
  selectApplicationReviewTile,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

const getOwnerClientDetailsTile = (): HTMLElement => {
  const title = screen.getByRole('heading', {
    name: 'Applicant details',
    level: 2,
  })
  const tile = title.closest('.cds--tile')
  expect(tile).toBeTruthy()
  return tile as HTMLElement
}

const getAgentDetailsTile = (): HTMLElement => {
  const title = screen.getByRole('heading', {
    name: 'Agent information',
    level: 3,
  })
  const section = title.closest('section')
  expect(section).toBeTruthy()
  return section as HTMLElement
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

  it('opens the application summary in view mode without repeating the application number', async () => {
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Application 321' })).toBeVisible()
    const summaryTile = await selectApplicationSummaryTile(false)
    const summary = within(summaryTile)

    expect(summary.queryByText('Application number')).not.toBeInTheDocument()
    expect(summary.queryByText('Status', { exact: true })).not.toBeInTheDocument()
    expect(summary.queryByText('Author')).not.toBeInTheDocument()
    expect(screen.getByText('Author: idir\\application-author')).toBeInTheDocument()
    expect(summary.getByRole('button', { name: 'Edit application details' })).toBeInTheDocument()
    expect(summary.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(summary.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(summary.queryByText('Owner client number')).not.toBeInTheDocument()
    expect(summary.queryByText('Agent client number')).not.toBeInTheDocument()
    expect(summary.queryByText('Application volume')).not.toBeInTheDocument()

    const itemDetails = within(await selectApplicationItemDetailsTile())
    fireEvent.change(await itemDetails.findByLabelText('Location of logs'), {
      target: { value: 'Changed location' },
    })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))

    expect(itemDetails.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(itemDetails.getByRole('button', { name: 'Edit scale details' })).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
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

    expect(await screen.findByText('The application was saved.')).toBeInTheDocument()
    expect(screen.queryByText('Action complete')).not.toBeInTheDocument()
  })

  it('shows each summary field once while editing and restores display values on cancel', async () => {
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

    const summary = within(await selectApplicationSummaryTile())
    const fields = ['Region', 'List date', 'Exemption term (days)']
    for (const field of fields) {
      expect(summary.getAllByText(field, { exact: true })).toHaveLength(1)
    }

    await userEvent.click(summary.getByRole('button', { name: 'Cancel' }))
    for (const field of fields) {
      expect(summary.getAllByText(field, { exact: true })).toHaveLength(1)
    }
    expect(summary.getByRole('button', { name: 'Edit application details' })).toBeVisible()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('neither shows nor saves the Order in Council indicator', async () => {
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

    const summary = within(await selectApplicationSummaryTile(false))
    expect(summary.getByText('Exemption term (days)', { exact: true })).toBeInTheDocument()
    expect(summary.queryByText('Order in Council indicator')).not.toBeInTheDocument()

    await userEvent.click(summary.getByRole('button', { name: 'Edit application details' }))
    expect(summary.queryByText('Order in Council indicator')).not.toBeInTheDocument()
    fireEvent.change(summary.getByLabelText('Exemption term (days)'), {
      target: { value: '45' },
    })
    const saveButton = summary.getByRole('button', { name: 'Save changes' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    })
    expect(mockedUpdateApplicationSummary.mock.calls[0][0]).toMatchObject({
      saveSource: 'summary',
      termDays: '45',
    })
    expect(mockedUpdateApplicationSummary.mock.calls[0][0]).not.toHaveProperty('oicIndicator')
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
      within(pageHeader as HTMLElement).getByText('Author: idir\\application-author'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Application search' })).toHaveAttribute(
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
      'Applicant',
      'Application',
      'Scale',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    // Figma puts a Carbon icon on every application detail tab.
    tabs.forEach((tab) => expect(tab.querySelector('svg')).toBeInTheDocument())
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
      currentSchedules: [{ value: '987', label: 'Jan 11, 2026' }],
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

    await selectApplicationSummaryTile()
    expect(await screen.findByText('Application summary options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Missing required options: exemption reason. Summary changes cannot be saved.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await selectApplicationDetailTab('Applicant')
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()
  })

  it('heads the owner details in view and keeps the agent checkbox after them in edit mode', async () => {
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

    // Figma's saved Applicant card heads the owner's details and shows no agent indicator field.
    const ownerSection = await screen.findByRole('region', { name: 'Owner' })
    expect(within(ownerSection).getByRole('heading', { level: 3, name: 'Owner' })).toBeVisible()
    expect(await within(ownerSection).findByText('owner@example.test')).toBeInTheDocument()
    expect(within(ownerSection).queryByText('I am an agent')).not.toBeInTheDocument()
    expect(within(ownerSection).queryByText('Applicant type')).not.toBeInTheDocument()

    const ownerTile = getOwnerClientDetailsTile()
    expect(
      within(ownerTile)
        .getByRole('heading', { level: 2, name: 'Applicant details' })
        .querySelector('svg'),
    ).toBeInTheDocument()
    await userEvent.click(within(ownerTile).getByRole('button', { name: 'Edit applicant details' }))
    expect(within(ownerTile).getByText('Required fields')).toBeInTheDocument()
    const editOwnerEmail = (await within(ownerTile).findByText('owner@example.test')).closest(
      '.detail-field-item',
    )
    const editOwnerAgentIndicator = within(ownerTile).getByLabelText("I'm an agent")
    // Figma separates the owner's details from the agent checkbox with a divider.
    const divider = ownerTile.querySelector('hr.application-applicant-divider')

    expect(editOwnerEmail).toBeTruthy()
    expect(divider).toBeTruthy()
    expect(
      Boolean(
        (editOwnerEmail as Node).compareDocumentPosition(divider as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(
      Boolean(
        (divider as Node).compareDocumentPosition(editOwnerAgentIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
  })

  it('shows client acronyms, the usual empty value and a divider before the agent', async () => {
    mockedFetchApplicationClientLocations.mockImplementation(
      async (_clientNumber, applicantType) => {
        const code = applicantType === 'agent' ? '01' : '00'
        return [{ locationCode: code, locationName: code, selected: true }]
      },
    )
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      ownerContactName: '',
    })
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: clientNumber === '00033344' ? 'Agent Export Services' : 'Owner Forestry Ltd.',
      clientAcronym: clientNumber === '00033344' ? '' : 'OWNFOR',
      locationName: clientNumber === '00033344' ? 'Export office' : 'Main office',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: '',
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

    const ownerSection = await screen.findByRole('region', { name: 'Owner' })
    expect(
      await within(ownerSection).findByText('Owner Forestry Ltd. (OWNFOR) · 00011122'),
    ).toBeInTheDocument()
    const ownerContact = within(ownerSection).getByText('Contact name').nextElementSibling
    expect(ownerContact).toHaveTextContent('Not provided')
    expect(within(ownerSection).getByText('00 - Main office')).toBeInTheDocument()

    const agentSection = screen.getByRole('region', { name: 'Agent information' })
    expect(
      await within(agentSection).findByText('Agent Export Services · 00033344'),
    ).toBeInTheDocument()
    expect(agentSection.previousElementSibling).toHaveClass('application-applicant-divider')
    expect(within(agentSection).getByText('01 - Export office')).toBeInTheDocument()
  })

  it('keeps saved client values visible when enrichment fails', async () => {
    mockedFetchApplicationClientData.mockRejectedValue(new Error('client endpoint unavailable'))
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

    const ownerDetails = await screen.findByRole('region', { name: 'Applicant client details' })
    expect(within(ownerDetails).getByText('00011122')).toBeInTheDocument()
    expect(await within(ownerDetails).findByText('00 - Owner Main Location')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('Owner Contact')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('Client details unavailable')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Client details could not be retrieved. Existing selections were preserved. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Owner details unavailable' }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Applicant')
    const agentDetails = await screen.findByRole('region', { name: 'Agent information' })
    expect(within(agentDetails).getByText('00033344')).toBeInTheDocument()
    expect(await within(agentDetails).findByText('01 - Agent Main Location')).toBeInTheDocument()
    expect(within(agentDetails).getByText('Agent Contact')).toBeInTheDocument()
    expect(within(agentDetails).getByText('Client details unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No agent assigned' })).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Application details' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No permits found' })).not.toBeInTheDocument()

    await selectApplicationDetailTab('Scale')
    // The reviewed Figma places each first-record action inside its empty state.
    expect(
      (await screen.findByRole('button', { name: 'Create package' })).closest('.lexis-empty-state'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scale', level: 2 })).not.toBeInTheDocument()
    expect(screen.getByText('Create a package, then add Summary of scale.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No packages found' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Package details' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Summary of scale' })).not.toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('heading', { name: 'Documents', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'No documents for this application',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add documents' }).closest('.lexis-empty-state'),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByRole('heading', { name: 'Remarks', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'No remarks for this application',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add remark' }).closest('.lexis-empty-state'),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Offers')
    expect(screen.queryByRole('heading', { name: 'Offers', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'No offers found',
      }),
    ).toBeInTheDocument()
  })

  it('shows an explicit empty state when no agent is assigned', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
      applicantTypeCode: 'A',
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

    await selectApplicationDetailTab('Applicant')
    const agentDetails = within(getAgentDetailsTile())
    expect(
      agentDetails.getByRole('heading', {
        level: 3,
        name: 'No agent assigned',
      }),
    ).toBeInTheDocument()
    expect(agentDetails.getByText('No agent is assigned to this application.')).toBeInTheDocument()
    expect(agentDetails.queryByText('Client details unavailable')).not.toBeInTheDocument()
  })

  it('edits owner contact and location with the Figma read-only client', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicationVolume: '',
      speciesCodes: [],
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerTile = getOwnerClientDetailsTile()
    const ownerControls = within(ownerTile)

    expect(
      ownerControls.queryByRole('heading', {
        name: 'Applicant client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      ownerControls.getByRole('button', {
        name: 'Edit applicant details',
      }),
    )

    // Figma: the saved client is read-only and there is no applicant type control.
    expect(ownerControls.queryByRole('combobox', { name: 'Client' })).not.toBeInTheDocument()
    expect(ownerControls.getByText('Client', { selector: 'dt' })).toBeInTheDocument()
    expect(ownerControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    expect(ownerControls.getByLabelText("I'm an agent")).toBeChecked()

    await chooseComboBoxOption(
      ownerControls.getByRole('combobox', { name: 'Client location' }),
      '02 - Owner Alternate Location',
    )
    await waitFor(() =>
      expect(ownerControls.getAllByRole('textbox', { name: 'Contact name' })[0]).toBeEnabled(),
    )
    const ownerContactName = ownerControls.getAllByRole('textbox', { name: 'Contact name' })[0]
    fireEvent.change(ownerContactName, { target: { value: 'Advertising Owner' } })
    await waitFor(() => expect(ownerContactName).toHaveValue('Advertising Owner'))

    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          ownerClientNumber: '00011122',
          ownerClientLocationCode: '02',
          ownerContactName: 'Advertising Owner',
          applicantTypeCode: 'A',
        }),
      )
    })
    expect(
      await ownerControls.findByRole('button', {
        name: 'Edit applicant details',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The application was saved.').closest('.cds--inline-notification'),
    ).toHaveClass('cds--inline-notification--success')
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  })

  it("keeps a saved Ministerial applicant type when I'm an agent is cleared again", async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'M',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit applicant details' }))
    const agentChoice = ownerControls.getByLabelText("I'm an agent")
    await userEvent.click(agentChoice)
    await userEvent.click(agentChoice)
    expect(agentChoice).not.toBeChecked()
    const ownerContactName = ownerControls.getAllByRole('textbox', { name: 'Contact name' })[0]
    fireEvent.change(ownerContactName, { target: { value: 'Ministerial Contact' } })
    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'Ministerial Contact',
          applicantTypeCode: 'M',
        }),
      ),
    )
  })

  it('edits agent information in Applicant and saves the owner-agent change together', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'M',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit applicant details' }))
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    await userEvent.click(ownerControls.getByLabelText("I'm an agent"))
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    let agentControls = within(getAgentDetailsTile())
    expect(agentControls.getByLabelText('Agent client')).toHaveValue('00011122')
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument(),
    )
    await selectApplicationDetailTab('Applicant')
    const resetOwnerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(
      resetOwnerControls.getByRole('button', { name: 'Edit applicant details' }),
    )
    expect(resetOwnerControls.getByLabelText("I'm an agent")).not.toBeChecked()
    await userEvent.click(resetOwnerControls.getByLabelText("I'm an agent"))
    agentControls = within(getAgentDetailsTile())

    await waitFor(() =>
      expect(agentControls.getByRole('combobox', { name: 'Agent location' })).toBeEnabled(),
    )
    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Agent location' }),
      '01 - Agent Main Location',
    )
    await waitFor(() =>
      expect(agentControls.getByRole('textbox', { name: 'Contact name' })).toBeEnabled(),
    )
    fireEvent.change(agentControls.getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Agent Contact' },
    })
    await userEvent.click(resetOwnerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          saveSource: 'owner-agent',
          applicantTypeCode: 'A',
          agentClientNumber: '00011122',
          agentClientLocationCode: '01',
          agentContactName: 'Agent Contact',
        }),
      ),
    )
  })

  it('edits agent details using the legacy editable fields', async () => {
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
    await selectApplicationDetailTab('Applicant')
    const agentTile = getAgentDetailsTile()
    let agentControls = within(agentTile)

    expect(
      agentControls.queryByRole('heading', {
        name: 'Agent client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    expect(agentControls.getByText('01 - Agent Main Location')).toBeInTheDocument()

    await userEvent.click(
      within(getOwnerClientDetailsTile()).getByRole('button', {
        name: 'Edit applicant details',
      }),
    )
    agentControls = within(getAgentDetailsTile())

    expect(agentControls.getByLabelText('Agent client')).toHaveValue('00033344')
    expect(within(getOwnerClientDetailsTile()).getByLabelText("I'm an agent")).toBeChecked()

    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Agent location' }),
      '02 - Agent Alternate Location',
    )
    await waitFor(() =>
      expect(
        agentControls.getByRole('textbox', {
          name: 'Contact name',
        }),
      ).toBeEnabled(),
    )
    fireEvent.change(agentControls.getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Agent Alternate Contact' },
    })

    await userEvent.click(
      within(getOwnerClientDetailsTile()).getByRole('button', { name: 'Save changes' }),
    )

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          agentClientNumber: '00033344',
          agentClientLocationCode: '02',
          agentContactName: 'Agent Alternate Contact',
          saveSource: 'owner-agent',
        }),
      )
    })
    expect(
      await within(getOwnerClientDetailsTile()).findByRole('button', {
        name: 'Edit applicant details',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('The application was saved.')).toBeInTheDocument()
  })

  it('cancels agent edits without changing the persisted summary', async () => {
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
    await selectApplicationDetailTab('Applicant')
    let agentControls = within(getAgentDetailsTile())
    await userEvent.click(
      within(getOwnerClientDetailsTile()).getByRole('button', {
        name: 'Edit applicant details',
      }),
    )
    agentControls = within(getAgentDetailsTile())
    fireEvent.change(agentControls.getByLabelText('Agent client'), {
      target: { value: '00099988' },
    })
    await userEvent.click(
      within(getOwnerClientDetailsTile()).getByRole('button', { name: 'Cancel' }),
    )

    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    agentControls = within(getAgentDetailsTile())
    expect(agentControls.queryByLabelText('Agent client')).not.toBeInTheDocument()
    const agentClientField = agentControls.getByText('Agent client').closest('.detail-field-item')
    expect(agentClientField).toBeTruthy()
    expect(within(agentClientField as HTMLElement).getByText(/00033344$/)).toBeInTheDocument()
  })

  it('loads complete application context without enabling edits for read-only viewers', async () => {
    mockApplicationDetailAuth(
      (action) => ['/applicationDetails', '/applicationRemarks'].includes(action),
      ['LEXIS_READ_ONLY'],
    )
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

    const ownerDetails = await screen.findByRole('region', { name: 'Applicant client details' })
    expect(within(ownerDetails).getByText('Owner Contact')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00', {
      applicationNumber: '321',
    })
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
    expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
    expect(
      within(getOwnerClientDetailsTile()).queryByRole('button', {
        name: 'Edit applicant details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Applicant')
    expect(
      within(getAgentDetailsTile()).queryByRole('button', {
        name: 'Edit agent details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    const summaryTile = getApplicationSummaryTile()
    const expectDetailField = (tile: HTMLElement, label: string, value: string) => {
      const field = within(tile).getByText(label).closest('.detail-field-item')
      expect(field).toBeTruthy()
      expect(within(field as HTMLElement).getByText(value)).toBeInTheDocument()
    }
    await waitFor(() => {
      expectDetailField(summaryTile, 'Region', 'Coast')
    })
    expectDetailField(summaryTile, 'Product type', 'Harvested Timber')
    expect(within(summaryTile).queryByText('Applicant type')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Owner client location')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Agent client location')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByRole('button', { name: 'Save changes' })).toBeNull()

    const itemDetailsTile = await selectApplicationItemDetailsTile(false)
    await waitFor(() => {
      expect(within(itemDetailsTile).queryByText('Product type')).not.toBeInTheDocument()
      expectDetailField(itemDetailsTile, 'Age class', 'Old Growth')
      expectDetailField(itemDetailsTile, 'Location of logs', 'BC')
      expectDetailField(itemDetailsTile, 'Species list', 'FI')
      expectDetailField(itemDetailsTile, 'End use', 'Lumber')
    })
    expect(
      within(itemDetailsTile).queryByRole('button', {
        name: 'Edit scale details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    const remarksTable = within(
      screen.getByRole('region', { name: 'Application remarks' }),
    ).getByRole('table')
    expect(within(remarksTable).getByText('ok')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
    expect(
      within(remarksTable).queryByRole('columnheader', { name: 'Actions' }),
    ).not.toBeInTheDocument()
    expect(within(remarksTable).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows offer rows despite retired filter query parameters', async () => {
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
      <MemoryRouter initialEntries={['/provincial/application/321?offerFilter=not-a-match']}>
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
    expect(screen.getByText('Apr 5, 2026')).toBeInTheDocument()
    expect(screen.queryByText('OFF-77')).not.toBeInTheDocument()

    expect(screen.queryByLabelText('Filter offers')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Application offers toolbar' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('shows the two signed-off offer columns and the stored B.C. receipt time', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      offers: [
        {
          offerNumber: 'OFF-77',
          companyName: 'Example Lumber',
          receivedDate: '2026-06-22',
          receivedTimestamp: '2026-06-22T22:37:24Z',
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
    const offers = within(await screen.findByRole('region', { name: 'Application offers' }))
    expect(offers.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Company name',
      'Date and time received',
    ])
    expect(offers.getByText('Example Lumber')).toBeInTheDocument()
    expect(offers.getByText('Jun 22, 2026 · 03:37:24 PM')).toBeInTheDocument()
    expect(offers.queryByRole('button')).not.toBeInTheDocument()
  })

  it('groups the signed-off Application and Scale fields without linked exemption or permits', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
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

    const summaryTile = await selectApplicationSummaryTile(false)
    const rows = summaryTile.querySelectorAll('dl')
    expect(
      Array.from(rows, (row) => Array.from(row.querySelectorAll('dt'), (term) => term.textContent)),
    ).toEqual([
      ['Region', 'Product type', 'Exemption reason'],
      ['Application date', 'List date'],
      ['Exemption term (days)'],
    ])
    expect(
      within(summaryTile)
        .getByRole('heading', { name: 'Application details' })
        .querySelector('svg'),
    ).toBeInTheDocument()
    expect(within(summaryTile).queryByText('Exemption number')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Jurisdiction')).not.toBeInTheDocument()
    expect(screen.queryByText('EX-555')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Permits' })).not.toBeInTheDocument()
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
    expect(within(summaryTile).getByText('Jan 1, 2026')).toBeInTheDocument()
    expect(within(summaryTile).getByText('Jan 3, 2026')).toBeInTheDocument()

    await selectApplicationDetailTab('Scale')
    const scaleTile = screen.getByRole('heading', { name: 'Scale details' }).closest('.cds--tile')
    expect(scaleTile).toBeTruthy()
    expect(
      Array.from((scaleTile as HTMLElement).querySelectorAll('dl'), (row) =>
        Array.from(row.querySelectorAll('dt'), (term) => term.textContent),
      ),
    ).toEqual([
      ['Location of logs'],
      ['Age class'],
      ['Average log volume (m³)', 'Application volume (m³)'],
      ['Species list', 'End use'],
      ['Total pieces'],
    ])
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
    expect(await screen.findByText('Application details')).toBeInTheDocument()
    expect(
      within(getApplicationSummaryTile()).queryByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeNull()

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('heading', { name: 'Scale details' })).toBeInTheDocument()
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

    await selectApplicationDetailTab('Scale')
    expect(screen.queryByRole('button', { name: 'Edit items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
    await selectApplicationDetailTab('Documents')
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(await screen.findByText('locked-doc.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save remark' })).not.toBeInTheDocument()
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
    expect(screen.getAllByText(/00099988$/).length).toBeGreaterThan(0)

    await act(async () => {
      resolveFirstDetail?.(applicationDetail)
    })

    expect(screen.getByText('Second status', { selector: '.lexis-status-tag' })).toBeInTheDocument()
    expect(screen.getAllByText(/00099988$/).length).toBeGreaterThan(0)
    expect(screen.queryByText('00011122')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(1)
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('saves application summary edits and refreshes detail', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    const detailAfterSummarySave: ProvincialApplicationDetail = {
      ...applicationDetail,
      termDays: 430,
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

    await selectApplicationSummaryTile()
    const summaryControls = within(await waitFor(() => getApplicationSummaryTile()))
    expect(summaryControls.queryByLabelText('Application status')).not.toBeInTheDocument()
    expect(summaryControls.getByText('Required fields')).toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Jurisdiction')).not.toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    const legacyOrderedControls = [
      getSummaryComboBox(summaryControls, 'Region'),
      getSummaryComboBox(summaryControls, 'Exemption reason'),
      summaryControls.getByLabelText('Application date'),
      summaryControls.getByRole('group', { name: 'List date' }),
      summaryControls.getByLabelText('Exemption term (days)'),
    ]
    legacyOrderedControls.slice(1).forEach((control, index) => {
      expect(
        legacyOrderedControls[index].compareDocumentPosition(control) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0)
    })
    const termInput = await screen.findByLabelText('Exemption term (days)')
    fireEvent.change(termInput, { target: { value: '430' } })
    expect(screen.queryByLabelText('Exemption term (months)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exemption term (years)')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '02', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01', {
        applicationNumber: '321',
      })
    })
    await selectApplicationDetailTab('Applicant')
    expect(await screen.findByText('Owner Forestry Ltd. · 00011122')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Applicant')
    expect(screen.getByText('Agent Export Services · 00033344')).toBeInTheDocument()
    expect(within(getAgentDetailsTile()).getByText('agent@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm application accuracy' })).toBeNull()

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith({
        applicationNumber: '321',
        saveSource: 'summary',
        applicationDate: '2026-01-01',
        termDays: '430',
        exemptionReasonCode: 'S',
        exportScheduleId: '988',
        orgUnitNumber: '13',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The application was saved.')).toBeInTheDocument()
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  }, 30000)

  it.each(['owner', 'agent'] as const)(
    'sends only %s fields when historical item values are invalid',
    async (saveSource) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        applicationVolume: 0,
        averageLogVolume: 100,
      })
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        applicationVolume: '0',
        averageLogVolume: '100',
        productLocation: '',
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

      await screen.findByRole('heading', { level: 1, name: 'Application 321' })
      await selectApplicationDetailTab('Applicant')
      const controls = within(getOwnerClientDetailsTile())
      await userEvent.click(
        controls.getByRole('button', {
          name: 'Edit applicant details',
        }),
      )
      const contactName =
        saveSource === 'owner'
          ? controls.getAllByRole('textbox', { name: 'Contact name' })[0]
          : within(getAgentDetailsTile()).getByRole('textbox', { name: 'Contact name' })
      await waitFor(() => expect(contactName).toBeEnabled())
      fireEvent.change(contactName, {
        target: {
          value: saveSource === 'owner' ? 'Owner Alternate Contact' : 'Agent Alternate Contact',
        },
      })
      await userEvent.click(controls.getByRole('button', { name: 'Save changes' }))

      await waitFor(() =>
        expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
          expect.objectContaining({
            applicationNumber: '321',
            saveSource: 'owner-agent',
            ownerClientNumber: '00011122',
            ownerClientLocationCode: '00',
            ownerContactName: saveSource === 'owner' ? 'Owner Alternate Contact' : 'Owner Contact',
            applicantTypeCode: 'A',
            agentClientNumber: '00033344',
            agentClientLocationCode: '01',
            agentContactName: saveSource === 'agent' ? 'Agent Alternate Contact' : 'Agent Contact',
          }),
        ),
      )
      expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    },
  )

  it('saves Application-owned fields while unrelated client lookups remain pending', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    mockedFetchApplicationClientLocations.mockImplementation(
      () => new Promise<never>(() => undefined),
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
    fireEvent.change(summaryControls.getByLabelText('Exemption term (days)'), {
      target: { value: '31' },
    })
    const saveSummary = summaryControls.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(saveSummary).toBeEnabled())
    await userEvent.click(saveSummary)

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ termDays: '31' }),
      )
    })
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  })

  it('enforces the single exemption term day input boundaries before saving', async () => {
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

    await selectApplicationSummaryTile()
    const termDays = screen.getByLabelText('Exemption term (days)')

    expect(termDays).toHaveAttribute('max', '99999')
    expect(screen.queryByLabelText('Exemption term (months)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exemption term (years)')).not.toBeInTheDocument()

    fireEvent.change(termDays, { target: { value: '100000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findAllByText('Exemption term days must be 99999 or less.')).toHaveLength(2)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    fireEvent.change(termDays, { target: { value: '0' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findAllByText('Exemption term days must be greater than 0.')).toHaveLength(
      2,
    )
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('validates application item text storage boundaries before saving', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const locationOfLogs = itemDetails.getByLabelText('Location of logs')
    expect(locationOfLogs).toHaveAttribute('maxlength', '250')
    fireEvent.change(locationOfLogs, {
      target: { value: 'L'.repeat(251) },
    })
    expect(
      locationOfLogs.closest('.cds--form-item')?.querySelector('.cds--text-area__label-counter'),
    ).toHaveTextContent('251/250')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(itemDetails.getByText('Location of logs must be 250 characters or fewer.')).toBeVisible()
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('shows the backend agent location error when an application edit is rejected', async () => {
    mockedUpdateApplicationSummary.mockResolvedValueOnce({
      valid: false,
      message: '',
      applicationNumber: '321',
      errors: ['Application agent location does not exist.'],
      warnings: [],
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

    await selectApplicationSummaryTile()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(screen.getByText('Application agent location does not exist.')).toBeVisible()
  })

  it('hides stale agent fields without submitting them during an owner application summary save', async () => {
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
        'Applicant',
        'Application',
        'Scale',
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

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ saveSource: 'summary' }),
      )
    })
    const saved = mockedUpdateApplicationSummary.mock.calls[0][0]
    expect(saved).not.toHaveProperty('applicantTypeCode')
    expect(saved).not.toHaveProperty('agentClientNumber')
    expect(saved).not.toHaveProperty('agentClientLocationCode')
    expect(saved).not.toHaveProperty('agentContactName')
  })

  it('keeps the agent choice and workflow fields read-only for scoped submitters', async () => {
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

    await selectApplicationDetailTab('Applicant')
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit applicant details' }))
    const agentChoice = await ownerControls.findByLabelText("I'm an agent")
    expect(agentChoice).toBeChecked()
    expect(agentChoice).toBeDisabled()
    expect(ownerControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    const summaryControls = within(await selectApplicationSummaryTile())
    expect(summaryControls.queryByLabelText('Application status')).not.toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Jurisdiction')).not.toBeInTheDocument()
    expect(summaryControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const accuracyDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    await userEvent.click(within(accuracyDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(accuracyDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ saveSource: 'summary' }),
      )
    })
    expect(mockedUpdateApplicationSummary.mock.calls[0][0]).not.toHaveProperty('applicantTypeCode')
  })

  it('clears a successful summary save when reopening submitter accuracy confirmation', async () => {
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
    await selectApplicationSummaryTile()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('The application was saved.')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
      ).not.toBeInTheDocument(),
    )
    await selectApplicationSummaryTile()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('dialog', { name: 'Confirm application accuracy' })).toBeVisible()
    expect(screen.queryByText('The application was saved.')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
  })

  it('clears a failed summary save when reopening submitter accuracy confirmation', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedUpdateApplicationSummary.mockRejectedValueOnce(new Error('Synthetic save failure'))
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
    await selectApplicationSummaryTile()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText('Unable to save application summary.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Unable to save application summary.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const reopened = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    expect(
      within(reopened).queryByText('Unable to save application summary.'),
    ).not.toBeInTheDocument()
    expect(within(reopened).getByRole('checkbox', { name: 'I Agree' })).not.toBeChecked()
  })

  it('validates application item edits before saving', async () => {
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

    const itemDetailsTile = await selectApplicationItemDetailsTile()
    const itemDetails = within(itemDetailsTile)
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')
    expect(itemDetails.getByText('Required fields')).toBeInTheDocument()
    expect(
      itemDetails.getByRole('heading', { level: 2, name: 'Scale details' }).querySelector('svg'),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    fireEvent.change(productLocationInput, { target: { value: '' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

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
    const termDaysInput = await summaryControls.findByLabelText('Exemption term (days)')

    await waitFor(() => {
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue(
        'Historic Natural Resource Region',
      )
      expect(summaryControls.getByRole('radio', { name: 'Nov 25, 2011' })).toBeChecked()
    })

    fireEvent.change(termDaysInput, {
      target: { value: '31' },
    })
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          termDays: '31',
          orgUnitNumber: '1834',
          exportScheduleId: '31885',
        }),
      )
    })
  })

  it('keeps the saved list date selectable after choosing another list date', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      listingDate: '2011-11-25',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      exportScheduleId: '31885',
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [{ value: '987', label: 'Jan 11, 2026' }],
      nextSchedules: [
        { value: '987', label: 'Jan 11, 2026' },
        { value: '988', label: 'Jan 25, 2026' },
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

    const summaryControls = within(await selectApplicationSummaryTile())
    await waitFor(() => {
      expect(summaryControls.getByRole('radio', { name: 'Nov 25, 2011' })).toBeChecked()
    })

    await userEvent.click(summaryControls.getByRole('radio', { name: 'Jan 25, 2026' }))
    expect(summaryControls.getByRole('radio', { name: 'Jan 25, 2026' })).toBeChecked()
    await userEvent.click(summaryControls.getByRole('radio', { name: 'Nov 25, 2011' }))
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '31885',
        }),
      )
    })
  })

  it('removes application species through the Carbon multi-select', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const species = itemDetails.getByRole('combobox', { name: /^Species list/ })
    expect(species).toHaveAccessibleName(/Total items selected: 2/)
    await userEvent.click(species)
    await userEvent.click(await itemDetails.findByRole('option', { name: /FI/ }))
    expect(species).toHaveAccessibleName(/Total items selected: 1/)
  })

  it('requires at least one selected species before saving application item details', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const species = itemDetails.getByRole('combobox', { name: /^Species list/ })
    expect(species).toHaveAttribute('aria-required', 'true')
    await userEvent.click(species)
    await userEvent.click(await itemDetails.findByRole('option', { name: /FI/ }))
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(await itemDetails.findByText('At least one species is required.')).toBeVisible()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
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
      currentSchedules: [{ value: '987', label: 'Jan 11, 2026' }],
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
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          orgUnitNumber: '1908',
        }),
      )
    })
  })

  it('lets an approver select No list date on an application summary', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [
        { value: '987', label: 'Jan 11, 2026' },
        { value: '988', label: 'Jan 25, 2026' },
        { value: '989', label: '2026-02-08' },
        { value: '', label: 'Blank' },
      ],
      nextSchedules: [
        { value: '987', label: 'Jan 11, 2026' },
        { value: '988', label: 'Jan 25, 2026' },
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
    await waitFor(() => {
      expect(summaryControls.getByRole('radio', { name: 'Jan 11, 2026' })).toBeChecked()
    })
    await userEvent.click(summaryControls.getByRole('radio', { name: 'Jan 25, 2026' }))
    expect(summaryControls.getByRole('radio', { name: 'Jan 25, 2026' })).toBeChecked()
    await userEvent.click(summaryControls.getByRole('radio', { name: 'No list date' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '',
        }),
      )
    })
  })

  it('requires a submitter to choose one of the next two list dates', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'NEW',
      statusDescription: 'New',
      listingDate: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicationStatusCode: 'NEW',
      exportScheduleId: '',
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [
        { value: '986', label: '2026-01-04' },
        { value: '987', label: 'Jan 11, 2026' },
        { value: '', label: 'Blank' },
      ],
      nextSchedules: [
        { value: '987', label: 'Jan 11, 2026' },
        { value: '988', label: 'Jan 25, 2026' },
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const listDate = await summaryControls.findByRole('group', { name: 'List date' })
    await waitFor(() => {
      expect(
        within(listDate)
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('value')),
      ).toEqual(['987', '988'])
    })
    within(listDate)
      .getAllByRole('radio')
      .forEach((radio) => expect(radio).not.toBeChecked())

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const blockedDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(blockedDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(blockedDialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(blockedDialog).findByText('Select a valid list date.')).toBeVisible()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    await userEvent.click(within(blockedDialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(listDate).getByRole('radio', { name: 'Jan 25, 2026' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '988',
        }),
      )
    })
  })

  it('locks the list date for a submitter once the application is approved', async () => {
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
    const listDate = await summaryControls.findByRole('group', { name: 'List date' })
    await waitFor(() => {
      expect(within(listDate).getByRole('radio', { checked: true })).toHaveAttribute('value', '987')
    })
    expect(
      summaryControls.getByText('List date cannot be changed after the application is approved.'),
    ).toBeVisible()
    await userEvent.click(within(listDate).getAllByRole('radio', { checked: false })[0])
    expect(within(listDate).getByRole('radio', { checked: true })).toHaveAttribute('value', '987')

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '987',
        }),
      )
    })
  })

  it('validates application item volume ranges before saving', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const applicationVolumeInput = await itemDetails.findByLabelText('Application volume (m³)')
    const averageLogVolumeInput = await itemDetails.findByLabelText('Average log volume (m³)')

    await waitFor(() => {
      expect(applicationVolumeInput).toHaveValue(100)
    })

    fireEvent.change(applicationVolumeInput, { target: { value: '10000000' } })
    fireEvent.change(averageLogVolumeInput, { target: { value: '100' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Average log volume must be 99.9 or less.').length).toBeGreaterThan(
      0,
    )
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('shows Cancel before Save changes in the Application and Scale editors', async () => {
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

    const application = within(await selectApplicationSummaryTile())
    const region = getSummaryComboBox(application, 'Region')
    const productType = getSummaryComboBox(application, 'Product type')
    expect(region.compareDocumentPosition(productType) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    )
    const applicationActions = application.getAllByRole('button', {
      name: /^(Cancel|Save changes)$/,
    })
    expect(applicationActions.map((button) => button.textContent?.trim())).toEqual([
      'Cancel',
      'Save changes',
    ])
    await userEvent.click(application.getByRole('button', { name: 'Cancel' }))

    const scale = within(await selectApplicationItemDetailsTile())
    expect(scale.queryByLabelText('Product type')).not.toBeInTheDocument()
    const scaleActions = scale.getAllByRole('button', { name: /^(Cancel|Save changes)$/ })
    expect(scaleActions.map((button) => button.textContent?.trim())).toEqual([
      'Cancel',
      'Save changes',
    ])
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const applicationVolume = await itemDetails.findByLabelText('Application volume (m³)')
    const saveItemDetails = itemDetails.getByRole('button', {
      name: 'Save changes',
    })

    fireEvent.change(applicationVolume, { target: { value: '250.999' } })
    await userEvent.click(saveItemDetails)

    expect(
      screen.getAllByText('Application volume must have no more than two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    fireEvent.change(applicationVolume, { target: { value: '9999999.99' } })
    await userEvent.click(saveItemDetails)

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  })

  it.each(['H', 'T'])(
    'blocks %s to Standing Timber when packages exist',
    async (productTypeCode) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        productTypeCode,
      })
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        productTypeCode,
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

      const application = within(await selectApplicationSummaryTile())
      await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Standing Timber')
      const message =
        'Product type cannot be changed to Standing Timber while packages exist. Remove the packages first.'
      expect(screen.queryByText(message)).not.toBeInTheDocument()
      await userEvent.click(application.getByRole('button', { name: 'Save changes' }))

      expect(screen.getAllByText(message).length).toBeGreaterThan(0)
      expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
      expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
      await userEvent.click(application.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText(message)).not.toBeInTheDocument()
    },
  )

  it('keeps application edits open when the backend rejects a product change with persisted scales', async () => {
    const message =
      'Product type cannot be changed to Unmanufactured Timber while Summary of scale records exist. Remove the Summary of scale records first.'
    mockedUpdateApplicationSummary.mockResolvedValue({
      valid: false,
      applicationNumber: '321',
      message: '',
      errors: [message],
      warnings: [],
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

    const application = within(await selectApplicationSummaryTile())
    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Timber')
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(message)).toBeVisible()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
      expect.objectContaining({ saveSource: 'items', productTypeCode: 'T' }),
    )
    expect(application.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    await userEvent.click(application.getByRole('button', { name: 'Cancel' }))
    expect(application.getByText('Harvested Timber', { exact: true })).toBeVisible()
  })

  it('shows and saves required item fields when changing Timber to Harvested Timber', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
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

    const application = within(await selectApplicationSummaryTile())
    expect(application.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(application.queryByLabelText('Average log volume (m³)')).not.toBeInTheDocument()
    expect(application.queryByLabelText('Age class')).not.toBeInTheDocument()
    expect(application.queryByLabelText('End use')).not.toBeInTheDocument()

    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Harvested Timber')

    fireEvent.change(await application.findByLabelText('Location of logs'), {
      target: { value: 'Prince George' },
    })
    fireEvent.change(application.getByLabelText('Average log volume (m³)'), {
      target: { value: '2.5' },
    })
    await chooseComboBoxOption(getSummaryComboBox(application, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(application, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(application, 'End use'), 'LU - Lumber')
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          saveSource: 'items',
          productTypeCode: 'H',
          productLocation: 'Prince George',
          averageLogVolume: '2.5',
          growthTypeCode: 'O',
          endUseCode: 'LU',
        }),
      )
    })
  })

  it('cancels a product type change and its dependent scale edits together', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
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

    const application = within(await selectApplicationSummaryTile())
    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Harvested Timber')
    const dependentScaleDetails = within(
      await application.findByRole('region', { name: 'Scale details for changed product type' }),
    )
    fireEvent.change(dependentScaleDetails.getByLabelText('Location of logs'), {
      target: { value: 'Changed location' },
    })
    fireEvent.change(dependentScaleDetails.getByLabelText('Average log volume (m³)'), {
      target: { value: '3.5' },
    })
    await chooseComboBoxOption(getSummaryComboBox(dependentScaleDetails, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(dependentScaleDetails, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(dependentScaleDetails, 'End use'), 'LU - Lumber')

    await userEvent.click(application.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(application.getByText('Timber', { exact: true })).toBeVisible()
    expect(application.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(application.queryByLabelText('Age class')).not.toBeInTheDocument()
    const scale = within(await selectApplicationItemDetailsTile(false))
    expect(scale.queryByText('Changed location')).not.toBeInTheDocument()
    expect(scale.queryByText('Old Growth')).not.toBeInTheDocument()
  })

  it('keeps saved scale details in the Scale tab while a product type change is unsaved', async () => {
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

    const application = within(await selectApplicationSummaryTile())
    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Timber')
    expect(
      await application.findByRole('region', { name: 'Scale details for changed product type' }),
    ).toBeInTheDocument()

    const scaleTile = await selectApplicationItemDetailsTile(false)
    const detailField = (label: string): HTMLElement => {
      const field = within(scaleTile).getByText(label).closest('.detail-field-item')
      expect(field).toBeTruthy()
      return field as HTMLElement
    }
    expect(detailField('Location of logs')).toHaveTextContent('BC')
    expect(detailField('Age class')).toHaveTextContent('Old Growth')
    expect(detailField('Average log volume (m³)')).toHaveTextContent('2')
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('saves Timber-to-Standing-Timber changes on the first action without a package-volume warning', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
      packages: [],
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
    })
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })

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

    const application = within(await selectApplicationSummaryTile())
    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Standing Timber')
    await chooseComboBoxOption(getSummaryComboBox(application, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(application, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(application, 'End use'), 'LU - Lumber')
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          saveSource: 'items',
          productTypeCode: 'S',
          growthTypeCode: 'O',
          endUseCode: 'LU',
        }),
      )
    })
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(
      screen.queryByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).not.toBeInTheDocument()
  })

  it('saves product type and application detail changes together', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
      packages: [],
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
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

    const application = within(await selectApplicationSummaryTile())
    fireEvent.change(application.getByLabelText('Exemption term (days)'), {
      target: { value: '45' },
    })
    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Standing Timber')
    await chooseComboBoxOption(getSummaryComboBox(application, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(application, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(application, 'End use'), 'LU - Lumber')
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          saveSource: 'summary-items',
          productTypeCode: 'S',
          termDays: '45',
          exportScheduleId: '987',
        }),
      )
    })
  })

  it('saves a submitter product type change without requiring a list date', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
      productTypeCode: 'T',
      packages: [],
      listingDate: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicationStatusCode: 'APP',
      exportScheduleId: '',
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
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

    const application = within(await selectApplicationSummaryTile())
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))
    const blockedDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(blockedDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(blockedDialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(blockedDialog).findByText('Select a valid list date.')).toBeVisible()
    await userEvent.click(within(blockedDialog).getByRole('button', { name: 'Cancel' }))
    expect(application.getByText('Select a valid list date.')).toBeInTheDocument()

    await chooseComboBoxOption(getSummaryComboBox(application, 'Product type'), 'Standing Timber')
    expect(application.queryByText('Select a valid list date.')).not.toBeInTheDocument()
    await chooseComboBoxOption(getSummaryComboBox(application, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(application, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(application, 'End use'), 'LU - Lumber')
    await userEvent.click(application.getByRole('button', { name: 'Save changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ saveSource: 'items', productTypeCode: 'S' }),
      )
    })
    expect(mockedUpdateApplicationSummary.mock.calls[0][0]).not.toHaveProperty('exportScheduleId')
    await waitFor(() =>
      expect(application.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument(),
    )
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    await itemDetails.findByLabelText('Application volume (m³)')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    const firstDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const firstAcknowledgement = within(firstDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    const firstConfirm = within(firstDialog).getByRole('button', {
      name: 'Save changes',
    })
    expect(firstAcknowledgement).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    await userEvent.click(firstConfirm)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(firstAcknowledgement)
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    const reopenedDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const reopenedAcknowledgement = within(reopenedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(reopenedAcknowledgement).not.toBeChecked()
    await userEvent.click(reopenedAcknowledgement)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await within(reopenedDialog).findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Review package volumes')).toHaveLength(1)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(reopenedDialog).toBeVisible()
    expect(reopenedAcknowledgement).toBeChecked()
    await userEvent.click(
      within(reopenedDialog).getByRole('button', {
        name: 'Save changes',
      }),
    )

    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))
  })

  it('resets application item edits from the editable snapshot', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))

    const resetItemDetails = within(await selectApplicationItemDetailsTile())
    await waitFor(() => {
      expect(resetItemDetails.getByLabelText('Location of logs')).toHaveValue('BC')
    })
  })

  it('guards unload only after application item details differ from the persisted baseline', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')
    await waitFor(() => expect(productLocationInput).toHaveValue('BC'))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))
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

    const summaryControls = within(await selectApplicationSummaryTile())
    fireEvent.change(await summaryControls.findByLabelText('Exemption term (days)'), {
      target: { value: '31' },
    })
    await selectApplicationRemarksForEditing()
    fireEvent.change(await screen.findByLabelText('Remark'), {
      target: { value: 'Sequential remark' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await userEvent.click(reviewTile.getByRole('radio', { name: 'Rejected' }))
    fireEvent.change(reviewTile.getByLabelText('Remarks'), {
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

  it('shows the saved contact name in view and edit mode without substituting a lookup contact', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      ownerContactName: 'Saved Custom Contact',
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

    const ownerSection = await screen.findByRole('region', { name: 'Owner' })
    expect(await within(ownerSection).findByText('Saved Custom Contact')).toBeInTheDocument()

    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit applicant details' }))
    expect(ownerControls.getAllByRole('textbox', { name: 'Contact name' })[0]).toHaveValue(
      'Saved Custom Contact',
    )
  })

  it('saves a typed summary contact name, as Figma uses free text', async () => {
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

    await selectApplicationDetailTab('Applicant')
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit applicant details' }))
    const ownerContactInput = await ownerControls.findByLabelText('Contact name', {
      selector: '#applicationOwnerContactNameEdit',
    })
    fireEvent.change(ownerContactInput, { target: { value: 'Typed Owner' } })
    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'Typed Owner',
        }),
      )
    })
  })

  it('does not substitute the owner email when an agent applicant has no email', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: clientNumber === '00033344' ? 'Agent without email' : 'Owner Forestry Ltd.',
      clientAcronym: '',
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
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      within(reviewTile).getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01', {
        applicationNumber: '321',
      })
      expect(within(reviewTile).getByLabelText('Client email address')).toHaveValue('')
    })
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
      await screen.findByText('Unable to retrieve provincial application detail.', {
        selector: '.app-inline-notification .cds--inline-notification__subtitle',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).not.toHaveBeenCalled()
  })
})
