import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchableSelect from '../SearchableSelect'

Element.prototype.scrollIntoView = vi.fn()

describe('SearchableSelect', () => {
  it('shows every option for short lists when a value is already selected', async () => {
    render(
      <SearchableSelect
        id="output-format"
        labelText="Output format"
        value="PDF"
        options={[
          { value: 'PDF', label: 'PDF' },
          { value: 'CSV', label: 'CSV' },
        ]}
        onChange={vi.fn()}
      />,
    )

    const combobox = screen.getByRole('combobox', { name: 'Output format' })
    await userEvent.click(combobox)

    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null

    expect(listbox).not.toBeNull()
    expect(within(listbox as HTMLElement).getByRole('option', { name: 'PDF' })).toBeVisible()
    expect(within(listbox as HTMLElement).getByRole('option', { name: 'CSV' })).toBeVisible()
  })
})
