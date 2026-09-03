import { render, screen } from '@testing-library/react'
import { requiredLabel } from '@/utils/required-label'

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
  })

  it('leaves an optional label unchanged', () => {
    render(<label>{requiredLabel('Optional field', false)}</label>)

    expect(screen.getByText('Optional field')).toBeInTheDocument()
    expect(document.querySelector('.required-label')).not.toBeInTheDocument()
  })
})
