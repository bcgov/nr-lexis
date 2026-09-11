import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlanketOicScaleCodeFields, {
  type BlanketOicScaleCodeField,
  type BlanketOicScaleCodeFieldsValue,
} from './BlanketOicScaleCodeFields'
import {
  fetchApplicationGradeCodes,
  fetchApplicationSpeciesCodes,
} from '@/service/provincial-application-items-service'

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationGradeCodes: vi.fn(),
  fetchApplicationSpeciesCodes: vi.fn(),
}))

const mockedFetchApplicationGradeCodes = vi.mocked(fetchApplicationGradeCodes)
const mockedFetchApplicationSpeciesCodes = vi.mocked(fetchApplicationSpeciesCodes)

type ControlledFieldsProps = {
  initialValue?: Partial<BlanketOicScaleCodeFieldsValue>
  onChange: (field: BlanketOicScaleCodeField, value: string) => void
  onAvailabilityChange: (ready: boolean) => void
}

const ControlledFields = ({
  initialValue,
  onChange,
  onAvailabilityChange,
}: ControlledFieldsProps) => {
  const [value, setValue] = useState<BlanketOicScaleCodeFieldsValue>({
    speciesCode: '',
    gradeCode: '',
    ...initialValue,
  })

  return (
    <BlanketOicScaleCodeFields
      region="1903"
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

describe('BlanketOicScaleCodeFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchApplicationSpeciesCodes.mockResolvedValue([
      { code: 'AL', description: 'Alder' },
      { code: 'FI', description: 'Fir' },
      { code: 'HE', description: 'Hemlock' },
    ])
    mockedFetchApplicationGradeCodes.mockImplementation(async (_region, speciesCode) =>
      speciesCode === 'AL'
        ? [{ code: 'W', description: 'Utility' }]
        : speciesCode === 'HE'
          ? [{ code: 'B', description: 'Pulp' }]
          : [{ code: 'A', description: 'Sawlog' }],
    )
  })

  it('uses named species and species-filtered grade options with loading safety', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    render(<ControlledFields onChange={onChange} onAvailabilityChange={onAvailabilityChange} />)

    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByRole('combobox', { name: 'Grade' })).toBeDisabled()

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Species' }), 'AL - Alder')

    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'AL')
      expect(onChange).toHaveBeenCalledWith('gradeCode', 'W')
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(true)
    })
    expect(screen.getByRole('combobox', { name: 'Grade' })).toHaveValue('W - Utility')
  })

  it('ignores a delayed grade response for a replaced species selection', async () => {
    let resolveAlderGrades:
      | ((options: Array<{ code: string; description: string }>) => void)
      | null = null
    const delayedAlderGrades = new Promise<Array<{ code: string; description: string }>>(
      (resolve) => {
        resolveAlderGrades = resolve
      },
    )
    const onChange = vi.fn()
    mockedFetchApplicationGradeCodes.mockImplementation(async (_region, speciesCode) =>
      speciesCode === 'AL' ? delayedAlderGrades : [{ code: 'A', description: 'Sawlog' }],
    )
    render(
      <ControlledFields
        initialValue={{ speciesCode: 'AL' }}
        onChange={onChange}
        onAvailabilityChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'AL'))
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Species' }), 'FI - Fir')
    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'FI')
      expect(screen.getByRole('combobox', { name: 'Grade' })).toHaveValue('A - Sawlog')
    })
    await act(async () => resolveAlderGrades?.([{ code: 'W', description: 'Utility' }]))

    expect(onChange).not.toHaveBeenCalledWith('gradeCode', 'W')
    expect(screen.getByRole('combobox', { name: 'Grade' })).toHaveValue('A - Sawlog')
  })

  it('disables the dependent grade selection and reports a failed authoritative lookup', async () => {
    const onAvailabilityChange = vi.fn()
    mockedFetchApplicationGradeCodes.mockRejectedValue(new Error('grades unavailable'))
    render(
      <ControlledFields
        initialValue={{ speciesCode: 'HE' }}
        onChange={vi.fn()}
        onAvailabilityChange={onAvailabilityChange}
      />,
    )

    await waitFor(() => {
      expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'HE')
      expect(screen.getByText('Scale options unavailable')).toBeInTheDocument()
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(false)
    })
    expect(screen.getByRole('combobox', { name: 'Grade' })).toBeDisabled()
  })
})
