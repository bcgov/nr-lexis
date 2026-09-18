import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import PermitCountrySelect from '..'

const countryOptions = [
  { value: 'CO', label: 'Colombia (CO)' },
  { value: 'CA', label: 'Canada (CA)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'TW', label: 'Taiwan (TW)' },
  { value: 'JP', label: 'Japan (JP)' },
  { value: 'CN', label: 'China (CN)' },
  { value: 'CL', label: 'Chile (CL)' },
  { value: 'KR', label: 'Korea (KR)' },
  { value: 'NZ', label: 'New Zealand (NZ)' },
  { value: 'GB', label: 'United Kingdom (GB)' },
  { value: 'AD', label: 'Andorra (AD)' },
  { value: 'KH', label: 'Cambodia (KH)' },
]

const CountrySelectHarness = ({ initialValue = '' }: { initialValue?: string }) => {
  const [value, setValue] = useState(initialValue)

  return (
    <>
      <PermitCountrySelect
        id="destination-country"
        labelText="Final destination country"
        value={value}
        options={countryOptions}
        onChange={setValue}
      />
      <output aria-label="Selected country">{value}</output>
    </>
  )
}

describe('PermitCountrySelect', () => {
  it('opens with the six preferred countries, a decorative divider, and every remaining country alphabetically', async () => {
    const user = userEvent.setup()
    const { container } = render(<CountrySelectHarness />)

    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })
    await user.click(countryInput)

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'United States (US)',
      'Japan (JP)',
      'China (CN)',
      'Korea (KR)',
      'Taiwan (TW)',
      'Canada (CA)',
      'Andorra (AD)',
      'Cambodia (KH)',
      'Chile (CL)',
      'Colombia (CO)',
      'New Zealand (NZ)',
      'United Kingdom (GB)',
    ])
    const dividers = container.querySelectorAll('.permit-country-select__after-preferred')
    expect(dividers).toHaveLength(1)
    expect(dividers[0]).toHaveTextContent('Andorra (AD)')
    // The divider is styling on the first remaining country, never an extra option.
    expect(screen.getAllByRole('option')).toHaveLength(countryOptions.length)

    await user.type(countryInput, 'Andorra')

    const andorra = await screen.findByRole('option', { name: 'Andorra (AD)' })
    expect(screen.queryByRole('option', { name: 'Canada (CA)' })).not.toBeInTheDocument()
    expect(container.querySelector('.permit-country-select__after-preferred')).toBeNull()
    await user.click(andorra)

    expect(countryInput).toHaveValue('Andorra (AD)')
    expect(screen.getByLabelText('Selected country')).toHaveTextContent('AD')
  })

  it('shows flat search matches with preferred countries first and supports keyboard selection', async () => {
    const user = userEvent.setup()
    const { container } = render(<CountrySelectHarness />)
    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })

    await user.type(countryInput, 'c')

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'China (CN)',
      'Canada (CA)',
      'Cambodia (KH)',
      'Chile (CL)',
      'Colombia (CO)',
    ])
    expect(container.querySelector('.permit-country-select__after-preferred')).toBeNull()
    await user.keyboard('{Enter}')

    expect(countryInput).toHaveValue('China (CN)')
    expect(screen.getByLabelText('Selected country')).toHaveTextContent('CN')

    await user.clear(countryInput)
    await user.type(countryInput, 'c')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(countryInput).toHaveValue('Canada (CA)')
    expect(screen.getByLabelText('Selected country')).toHaveTextContent('CA')
  })

  it('navigates across the divider without adding a keyboard stop', async () => {
    const user = userEvent.setup()
    render(<CountrySelectHarness />)
    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })

    await user.click(countryInput)
    await user.keyboard('{ArrowDown>7}{Enter}')

    expect(countryInput).toHaveValue('Andorra (AD)')
    expect(screen.getByLabelText('Selected country')).toHaveTextContent('AD')
  })

  it('keeps a persisted country outside the preferred six labelled and selectable', async () => {
    const user = userEvent.setup()
    render(<CountrySelectHarness initialValue="AD" />)

    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })
    expect(countryInput).toHaveValue('Andorra (AD)')

    await user.click(countryInput)

    expect(screen.getByRole('option', { name: 'Andorra (AD)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Canada (CA)' })).toBeInTheDocument()
  })

  it('keeps a persisted country absent from active references labelled and selectable', async () => {
    const user = userEvent.setup()
    render(<CountrySelectHarness initialValue="ZZ" />)
    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })
    expect(countryInput).toHaveValue('ZZ')

    await user.click(countryInput)
    await user.click(screen.getByRole('option', { name: 'ZZ' }))

    expect(countryInput).toHaveValue('ZZ')
  })
})
