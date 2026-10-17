import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import { submitProvincialExemptionCreate } from '@/service/create-submit-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialExemptionCreate: vi.fn(),
}))

Element.prototype.scrollIntoView = vi.fn()

const renderCreatePage = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/exemption/create']}>
      <Routes>
        <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
      </Routes>
    </MemoryRouter>,
  )

const chooseBlanketOic = async () => {
  const blanketOic = await screen.findByRole('radio', { name: 'Blanket OIC' })
  await waitFor(() => expect(blanketOic).toBeEnabled())
  await userEvent.click(blanketOic)
}

describe('Provincial exemption create layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext())
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [
        { value: 'O', label: 'Order in Council' },
        { value: 'B', label: 'Blanket OIC' },
      ],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })
  })

  it('shows the page title without a subtitle', async () => {
    renderCreatePage()

    const heading = await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    expect(
      screen.queryByText('Enter exemption details and save a new exemption.'),
    ).not.toBeInTheDocument()
    expect(heading.closest('header')?.querySelector('p')).toBeNull()
  })

  it('puts the fee rate one column wide on its own row below the override choice', async () => {
    renderCreatePage()

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    const fees = screen.getByRole('region', { name: 'Fees' })
    await userEvent.click(within(fees).getByRole('radio', { name: 'Yes' }))

    const feeRate = within(fees).getByRole('textbox', { name: 'Fee rate ($/m³)' })
    const overrideRow = within(fees)
      .getByRole('radio', { name: 'Yes' })
      .closest('.record-field-grid__row')
    const feeRateRow = feeRate.closest('.record-field-grid__row')
    expect(overrideRow).not.toBeNull()
    expect(feeRateRow).not.toBeNull()
    expect(feeRateRow).not.toBe(overrideRow)
    expect(feeRateRow?.parentElement).toBe(overrideRow?.parentElement)
    expect(feeRate.closest('.record-field')).toHaveClass('cds--lg:col-span-4')
  })

  it('names the chosen regions and links the region error to its field', async () => {
    renderCreatePage()

    await chooseBlanketOic()
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    const region = screen.getByRole('combobox', { name: /^Region/ })
    expect(region).toHaveAttribute('aria-invalid', 'true')
    expect(region).toHaveAccessibleDescription(
      'Select at least one region for a Blanket OIC exemption',
    )
    expect(submitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.click(region)
    await userEvent.click(
      await screen.findByRole('option', { name: 'Kootenay-Boundary Natural Resource Region' }),
    )
    await userEvent.keyboard('{Escape}')
    expect(region).toHaveAttribute('placeholder', 'Kootenay-Boundary Natural Resource Region')
    expect(region).not.toHaveAttribute('aria-invalid')
    expect(region).not.toHaveAttribute('aria-describedby')
  })
})
