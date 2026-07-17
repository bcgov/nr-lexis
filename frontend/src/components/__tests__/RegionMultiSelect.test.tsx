import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RegionMultiSelect, { type RegionMultiSelectOption } from '../RegionMultiSelect'

Element.prototype.scrollIntoView = vi.fn()

const regions: RegionMultiSelectOption[] = [
  { id: '1903', text: 'Cariboo Natural Resource Region' },
  { id: '1904', text: 'Kootenay-Boundary Natural Resource Region' },
  { id: '1908', text: 'Skeena Natural Resource Region' },
]

function RegionHarness({
  initialSelected = [],
  disabled = false,
}: {
  initialSelected?: RegionMultiSelectOption[]
  disabled?: boolean
}) {
  const [selectedItems, setSelectedItems] = useState(initialSelected)

  return (
    <RegionMultiSelect
      id="regions"
      titleText="Region"
      items={regions}
      selectedItems={selectedItems}
      disabled={disabled}
      onChange={setSelectedItems}
    />
  )
}

describe('RegionMultiSelect', () => {
  it('renders every selected region as an individually removable pill', async () => {
    render(<RegionHarness initialSelected={regions.slice(0, 2)} />)

    const selectedRegions = screen.getByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getAllByRole('listitem')).toHaveLength(2)
    expect(within(selectedRegions).getByText(regions[0].text)).toBeVisible()
    expect(within(selectedRegions).getByText(regions[1].text)).toBeVisible()

    await userEvent.click(
      within(selectedRegions).getByRole('button', { name: `Remove ${regions[0].text}` }),
    )

    expect(screen.queryByText(regions[0].text)).not.toBeInTheDocument()
    expect(screen.getByText(regions[1].text)).toBeVisible()
    expect(screen.getByRole('combobox', { name: /^Region/ })).toHaveFocus()
  })

  it('selects and clears every region from the select-all option inside the menu', async () => {
    render(<RegionHarness />)

    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(combobox)
    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()

    const selectAll = within(listbox as HTMLElement).getByRole('option', {
      name: 'Select all shown regions',
    })
    await userEvent.click(selectAll)

    expect(
      within(screen.getByRole('list', { name: 'Selected regions' })).getAllByRole('listitem'),
    ).toHaveLength(regions.length)
    const selectedRegions = screen.getByRole('list', { name: 'Selected regions' })
    for (const region of regions) {
      expect(within(selectedRegions).getByText(region.text)).toBeVisible()
    }

    await userEvent.click(selectAll)
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('selects every shown region when some regions are already selected', async () => {
    render(<RegionHarness initialSelected={[regions[0]]} />)

    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(combobox)
    await userEvent.click(
      screen.getByRole('option', {
        name: 'Select all shown regions',
      }),
    )

    expect(
      within(screen.getByRole('list', { name: 'Selected regions' })).getAllByRole('listitem'),
    ).toHaveLength(regions.length)
  })

  it('preserves the first region when regions are selected consecutively', async () => {
    render(<RegionHarness />)

    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(combobox)
    await userEvent.click(screen.getByRole('option', { name: regions[0].text }))
    await userEvent.click(screen.getByRole('option', { name: regions[1].text }))

    const selectedRegions = await screen.findByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getByText(regions[0].text)).toBeVisible()
    expect(within(selectedRegions).getByText(regions[1].text)).toBeVisible()
  })

  it('selects only shown regions while filtering and disables pill removal', async () => {
    const { rerender } = render(<RegionHarness />)
    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.type(combobox, 'Cariboo')

    const listboxId = combobox.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    await userEvent.click(
      within(listbox as HTMLElement).getByRole('option', {
        name: 'Select all shown regions',
      }),
    )

    const selectedRegions = screen.getByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getAllByRole('listitem')).toHaveLength(1)
    expect(within(selectedRegions).getByText(regions[0].text)).toBeVisible()

    rerender(<RegionHarness key="disabled" initialSelected={[regions[0]]} disabled />)
    expect(screen.getByRole('button', { name: `Remove ${regions[0].text}` })).toBeDisabled()
  })
})
