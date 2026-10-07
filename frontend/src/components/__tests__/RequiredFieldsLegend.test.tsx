import { render, screen } from '@testing-library/react'

import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'

describe('RequiredFieldsLegend', () => {
  it('shows the legend with the shared marker and keeps a page spacing class', () => {
    render(<RequiredFieldsLegend className="boic-permit-required-hint" />)

    const legend = screen.getByText('Required fields').closest('p')
    expect(legend).toHaveClass('required-fields-legend', 'boic-permit-required-hint')
    expect(legend?.querySelector('.required-label__marker')).toHaveAttribute('aria-hidden', 'true')
  })
})
