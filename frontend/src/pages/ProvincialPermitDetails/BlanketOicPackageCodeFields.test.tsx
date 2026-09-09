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
  status: 'ACT',
  reprocessed: 'N',
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

  it('uses region and selected species for dependent selections without blocking empty required fields', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    render(<ControlledFields onChange={onChange} onAvailabilityChange={onAvailabilityChange} />)

    await waitFor(() => {
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenCalledWith('101', 'H', [])
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(true)
    })
    expect(mockedFetchApplicationEndUsesForSpeciesRegion).not.toHaveBeenCalled()

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Species' }), 'FI - Fir')
    await userEvent.click(screen.getByRole('button', { name: 'Add species' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('speciesCodes', 'FI')
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('101', 'H', ['FI'])
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('101', ['FI'])
    })

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'End use' }), 'LU - Lumber')
    expect(onChange).toHaveBeenCalledWith('endUseCode', 'LU')

    await userEvent.click(screen.getByRole('button', { name: 'Remove FI' }))
    expect(onChange).toHaveBeenCalledWith('speciesCodes', '')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'End use' })).toBeDisabled()
    })
  })

  it('emits the source-backed reprocessed Y and N payload values', async () => {
    const onChange = vi.fn()
    render(<ControlledFields onChange={onChange} onAvailabilityChange={vi.fn()} />)

    expect(screen.getByLabelText('No')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Yes'))
    expect(onChange).toHaveBeenCalledWith('reprocessed', 'Y')

    await userEvent.click(screen.getByLabelText('No'))
    expect(onChange).toHaveBeenCalledWith('reprocessed', 'N')
  })

  it('keeps cleared required package-code values blank instead of restoring defaults', async () => {
    render(
      <ControlledFields
        initialValue={{ ageClass: '', productType: '', status: '', reprocessed: '' }}
        onChange={vi.fn()}
        onAvailabilityChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Age class' })).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'Status' })).toBeEnabled()
    })

    expect(screen.getByRole('combobox', { name: 'Age class' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
    expect(screen.getByLabelText('Yes')).not.toBeChecked()
    expect(screen.getByLabelText('No')).not.toBeChecked()
  })

  it('keeps an end-use fallback for empty candidates and replaces it after a species change yields allowed candidates', async () => {
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
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('101', ['FI'])
    })
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('LEGACY-END-USE')

    await userEvent.click(screen.getByRole('button', { name: 'Remove FI' }))
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Species' }), 'HE - Hemlock')
    await userEvent.click(screen.getByRole('button', { name: 'Add species' }))

    await waitFor(() => {
      expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalledWith('101', ['HE'])
      expect(onChange).toHaveBeenCalledWith('endUseCode', 'LU')
    })
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('LU - Lumber')
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
          status: 'OLD-STATUS',
        }}
        onChange={onChange}
        onAvailabilityChange={onAvailabilityChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Package options unavailable')).toBeInTheDocument()
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(false)
    })

    expect(screen.getByText('FI')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'End use' })).toHaveValue('OLD-END-USE')
    expect(screen.getByRole('combobox', { name: 'Age class' })).toHaveValue('OLD-AGE')
    expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('OLD-PRODUCT')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('OLD-STATUS')
    expect(screen.getByLabelText('No')).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })
})
