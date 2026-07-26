import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import IsoDatePicker from '../IsoDatePicker'

describe('IsoDatePicker', () => {
  it('marks the editable date input for password manager ignore', () => {
    render(
      <IsoDatePicker
        id="applicationDate"
        labelText="Application Date"
        value=""
        onChange={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Application Date')

    expect(input).toHaveAttribute('data-1p-ignore', 'true')
    expect(input).toHaveAttribute('data-lpignore', 'true')
    expect(input).toHaveAttribute('pattern', String.raw`\d{4}-\d{2}-\d{2}`)
  })

  it('renders an initial ISO date value', () => {
    render(
      <IsoDatePicker
        id="retrievalDate"
        labelText="Retrieval date"
        value="2026-06-26"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Retrieval date')).toHaveValue('2026-06-26')
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

  it('does not emit a change when Carbon repeats the controlled date value', () => {
    const onChange = vi.fn()
    render(
      <IsoDatePicker
        id="approvalDate"
        labelText="Approval date"
        value="2026-07-01"
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Approval date'), {
      target: { value: '2026-07-01' },
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})
