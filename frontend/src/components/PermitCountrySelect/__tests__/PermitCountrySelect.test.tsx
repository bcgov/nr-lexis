import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import PermitCountrySelect from '..'

const countryOptions = [
  { value: 'CA', label: 'Canada (CA)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'JP', label: 'Japan (JP)' },
  { value: 'CN', label: 'China (CN)' },
  { value: 'NZ', label: 'New Zealand (NZ)' },
  { value: 'GB', label: 'United Kingdom (GB)' },
  { value: 'AD', label: 'Andorra (AD)' },
]

const CountrySelectHarness = ({ initialValue = '' }: { initialValue?: string }) => {
  const [value, setValue] = useState(initialValue)

  return (
    <PermitCountrySelect
      id="destination-country"
      labelText="Final destination country"
      value={value}
      options={countryOptions}
      onChange={setValue}
    />
  )
}

describe('PermitCountrySelect', () => {
  it('opens with the first six procedure-ordered countries and searches all active countries', async () => {
    const user = userEvent.setup()
    render(<CountrySelectHarness />)

    const countryInput = screen.getByRole('combobox', { name: 'Final destination country' })
    await user.click(countryInput)

    expect(screen.getByRole('option', { name: 'Canada (CA)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'United Kingdom (GB)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Andorra (AD)' })).not.toBeInTheDocument()

    await user.type(countryInput, 'Andorra')

    const andorra = await screen.findByRole('option', { name: 'Andorra (AD)' })
    expect(screen.queryByRole('option', { name: 'Canada (CA)' })).not.toBeInTheDocument()
    await user.click(andorra)

    expect(countryInput).toHaveValue('Andorra (AD)')
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
})
