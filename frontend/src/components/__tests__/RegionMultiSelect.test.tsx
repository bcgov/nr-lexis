import { render, screen } from '@testing-library/react'
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
    <>
      <RegionMultiSelect
        id="regions"
        titleText="Region"
        items={regions}
        selectedItems={selectedItems}
        disabled={disabled}
        onChange={setSelectedItems}
      />
      <output data-testid="selected-regions">
        {selectedItems.map((item) => item.text).join('|')}
      </output>
    </>
  )
}

describe('RegionMultiSelect', () => {
  it('uses the default Carbon selection summary without external pills', () => {
    render(<RegionHarness initialSelected={regions.slice(0, 2)} />)

    expect(
      screen.getByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(document.querySelector('.region-multi-select .cds--tag--filter')).toHaveTextContent('2')
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('updates consecutive selections through the Carbon options', async () => {
    const user = userEvent.setup()
    render(<RegionHarness />)

    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await user.click(combobox)
    await user.click(screen.getByRole('option', { name: regions[0].text }))
    await user.click(screen.getByRole('option', { name: regions[1].text }))

    expect(screen.getByTestId('selected-regions')).toHaveTextContent(
      `${regions[0].text}|${regions[1].text}`,
    )
    expect(
      screen.getByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
  })

  it('uses Carbon filtering and clears the current selection from the built-in summary', async () => {
    const user = userEvent.setup()
    render(<RegionHarness />)

    const combobox = screen.getByRole('combobox', { name: /^Region/ })
    await user.type(combobox, 'Skeena')
    await user.click(screen.getByRole('option', { name: regions[2].text }))

    expect(screen.getByTestId('selected-regions')).toHaveTextContent(regions[2].text)
    await user.click(screen.getByRole('button', { name: 'Clear all selected items' }))
    expect(screen.getByTestId('selected-regions')).toBeEmptyDOMElement()
  })

  it('disables the Carbon control', () => {
    render(<RegionHarness initialSelected={[regions[0]]} disabled />)

    expect(screen.getByRole('combobox', { name: /^Region/ })).toBeDisabled()
  })
})
