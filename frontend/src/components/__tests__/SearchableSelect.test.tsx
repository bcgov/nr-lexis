import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchableSelect from '../SearchableSelect'

Element.prototype.scrollIntoView = vi.fn()

describe('SearchableSelect', () => {
  it('exposes required status on the combobox', () => {
    render(
      <SearchableSelect
        id="required-status"
        labelText="Application status"
        value=""
        options={[]}
        required
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Application status' })).toHaveAttribute(
      'aria-required',
      'true',
    )
  })

  it('marks the combobox invalid while it shows an error', () => {
    const select = (props: { invalid: boolean; disabled?: boolean }) => (
      <SearchableSelect
        id="region"
        labelText="Region"
        value=""
        options={[{ value: '11', label: 'Cariboo' }]}
        invalidText="Region is required"
        onChange={vi.fn()}
        {...props}
      />
    )
    const { rerender } = render(select({ invalid: true }))

    const combobox = screen.getByRole('combobox', { name: 'Region' })
    expect(combobox).toHaveAttribute('aria-invalid', 'true')
    expect(combobox).toHaveAccessibleDescription('Region is required')

    rerender(select({ invalid: false }))
    expect(combobox).not.toHaveAttribute('aria-invalid')
    rerender(select({ invalid: true, disabled: true }))
    expect(combobox).not.toHaveAttribute('aria-invalid')
  })

  it('offers All first, which selects no restriction and has nothing to clear', async () => {
    const onChange = vi.fn()
    const statuses = [
      { value: 'ACT', label: 'Active' },
      { value: 'CAN', label: 'Cancelled' },
    ]
    const { rerender } = render(
      <SearchableSelect
        id="permitStatus"
        labelText="Permit status"
        value="ACT"
        options={statuses}
        placeholder="All"
        allOptionLabel="All"
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const listbox = screen.getByRole('listbox')
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', 'Active', 'Cancelled'])
    await userEvent.click(within(listbox).getByRole('option', { name: 'All' }))
    expect(onChange).toHaveBeenCalledWith('')

    rerender(
      <SearchableSelect
        id="permitStatus"
        labelText="Permit status"
        value=""
        options={statuses}
        placeholder="All"
        allOptionLabel="All"
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Permit status' })).toHaveValue('All')
    expect(document.querySelector('.searchable-select--all')).not.toBeNull()
  })

  it('marks a select that is not clearable and keeps the default clearable', () => {
    const select = (clearable?: boolean) => (
      <SearchableSelect
        id="region"
        labelText="Region"
        value="11"
        options={[{ value: '11', label: 'Cariboo' }]}
        clearable={clearable}
        onChange={vi.fn()}
      />
    )
    const { rerender } = render(select())
    expect(document.querySelector('.lexis-combobox--no-clear')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear selected item' })).toBeInTheDocument()

    rerender(select(true))
    expect(document.querySelector('.lexis-combobox--no-clear')).toBeNull()

    rerender(select(false))
    expect(document.querySelector('.lexis-combobox--no-clear')).not.toBeNull()
  })

  it('keeps a list’s own All option instead of adding a second, and treats it as All', async () => {
    const options = [
      { value: 'ALL', label: 'All' },
      { value: 'M', label: 'Ministerial' },
    ]
    const select = (value: string) => (
      <SearchableSelect
        id="exemptionType"
        labelText="Exemption type"
        value={value}
        options={options}
        placeholder="All"
        allOptionLabel="All"
        onChange={vi.fn()}
      />
    )
    const { rerender } = render(select('M'))

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(2)
    expect(document.querySelector('.searchable-select--all')).toBeNull()

    // Choosing the list's All, or no value at all, reads as All with nothing to clear.
    for (const value of ['ALL', '']) {
      rerender(select(value))
      expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('All')
      expect(document.querySelector('.searchable-select--all')).not.toBeNull()
    }
  })

  it('shows a read-only value without offering other options', async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        id="locked-type"
        labelText="Exemption type"
        value="M"
        options={[
          { value: 'M', label: 'Ministerial' },
          { value: 'B', label: 'Blanket Order in Council' },
        ]}
        readOnly
        onChange={onChange}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Exemption type' })
    expect(combobox).toHaveValue('Ministerial')
    expect(combobox).toHaveAttribute('readonly')
    await userEvent.click(combobox)
    expect(screen.queryByRole('option', { name: 'Blanket Order in Council' })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows every option for lists with fewer than ten items when a value is already selected', async () => {
    const options = Array.from({ length: 9 }, (_, index) => ({
      value: `OPT-${index + 1}`,
      label: `Option ${index + 1}`,
    }))

    render(
      <SearchableSelect
        id="output-format"
        labelText="Output format"
        value="OPT-1"
        options={options}
        onChange={vi.fn()}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Output format' })
    await userEvent.click(combobox)

    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null

    expect(listbox).not.toBeNull()
    for (const option of options) {
      expect(
        within(listbox as HTMLElement).getByRole('option', { name: option.label }),
      ).toBeVisible()
    }
  })

  it('keeps filtering longer lists by the current input value', async () => {
    const options = Array.from({ length: 10 }, (_, index) => ({
      value: `OPT-${index + 1}`,
      label: `Option ${index + 1}`,
    }))

    render(
      <SearchableSelect
        id="application-status"
        labelText="Application status"
        value="OPT-1"
        options={options}
        onChange={vi.fn()}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Application status' })
    await userEvent.click(combobox)

    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null

    expect(listbox).not.toBeNull()
    expect(within(listbox as HTMLElement).getByRole('option', { name: 'Option 1' })).toBeVisible()
    expect(
      within(listbox as HTMLElement).queryByRole('option', { name: 'Option 2' }),
    ).not.toBeInTheDocument()
  })

  it('does not emit a change when the selected option is chosen again', async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        id="application-status"
        labelText="Application status"
        value="OPT-1"
        options={[
          { value: 'OPT-1', label: 'Option 1' },
          { value: 'OPT-2', label: 'Option 2' },
        ]}
        onChange={onChange}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Application status' })
    await userEvent.click(combobox)
    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()

    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'Option 1' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits the selected value when a different option is chosen with the mouse', async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        id="permit-status"
        labelText="Permit status"
        value=""
        options={[
          { value: 'ACT', label: 'Active' },
          { value: 'CAN', label: 'Cancelled' },
        ]}
        onChange={onChange}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Permit status' })
    await userEvent.click(combobox)
    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()

    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'Cancelled' }))

    expect(onChange).toHaveBeenLastCalledWith('CAN')
  })

  it('emits a custom value when custom entry is enabled', async () => {
    const onChange = vi.fn()
    render(
      <SearchableSelect
        id="owner-name"
        labelText="Owner name"
        value="Default Owner"
        options={[{ value: 'Default Owner', label: 'Default Owner' }]}
        allowCustomValue
        onChange={onChange}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Owner name' })
    await userEvent.clear(combobox)
    await userEvent.type(combobox, 'Custom Owner')
    await userEvent.tab()

    expect(onChange).toHaveBeenLastCalledWith('Custom Owner')
  })
})
