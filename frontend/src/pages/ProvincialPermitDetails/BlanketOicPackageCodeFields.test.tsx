import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlanketOicPackageCodeFields, {
  type BlanketOicPackageCodeField,
  type BlanketOicPackageCodeFieldsValue,
} from './BlanketOicPackageCodeFields'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationPackageStatusCodes,
  fetchApplicationRemainingSpecies,
} from '@/service/provincial-application-items-service'
import { fetchProvincialApplicationOptions } from '@/service/search-options-service'

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
  fetchApplicationPackageStatusCodes: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
}))

const mockedFetchApplicationEndUsesForSpeciesRegion = vi.mocked(
  fetchApplicationEndUsesForSpeciesRegion,
)
const mockedFetchApplicationPackageStatusCodes = vi.mocked(fetchApplicationPackageStatusCodes)
const mockedFetchApplicationRemainingSpecies = vi.mocked(fetchApplicationRemainingSpecies)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)

const DEFAULT_VALUE: BlanketOicPackageCodeFieldsValue = {
  speciesCodes: '',
  endUseCode: '',
  ageClass: 'O',
  productType: 'H',
}

type ControlledFieldsProps = {
  initialValue?: Partial<BlanketOicPackageCodeFieldsValue>
  onChange: (field: BlanketOicPackageCodeField, value: string) => void
  onAvailabilityChange: (ready: boolean) => void
}

const ControlledFields = ({
  initialValue,
  onChange,
  onAvailabilityChange,
}: ControlledFieldsProps) => {
  const [value, setValue] = useState<BlanketOicPackageCodeFieldsValue>({
    ...DEFAULT_VALUE,
    ...initialValue,
  })

  return (
    <BlanketOicPackageCodeFields
      region="101"
      value={value}
      disabled={false}
      onChange={(field, nextValue) => {
        onChange(field, nextValue)
        setValue((current) => ({ ...current, [field]: nextValue }))
      }}
      onAvailabilityChange={onAvailabilityChange}
    />
  )
}

