import { Dropdown } from '@carbon/react'
import { render, screen } from '@testing-library/react'
import { markRequired, requiredLabel } from '@/utils/required-label'

describe('requiredLabel', () => {
  it('marks a required label without changing its accessible name', () => {
    render(
      <>
        <label htmlFor="required-field">{requiredLabel('Required field')}</label>
        <input id="required-field" />
      </>,
    )

    expect(screen.getByLabelText('Required field')).toBeInTheDocument()
    expect(screen.getByText('Required field')).toHaveClass('required-label')
    const marker = document.querySelector('.required-label__marker')
    expect(marker).toHaveAttribute('aria-hidden', 'true')
    // The stylesheet draws the asterisk, so it is no glyph and no label text.
    expect(marker).toBeEmptyDOMElement()
    expect(screen.getByText('Required field').firstElementChild).toBe(marker)
  })

  it('leaves an optional label unchanged', () => {
    render(<label>{requiredLabel('Optional field', false)}</label>)

    expect(screen.getByText('Optional field')).toBeInTheDocument()
    expect(document.querySelector('.required-label')).not.toBeInTheDocument()
  })

  it('marks a required Carbon Dropdown for assistive technology', () => {
    render(
      <Dropdown
        id="required-dropdown"
        ref={markRequired}
        titleText={requiredLabel('Age class')}
        label="Choose an option"
        items={['Old growth']}
      />,
    )

    expect(screen.getByRole('combobox', { name: /Age class/ })).toHaveAttribute(
      'aria-required',
      'true',
    )
  })
})
