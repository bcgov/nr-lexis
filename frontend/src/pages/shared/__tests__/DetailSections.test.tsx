import { render, screen } from '@testing-library/react'

import { DetailFieldTile } from '@/pages/shared/DetailSections'

describe('detail section cards', () => {
  it('uses the FSPTS card structure and bounded field grid for key-value details', () => {
    const { container } = render(
      <DetailFieldTile
        title="Owner"
        fields={[
          { label: 'Client number', value: '00012345' },
          { label: 'Company', value: 'Example Forestry Ltd.' },
        ]}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Owner' })).toBeInTheDocument()
    expect(screen.getByText('Client number').tagName).toBe('DT')
    expect(screen.getByText('00012345').tagName).toBe('DD')
    expect(container.querySelector('.cds--tile')).toHaveClass('detail-section-card')
    expect(container.querySelector('.detail-section-card__header')).toContainElement(
      screen.getByRole('heading', { level: 2, name: 'Owner' }),
    )
    expect(container.querySelector('dl')).toHaveClass('detail-field-grid')
  })

  it('lets a sole field span the complete card width', () => {
    render(
      <DetailFieldTile
        title="Other conditions"
        fields={[{ label: 'Conditions', value: <span>Export before expiry.</span> }]}
      />,
    )

    expect(screen.getByText('Conditions').closest('.detail-field-item')).toHaveClass(
      'detail-field-item--full',
    )
    expect(screen.getByText('Export before expiry.')).toBeInTheDocument()
  })
})
