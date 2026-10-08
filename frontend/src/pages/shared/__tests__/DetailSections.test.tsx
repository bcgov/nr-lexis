import { render, screen } from '@testing-library/react'

import { DetailFieldTile } from '@/pages/shared/DetailSections'

describe('detail section cards', () => {
  it('uses the card structure and record field grid for key-value details', () => {
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
    expect(container.querySelector('dl')).toHaveClass('record-field', 'cds--lg:col-span-4')
  })

  it('lets a field explicitly span the complete card width', () => {
    render(
      <DetailFieldTile
        title="Other conditions"
        fields={[{ label: 'Conditions', value: <span>Export before expiry.</span>, span: 'full' }]}
      />,
    )

    expect(screen.getByText('Conditions').closest('.record-field')).toHaveClass(
      'cds--lg:col-span-16',
    )
    expect(screen.getByText('Export before expiry.')).toBeInTheDocument()
  })

  it('starts each group of fields on its own row', () => {
    const { container } = render(
      <DetailFieldTile
        title="Applicant"
        fields={[
          [
            { label: 'Client', value: 'Example Forestry Ltd. · 00012345', span: 'wide' },
            { label: 'Client location', value: '00', span: 'wide' },
          ],
          [{ label: 'Country', value: 'Canada' }],
        ]}
      />,
    )

    const rows = container.querySelectorAll('.record-field-grid__row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContainElement(screen.getByText('Client location'))
    expect(rows[1]).toContainElement(screen.getByText('Country'))
    expect(screen.getByText('Client').closest('.record-field')).toHaveClass('cds--lg:col-span-8')
  })
})
