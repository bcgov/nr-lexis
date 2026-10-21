import { render, screen } from '@testing-library/react'

import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'

describe('RequiredFieldsLegend', () => {
  it('shows the legend with the shared marker and keeps a page spacing class', () => {
    render(<RequiredFieldsLegend className="boic-permit-required-hint" />)

    const legend = screen.getByText('Required fields').closest('p')
    expect(legend).toHaveClass('required-fields-legend', 'boic-permit-required-hint')
    expect(legend?.querySelector('.required-label__marker')).toHaveAttribute('aria-hidden', 'true')
  })
  it('reads "Required field" for a single required field', () => {
    render(<RequiredFieldsLegend single />)

    const legend = screen.getByText('Required field').closest('p')
    expect(legend).toHaveClass('required-fields-legend')
    expect(legend?.querySelector('.required-label__marker')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText('Required fields')).toBeNull()
  })
})
