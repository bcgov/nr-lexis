import { useState, type ComponentProps } from 'react'
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
  ApplicationCodeOption,
  fetchApplicationPackageDetails,
  fetchApplicationPermits,
} from '@/service/provincial-application-items-service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupApplicationDetailTests,
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
  mockedOpenApplicationDocument,
  mockedFetchApplicationEndUsesForSpeciesRegion,
  mockedFetchApplicationGradeCodes,
  mockedFetchApplicationPackageDetails,
  mockedFetchApplicationPackageScales,
  mockedFetchApplicationPackageSpecies,
  mockedFetchApplicationPackageStatusCodes,
  mockedFetchApplicationPermits,
  mockedFetchApplicationRemainingSpecies,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchApplicationUniqueScales,
  mockedFetchProvincialApplicationDetail,
  mockedFetchProvincialApplicationOptions,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationSummary,
  selectApplicationDetailTab,
  selectApplicationItemDetailsTile,
  selectApplicationItemsForEditing,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'
import ProvincialApplicationItemsPanel from '@/pages/ProvincialApplicationDetails/ApplicationItemsPanel'
import type { ActionResult } from '@/utils/action-result'

Element.prototype.scrollIntoView = vi.fn()

const openCreatePackageControls = async () => {
  await selectApplicationDetailTab('Scale')
  await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
  const packageNumber = await screen.findByLabelText('Package number')
  return within(packageNumber.closest('.application-items-drawer') as HTMLElement)
}

const renderApplicationItems = () =>
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

const fillNewPackage = (controls: ReturnType<typeof within>, packageNumber: string) => {
  fireEvent.change(controls.getByLabelText('Package number'), { target: { value: packageNumber } })
  fireEvent.change(controls.getByLabelText('Volume (m³)'), { target: { value: '25.0' } })
  fireEvent.change(controls.getByLabelText('Average length (m)'), { target: { value: '12.0' } })
  fireEvent.change(controls.getByLabelText('Average top diameter (rads)'), {
    target: { value: '24.0' },
  })
}

const chooseDropdownOption = async (dropdown: HTMLElement, optionName: string) => {
  await waitFor(() => expect(dropdown).toBeEnabled())
  await userEvent.click(dropdown)
  await userEvent.click(await screen.findByRole('option', { name: optionName }))
}

const fillNewScale = async (
  controls: ReturnType<typeof within>,
  { pieces = '2', volume = '8.0' } = {},
) => {
  fireEvent.change(controls.getByLabelText('Timber mark'), { target: { value: 'TM002' } })
  await chooseDropdownOption(controls.getByRole('combobox', { name: 'Species' }), 'Douglas-fir')
  await chooseDropdownOption(controls.getByRole('combobox', { name: 'Grade' }), 'Sawlog')
  fireEvent.change(controls.getByLabelText('Pieces'), { target: { value: pieces } })
  fireEvent.change(controls.getByLabelText('Volume (m³)'), { target: { value: volume } })
}

const openScaleControls = async () => {
  await selectApplicationDetailTab('Scale')
  await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
  const timberMark = await screen.findByLabelText('Timber mark')
  return within(timberMark.closest('.application-items-drawer') as HTMLElement)
}

