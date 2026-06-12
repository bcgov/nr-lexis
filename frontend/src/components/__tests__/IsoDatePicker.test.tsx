import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import IsoDatePicker from '@/components/IsoDatePicker'

describe('IsoDatePicker', () => {
  it('disables browser autocomplete on the editable date input', () => {
    render(
      <IsoDatePicker
        id="applicationDate"
        labelText="Application Date"
        value=""
        onChange={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Application Date')

    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('name', 'applicationDate-lexis-date')
    expect(input).toHaveAttribute('data-1p-ignore', 'true')
    expect(input).toHaveAttribute('data-lpignore', 'true')
  })

  it('still supports typed ISO dates', async () => {
    const StatefulDatePicker = () => {
      const [value, setValue] = useState('')

      return (
        <IsoDatePicker
          id="receivedDate"
          labelText="Received Date"
          value={value}
          onChange={setValue}
        />
      )
    }

    render(<StatefulDatePicker />)

    const input = screen.getByLabelText('Received Date')

    await userEvent.type(input, '2026-06-12')

    expect(input).toHaveValue('2026-06-12')
  })
})