const chooseComboBoxOption = async (combobox: HTMLElement, optionName: string) => {
  await userEvent.click(combobox)
  await userEvent.clear(combobox)
  await userEvent.type(combobox, optionName)
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

describe('BlanketOicPackageCodeFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [{ value: 'O', label: 'Old growth' }],
      regions: [],
      currentSchedules: [],
    })
    mockedFetchApplicationPackageStatusCodes.mockResolvedValue([
      { code: 'ACT', description: 'Active' },
    ])
    mockedFetchApplicationRemainingSpecies.mockImplementation(
      async (_region, _productType, selectedSpecies) =>
        selectedSpecies.includes('FI')
          ? [{ code: 'HE', description: 'Hemlock' }]
          : [
              { code: 'FI', description: 'Fir' },
              { code: 'HE', description: 'Hemlock' },
            ],
    )
    mockedFetchApplicationEndUsesForSpeciesRegion.mockResolvedValue([
      { code: 'LU', description: 'Lumber' },
    ])
  })

  it('narrows the Species list and offers only end uses that complete a sort', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    render(<ControlledFields onChange={onChange} onAvailabilityChange={onAvailabilityChange} />)

    await waitFor(() => {
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenCalledWith('101', 'H', [])
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(true)
    })
    expect(mockedFetchApplicationEndUsesForSpeciesRegion).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'End use' })).toBeDisabled()
    expect(screen.getByText('Available once species are selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add species' })).not.toBeInTheDocument()

    const species = screen.getByRole('combobox', { name: /^Species list/ })
    expect(species).toHaveAttribute('aria-required', 'true')
    await userEvent.click(species)
    await userEvent.click(await screen.findByRole('option', { name: /FI - Fir/ }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('speciesCodes', 'FI')
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('101', 'H', ['FI'])
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('101', ['FI'], {
        completeSortOnly: true,
      })
    })
    expect(await screen.findByRole('option', { name: /HE - Hemlock/ })).toBeInTheDocument()
    expect(species).toHaveAccessibleName(/Total items selected: 1/)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'End use' })).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('')
    expect(onChange).not.toHaveBeenCalledWith('endUseCode', expect.anything())

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'End use' }), 'LU - Lumber')
    expect(onChange).toHaveBeenCalledWith('endUseCode', 'LU')

    await userEvent.click(species)
    await userEvent.click(await screen.findByRole('option', { name: /FI/ }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('speciesCodes', '')
      expect(onChange).toHaveBeenLastCalledWith('endUseCode', '')
      expect(screen.getByRole('combobox', { name: 'End use' })).toBeDisabled()
    })
  })

  it('marks Escape on the open Species list as handled so the side panel stays open', async () => {
    const escapeHandled: boolean[] = []
    render(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') escapeHandled.push(event.defaultPrevented)
        }}
      >
        <ControlledFields onChange={vi.fn()} onAvailabilityChange={vi.fn()} />
      </div>,
    )

    const species = screen.getByRole('combobox', { name: /^Species list/ })
    await waitFor(() => expect(species).toBeEnabled())
    await userEvent.click(species)
    expect(await screen.findByRole('option', { name: /FI - Fir/ })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    expect(escapeHandled).toEqual([true])
    expect(screen.queryByRole('option', { name: /FI - Fir/ })).not.toBeInTheDocument()
  })

  it('omits status and reprocessed without requiring their lookup', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    mockedFetchApplicationPackageStatusCodes.mockRejectedValue(new Error('status unavailable'))
    render(<ControlledFields onChange={onChange} onAvailabilityChange={onAvailabilityChange} />)

    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith(true))
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Reprocessed' })).not.toBeInTheDocument()
    expect(screen.queryByText('Package options unavailable')).not.toBeInTheDocument()
    expect(mockedFetchApplicationPackageStatusCodes).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps cleared required package-code values blank instead of restoring defaults', async () => {
    render(
      <ControlledFields
        initialValue={{ ageClass: '', productType: '' }}
        onChange={vi.fn()}
        onAvailabilityChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Age class' })).toBeEnabled()
    })

    expect(screen.getByRole('combobox', { name: 'Age class' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('')
  })

  it('clears an end use that no longer completes a sort and waits for the user to choose one', async () => {
    const onChange = vi.fn()
    mockedFetchApplicationEndUsesForSpeciesRegion.mockImplementation(
      async (_region, selectedSpecies) =>
        selectedSpecies.includes('HE') ? [{ code: 'LU', description: 'Lumber' }] : [],
    )

    render(
      <ControlledFields
        initialValue={{ speciesCodes: 'FI', endUseCode: 'LEGACY-END-USE' }}
        onChange={onChange}
        onAvailabilityChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('101', ['FI'], {
        completeSortOnly: true,
      })
      expect(onChange).toHaveBeenCalledWith('endUseCode', '')
    })
    expect(screen.getByRole('combobox', { name: 'End use' })).toBeDisabled()
    expect(screen.getByText('Available once species are selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: /^Species list/ }))
    await userEvent.click(await screen.findByRole('option', { name: /HE - Hemlock/ }))

    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith(
        '101',
        ['FI', 'HE'],
        { completeSortOnly: true },
      )
      expect(screen.getByRole('combobox', { name: 'End use' })).toBeEnabled()
    })
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('')
    expect(screen.queryByText('Available once species are selected')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalledWith('endUseCode', 'LU')
  })

  it('preserves persisted values and reports unavailable references when dependency loads fail', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    mockedFetchApplicationRemainingSpecies.mockRejectedValue(new Error('species unavailable'))
    mockedFetchApplicationEndUsesForSpeciesRegion.mockRejectedValue(
      new Error('end uses unavailable'),
    )

    render(
      <ControlledFields
        initialValue={{
          speciesCodes: 'FI',
          endUseCode: 'OLD-END-USE',
          ageClass: 'OLD-AGE',
          productType: 'OLD-PRODUCT',
        }}
        onChange={onChange}
        onAvailabilityChange={onAvailabilityChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Package options unavailable')).toBeInTheDocument()
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(false)
    })

    expect(screen.getByRole('combobox', { name: /^Species list/ })).toHaveAccessibleName(
      /Total items selected: 1/,
    )
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('OLD-END-USE')
    expect(screen.getByRole('combobox', { name: 'Age class' })).toHaveValue('OLD-AGE')
    expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('OLD-PRODUCT')
    expect(onChange).not.toHaveBeenCalled()
  })
})