/** Stands in for the detail page, which owns the single action result the panel reports into. */
function ItemsPanelWithActionResult(
  props: Omit<
    ComponentProps<typeof ProvincialApplicationItemsPanel>,
    'actionResult' | 'onActionResult'
  >,
) {
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  return (
    <ProvincialApplicationItemsPanel
      {...props}
      actionResult={actionResult}
      onActionResult={setActionResult}
    />
  )
}

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
      expect(screen.getByRole('tab', { name: 'Scale' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
    })
    expect(screen.getByRole('heading', { name: 'Package PKG-2' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Selected package' })).toHaveValue('PKG-2')
    expect(screen.getByRole('heading', { name: 'Summary of scale' })).toBeInTheDocument()
    expect(document.getElementById('application-items-scales')).toBeInTheDocument()
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })
  })

  it.each([
    { classification: 'explicit', ageClass: 'O', productType: 'H', expectedAge: 'O' },
    { classification: 'inherited', ageClass: '', productType: '', expectedAge: 'S' },
    {
      classification: 'inherited with matching product',
      ageClass: '',
      productType: 'H',
      expectedAge: 'S',
    },
  ])(
    'preserves padded siblings with $classification package classification',
    async ({ ageClass, productType, expectedAge }) => {
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        exemptionNumber: '',
        applicationStatusCode: 'NEW',
        growthTypeCode: 'S',
      })
      const plainPackageNumber = 'PKG-EXISTING'
      const storedPackageNumber = 'PKG-EXISTING  '
      const storedPackageLabel = 'PKG-EXISTING (2 trailing spaces)'
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        exemptionNumber: null,
        applicationStatusCode: 'NEW',
        packages: [
          { packageNumber: plainPackageNumber, volume: 100, pieceCount: 5 },
          { packageNumber: storedPackageNumber, volume: 50, pieceCount: 3 },
        ],
      })
      mockedFetchApplicationPackageDetails.mockImplementation(async (packageNumber) => ({
        success: true,
        packageNumber: plainPackageNumber,
        volume: packageNumber === storedPackageNumber ? '50.0' : '100.0',
        scaledVolume: 20,
        length: '12.0',
        diameter: '24.0',
        status: 'ACT',
        comments: '',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass,
        ageClassDescription: 'Old',
        productType,
        productTypeDescription: 'Harvested Timber',
      }))
      mockedUpdateApplicationPackage.mockImplementation(async (request) => ({
        valid: true,
        packageNumber: request.packageNumber,
        errors: [],
        warnings: [],
      }))

      render(
        <MemoryRouter
          initialEntries={[
            '/provincial/application/321?tab=items&packageNumber=PKG-EXISTING%20%20',
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

      await waitFor(() =>
        expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith(storedPackageNumber),
      )
      await selectApplicationItemsForEditing()
      const packageDetailsSection = (
        await screen.findByRole('heading', { name: /^Package PKG-/ })
      ).closest('section')
      expect(packageDetailsSection).toBeTruthy()
      const packageDetailsControls = within(packageDetailsSection as HTMLElement)

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Selected package' })).toHaveValue(
          storedPackageLabel,
        )
        expect(packageDetailsControls.getByLabelText('Package number')).toHaveValue(
          storedPackageNumber,
        )
        expect(packageDetailsControls.getByRole('button', { name: 'Save package' })).toBeEnabled()
      })

      const packageSelector = screen.getByRole('combobox', { name: 'Selected package' })
      await chooseComboBoxOption(packageSelector, plainPackageNumber)
      await waitFor(() => {
        expect(mockedFetchApplicationPackageDetails).toHaveBeenLastCalledWith(plainPackageNumber)
        expect(packageDetailsControls.getByLabelText('Package volume (m³)')).toHaveValue('100.0')
        expect(packageDetailsControls.getByRole('button', { name: 'Save package' })).toBeEnabled()
      })
      await chooseComboBoxOption(packageSelector, storedPackageLabel)
      await waitFor(() => {
        expect(mockedFetchApplicationPackageDetails).toHaveBeenLastCalledWith(storedPackageNumber)
        expect(packageDetailsControls.getByLabelText('Package volume (m³)')).toHaveValue('50.0')
        expect(packageDetailsControls.getByRole('button', { name: 'Save package' })).toBeEnabled()
      })

      fireEvent.change(packageDetailsControls.getByLabelText('Package comments'), {
        target: { value: 'Updated stored package' },
      })
      await userEvent.click(packageDetailsControls.getByRole('button', { name: 'Save package' }))

      await waitFor(() =>
        expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
          expect.objectContaining({
            packageNumber: storedPackageNumber,
            newPackageNumber: storedPackageNumber,
            comments: 'Updated stored package',
            ageClass: expectedAge,
            productType: 'H',
          }),
        ),
      )
    },
  )

  it.each([
    {
      reason: 'application age is missing',
      growthTypeCode: '',
      oicIndicator: 'N',
      productType: 'H',
    },
    { reason: 'application is OIC', growthTypeCode: 'S', oicIndicator: 'Y', productType: 'H' },
    { reason: 'OIC status is unknown', growthTypeCode: 'S', oicIndicator: '', productType: 'H' },
    { reason: 'package product differs', growthTypeCode: 'S', oicIndicator: 'N', productType: 'S' },
  ])(
    'does not infer package age when $reason',
    async ({ growthTypeCode, oicIndicator, productType }) => {
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        growthTypeCode,
        oicIndicator,
      })
      mockedFetchApplicationPackageDetails.mockResolvedValue({
        success: true,
        packageNumber: 'PKG-1',
        volume: '100.0',
        scaledVolume: 20,
        length: '12.0',
        diameter: '24.0',
        status: 'ACT',
        comments: '',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: '',
        ageClassDescription: '',
        productType,
        productTypeDescription: '',
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
      await selectApplicationItemsForEditing()
      const controls = within(
        (await screen.findByRole('heading', { name: /^Package PKG-/ })).closest(
          'section',
        ) as HTMLElement,
      )
      await waitFor(() =>
        expect(controls.getByRole('button', { name: 'Save package' })).toBeEnabled(),
      )
      expect(controls.getByRole('combobox', { name: 'Age class' })).toHaveValue('')
      fireEvent.change(controls.getByLabelText('Package comments'), {
        target: { value: 'Comment edit' },
      })
      await userEvent.click(controls.getByRole('button', { name: 'Save package' }))
      expect(screen.getAllByText('Age class is required').length).toBeGreaterThan(0)
      expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    },
  )

  it('keeps all package rows and totals despite retired filters and package selection', async () => {
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
      comments: '',
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'H',
      productTypeDescription: 'Harvested Timber',
    }))
    mockedFetchApplicationPackageScales.mockImplementation(async (packageNumber) => [
      {
        permitted: false,
        timberMark: packageNumber === 'PKG-2' ? 'TM002' : 'TM001',
        species: 'Fir',
        grade: 'Sawlog',
        pieces: packageNumber === 'PKG-2' ? 3 : 5,
        volume: packageNumber === 'PKG-2' ? '10.0' : '20.0',
        id: packageNumber === 'PKG-2' ? '56' : '55',
        cascadeSplitCode: 'S',
      },
    ])

    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items&packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const applicationItemDetailsTile = await selectApplicationItemDetailsTile(false)
    const applicationItemDetails = within(applicationItemDetailsTile)
    const applicationTotalPieces = () => {
      const label = applicationItemDetails.getByText('Total pieces')
      return label.parentElement?.querySelector('dd')
    }
    expect(applicationTotalPieces()).toHaveTextContent('8')
    expect(
      Array.from(applicationItemDetailsTile.querySelectorAll('.detail-field-label'))
        .map((field) => field.textContent)
        .slice(-3),
    ).toEqual(['Species list', 'End use', 'Total pieces'])

    const packagesSection = (await screen.findByRole('heading', { name: 'Packages' })).closest(
      '.cds--tile',
    )
    expect(packagesSection).toBeTruthy()
    expect(screen.queryByLabelText('Filter packages')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Application packages toolbar' }),
    ).not.toBeInTheDocument()
    expect(within(packagesSection as HTMLElement).getByText('PKG-1')).toBeInTheDocument()
    expect(within(packagesSection as HTMLElement).getByText('PKG-2')).toBeInTheDocument()

    const packageDetailsSection = screen
      .getByRole('heading', { name: /^Package PKG-/ })
      .closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Average top diameter (rads)'),
    ).toBeInTheDocument()
    const selectedPackageTotalPieces = () => {
      const label = within(packageDetailsSection as HTMLElement).getByText('Total pieces')
      return label.parentElement?.querySelector('dd')
    }
    await waitFor(() => expect(selectedPackageTotalPieces()).toHaveTextContent('5'))

    const packageSelector = screen.getByRole('combobox', { name: 'Selected package' })
    await chooseComboBoxOption(packageSelector, 'PKG-2')
    await waitFor(() => {
      expect(packageSelector).toHaveValue('PKG-2')
      expect(selectedPackageTotalPieces()).toHaveTextContent('3')
    })
    expect(applicationTotalPieces()).toHaveTextContent('8')

    await userEvent.click(
      applicationItemDetails.getByRole('button', { name: 'Edit scale details' }),
    )
    await waitFor(() => {
      expect(applicationItemDetails.getAllByText('Total pieces')).toHaveLength(1)
      expect(applicationTotalPieces()).toHaveTextContent('8')
    })
  })

  it.each([
    [10, '10.0'],
    [12.25, '12.25'],
  ])('loads stored application volume %s into the scale editor as %s', async (volume, expected) => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationVolume: volume,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicationVolume: String(volume),
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

    const details = within(await selectApplicationItemDetailsTile(false))
    await userEvent.click(details.getByRole('button', { name: 'Edit scale details' }))
    const input = await details.findByLabelText('Application volume (m³)')
    await waitFor(() => expect(input).toHaveProperty('value', expected))
    expect((input as HTMLInputElement).validity.stepMismatch).toBe(false)
  })

  it('opens package editing in a drawer while keeping scale rows visible', async () => {
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

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('button', { name: 'Edit package' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Packages' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /^Package PKG-/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Summary of scale' })).toBeInTheDocument()
    const summaryOfScale = document.getElementById('application-items-scales')
    expect(summaryOfScale).toBeInTheDocument()
    expect(
      within(summaryOfScale as HTMLElement)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Timber mark', 'Scale type', 'Pieces', 'Species', 'Grade', 'Volume (m³)', 'Delete'])
    expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit package' }))
    expect(await screen.findByLabelText('Package comments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save package' })).toBeInTheDocument()
    expect(
      within(summaryOfScale as HTMLElement)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Timber mark', 'Scale type', 'Pieces', 'Species', 'Grade', 'Volume (m³)', 'Delete'])

    await userEvent.click(
      within(document.querySelector('.application-items-drawer') as HTMLElement).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    )
    expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeInTheDocument()
  })

  it('keeps application item details and package drafts in mutually exclusive editors', async () => {
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

    const applicationItemDetails = within(await selectApplicationItemDetailsTile(false))
    expect(
      applicationItemDetails.getByRole('button', { name: 'Edit scale details' }),
    ).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const packageComments = await screen.findByLabelText('Package comments')
    fireEvent.change(packageComments, { target: { value: 'Unsaved package draft' } })
    expect(packageComments).toHaveValue('Unsaved package draft')
    expect(applicationItemDetails.getByRole('button', { name: 'Edit scale details' })).toBeEnabled()

    await userEvent.click(
      within(document.querySelector('.application-items-drawer') as HTMLElement).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    const editApplicationItemDetails = await applicationItemDetails.findByRole('button', {
      name: 'Edit scale details',
    })
    await userEvent.click(editApplicationItemDetails)

    expect(applicationItemDetails.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
  })

  it('shows the empty package prompt and opens the create drawer', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Package details' })).toBeInTheDocument()
    expect(screen.getByText('No packages for this application')).toBeInTheDocument()
    expect(screen.getByText('Create a package, then add Summary of scale.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Summary of scale' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create package' }))
    const packageNumber = await screen.findByLabelText('Package number')
    const drawer = packageNumber.closest('.application-items-drawer') as HTMLElement
    expect(drawer).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Comments')).toHaveAttribute('maxlength', '180')
    expect(within(drawer).getByRole('button', { name: 'Save package' })).toBeInTheDocument()
  })

  it('keeps an unsaved package draft until discard is confirmed', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const volume = await screen.findByLabelText('Package volume (m³)')
    const drawer = volume.closest('.application-items-drawer') as HTMLElement
    await userEvent.clear(volume)
    await userEvent.type(volume, '75')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))

    const dialog = screen.getByRole('dialog', { name: 'Discard changes?' })
    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.')
    expect(volume).toHaveValue('75')
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.queryByLabelText('Package volume (m³)')).not.toBeInTheDocument(),
    )
  })

  it('returns focus to the package Cancel action when keeping the draft', async () => {
    renderApplicationItems()
    const drawer = await openCreatePackageControls()
    const packageNumber = drawer.getByLabelText('Package number')
    fireEvent.change(packageNumber, { target: { value: 'KEEP-PACKAGE' } })
    const cancel = drawer.getByRole('button', { name: 'Cancel' })
    await userEvent.click(cancel)
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(packageNumber).toHaveValue('KEEP-PACKAGE')
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    await userEvent.click(cancel)
    const discard = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discard).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create package' })).toHaveFocus(),
    )
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it.each([
    { launcher: 'Edit package', field: 'Package number' },
    { launcher: 'Create package', field: 'Package number' },
    { launcher: 'Add scale', field: 'Timber mark' },
  ])('returns focus to $launcher after cancelling its drawer', async ({ launcher, field }) => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const launcherButton = await screen.findByRole('button', { name: launcher })
    await userEvent.click(launcherButton)
    const drawerField = await screen.findByLabelText(field)
    await waitFor(() => expect(drawerField).toHaveFocus())
    const drawer = drawerField.closest('.application-items-drawer') as HTMLElement
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(launcherButton).toHaveFocus())
  })

  it('returns focus to Edit package after a successful save', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const launcherButton = await screen.findByRole('button', { name: 'Edit package' })
    await userEvent.click(launcherButton)
    const comments = await screen.findByLabelText('Package comments')
    const drawer = comments.closest('.application-items-drawer') as HTMLElement
    await waitFor(() => expect(within(drawer).getByLabelText('Package number')).toHaveFocus())
    fireEvent.change(comments, { target: { value: 'Focus restored' } })
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save package' }))

    await waitFor(() => expect(mockedUpdateApplicationPackage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(launcherButton).toHaveFocus())
  })

  it('returns focus to Edit package when Escape closes the drawer', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const launcherButton = await screen.findByRole('button', { name: 'Edit package' })
    await userEvent.click(launcherButton)
    const packageNumber = await screen.findByLabelText('Package number')
    await waitFor(() => expect(packageNumber).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(launcherButton).toHaveFocus())
  })

  it('keeps an active package draft when replacement actions are declined', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const comments = await screen.findByLabelText('Package comments')
    await userEvent.clear(comments)
    await userEvent.type(comments, 'Keep this draft')
    const createPackage = screen.getByRole('button', { name: 'Create package' })
    const addScale = screen.getByRole('button', { name: 'Add scale' })
    const deleteScale = within(
      document.getElementById('application-items-scales') as HTMLElement,
    ).getByRole('button', { name: 'Delete' })
    for (const action of [createPackage, addScale, deleteScale]) {
      expect(action).toBeEnabled()
      await userEvent.click(action)
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    }
    expect(comments).toHaveValue('Keep this draft')
    expect(screen.getByRole('heading', { name: 'Edit package' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Delete scale' })).not.toBeInTheDocument()
  })

  it('submits a new package only once while its save is pending', async () => {
    let resolveCreate:
      | ((result: Awaited<ReturnType<typeof mockedAddApplicationPackage>>) => void)
      | undefined
    mockedAddApplicationPackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const drawer = await openCreatePackageControls()
    fillNewPackage(drawer, 'PKG-NEW')
    const save = drawer.getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)
    await waitFor(() => expect(mockedAddApplicationPackage).toHaveBeenCalledTimes(1))
    expect(drawer.getByRole('button', { name: 'Saving package' })).toBeDisabled()
    await userEvent.click(drawer.getByRole('button', { name: 'Saving package' }))
    expect(mockedAddApplicationPackage).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCreate?.({
        valid: false,
        packageNumber: 'PKG-NEW',
        errors: ['Try again.'],
        warnings: [],
      })
    })
    expect(drawer.getByRole('button', { name: 'Save package' })).toBeEnabled()
  })

  it('submits a scale only once while its save is pending', async () => {
    let resolveScale:
      | ((result: Awaited<ReturnType<typeof mockedAddApplicationScaleToPackage>>) => void)
      | undefined
    mockedAddApplicationScaleToPackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveScale = resolve
        }),
    )
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?tab=items']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const drawer = await openScaleControls()
    await fillNewScale(drawer)
    const save = drawer.getByRole('button', { name: 'Save scale' })
    await userEvent.click(save)
    await waitFor(() => expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledTimes(1))
    expect(drawer.getByRole('button', { name: 'Saving scale' })).toBeDisabled()
    await userEvent.click(drawer.getByRole('button', { name: 'Saving scale' }))
    expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveScale?.({ valid: false, result: null, errors: ['Try again.'], warnings: [] })
    })
    expect(drawer.getByRole('button', { name: 'Save scale' })).toBeEnabled()
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

    const packageSelector = await screen.findByRole('combobox', { name: 'Selected package' })
    await waitFor(() => {
      expect(packageSelector).toHaveValue('PKG-1')
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })

    await selectApplicationItemsForEditing()
    await chooseComboBoxOption(packageSelector, 'PKG-2')
    await waitFor(() => {
      expect(packageSelector).toHaveValue('PKG-2')
      expect(screen.getByLabelText('Package comments')).toHaveValue('Second package')
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
    expect(await screen.findByText('Application details')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('heading', { name: /^Package PKG-/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add scale' })).not.toBeInTheDocument()
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

      const pageHeading = await screen.findByRole('heading', { name: 'Application 321' })
      expect(pageHeading.closest('.lexis-page-header')).toHaveTextContent(statusDescription)
      await selectApplicationDetailTab('Application')
      expect(await screen.findByText('Application details')).toBeInTheDocument()
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
      const summaryTile = getApplicationSummaryTile()
      expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

      await selectApplicationDetailTab('Scale')
      expect(await screen.findByRole('heading', { name: /^Package PKG-/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add scale' })).not.toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: 'Save package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Create package' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Add scale' })).toBeEnabled()
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

    await selectApplicationDetailTab('Scale')
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add scale' })).not.toBeInTheDocument()
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

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('heading', { name: 'Scale details' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Timber marks' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /^Package PKG-/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Summary of scale')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add scale' })).not.toBeInTheDocument()
  })

  it('keeps the item editor closed for standing timber when mutation permissions are supplied', () => {
    render(
      <ItemsPanelWithActionResult
        detail={{ ...applicationDetail, productTypeCode: 'S', packages: [] }}
        canEditPackages
        canAddPackages
        canAddScales
        canUpdatePackageNumber
        hideMutationActions={false}
        authoritativeOptionsAvailability="available"
        productTypeOptions={[]}
        growthTypeOptions={[]}
        onDetailChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
  })

  it('keeps the item editor closed for Timber when only scale permission is supplied', () => {
    render(
      <ItemsPanelWithActionResult
        detail={{ ...applicationDetail, productTypeCode: 'T' }}
        canEditPackages={false}
        canAddPackages={false}
        canAddScales
        canUpdatePackageNumber={false}
        hideMutationActions={false}
        authoritativeOptionsAvailability="available"
        productTypeOptions={[]}
        growthTypeOptions={[]}
        onDetailChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
  })

  it('shows package details without Summary of scale for Timber applications', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      growthTypeCode: '',
      averageLogVolume: '',
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

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('heading', { name: /^Package PKG-/ })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Summary of scale' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Timber marks' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Edit package' })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { name: /^Package PKG-/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-1')
    })
    expect(screen.queryByLabelText('Application item summary')).not.toBeInTheDocument()
    const packageDetailsSection = screen
      .getByRole('heading', { name: /^Package PKG-/ })
      .closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(packageDetailsSection).toHaveClass('application-items-card')
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total scale volume (m³)'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('20.0')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement).getByText('Total pieces'),
    ).toBeInTheDocument()
    expect(within(packageDetailsSection as HTMLElement).getByText('5')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement).getByLabelText('Average top diameter (rads)'),
    ).toBeInTheDocument()

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

    fireEvent.change(screen.getByLabelText('Package comments'), {
      target: { value: 'Updated package' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save package' }))

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

  it('caps package comments at 180 ASCII characters and saves the capped value', async () => {
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
    const comments = await screen.findByLabelText('Package comments')
    expect(comments).toHaveAttribute('maxlength', '180')
    // Typing each character re-renders the whole detail page, so only type across the limit.
    fireEvent.change(comments, { target: { value: 'A'.repeat(179) } })
    await userEvent.type(comments, 'AA')
    expect(comments).toHaveValue('A'.repeat(180))

    await userEvent.click(screen.getByRole('button', { name: 'Save package' }))

    await waitFor(() =>
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({ comments: 'A'.repeat(180) }),
      ),
    )
  })

  it('blocks programmatically overlong package comments without calling the update service', async () => {
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
    const comments = await screen.findByLabelText('Package comments')
    await act(async () => {
      fireEvent.change(comments, {
        target: { value: 'A'.repeat(181) },
      })
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save package' }))

    expect(comments).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('applicationItemsPackageComments-error-msg')).toHaveTextContent(
      'Package comments must be 180 characters or fewer',
    )
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
  })

  it('blocks non-ASCII package comments without calling the update service', async () => {
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
    const comments = await screen.findByLabelText('Package comments')
    await act(async () => {
      fireEvent.change(comments, {
        target: { value: 'Réview' },
      })
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save package' }))

    expect(comments).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('applicationItemsPackageComments-error-msg')).toHaveTextContent(
      'Package comments contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
    )
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
  })

  it('keeps a loaded historical package comment without truncating it', async () => {
    const historicalComment = `Réview ${'A'.repeat(175)}`
    mockedFetchApplicationPackageDetails.mockResolvedValue({
      success: true,
      packageNumber: 'PKG-1',
      volume: '100.0',
      scaledVolume: 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: historicalComment,
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'LOG',
      productTypeDescription: 'Logs',
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

    await selectApplicationItemsForEditing()
    expect(await screen.findByLabelText('Package comments')).toHaveValue(historicalComment)
  })

  it("waits for the application's end uses before creating a package", async () => {
    const pendingEndUseLookups: Array<(options: ApplicationCodeOption[]) => void> = []
    mockedFetchApplicationEndUsesForSpeciesRegion.mockImplementation(
      () => new Promise((resolve) => pendingEndUseLookups.push(resolve)),
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

    const createPackageControls = await openCreatePackageControls()
    const save = createPackageControls.getByRole('button', { name: 'Save package' })
    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('12', ['FI'])
      expect(save).toBeEnabled()
    })
    expect(screen.getByText('Loading authoritative item options…')).toBeInTheDocument()
    fillNewPackage(createPackageControls, 'PKG-DELAYED')
    await userEvent.click(save)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    // The panel shows only the fields its saved state asks for.
    for (const hidden of ['Status code', 'Product type', 'Age class', 'End use']) {
      expect(createPackageControls.queryByRole('combobox', { name: hidden })).toBeNull()
    }

    // The application's own end use isn't valid for its species, so the first valid one is saved.
    await act(async () => {
      pendingEndUseLookups.forEach((resolve) =>
        resolve([
          { code: 'PL', description: 'Pulp' },
          { code: 'SL', description: 'Sawn logs' },
        ]),
      )
    })
    await waitFor(() => expect(save).toBeEnabled())

    fillNewPackage(createPackageControls, 'PKG-DELAYED')
    await userEvent.click(save)

    await waitFor(() => {
      expect(mockedAddApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageNumber: 'PKG-DELAYED',
          endUseCode: 'PL',
          speciesCodes: ['FI'],
        }),
      )
    })
  })

  it.each(['fail', 'come back empty'])(
    "rejects package creation when the application's end uses %s",
    async (lookupResult) => {
      mockedFetchApplicationEndUsesForSpeciesRegion.mockImplementation(() =>
        lookupResult === 'fail'
          ? Promise.reject(new Error('End use lookup failure'))
          : Promise.resolve([]),
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

      const createPackageControls = await openCreatePackageControls()
      const save = createPackageControls.getByRole('button', { name: 'Save package' })
      expect(
        await screen.findByText(
          /package creation (is|are) disabled because end use options could not be loaded\./i,
        ),
      ).toBeInTheDocument()
      expect(save).toBeEnabled()
      fillNewPackage(createPackageControls, 'PKG-NEW')
      await userEvent.click(save)
      expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    },
  )

  it.each(['failed', 'empty'])('recovers %s selected End Use', async (lookupResult) => {
    let failNextSelectedEndUseLookup = false
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
      comments: 'Ready',
      statusDescription: 'Active',
      reprocessed: 'N',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'H',
      productTypeDescription: 'Harvested Timber',
    }))
    mockedFetchApplicationEndUsesForSpeciesRegion.mockImplementation((_region, speciesCodes) => {
      if (speciesCodes.includes('FI') && failNextSelectedEndUseLookup) {
        failNextSelectedEndUseLookup = false
        return lookupResult === 'empty'
          ? Promise.resolve([])
          : Promise.reject(new Error('Temporary selected end use lookup failure'))
      }
      return Promise.resolve([{ code: 'LU', description: 'Lumber' }])
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

    await selectApplicationItemsForEditing()
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: /^Package PKG-/ })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()
    const packageDetailsControls = within(packageDetailsSection as HTMLElement)
    const savePackage = packageDetailsControls.getByRole('button', { name: 'Save package' })
    const addScale = screen.getByRole('button', { name: 'Add scale' })

    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('12', ['FI'])
      expect(packageDetailsControls.getByRole('combobox', { name: 'End use' })).toBeEnabled()
      expect(savePackage).toBeEnabled()
      expect(addScale).toBeEnabled()
    })

    const packageSelector = screen.getByRole('combobox', { name: 'Selected package' })
    failNextSelectedEndUseLookup = true
    await chooseComboBoxOption(packageSelector, 'PKG-2')

    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
      expect(packageDetailsControls.getByRole('combobox', { name: 'End use' })).toBeDisabled()
      expect(savePackage).toBeEnabled()
      expect(addScale).toBeEnabled()
      expect(
        screen.getByText('Package saves are disabled because end use options could not be loaded.'),
      ).toBeInTheDocument()
    })

    await userEvent.click(savePackage)
    expect(await packageDetailsControls.findByText('Package save failed')).toBeInTheDocument()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()

    await chooseComboBoxOption(packageSelector, 'PKG-1')
    // Package reload and Carbon's selected-label effect can exceed 1s under CI coverage.
    await waitFor(
      () => {
        expect(packageDetailsControls.getByRole('combobox', { name: 'End use' })).toHaveValue(
          'LU - Lumber',
        )
        expect(packageDetailsControls.getByRole('combobox', { name: 'End use' })).toBeEnabled()
        expect(savePackage).toBeEnabled()
        expect(addScale).toBeEnabled()
      },
      { timeout: 5_000 },
    )
  })

  it('preserves a selected package end use while dependent options are loading', async () => {
    let resolveSelectedEndUseOptions: ((options: ApplicationCodeOption[]) => void) | undefined
    mockedFetchApplicationEndUsesForSpeciesRegion.mockImplementation((_region, speciesCodes) => {
      if (speciesCodes.includes('FI')) {
        return new Promise((resolve) => {
          resolveSelectedEndUseOptions = resolve
        })
      }
      return Promise.resolve([{ code: 'LU', description: 'Lumber' }])
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

    await selectApplicationItemsForEditing()
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: /^Package PKG-/ })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()
    const packageDetailsControls = within(packageDetailsSection as HTMLElement)
    const endUse = packageDetailsControls.getByRole('combobox', { name: 'End use' })

    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('12', ['FI'])
      expect(endUse).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Save package' })).toBeEnabled()
    })
    expect(screen.queryByRole('textbox', { name: 'End use' })).not.toBeInTheDocument()

    await act(async () => {
      resolveSelectedEndUseOptions?.([
        { code: 'PL', description: 'Pulp' },
        { code: 'LU', description: 'Lumber' },
      ])
    })

    await waitFor(() => {
      expect(endUse).toHaveValue('LU - Lumber')
      expect(endUse).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Save package' })).toBeEnabled()
    })
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

    await selectApplicationDetailTab('Scale')

    const waterScaleRow = (await screen.findByText('TM-WATER')).closest('tr')
    const estimatedScaleRow = screen.getByText('TM-ESTIMATE').closest('tr')
    expect(waterScaleRow).toBeTruthy()
    expect(estimatedScaleRow).toBeTruthy()
    expect(within(waterScaleRow as HTMLElement).getByText('C')).toBeInTheDocument()
    expect(within(estimatedScaleRow as HTMLElement).getByText('I')).toBeInTheDocument()
  })

  it('guards navigation and discards an unsaved package draft on confirmation', async () => {
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
    const comments = await screen.findByLabelText('Package comments')
    fireEvent.change(comments, { target: { value: 'Unsaved package draft' } })
    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))

    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.')
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await userEvent.click(
      within(document.querySelector('.application-items-drawer') as HTMLElement).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('retains package details and scales when package species cannot be loaded', async () => {
    mockedFetchApplicationPackageSpecies.mockRejectedValue(
      new Error('Package species lookup failed'),
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

    await selectApplicationDetailTab('Scale')

    const packageDetailsSection = (
      await screen.findByRole('heading', { name: /^Package PKG-/ })
    ).closest('section')
    const packageSpeciesSection = screen.getByRole('heading', {
      name: 'Package species',
    }).parentElement
    const scalesSection = screen
      .getByRole('heading', { name: 'Summary of scale' })
      .closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(packageSpeciesSection).toBeTruthy()
    expect(scalesSection).toBeTruthy()

    expect(await screen.findByText('Selected package data unavailable')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement)
        .getByText('Comments')
        .parentElement?.querySelector('dd'),
    ).toHaveTextContent('Ready')
    expect(within(scalesSection as HTMLElement).getByText('TM001')).toBeInTheDocument()
    expect(
      within(packageSpeciesSection as HTMLElement).getByText(
        'Package species could not be loaded.',
      ),
    ).toBeInTheDocument()
    expect(
      within(packageSpeciesSection as HTMLElement).queryByText(
        'No species assigned to this package.',
      ),
    ).not.toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement)
        .getByText('End use', { selector: 'dt' })
        .parentElement?.querySelector('dd'),
    ).toHaveTextContent('Not available')
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add scale' })).toBeDisabled()
    expect(
      within(scalesSection as HTMLElement).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled()
  })

  it('keeps a partial package load warning after an unrelated create package action', async () => {
    mockedFetchApplicationPackageSpecies.mockRejectedValue(
      new Error('Package species lookup failed'),
    )
    mockedAddApplicationPackage.mockResolvedValue({
      valid: false,
      packageNumber: 'PKG-NEW',
      errors: ['Package creation was rejected.'],
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

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByText('Selected package data unavailable')).toBeInTheDocument()

    const createPackageControls = await openCreatePackageControls()
    fillNewPackage(createPackageControls, 'PKG-NEW')
    const save = createPackageControls.getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    await waitFor(() => {
      expect(mockedAddApplicationPackage).toHaveBeenCalled()
    })
    expect(screen.getByText('Selected package data unavailable')).toBeInTheDocument()
  })

  it('retains package details and species when package scales cannot be loaded', async () => {
    mockedFetchApplicationPackageScales.mockRejectedValue(new Error('Package scale lookup failed'))

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

    await selectApplicationDetailTab('Scale')

    const packageDetailsSection = (
      await screen.findByRole('heading', { name: /^Package PKG-/ })
    ).closest('section')
    const packageSpeciesSection = screen.getByRole('heading', {
      name: 'Package species',
    }).parentElement
    const scalesSection = screen
      .getByRole('heading', { name: 'Summary of scale' })
      .closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(packageSpeciesSection).toBeTruthy()
    expect(scalesSection).toBeTruthy()

    expect(await screen.findByText('Selected package data unavailable')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement)
        .getByText('Comments')
        .parentElement?.querySelector('dd'),
    ).toHaveTextContent('Ready')
    expect(
      within(packageSpeciesSection as HTMLElement).getByText('FI - Douglas-fir'),
    ).toBeInTheDocument()
    expect(
      within(scalesSection as HTMLElement).getByText('Package scales could not be loaded.'),
    ).toBeInTheDocument()
    expect(
      within(scalesSection as HTMLElement).queryByText('No scales assigned to this package.'),
    ).not.toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement)
        .getByText('Total pieces')
        .parentElement?.querySelector('dd'),
    ).toHaveTextContent('Not available')
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add scale' })).toBeDisabled()
  })

  it('fails closed when package details cannot be loaded', async () => {
    mockedFetchApplicationPackageDetails.mockRejectedValue(
      new Error('Package details lookup failed'),
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

    await selectApplicationDetailTab('Scale')

    expect(
      await screen.findByText('Unable to retrieve application item details.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add scale' })).toBeDisabled()

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedDeleteApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
    expect(mockedFetchApplicationPackageSpecies).not.toHaveBeenCalled()
    expect(mockedFetchApplicationPackageScales).not.toHaveBeenCalled()
  })

  it('explains on save that package and scale changes need the item options', async () => {
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
    expect(
      screen.getByText(
        'Package saves, package creation, and scale additions are disabled because item options could not be loaded.',
      ),
    ).toBeInTheDocument()
    const optionsMessage =
      'Package saves, package creation, and scale additions are disabled because item options could not be loaded.'
    const editControls = within(document.querySelector('.application-items-drawer') as HTMLElement)
    await userEvent.click(editControls.getByRole('button', { name: 'Save package' }))
    expect(await editControls.findByText('Package save failed')).toBeInTheDocument()
    expect(editControls.getByText(optionsMessage)).toBeInTheDocument()
    await userEvent.click(editControls.getByRole('button', { name: 'Cancel' }))
    const createControls = await openCreatePackageControls()
    expect(createControls.getByRole('button', { name: 'Save package' })).toBeEnabled()
    fillNewPackage(createControls, 'PKG-NEW')
    await userEvent.click(createControls.getByRole('button', { name: 'Save package' }))
    expect(createControls.getByText('Package creation failed')).toBeInTheDocument()
    await userEvent.click(createControls.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    const scaleControls = await openScaleControls()
    expect(scaleControls.getByRole('button', { name: 'Save scale' })).toBeEnabled()
    await userEvent.click(scaleControls.getByRole('button', { name: 'Save scale' }))
    expect(scaleControls.getByText('Scale creation failed')).toBeInTheDocument()

    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('keeps Create package Save enabled while end use options load without submitting early', async () => {
    let resolveEndUses: ((options: ApplicationCodeOption[]) => void) | undefined
    mockedFetchApplicationEndUsesForSpeciesRegion.mockReturnValue(
      new Promise((resolve) => {
        resolveEndUses = resolve
      }),
    )
    renderApplicationItems()
    const drawer = await openCreatePackageControls()
    fillNewPackage(drawer, 'PKG-NEW')
    const save = drawer.getByRole('button', { name: 'Save package' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(drawer.getByText('Loading authoritative item options…')).toBeInTheDocument()

    await act(async () => resolveEndUses?.([{ code: 'LU', description: 'Lumber' }]))
    await userEvent.click(save)
    await waitFor(() => expect(mockedAddApplicationPackage).toHaveBeenCalledTimes(1))
  })

  it('shows a server package-volume rejection on Volume and focuses it', async () => {
    const message = 'The total package volume must not exceed the application volume (100.0).'
    const fieldError = 'The total package volume must not exceed the application volume (100.0)'
    mockedAddApplicationPackage.mockResolvedValueOnce({
      valid: false,
      packageNumber: 'PKG-NEW',
      errors: [message],
      warnings: [],
    })
    renderApplicationItems()
    const drawer = await openCreatePackageControls()
    fillNewPackage(drawer, 'PKG-NEW')
    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))

    const volume = drawer.getByLabelText('Volume (m³)')
    await waitFor(() => expect(volume).toHaveAttribute('aria-invalid', 'true'))
    expect(drawer.getByText(fieldError)).toBeInTheDocument()
    expect(drawer.queryByText('Package creation failed')).not.toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())
    fireEvent.change(volume, { target: { value: '1.0' } })
    expect(drawer.queryByText(fieldError)).not.toBeInTheDocument()
  })

  it('hides package status and reprocessed fields while preserving their saved values', async () => {
    mockedFetchApplicationPackageDetails.mockResolvedValue({
      success: true,
      packageNumber: 'PKG-1',
      volume: '100.0',
      scaledVolume: 20,
      length: '12.0',
      diameter: '24.0',
      status: 'ACT',
      comments: '',
      statusDescription: 'Active',
      reprocessed: 'Y',
      ageClass: 'O',
      ageClassDescription: 'Old',
      productType: 'H',
      productTypeDescription: 'Harvested',
    })
    renderApplicationItems()
    await selectApplicationDetailTab('Scale')
    await screen.findByRole('button', { name: 'Edit package' })
    const section = screen.getByRole('heading', { name: 'Package PKG-1' }).closest('section')!
    expect(within(section).queryByText('Status')).not.toBeInTheDocument()
    expect(within(section).queryByText('Reprocessed')).not.toBeInTheDocument()
    await selectApplicationItemsForEditing()
    const comments = await screen.findByLabelText('Package comments')
    const drawer = within(comments.closest('.application-items-drawer') as HTMLElement)
    expect(drawer.queryByRole('combobox', { name: 'Status code' })).not.toBeInTheDocument()
    expect(drawer.queryByRole('combobox', { name: 'Reprocessed' })).not.toBeInTheDocument()
    fireEvent.change(comments, { target: { value: 'Updated comment' } })
    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACT', reprocessed: 'Y' }),
      ),
    )
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

    const createPackageControls = await openCreatePackageControls()
    expect(createPackageControls.getByLabelText('Volume (m³)')).toHaveValue('0.0')
    expect(createPackageControls.getByLabelText('Average length (m)')).toHaveValue('0.0')
    expect(createPackageControls.getByLabelText('Average top diameter (rads)')).toHaveValue('0.0')
    const save = createPackageControls.getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    expect(screen.getAllByText('Package number is required').length).toBeGreaterThan(0)
    expect(createPackageControls.getByText('Volume must be greater than 0')).toBeInTheDocument()
    expect(
      createPackageControls.getByText('Average length must be greater than 0'),
    ).toBeInTheDocument()
    expect(
      createPackageControls.getByText('Average diameter must be greater than 0'),
    ).toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(createPackageControls.queryByText('Package creation failed')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(createPackageControls.getByLabelText('Package number')).toHaveFocus(),
    )
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

    const createPackageControls = await openCreatePackageControls()
    const packageNumberInput = createPackageControls.getByLabelText(
      'Package number',
    ) as HTMLInputElement

    fireEvent.change(packageNumberInput, { target: { value: 'pkg-1' } })
    expect(packageNumberInput.value).toBe('PKG-1')
    await userEvent.click(createPackageControls.getByRole('button', { name: 'Save package' }))

    expect(screen.getAllByText('Package PKG-1 already exists').length).toBeGreaterThan(0)
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

    const createPackageControls = await openCreatePackageControls()

    fireEvent.change(createPackageControls.getByLabelText('Package number'), {
      target: { value: 'pkg-new' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Volume (m³)'), {
      target: { value: '25.55' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average length (m)'), {
      target: { value: '100' },
    })
    fireEvent.change(createPackageControls.getByLabelText('Average top diameter (rads)'), {
      target: { value: '100' },
    })
    const save = createPackageControls.getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    expect(
      screen.getAllByText('Volume must have no more than one decimal place').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Average length must be 99 or less')).toBeInTheDocument()
    expect(screen.getByText('Average diameter must be 99.99 or less')).toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('requires age class before creating a harvested product package', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      growthTypeCode: '',
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

    const createPackageControls = await openCreatePackageControls()
    fillNewPackage(createPackageControls, 'PKG-NEW')
    const save = createPackageControls.getByRole('button', { name: 'Save package' })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    // The panel has no Age class field, so the missing application value shows at its top.
    expect(createPackageControls.getByText('Package creation failed')).toBeInTheDocument()
    expect(createPackageControls.getByText('Age class is required.')).toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it("creates application packages with the application's classification, species and end use", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/application/321',
            state: { applicationCreationNotice: { applicationNumber: '321' } },
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
    await selectApplicationDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const packageNumber = await screen.findByLabelText('Package number')
    const drawer = packageNumber.closest('.application-items-drawer') as HTMLElement
    const createPackageControls = within(drawer)

    fillNewPackage(createPackageControls, 'PKG-NEW')
    await waitFor(() =>
      expect(createPackageControls.getByRole('button', { name: 'Save package' })).toBeEnabled(),
    )

    await userEvent.click(createPackageControls.getByRole('button', { name: 'Save package' }))

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
        ageClass: 'O',
        productType: 'H',
        endUseCode: 'LU',
        speciesCodes: ['FI'],
      })
    })
    expect(await screen.findByText('Package saved.')).toBeInTheDocument()
    expect(screen.queryByText('The application was saved.')).not.toBeInTheDocument()
    // The saved package reports inside its own card rather than the page header.
    expect(
      screen.getByText('Package saved.').closest('.application-items-section--package-details'),
    ).not.toBeNull()
    expect(createPackageControls.queryByText('Package number is required')).not.toBeInTheDocument()
  })

  it('replaces an item result with a later page action result', async () => {
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [{ id: '900', name: 'app-doc.pdf', description: '', type: 'Attachment' }],
      source: 'api',
    })
    mockedOpenApplicationDocument.mockRejectedValueOnce(new Error('Open failed'))

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
    fireEvent.change(await screen.findByLabelText('Package comments'), {
      target: { value: 'Updated comments' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save package' }))
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    const documentRow = (await screen.findByText('app-doc.pdf')).closest('tr')
    await userEvent.click(within(documentRow as HTMLElement).getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Unable to open the selected document.')).toBeInTheDocument()

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByRole('heading', { name: 'Package PKG-1' })).toBeInTheDocument()
    expect(screen.queryByText('Package PKG-1 saved.')).not.toBeInTheDocument()
    expect(screen.getByText('Unable to open the selected document.')).toBeInTheDocument()
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

    await selectApplicationDetailTab('Scale')
    const packageDetailsSection = (
      await screen.findByRole('heading', { name: /^Package PKG-/ })
    ).closest('section')
    expect(packageDetailsSection).toBeTruthy()
    expect(
      within(packageDetailsSection as HTMLElement).getAllByText('Package number').length,
    ).toBeGreaterThan(0)
    expect(within(packageDetailsSection as HTMLElement).getByText('PKG-1')).toBeInTheDocument()
    expect(
      within(packageDetailsSection as HTMLElement)
        .getByText('Total pieces')
        .parentElement?.querySelector('dd'),
    ).toHaveTextContent('0')

    await userEvent.click(
      await within(packageDetailsSection as HTMLElement).findByRole('button', {
        name: 'Delete package',
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

    await selectApplicationDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete package' }))
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

    await selectApplicationDetailTab('Scale')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit package' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Delete package' })).not.toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument()
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

    await selectApplicationDetailTab('Scale')
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
    expect(within(secondPackageRow as HTMLElement).getByText('200.0')).toBeInTheDocument()
    expect(within(secondPackageRow as HTMLElement).getByText('8')).toBeInTheDocument()

    const secondPackageRadio = within(secondPackageRow as HTMLElement).getByRole('radio', {
      name: 'Select package PKG-2',
    })
    expect(secondPackageRadio).not.toBeChecked()
    fireEvent.click(secondPackageRadio)

    await waitFor(() => {
      expect(mockedFetchApplicationPackageDetails).toHaveBeenCalledWith('PKG-2')
      expect(screen.getByText('Comments').parentElement?.querySelector('dd')).toHaveTextContent(
        'Second package',
      )
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

    expect(screen.getByRole('combobox', { name: 'Selected package' })).toHaveValue('PKG-2')
    expect(screen.getByText('Comments').parentElement?.querySelector('dd')).toHaveTextContent(
      'Second package',
    )
    expect(screen.queryByText('First package stale')).not.toBeInTheDocument()
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

    await openScaleControls()
    fireEvent.change(screen.getByLabelText('Timber mark'), { target: { value: 'DRAFT-A' } })
    const packagesSection = (await screen.findByRole('heading', { name: 'Packages' })).closest(
      '.cds--tile',
    )
    expect(packagesSection).toBeTruthy()
    const secondPackageRadio = within(packagesSection as HTMLElement).getByRole('radio', {
      name: 'Select package PKG-2',
    })
    fireEvent.click(secondPackageRadio)

    const confirmation = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(confirmation).toHaveAccessibleDescription('Your changes will be lost.')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('combobox', { name: 'Selected package' })).toHaveValue('PKG-1')
    expect(
      within(packagesSection as HTMLElement).getByRole('radio', {
        name: 'Select package PKG-1',
      }),
    ).toBeChecked()
    expect(secondPackageRadio).not.toBeChecked()
    expect(screen.getByLabelText('Timber mark')).toHaveValue('DRAFT-A')

    fireEvent.click(secondPackageRadio)
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Selected package' })).toHaveValue('PKG-2')
      expect(screen.getByLabelText('Timber mark')).toHaveValue('')
    })
    expect(secondPackageRadio).toBeChecked()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('shows legacy timber mark summaries for application scales', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'S',
      packages: [],
    })
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

    await selectApplicationDetailTab('Scale')
    const timberMarksSection = (
      await screen.findByRole('heading', { name: 'Timber marks' })
    ).closest('div')
    expect(timberMarksSection).toBeTruthy()
    expect(
      await within(timberMarksSection as HTMLElement).findByText('TM-SUMMARY'),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationUniqueScales).toHaveBeenCalledWith('321')
  })

  it('adds and deletes package scales', async () => {
    const initialDetail = {
      ...applicationDetail,
      packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 0 }],
    }
    const detailAfterScaleAdd = {
      ...initialDetail,
      packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 2 }],
    }
    mockedFetchProvincialApplicationDetail
      .mockReset()
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValueOnce(detailAfterScaleAdd)
      // Deleting the added scale returns the application to its initial detail.
      .mockResolvedValue(initialDetail)

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

    await selectApplicationDetailTab('Scale')
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    const detailFetchCountAfterInitialLoad =
      mockedFetchProvincialApplicationDetail.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Add scale' }))
    await fillNewScale(screen)
    expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('12', 'FI')
    fireEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    await waitFor(() => {
      expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          timberMark: 'TM002',
          packageNumber: 'PKG-1',
          applicationNumber: '321',
          speciesCode: 'FI',
          gradeCode: '1',
          pieces: '2',
          volume: '8.0',
        }),
      )
    })
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
        detailFetchCountAfterInitialLoad + 1,
      )
    })
    expect(await screen.findByText('Scale saved.')).toBeInTheDocument()
    expect(
      screen.getByText('Scale saved.').closest('.application-items-section--scales'),
    ).not.toBeNull()
    expect(screen.queryByText('Timber mark is required')).not.toBeInTheDocument()

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
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
        detailFetchCountAfterInitialLoad + 2,
      )
    })
  })

  it.each([
    { volume: '0.05', packageVolume: 1, exceedsPackage: false },
    { volume: '1.04', packageVolume: 1, exceedsPackage: false },
    { volume: '1.05', packageVolume: 1, exceedsPackage: true },
    { volume: '1.06', packageVolume: 2, exceedsPackage: false },
  ])(
    'saves scale volume $volume as entered and checks it rounded against a $packageVolume m³ package',
    async ({ volume, packageVolume, exceedsPackage }) => {
      mockedFetchApplicationPackageDetails.mockResolvedValue({
        success: true,
        packageNumber: 'PKG-1',
        volume: packageVolume.toFixed(1),
        scaledVolume: 0,
        length: '12.0',
        diameter: '24.0',
        status: 'ACT',
        comments: 'Ready',
        statusDescription: 'Active',
        reprocessed: 'N',
        ageClass: 'O',
        ageClassDescription: 'Old',
        productType: 'LOG',
        productTypeDescription: 'Logs',
      })
      mockedFetchApplicationPackageScales.mockResolvedValue([])
      render(
        <ItemsPanelWithActionResult
          detail={{
            ...applicationDetail,
            packages: [{ packageNumber: 'PKG-1', volume: packageVolume, pieceCount: 0 }],
          }}
          canEditPackages
          canAddPackages
          canAddScales
          canUpdatePackageNumber
          hideMutationActions={false}
          authoritativeOptionsAvailability="available"
          productTypeOptions={[]}
          growthTypeOptions={[]}
          onDetailChanged={vi.fn().mockResolvedValue(undefined)}
        />,
      )

      await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
      await fillNewScale(screen, { volume })
      await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

      if (exceedsPackage) {
        expect(
          screen.getAllByText('Must be less than or equal to remaining package volume (1.0 m³)')
            .length,
        ).toBeGreaterThan(0)
        expect(screen.getByLabelText('Volume (m³)')).toHaveValue(volume)
        expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
      } else {
        await waitFor(() => {
          expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledWith(
            expect.objectContaining({ volume }),
          )
        })
      }
    },
  )

  it('blocks a scale volume with more than two decimals', async () => {
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

    const drawer = await openScaleControls()
    await fillNewScale(drawer, { volume: '1.055' })
    await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

    expect(
      drawer.getAllByText('Volume must have no more than two decimal places').length,
    ).toBeGreaterThan(0)
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it.each(['save', 'create'] as const)(
    'preserves a committed package %s as a warning when detail refresh rejects',
    async (operation) => {
      const onDetailChanged = vi.fn().mockRejectedValue(new Error('refresh failed'))
      render(
        <ItemsPanelWithActionResult
          detail={applicationDetail}
          canEditPackages
          canAddPackages
          canAddScales
          canUpdatePackageNumber
          hideMutationActions={false}
          authoritativeOptionsAvailability="available"
          productTypeOptions={[{ code: 'H', description: 'Harvested Timber' }]}
          growthTypeOptions={[{ code: 'S', description: 'Second Growth' }]}
          applicationGrowthTypeCode="S"
          onDetailChanged={onDetailChanged}
        />,
      )

      await screen.findByText('TM001')
      await userEvent.click(
        await screen.findByRole('button', {
          name: operation === 'save' ? 'Edit package' : 'Create package',
        }),
      )
      if (operation === 'save') {
        fireEvent.change(screen.getByLabelText('Package comments'), {
          target: { value: 'Saved before refresh failure' },
        })
        await userEvent.click(screen.getByRole('button', { name: 'Save package' }))
      } else {
        const section = within(document.querySelector('.application-items-drawer') as HTMLElement)
        fillNewPackage(section, 'PKG-NEW')
        await userEvent.click(section.getByRole('button', { name: 'Save package' }))
      }

      await waitFor(() => expect(onDetailChanged).toHaveBeenCalledTimes(1))
      const expectedMessage =
        operation === 'save'
          ? 'Package PKG-1 was saved, but application items could not be refreshed. Reload before changing packages again.'
          : 'Package PKG-NEW was created, but application items could not be refreshed. Reload before changing packages again.'
      expect(
        (await screen.findByText(expectedMessage)).closest('.cds--inline-notification'),
      ).toHaveClass('cds--inline-notification--warning')
      expect(screen.queryByText('Unable to save package details.')).not.toBeInTheDocument()
      expect(screen.queryByText('Unable to create package.')).not.toBeInTheDocument()
      expect(
        screen.queryByText(operation === 'save' ? 'Package PKG-1 saved.' : 'Package saved.'),
      ).not.toBeInTheDocument()
      expect(
        operation === 'save' ? mockedUpdateApplicationPackage : mockedAddApplicationPackage,
      ).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps a failed package save in its drawer and clears it when the drawer is discarded', async () => {
    mockedUpdateApplicationPackage.mockRejectedValueOnce(new Error('Package service unavailable'))
    render(
      <ItemsPanelWithActionResult
        detail={applicationDetail}
        canEditPackages
        canAddPackages
        canAddScales
        canUpdatePackageNumber
        hideMutationActions={false}
        authoritativeOptionsAvailability="available"
        productTypeOptions={[]}
        growthTypeOptions={[]}
        onDetailChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await screen.findByText('TM001')
    const editPackage = await screen.findByRole('button', { name: 'Edit package' })
    await waitFor(() => expect(editPackage).toBeEnabled())
    await userEvent.click(editPackage)
    const comments = await screen.findByLabelText('Package comments')
    const drawer = within(comments.closest('.application-items-drawer') as HTMLElement)
    fireEvent.change(comments, { target: { value: 'Café delivery' } })
    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))
    expect(
      await drawer.findByText(
        'Package comments contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(comments).toHaveFocus())
    expect(drawer.queryByText('Package save failed')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()

    fireEvent.change(comments, { target: { value: 'Cafe delivery' } })
    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))
    // The page behind an open drawer is inert, so the failure must stay in the drawer.
    expect(await drawer.findByText('Package save failed')).toBeInTheDocument()
    expect(drawer.getByText('Unable to save package details.')).toBeInTheDocument()
    expect(screen.queryByText('Item action failed')).not.toBeInTheDocument()

    await userEvent.click(drawer.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByLabelText('Package comments')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeInTheDocument()
    expect(screen.queryByText('Package save failed')).not.toBeInTheDocument()
    expect(screen.queryByText('Item action failed')).not.toBeInTheDocument()
  })

  it('shows scale mutation partial success as a warning when detail refresh fails', async () => {
    const onDetailChanged = vi.fn().mockRejectedValue(new Error('refresh failed'))
    render(
      <ItemsPanelWithActionResult
        detail={{
          ...applicationDetail,
          packages: [{ packageNumber: 'PKG-1', volume: 100, pieceCount: 0 }],
        }}
        canEditPackages
        canAddPackages
        canAddScales
        canUpdatePackageNumber
        hideMutationActions={false}
        authoritativeOptionsAvailability="available"
        productTypeOptions={[]}
        growthTypeOptions={[]}
        onDetailChanged={onDetailChanged}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Add scale' }))
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await fillNewScale(screen)
    await userEvent.click(screen.getByRole('button', { name: 'Save scale' }))

    await waitFor(() => {
      expect(mockedAddApplicationScaleToPackage).toHaveBeenCalledTimes(1)
      expect(onDetailChanged).toHaveBeenCalledTimes(1)
    })
    expect(
      (await screen.findByText('Scale 56 added. Reload before adding another scale row.')).closest(
        '.cds--inline-notification',
      ),
    ).toHaveClass('cds--inline-notification--warning')
    expect(screen.queryByText('Unable to add scale.')).not.toBeInTheDocument()

    const scaleRow = screen.getByText('TM001').closest('tr')
    expect(scaleRow).toBeTruthy()
    await userEvent.click(within(scaleRow as HTMLElement).getByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Delete scale' })
    expect(
      screen.queryByText('Scale 56 added. Reload before adding another scale row.'),
    ).not.toBeInTheDocument()
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedDeleteApplicationScale).toHaveBeenCalledWith('55', '321')
      expect(onDetailChanged).toHaveBeenCalledTimes(2)
    })
    expect(
      (
        await screen.findByText('Scale 55 deleted. Reload before changing scale rows again.')
      ).closest('.cds--inline-notification'),
    ).toHaveClass('cds--inline-notification--warning')
    expect(screen.queryByText('Unable to delete scale.')).not.toBeInTheDocument()
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

    const drawer = await openScaleControls()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    // Grade waits for a species, and the volume starts at 0.0 with the package's remaining volume.
    expect(drawer.getByRole('combobox', { name: 'Grade' })).toBeDisabled()
    expect(drawer.getByText('Available once species are selected')).toBeInTheDocument()
    expect(drawer.getByLabelText('Volume (m³)')).toHaveValue('0.0')
    expect(
      drawer.getByText('Must be less than or equal to remaining package volume (80.0 m³)'),
    ).toBeInTheDocument()
    await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

    expect(drawer.getAllByText('Timber mark is required').length).toBeGreaterThan(0)
    expect(drawer.getByText('Species is required')).toBeInTheDocument()
    expect(drawer.queryByText('Grade is required.')).not.toBeInTheDocument()
    expect(drawer.getByText('Pieces is required')).toBeInTheDocument()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
    expect(drawer.queryByText('Scale creation failed')).not.toBeInTheDocument()
    await waitFor(() => expect(drawer.getByLabelText('Timber mark')).toHaveFocus())
  })

  it.each([
    {
      message: 'Timber mark TM002 is not valid for this scale due to a status of ZZ.',
      fieldError: 'Timber mark TM002 is not valid for this scale due to a status of ZZ',
      label: 'Timber mark',
      corrected: 'TM003',
    },
    {
      message: 'The scale volume must be less than 5.0.',
      fieldError: 'The scale volume must be less than 5.0',
      label: 'Volume (m³)',
      corrected: '1.0',
    },
    {
      message: 'A scale with this timber mark, species, and grade already exists.',
      fieldError: 'A scale with this timber mark, species, and grade already exists',
      label: 'Timber mark',
      corrected: 'TM003',
    },
  ])(
    'attaches the server scale error to $label: $message',
    async ({ message, fieldError, label, corrected }) => {
      mockedAddApplicationScaleToPackage.mockResolvedValueOnce({
        valid: false,
        errors: [message],
        warnings: [],
        result: null,
      })
      renderApplicationItems()
      const drawer = await openScaleControls()
      await fillNewScale(drawer)
      await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

      const field = drawer.getByLabelText(label)
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
      expect(drawer.getByText(fieldError)).toBeInTheDocument()
      expect(drawer.queryByText('Scale creation failed')).not.toBeInTheDocument()
      await waitFor(() => expect(field).toHaveFocus())
      fireEvent.change(field, { target: { value: corrected } })
      expect(drawer.queryByText(fieldError)).not.toBeInTheDocument()
    },
  )

  it('keeps a non-field scale failure in a focused notification and preserves the draft', async () => {
    const message = 'Record changed. Reload before retrying.'
    mockedAddApplicationScaleToPackage.mockResolvedValueOnce({
      valid: false,
      errors: [message],
      warnings: [],
      result: null,
    })
    renderApplicationItems()
    const drawer = await openScaleControls()
    await fillNewScale(drawer)
    await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

    const notification = await drawer.findByText(message)
    await waitFor(() => expect(notification.closest('[data-drawer-error]')).toHaveFocus())
    expect(drawer.getByLabelText('Timber mark')).toHaveValue('TM002')
    expect(drawer.getByLabelText('Volume (m³)')).toHaveValue('8.0')
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

    const drawer = await openScaleControls()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await fillNewScale(drawer, { pieces: '1.5', volume: '100000' })
    await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

    expect(drawer.getAllByText('Pieces must be a whole number').length).toBeGreaterThan(0)
    expect(drawer.getByText('Volume must be 99999.9 or less')).toBeInTheDocument()
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

    const drawer = await openScaleControls()
    expect(await screen.findByText('TM001')).toBeInTheDocument()
    await fillNewScale(drawer, { pieces: '1', volume: '80.1' })
    await userEvent.click(drawer.getByRole('button', { name: 'Save scale' }))

    expect(
      drawer.getAllByText('Must be less than or equal to remaining package volume (80.0 m³)')
        .length,
    ).toBeGreaterThan(0)
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    await itemDetails.findByLabelText('Application volume (m³)')

    fireEvent.change(itemDetails.getByLabelText('Application volume (m³)'), {
      target: { value: '100.1' },
    })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    })
  })
})
