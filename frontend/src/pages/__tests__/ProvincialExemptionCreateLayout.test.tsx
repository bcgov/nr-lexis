import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import {
  checkProvincialExemptionNumber,
  submitProvincialExemptionCreate,
} from '@/service/create-submit-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  checkProvincialExemptionNumber: vi.fn(),
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

const fillBlanketOic = async (exemptionNumber = 'T1016R3') => {
  await chooseBlanketOic()
  await userEvent.type(screen.getByRole('textbox', { name: 'Exemption number' }), exemptionNumber)
  fireEvent.change(screen.getByLabelText('Approval date'), { target: { value: '2026-10-17' } })
  fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2027-10-17' } })
  await userEvent.click(screen.getByRole('combobox', { name: /^Region/ }))
  await userEvent.click(
    await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
  )
  await userEvent.keyboard('{Escape}')
}

const serverDuplicateError = '* - this exemption number has already been assigned'
const duplicateFieldError = 'This exemption number has already been assigned'

const errorMessageFor = (field: HTMLElement): string | null => {
  const id = field.getAttribute('aria-errormessage')
  return id ? (document.getElementById(id)?.textContent ?? null) : null
}

describe('Provincial exemption create layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext())
    vi.mocked(checkProvincialExemptionNumber).mockResolvedValue({ valid: true, message: '' })
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

  it('shows a taken number on its field when leaving it, and clears it on edit', async () => {
    vi.mocked(checkProvincialExemptionNumber).mockResolvedValue({
      valid: false,
      message: serverDuplicateError,
    })
    renderCreatePage()
    await chooseBlanketOic()

    const number = screen.getByRole('textbox', { name: 'Exemption number' })
    await userEvent.type(number, 'T1016R3')
    expect(checkProvincialExemptionNumber).not.toHaveBeenCalled()
    await userEvent.tab()

    expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(1)
    expect(checkProvincialExemptionNumber).toHaveBeenCalledWith('T1016R3')
    await waitFor(() => expect(number).toHaveAttribute('aria-invalid', 'true'))
    expect(errorMessageFor(number)).toBe(duplicateFieldError)
    expect(screen.queryByText(serverDuplicateError)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeEnabled()
    expect(submitProvincialExemptionCreate).not.toHaveBeenCalled()

    // The dates and region are still empty, so Save stops at those fields and keeps the
    // number's message alongside them.
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
    expect(submitProvincialExemptionCreate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Approval date')).toHaveAttribute('aria-invalid', 'true')
    expect(errorMessageFor(number)).toBe(duplicateFieldError)

    await userEvent.type(number, '9')
    expect(number).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(duplicateFieldError)).not.toBeInTheDocument()
  })

  it('drops a taken message when a later check finds that number free', async () => {
    vi.mocked(checkProvincialExemptionNumber).mockResolvedValueOnce({
      valid: false,
      message: serverDuplicateError,
    })
    renderCreatePage()
    await chooseBlanketOic()
    const number = screen.getByRole('textbox', { name: 'Exemption number' })

    await userEvent.type(number, 'T1016R3')
    await userEvent.tab()
    await waitFor(() => expect(errorMessageFor(number)).toBe(duplicateFieldError))

    await userEvent.type(number, '9{Backspace}')
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(2)
    expect(checkProvincialExemptionNumber).toHaveBeenLastCalledWith('T1016R3')
    await waitFor(() => expect(number).not.toHaveAttribute('aria-invalid'))
    expect(screen.queryByText(duplicateFieldError)).not.toBeInTheDocument()
  })

  it('lets Save submit a number reported taken and shows the refusal on the field', async () => {
    vi.mocked(checkProvincialExemptionNumber).mockResolvedValue({
      valid: false,
      message: serverDuplicateError,
    })
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: [serverDuplicateError],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    const number = screen.getByRole('textbox', { name: 'Exemption number' })
    await waitFor(() => expect(errorMessageFor(number)).toBe(duplicateFieldError))

    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
    await waitFor(() => expect(submitProvincialExemptionCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(number).toHaveFocus())
    expect(errorMessageFor(number)).toBe(duplicateFieldError)
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()
  })

  it('puts a past expiry date refusal on the Expiry date field', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: ['An active exemption cannot have an expiry date before today.'],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    const expiry = await screen.findByLabelText('Expiry date')
    await waitFor(() => expect(expiry).toHaveFocus())
    expect(expiry).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText('An active exemption cannot have an expiry date before today'),
    ).toBeVisible()
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()

    fireEvent.change(expiry, { target: { value: '2027-10-18' } })
    expect(expiry).not.toHaveAttribute('aria-invalid')
  })

  it('checks a number only when it changed and passes local validation', async () => {
    renderCreatePage()
    await chooseBlanketOic()
    const number = screen.getByRole('textbox', { name: 'Exemption number' })

    await userEvent.click(number)
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).not.toHaveBeenCalled()

    await userEvent.type(number, 'É')
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).not.toHaveBeenCalled()

    await userEvent.clear(number)
    await userEvent.type(number, 'T1016R3')
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(1)

    await userEvent.click(number)
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(1)

    await userEvent.type(number, '{Backspace}7')
    await userEvent.tab()
    expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(2)
    expect(checkProvincialExemptionNumber).toHaveBeenLastCalledWith('T1016R7')
    expect(number).not.toHaveAttribute('aria-invalid')
  })

  it('leaves the field alone when the number lookup fails', async () => {
    vi.mocked(checkProvincialExemptionNumber).mockRejectedValue(new Error('offline'))
    renderCreatePage()
    await chooseBlanketOic()
    const number = screen.getByRole('textbox', { name: 'Exemption number' })

    await userEvent.type(number, 'T1016R3')
    await userEvent.tab()
    await waitFor(() => expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(1))

    expect(number).not.toHaveAttribute('aria-invalid')
    await userEvent.click(number)
    await userEvent.tab()
    await waitFor(() => expect(checkProvincialExemptionNumber).toHaveBeenCalledTimes(2))
  })

  it('uppercases the number as it is typed and saves it uppercase', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: true,
      message: 'Saved.',
      errors: [],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic('t261017m')

    expect(screen.getByRole('textbox', { name: 'Exemption number' })).toHaveValue('T261017M')
    expect(checkProvincialExemptionNumber).toHaveBeenCalledWith('T261017M')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
    await waitFor(() => expect(submitProvincialExemptionCreate).toHaveBeenCalledTimes(1))
    expect(submitProvincialExemptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ exemptionNumber: 'T261017M' }),
    )
  })

  it('puts the Save duplicate error on the number and focuses it from the Fees tab', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: [serverDuplicateError],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    const number = await screen.findByRole('textbox', { name: 'Exemption number' })
    await waitFor(() => expect(number).toHaveFocus())
    expect(number).toHaveAttribute('aria-invalid', 'true')
    expect(errorMessageFor(number)).toBe(duplicateFieldError)
    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByText(serverDuplicateError)).not.toBeInTheDocument()
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
    await waitFor(() => expect(submitProvincialExemptionCreate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(number).toHaveFocus())

    await userEvent.clear(number)
    await userEvent.type(number, 'TF17NEW')
    expect(number).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(duplicateFieldError)).not.toBeInTheDocument()
  })

  it('clears the duplicate number error when the exemption type changes', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: '',
      errors: [serverDuplicateError],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
    await screen.findByText(duplicateFieldError)

    await userEvent.click(screen.getByRole('radio', { name: 'Order in Council' }))
    const number = screen.getByRole('textbox', { name: 'Exemption number' })
    expect(number).toHaveValue('T1016R3')
    expect(number).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(duplicateFieldError)).not.toBeInTheDocument()
    expect(submitProvincialExemptionCreate).toHaveBeenCalledTimes(1)
  })

  it('shows every other Save error and keeps the duplicate on its field', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: [
        serverDuplicateError,
        'The selected region is no longer available.',
        'Try again later.',
      ],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    const number = screen.getByRole('textbox', { name: 'Exemption number' })
    await waitFor(() => expect(number).toHaveFocus())
    expect(errorMessageFor(number)).toBe(duplicateFieldError)
    expect(
      screen.getByText('The selected region is no longer available. Try again later.'),
    ).toBeVisible()
    expect(screen.queryByText(serverDuplicateError)).not.toBeInTheDocument()
  })

  it('puts a Save error that names a field on that field', async () => {
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: ['The approved volume must be greater than 0'],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()
    await userEvent.type(screen.getByRole('textbox', { name: /^Approval volume/ }), '5')
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    const volume = await screen.findByRole('textbox', { name: /^Approval volume/ })
    await waitFor(() => expect(volume).toHaveFocus())
    expect(errorMessageFor(volume)).toBe('The approved volume must be greater than 0')
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Exemption number' })).not.toHaveAttribute(
      'aria-invalid',
    )

    await userEvent.type(volume, '0')
    expect(volume).not.toHaveAttribute('aria-invalid')
  })

  it('focuses every general Save rejection without blaming the number', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    onTestFinished(() => visibleRects.mockRestore())
    vi.mocked(submitProvincialExemptionCreate).mockResolvedValue({
      success: false,
      message: 'The exemption could not be saved.',
      errors: ['The exemption changed in another session.', 'Refresh before trying again.'],
      warnings: [],
    })
    renderCreatePage()
    await fillBlanketOic()

    for (let attempt = 1; attempt <= 2; attempt++) {
      await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))
      const notice = (
        await screen.findByText(/The exemption changed in another session\./)
      ).closest('.app-inline-notification')
      await waitFor(() => expect(notice).toHaveFocus())
      expect(notice).toHaveTextContent('Refresh before trying again.')
      expect(screen.getByRole('textbox', { name: 'Exemption number' })).not.toHaveAttribute(
        'aria-invalid',
      )
      expect(submitProvincialExemptionCreate).toHaveBeenCalledTimes(attempt)
    }
  })
})
