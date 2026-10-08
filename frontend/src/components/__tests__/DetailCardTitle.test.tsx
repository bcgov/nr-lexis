import { Certificate } from '@carbon/icons-react'
import { render, screen } from '@testing-library/react'

import DetailCardTitle from '@/components/DetailCardTitle'

describe('DetailCardTitle', () => {
  it('renders an h2 led by a decorative 24px tab icon', () => {
    render(<DetailCardTitle icon={Certificate}>Permit details</DetailCardTitle>)

    const heading = screen.getByRole('heading', { level: 2, name: 'Permit details' })
    const icon = heading.querySelector('svg')
    expect(heading).toHaveClass('detail-tile-title')
    expect(heading.firstElementChild).toBe(icon)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('width', '24')
  })

  it('renders without an icon for cards outside tabs', () => {
    render(
      <DetailCardTitle id="offer-title" className="offer-card-title">
        Offer details
      </DetailCardTitle>,
    )

    const heading = screen.getByRole('heading', { level: 2, name: 'Offer details' })
    expect(heading).toHaveAttribute('id', 'offer-title')
    expect(heading).toHaveClass('detail-tile-title', 'offer-card-title')
    expect(heading.querySelector('svg')).toBeNull()
  })
})
