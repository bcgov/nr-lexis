import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlanketOicScaleCodeFields, {
  type BlanketOicScaleCodeField,
  type BlanketOicScaleCodeFieldsProps,
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
  onAvailabilityChange: BlanketOicScaleCodeFieldsProps['onAvailabilityChange']
  fieldErrors?: BlanketOicScaleCodeFieldsProps['fieldErrors']
}

const ControlledFields = ({
  initialValue,
  onChange,
  onAvailabilityChange,
  fieldErrors,
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
      fieldErrors={fieldErrors}
    />
  )
}

const chooseOption = async (name: 'Species' | 'Grade', optionName: string) => {
  await userEvent.click(screen.getByRole('combobox', { name }))
  await userEvent.click(await screen.findByRole('option', { name: optionName }))
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
        ? [
            { code: 'W', description: 'Utility' },
            { code: 'X', description: 'Chipper' },
          ]
        : [{ code: 'A', description: 'Sawlog' }],
    )
  })

  it('lists every species by name and waits for a species before offering grades', async () => {
    const onChange = vi.fn()
    const onAvailabilityChange = vi.fn()
    render(<ControlledFields onChange={onChange} onAvailabilityChange={onAvailabilityChange} />)

    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith('ready'))
    const grade = screen.getByRole('combobox', { name: 'Grade' })
    expect(grade).toBeDisabled()
    expect(grade).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('Available once species are selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Species' }))
    const species = screen.getAllByRole('option').map((option) => option.textContent)
    expect(species).toEqual(['Alder', 'Fir', 'Hemlock'])
    await userEvent.click(screen.getByRole('option', { name: 'Alder' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Grade' })).toBeEnabled())
    expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'AL')
    expect(onChange).toHaveBeenCalledWith('speciesCode', 'AL')
    // Grade is chosen by the user, never picked for them.
    expect(onChange).not.toHaveBeenCalledWith('gradeCode', 'W')
    expect(screen.queryByText('Available once species are selected')).not.toBeInTheDocument()

    await chooseOption('Grade', 'Chipper')
    expect(onChange).toHaveBeenLastCalledWith('gradeCode', 'X')
  })

  it('clears the grade when the species changes and ignores a stale grade response', async () => {
    let resolveAlderGrades:
      | ((options: Array<{ code: string; description: string }>) => void)
      | null = null
    const onChange = vi.fn()
    mockedFetchApplicationGradeCodes.mockImplementation(async (_region, speciesCode) =>
      speciesCode === 'AL'
        ? new Promise((resolve) => {
            resolveAlderGrades = resolve
          })
        : [{ code: 'A', description: 'Sawlog' }],
    )
    render(
      <ControlledFields
        initialValue={{ speciesCode: 'AL', gradeCode: 'W' }}
        onChange={onChange}
        onAvailabilityChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(mockedFetchApplicationGradeCodes).toHaveBeenCalledWith('1903', 'AL'))
    await chooseOption('Species', 'Fir')
    expect(onChange).toHaveBeenCalledWith('speciesCode', 'FI')
    expect(onChange).toHaveBeenCalledWith('gradeCode', '')

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Grade' })).toBeEnabled())
    await act(async () => resolveAlderGrades?.([{ code: 'W', description: 'Utility' }]))
    await userEvent.click(screen.getByRole('combobox', { name: 'Grade' }))
    expect(screen.getByRole('option', { name: 'Sawlog' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Utility' })).not.toBeInTheDocument()
  })

  it('reports a failed lookup to the panel and treats an empty grade list as loaded', async () => {
    const onAvailabilityChange = vi.fn()
    mockedFetchApplicationGradeCodes.mockResolvedValueOnce([])
    const { unmount } = render(
      <ControlledFields
        initialValue={{ speciesCode: 'HE' }}
        onChange={vi.fn()}
        onAvailabilityChange={onAvailabilityChange}
      />,
    )
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith('ready'))
    expect(onAvailabilityChange).not.toHaveBeenCalledWith('unavailable')
    unmount()

    mockedFetchApplicationGradeCodes.mockRejectedValue(new Error('grades unavailable'))
    render(
      <ControlledFields
        initialValue={{ speciesCode: 'HE' }}
        onChange={vi.fn()}
        onAvailabilityChange={onAvailabilityChange}
      />,
    )
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith('unavailable'))
    expect(screen.getByRole('combobox', { name: 'Grade' })).toBeDisabled()
    // The panel shows the notice at its top, not over a field.
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })

  it('shows field errors in place of the helper', async () => {
    render(
      <ControlledFields
        onChange={vi.fn()}
        onAvailabilityChange={vi.fn()}
        fieldErrors={{ speciesCode: 'Select a species.' }}
      />,
    )

    expect(await screen.findByText('Select a species')).toBeInTheDocument()
    // Carbon marks an invalid dropdown on its list box.
    expect(
      screen.getByRole('combobox', { name: 'Species' }).closest('[data-invalid="true"]'),
    ).not.toBeNull()
  })
})
