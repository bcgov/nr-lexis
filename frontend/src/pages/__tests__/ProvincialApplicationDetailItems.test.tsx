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
import type {
  fetchApplicationPackageDetails,
  fetchApplicationPermits,
} from '@/service/provincial-application-items-service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupApplicationDetailTests,
  LocationProbe,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  getApplicationSummaryTile,
  mockedAddApplicationPackage,
  mockedAddApplicationScaleToPackage,
  mockedCheckApplicationVolumeUsage,
  mockedDeleteApplicationPackage,
  mockedDeleteApplicationScale,
  mockedFetchApplicationDocuments,
  mockedFetchApplicationGradeCodes,
  mockedFetchApplicationPackageDetails,
  mockedFetchApplicationPackageScales,
  mockedFetchApplicationPackageSpecies,
  mockedFetchApplicationPackageStatusCodes,
  mockedFetchApplicationPermits,
  mockedFetchApplicationRemainingSpecies,
  mockedFetchApplicationScaleDetails,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchApplicationUniqueScales,
  mockedFetchProvincialApplicationDetail,
  mockedFetchProvincialApplicationOptions,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationSummary,
  selectApplicationDetailTab,
  selectApplicationItemsForEditing,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

Element.prototype.scrollIntoView = vi.fn()

describe.sequential('Provincial Application Detail Actions - items', () => {
  beforeEach(setupApplicationDetailTests)

  it('makes the core application usable while secondary sections continue loading', async () => {
    let resolvePermits:
      | ((value: Awaited<ReturnType<typeof fetchApplicationPermits>>) => void)
      | undefined
    mockedFetchApplicationPermits.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermits = resolve
      }),
    )

    const { container } = render(
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
      await screen.findByRole('heading', { level: 1, name: 'Application 321' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(mockedFetchApplicationPermits).toHaveBeenCalledWith('321'))
    expect(container.querySelector('.provincial-application-detail')).not.toHaveAttribute('inert')
    expect(mockedFetchApplicationDocuments).not.toHaveBeenCalled()

    await act(async () => {
      resolvePermits?.([])
    })

    await waitFor(() => expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('321'))
  })

  it('renders application permits and opens permit details', async () => {
    mockedFetchApplicationPermits.mockResolvedValue([
      { permitNumber: '900100', permitStatusDescription: 'Active' },
      { permitNumber: '900101', permitStatusDescription: 'Complete' },
    ])

    render(
      <MemoryRouter initialEntries={['/provincial/application/321?packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/provincial/permit/:permitNumber" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchApplicationPermits).toHaveBeenCalledWith('321')
    })
    await selectApplicationDetailTab('Application')
    const permitRow = (await screen.findByText('900101')).closest('tr')
    expect(permitRow).toBeTruthy()
    const permitStatus = within(permitRow as HTMLElement).getByText('Complete')
    expect(permitStatus).toHaveClass('lexis-status-tag')
    expect(permitStatus).toHaveAttribute('data-status-variant', 'positive')

    await userEvent.click(within(permitRow as HTMLElement).getByRole('button', { name: 'Open' }))

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/permit/900101?packageFilter=PKG-1')
  })

  it('opens a scale deep link on the Items tab and selects its package for an owner application', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'O',
      agentClientNumber: '',
      agentClientLocationCode: '',
    })
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 50, pieceCount: 3 },
      ],
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/321?tab=items&packageNumber=PKG-2&section=scales',
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

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Items' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
    })
    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-2')
    expect(document.getElementById('application-items-scales')).toBeInTheDocument()
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })
  })

  it('keeps package mutation controls behind the Items edit mode', async () => {
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByRole('button', { name: 'Edit items' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Package Comments')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    expect(await screen.findByLabelText('Package Comments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeInTheDocument()

    await userEvent.click(
      within(
        document.querySelector(
          '#application-items .application-items-panel__header',
        ) as HTMLElement,
      ).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByLabelText('Package Comments')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit items' })).toBeInTheDocument()
  })

  it('keeps a manual package selection after handling a deep-link package focus', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 50, pieceCount: 3 },
      ],
    })
    mockedFetchApplicationPackageDetails.mockImplementation(async (packageNumber) => ({
      success: true,
      packageNumber,
      volume: packageNumber === 'PKG-2' ? '50.0' : '100.0',
      scaledVolume: packageNumber === 'PKG-2' ? 10 : 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: packageNumber === 'PKG-2' ? 'Second package' : 'First package',
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'LOG',
      productTypeDescription: 'Logs',
    }))

    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items&packageNumber=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const packageSelector = await screen.findByRole('combobox', { name: 'Selected Package' })
    await waitFor(() => {
      expect(packageSelector).toHaveValue('PKG-1')
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })

    await selectApplicationItemsForEditing()
    await chooseComboBoxOption(packageSelector, 'PKG-2')
    await waitFor(() => {
      expect(packageSelector).toHaveValue('PKG-2')
      expect(screen.getByLabelText('Package Comments')).toHaveValue('Second package')
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(packageSelector).toHaveValue('PKG-2')
    expect(mockedFetchApplicationPackageDetails).toHaveBeenLastCalledWith('PKG-2')
  })

  it('blocks application summary and package edits for exemption approvers', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      exemptionApprover: true,
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it.each([
    ['EXE', 'Exempted - New'],
    ['PMT', 'Permitted'],
    ['PND', 'Pending'],
    ['REJ', 'Rejected'],
    ['WDN', 'Withdrawn'],
  ])(
    'blocks application summary and package edits for %s applications',
    async (applicationStatusCode, statusDescription) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        applicationStatusCode,
        statusDescription,
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

      await selectApplicationDetailTab('Application')
      expect(await screen.findByText('Application summary')).toBeInTheDocument()
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
      const summaryTile = getApplicationSummaryTile()
      expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

      await selectApplicationDetailTab('Items')
      expect(await screen.findByText('Package Details')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit items' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete Package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
      expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
      expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
      expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
      expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
    },
  )

  it('keeps item mutations available when the server denies only summary editing', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      canEditApplicationDetails: false,
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'APP', label: 'Approved' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [],
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
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(within(getApplicationSummaryTile()).queryByLabelText('Exemption reason')).toBeNull()
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()

    await selectApplicationItemsForEditing()
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
      expect(screen.queryByText('Loading authoritative item options…')).not.toBeInTheDocument()
      expect(screen.queryByText('Item options unavailable')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save Package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Create Package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Add Scale' })).toBeEnabled()
    })
  })

  it('keeps summary editing available when the server denies item mutations', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      canEditApplicationDetails: true,
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

    await selectApplicationSummaryTile()
    expect(
      await within(getApplicationSummaryTile()).findByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeEnabled()

    await selectApplicationDetailTab('Items')
    expect(screen.queryByRole('button', { name: 'Edit items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
  })

  it('hides package and scale mutations for standing timber applications', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'S',
      packages: [],
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
      canUpdatePackageNumber: true,
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

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
  })

  it('keeps authoritative empty remaining-species results empty', async () => {
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([])

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

    await selectApplicationItemsForEditing()
    await waitFor(() => {
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenCalled()
    })

    const packageSpecies = screen.getAllByRole('combobox', { name: 'Species' })[0]
    await userEvent.click(packageSpecies)
    expect(screen.queryByRole('option', { name: 'CE - Cedar' })).not.toBeInTheDocument()

    const createSpecies = screen.getByRole('combobox', {
      name: 'Create Package Species',
    })
    await userEvent.click(createSpecies)
    expect(screen.queryByRole('option', { name: 'CE - Cedar' })).not.toBeInTheDocument()
  })

  it('edits package species and saves application item details', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })
    expect(screen.queryByLabelText('Application item summary')).not.toBeInTheDocument()
    const packageDetailsSection = screen.getByText('Package Details').closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(packageDetailsSection).toHaveClass('application-items-card')
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total Scale Volume'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('20')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total Pieces'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('5')).toBeInTheDocument()

    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[0],
      'CE - Cedar',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add Species' }))
    await waitFor(() => {
      expect(screen.getAllByText('CE - Cedar').some((element) => element.tagName === 'TD')).toBe(
        true,
      )
    })

    fireEvent.change(screen.getByLabelText('Package Comments'), {
      target: { value: 'Updated package' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Package' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          comments: 'Updated package',
          endUseCode: 'LU',
          speciesCodes: ['FI', 'CE'],
        }),
      )
    })
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()
  })

  it('displays legacy scale types for cascade split codes', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM-WATER',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 5,
        volume: '20.0',
        id: '55',
        cascadeSplitCode: 'W',
      },
      {
        permitted: false,
        timberMark: 'TM-ESTIMATE',
        species: 'Cedar',
        grade: 'Sawlog',
        pieces: 2,
        volume: '8.0',
        id: '56',
        cascadeSplitCode: 'E',
      },
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

    await selectApplicationDetailTab('Items')

    const waterScaleRow = (await screen.findByText('TM-WATER')).closest('tr')
    const estimatedScaleRow = screen.getByText('TM-ESTIMATE').closest('tr')
    expect(waterScaleRow).toBeTruthy()
    expect(estimatedScaleRow).toBeTruthy()
    expect(within(waterScaleRow as HTMLElement).getByText('C')).toBeInTheDocument()
    expect(within(estimatedScaleRow as HTMLElement).getByText('I')).toBeInTheDocument()
  })

  it('guards package drafts and provides an explicit local reset', async () => {
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

    await selectApplicationItemsForEditing()
    const comments = await screen.findByLabelText('Package Comments')
    fireEvent.change(comments, { target: { value: 'Unsaved package draft' } })
    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Unsaved changes',
    })
    expect(dialog).toHaveAccessibleDescription(/Use the Items tab to save or reset/)
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset package drafts' }))

    expect(screen.getByLabelText('Package Comments')).toHaveValue('Ready')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('fails closed when selected package data cannot be loaded', async () => {
    mockedFetchApplicationPackageSpecies.mockRejectedValue(
      new Error('Oracle package species lookup failed'),
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

    await selectApplicationItemsForEditing()

    expect(
      await screen.findByText('Unable to retrieve application item details.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Package' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Save Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedDeleteApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('disables package and scale mutations when authoritative item options fail', async () => {
    mockedFetchApplicationPackageStatusCodes.mockRejectedValue(
      new Error('Oracle package status lookup failed'),
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

    await selectApplicationItemsForEditing()

    expect(await screen.findByText('Item options unavailable')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Create Package' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add Scale' })).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Package' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows field validation before creating an empty package', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByRole('button', { name: 'Create Package' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Package number is required.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('blocks duplicate package numbers before creating a package', async () => {
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

    await selectApplicationItemsForEditing()
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)
    const packageNumberInput = createPackageControls.getByLabelText(
      'Package Number',
    ) as HTMLInputElement

    fireEvent.change(packageNumberInput, { target: { value: 'pkg-1' } })
    expect(packageNumberInput.value).toBe('PKG-1')
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Package PKG-1 already exists.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('shows legacy package validation before creating an invalid package', async () => {
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

    await selectApplicationItemsForEditing()
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    fireEvent.change(createPackageControls.getByLabelText('Package Number'), {
      target: { value: 'pkg-new' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Package Volume'), {
      target: { value: '25.55' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Length'), {
      target: { value: '100' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Diameter'), {
      target: { value: '100' },
    })
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(
      screen.getAllByText('Package volume must have no more than one decimal place.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Average length must be 99 or less.')).toBeInTheDocument()
    expect(screen.getByText('Average diameter must be 99.99 or less.')).toBeInTheDocument()
    expect(screen.getByText('Package status code is required.')).toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('requires age class before creating a harvested product package', async () => {
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

    await selectApplicationItemsForEditing()
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    fireEvent.change(createPackageControls.getByLabelText('Package Number'), {
      target: { value: 'PKG-NEW' },
    })
    fireEvent.blur(createPackageControls.getByLabelText('Package Number'))
    fireEvent.change(createPackageControls.getByLabelText('Package Volume'), {
      target: { value: '25.0' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Length'), {
      target: { value: '12.0' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Diameter'), {
      target: { value: '24.0' },
    })
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Status Code' }),
      'ACT - Active',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Product Type' }),
      'H - Harvested Timber',
    )
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    expect(screen.getAllByText('Age class is required.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('creates application packages with selected species and end use', async () => {
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

    await selectApplicationItemsForEditing()
    const createPackageSection = (
      await screen.findByRole('heading', { name: 'Create Package' })
    ).closest('section')
    expect(createPackageSection).toBeTruthy()
    const createPackageControls = within(createPackageSection as HTMLElement)

    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', {
        name: 'Create Package Species',
      }),
      'CE - Cedar',
    )
    await userEvent.click(
      createPackageControls.getByRole('button', {
        name: 'Add species to new package',
      }),
    )
    await waitFor(() => {
      expect(createPackageControls.getByText('CE - Cedar')).toBeInTheDocument()
    })

    fireEvent.change(createPackageControls.getByLabelText('Package Number'), {
      target: { value: 'PKG-NEW' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Package Volume'), {
      target: { value: '25.0' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Length'), {
      target: { value: '12.0' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average Diameter'), {
      target: { value: '24.0' },
    })
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Status Code' }),
      'ACT - Active',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Product Type' }),
      'H - Harvested Timber',
    )
    await chooseComboBoxOption(
      createPackageControls.getByRole('combobox', { name: 'Age Class' }),
      'S - Second Growth',
    )
    await waitFor(() => {
      expect(
        createPackageControls.getByRole('combobox', {
          name: 'End Use Options',
        }),
      ).toHaveValue('LU - Lumber')
    })

    await userEvent.click(createPackageControls.getByRole('button', { name: 'Create Package' }))

    await waitFor(() => {
      expect(mockedAddApplicationPackage).toHaveBeenCalledWith({
        packageNumber: 'PKG-NEW',
        applicationNumber: '321',
        volume: '25.0',
        averageLength: '12.0',
        averageDiameter: '24.0',
        status: 'ACT',
        comments: '',
        reprocessed: 'N',
        ageClass: 'S',
        productType: 'H',
        endUseCode: 'LU',
        speciesCodes: ['CE'],
      })
    })
    expect(await screen.findByText('Package PKG-NEW created.')).toBeInTheDocument()
    expect(createPackageControls.queryByText('Package number is required.')).not.toBeInTheDocument()
  })

  it('deletes the selected application package', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 0,
        volume: '0.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
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

    await selectApplicationItemsForEditing()
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: 'Package Details' })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(
      within(packageDetailsSection as HTMLElement).getAllByText('Package Number').length,
    ).toBeGreaterThan(1)
    expect(within(packageDetailsSection as HTMLElement).getByText('PKG-1')).toBeInTheDocument()

    await userEvent.click(
      within(packageDetailsSection as HTMLElement).getByRole('button', {
        name: 'Delete Package',
      }),
    )
    const confirmation = await screen.findByRole('dialog', { name: 'Delete package' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete package PKG-1 from application 321? This cannot be undone.',
    )
    expect(mockedDeleteApplicationPackage).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedDeleteApplicationPackage).toHaveBeenCalledWith('PKG-1', '321')
    })
    expect(await screen.findByText('Package PKG-1 deleted.')).toBeInTheDocument()
  })

  it('keeps a failed package deletion open for retry', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 0,
        volume: '0.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
    ])
    mockedDeleteApplicationPackage.mockResolvedValue({ success: false })

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

    await selectApplicationItemsForEditing()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Package' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Delete package' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Failed to delete package')).toBeInTheDocument()
    expect(screen.getByText('Package delete failed. Refresh and try again.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete package' })).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getAllByText('PKG-1').length).toBeGreaterThan(0)
  })

  it('prevents package save and delete when package scales are permitted', async () => {
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: true,
        timberMark: 'TM001',
        species: 'Douglas-fir',
        grade: 'Sawlog',
        pieces: 5,
        volume: '20.0',
        id: '55',
        cascadeSplitCode: 'S',
      },
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

    await selectApplicationItemsForEditing()
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: 'Package Details' })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByLabelText('Package Comments')).toBeDisabled()
      expect(
        within(packageDetailsSection as HTMLElement).getByRole('button', {
          name: 'Save Package',
        }),
      ).toBeDisabled()
      expect(
        within(packageDetailsSection as HTMLElement).getByRole('button', {
          name: 'Delete Package',
        }),
      ).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: 'Add Species' })).toBeDisabled()
    const packageSpeciesSection = screen.getByText('Package Species').closest('section')
    expect(packageSpeciesSection).toBeTruthy()
    expect(
      within(packageSpeciesSection as HTMLElement).getByRole('button', {
        name: 'Remove',
      }),
    ).toBeDisabled()
  })

  it('ignores stale package item responses after selecting another package', async () => {
    const detailWithTwoPackages: ProvincialApplicationDetail = {
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 200, pieceCount: 8 },
      ],
    }
    let resolveFirstPackageDetails:
      | ((value: Awaited<ReturnType<typeof fetchApplicationPackageDetails>>) => void)
      | undefined
    mockedFetchProvincialApplicationDetail.mockResolvedValue(detailWithTwoPackages)
    mockedFetchApplicationPackageDetails
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstPackageDetails = resolve
          }),
      )
      .mockResolvedValueOnce({
        success: true,
        packageNumber: 'PKG-2',
        volume: '200.0',
        scaledVolume: 40,
        length: '14.0',
        diameter: '26.0',
        status: 'ACT',
        comments: 'Second package',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: 'O',
        ageClassDescription: 'Old',
        productType: 'LOG',
        productTypeDescription: 'Logs',
      })
    mockedFetchApplicationPackageSpecies.mockResolvedValue([
      {
        species: 'CE',
        endUse: 'LU',
        endUseDescription: 'Lumber',
      },
    ])
    mockedFetchApplicationPackageScales.mockResolvedValue([
      {
        permitted: false,
        timberMark: 'TM002',
        species: 'Cedar',
        grade: 'Sawlog',
        pieces: 8,
        volume: '40.0',
        id: '56',
        cascadeSplitCode: 'S',
      },
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

    await selectApplicationItemsForEditing()
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })

    const packagesSection = (await screen.findByRole('heading', { name: 'Packages' })).closest(
      '.cds--tile',
    )
    expect(packagesSection).toBeTruthy()
    const secondPackageRow = within(packagesSection as HTMLElement)
      .getByText('PKG-2')
      .closest('tr')
    expect(secondPackageRow).toBeTruthy()
    expect(within(secondPackageRow as HTMLElement).getByText('200')).toBeInTheDocument()
    expect(within(secondPackageRow as HTMLElement).getByText('8')).toBeInTheDocument()

    const secondPackageRadio = within(secondPackageRow as HTMLElement).getByRole('radio', {
      name: 'Select package PKG-2',
    })
    expect(secondPackageRadio).not.toBeChecked()
    fireEvent.click(secondPackageRadio)

    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
      expect(screen.getByLabelText('Package Comments')).toHaveValue('Second package')
    })
    expect(secondPackageRadio).toBeChecked()

    await act(async () => {
      resolveFirstPackageDetails?.({
        success: true,
        packageNumber: 'PKG-1',
        volume: '100.0',
        scaledVolume: 20,
        length: '12.0',
        diameter: '24.0',
        status: 'ACT',
        comments: 'First package stale',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: 'O',
        ageClassDescription: 'Old',
        productType: 'LOG',
        productTypeDescription: 'Logs',
      })
    })

    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-2')
    expect(screen.getByLabelText('Package Comments')).toHaveValue('Second package')
    expect(screen.queryByDisplayValue('First package stale')).not.toBeInTheDocument()
    expect(screen.getByText('TM002')).toBeInTheDocument()
    expect(screen.queryByText('TM001')).not.toBeInTheDocument()
    expect(mockedFetchApplicationPackageSpecies).not.toHaveBeenCalledWith('PKG-1')
    expect(mockedFetchApplicationPackageScales).not.toHaveBeenCalledWith('PKG-1')
  })

  it('confirms and clears package-specific drafts before switching packages', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [
        { packageNumber: 'PKG-1', volume: 100, pieceCount: 5 },
        { packageNumber: 'PKG-2', volume: 200, pieceCount: 8 },
      ],
    })
    mockedFetchApplicationPackageDetails.mockImplementation(async (packageNumber) => ({
      success: true,
      packageNumber,
      volume: packageNumber === 'PKG-2' ? '200.0' : '100.0',
      scaledVolume: packageNumber === 'PKG-2' ? 40 : 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: `${packageNumber} comments`,
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'LOG',
      productTypeDescription: 'Logs',
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

    await selectApplicationItemsForEditing()
    await waitFor(() =>
      expect(screen.getByLabelText('Package Comments')).toHaveValue('PKG-1 comments'),
    )
    fireEvent.change(screen.getByLabelText('Timber Mark'), { target: { value: 'DRAFT-A' } })
    const packagesSection = (await screen.findByRole('heading', { name: 'Packages' })).closest(
      '.cds--tile',
    )
    expect(packagesSection).toBeTruthy()
    const secondPackageRadio = within(packagesSection as HTMLElement).getByRole('radio', {
      name: 'Select package PKG-2',
    })
    fireEvent.click(secondPackageRadio)

    const confirmation = await screen.findByRole('dialog', {
      name: 'Discard package drafts?',
    })
    expect(confirmation).toHaveAccessibleDescription(/discard unsaved package, species, and scale/)
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-1')
    expect(
      within(packagesSection as HTMLElement).getByRole('radio', {
        name: 'Select package PKG-1',
      }),
    ).toBeChecked()
    expect(secondPackageRadio).not.toBeChecked()
    expect(screen.getByLabelText('Timber Mark')).toHaveValue('DRAFT-A')

    fireEvent.click(secondPackageRadio)
    await userEvent.click(screen.getByRole('button', { name: 'Discard and switch' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Selected Package' })).toHaveValue('PKG-2')
      expect(screen.getByLabelText('Timber Mark')).toHaveValue('')
    })
    expect(secondPackageRadio).toBeChecked()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows legacy timber mark summaries for application scales', async () => {
    mockedFetchApplicationUniqueScales.mockResolvedValue([{ timberMark: 'TM-SUMMARY' }])

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

    await selectApplicationDetailTab('Items')
    const timberMarksSection = (
      await screen.findByRole('heading', { name: 'Timber Marks' })
    ).closest('div')
    expect(timberMarksSection).toBeTruthy()
    expect(
      await within(timberMarksSection as HTMLElement).findByText('TM-SUMMARY'),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationUniqueScales).toHaveBeenCalledWith('321')
  })

  it('adds and deletes package scales', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    const detailFetchCountAfterInitialLoad =
      mockedFetchProvincialApplicationDetail.mock.calls.length
    fireEvent.change(screen.getByLabelText('Timber Mark'), {
      target: { value: 'TM002' },
    })
    fireEvent.blur(screen.getByLabelText('Timber Mark'))
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('12', 'FI')
    })
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Scale Volume'), {
      target: { value: '8.0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    await waitFor(() => {
      expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          timberMark: 'TM002',
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          pieces: '2',
          volume: '8.0',
        }),
      )
    })
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
      detailFetchCountAfterInitialLoad,
    )
    expect(await screen.findByText('Scale 56 added.')).toBeInTheDocument()
    expect(screen.queryByText('Timber mark is required.')).not.toBeInTheDocument()

    const scaleRow = screen.getByText('TM001').closest('tr')
    expect(scaleRow).toBeTruthy()
    expect(within(scaleRow as HTMLElement).getByText('-')).toBeInTheDocument()
    fireEvent.click(within(scaleRow as HTMLElement).getByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Delete scale' })
    expect(confirmation).toHaveTextContent(
      'Permanently delete scale 55 (TM001) from package PKG-1? This cannot be undone.',
    )
    expect(mockedDeleteApplicationScale).not.toHaveBeenCalled()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockedDeleteApplicationScale).toHaveBeenCalledWith('55', '321')
    })
  })

  it('looks up package scales by timber mark and scale id', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('TM001')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Scale ID or timber mark'), {
      target: { value: 'TM001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lookup Scale' }))
    expect(
      await screen.findByText(
        'Found 1 scale row for timber mark TM001: TM001 Douglas-fir/Sawlog 5 pcs 20.0 m3',
      ),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationScaleDetails).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Scale ID or timber mark'), {
      target: { value: '55' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lookup Scale' }))
    expect(await screen.findByText('TM001 FI/1 5 pcs 20.0 m3')).toBeInTheDocument()
    expect(mockedFetchApplicationScaleDetails).toHaveBeenCalledWith('55')
  })

  it('shows field validation before adding an empty scale', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Timber mark is required.').length).toBeGreaterThan(0)
    expect(screen.getByText('Species is required.')).toBeInTheDocument()
    expect(screen.getByText('Grade is required.')).toBeInTheDocument()
    expect(screen.getByText('Pieces is required.')).toBeInTheDocument()
    expect(screen.getByText('Scale volume is required.')).toBeInTheDocument()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows legacy scale validation before adding invalid scale values', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Timber Mark'), {
      target: { value: 'TM002' },
    })
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), {
      target: { value: '1.5' },
    })
    fireEvent.change(screen.getByLabelText('Scale Volume'), {
      target: { value: '100000' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Pieces must be a whole number.').length).toBeGreaterThan(0)
    expect(screen.getByText('Scale volume must be 99999.9 or less.')).toBeInTheDocument()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('blocks scale volume that exceeds the selected package remaining volume', async () => {
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Timber Mark'), {
      target: { value: 'TM002' },
    })
    await chooseComboBoxOption(
      screen.getAllByRole('combobox', { name: 'Species' })[1],
      'FI - Douglas-fir',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Grade' }), '1 - Sawlog')
    fireEvent.change(screen.getByLabelText('Pieces'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Scale Volume'), {
      target: { value: '80.1' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add Scale' }))

    expect(screen.getAllByText('Scale volume must be 80.0 or less.').length).toBeGreaterThan(0)
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('warns once before saving summary when package volumes do not consume application volume', async () => {
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

    await selectApplicationSummaryTile()
    await screen.findByLabelText('Application volume (m³)')

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    })
  })
})
