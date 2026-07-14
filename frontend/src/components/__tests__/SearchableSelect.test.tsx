import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchableSelect from '../SearchableSelect'

Element.prototype.scrollIntoView = vi.fn()

describe('SearchableSelect', () => {
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
})
