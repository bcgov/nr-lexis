import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import IsoDatePicker, { parseIsoDate } from '../IsoDatePicker'

describe('IsoDatePicker', () => {
  it('rejects impossible dates before Flatpickr can normalize them', () => {
    expect(parseIsoDate('2026-02-30')).toBe(false)
    expect(parseIsoDate('2024-02-29')).toEqual(new Date(2024, 1, 29))
  })

  it('preserves four-digit years below 100', () => {
    const parsedDate = parseIsoDate('0099-01-01')

    expect(parsedDate).not.toBe(false)
    if (parsedDate === false) throw new Error('Expected a valid date')
    expect(parsedDate.getFullYear()).toBe(99)
  })

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

  it('exposes required status on the editable date input', () => {
    render(
      <IsoDatePicker
        id="requiredApplicationDate"
        labelText="Application Date"
        value=""
        required
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Application Date')).toHaveAttribute('aria-required', 'true')
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

  it('keeps a read-only date focusable without a calendar, typing or format hint', async () => {
    const onChange = vi.fn()
    render(
      <IsoDatePicker
        id="readOnlyApplicationDate"
        labelText="Application date"
        value="2026-10-21"
        readOnly
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Application date') as HTMLInputElement & {
      _flatpickr: { isOpen: boolean }
    }

    await userEvent.click(input)
    await userEvent.type(input, '2026-01-01')

    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveValue('2026-10-21')
    expect(input._flatpickr.isOpen).toBe(false)
    expect(screen.queryByText('year-month-day')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
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

  it('preserves impossible typed dates for parent validation', () => {
    const StatefulDatePicker = () => {
      const [value, setValue] = useState('2026-08-17')

      return (
        <>
          <IsoDatePicker
            id="approvalDate"
            labelText="Approval date"
            value={value}
            onChange={setValue}
          />
          <output aria-label="Current date value">{value}</output>
        </>
      )
    }

    render(<StatefulDatePicker />)

    fireEvent.change(screen.getByLabelText('Approval date'), {
      target: { value: '2026-02-31' },
    })

    expect(screen.getByLabelText('Current date value')).toHaveTextContent('2026-02-31')
  })

  it('keeps an impossible typed date visible when Flatpickr clears the input on blur', async () => {
    const onBlur = vi.fn()
    const StatefulDatePicker = () => {
      const [value, setValue] = useState('')

      return (
        <IsoDatePicker
          id="approvalDate"
          labelText="Approval date"
          value={value}
          onBlur={onBlur}
          onChange={setValue}
        />
      )
    }

    render(<StatefulDatePicker />)

    const input = screen.getByLabelText('Approval date')
    fireEvent.change(input, { target: { value: '2026-02-31' } })
    fireEvent.blur(input)

    const dateInput = input as HTMLInputElement
    dateInput.value = ''

    await waitFor(() => expect(input).toHaveValue('2026-02-31'))
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it('keeps an impossible typed date visible when Enter makes Flatpickr empty the input', async () => {
    const onChange = vi.fn()
    const StatefulDatePicker = () => {
      const [value, setValue] = useState('')

      return (
        <IsoDatePicker
          id="approvalDate"
          labelText="Approval date"
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
        />
      )
    }

    render(<StatefulDatePicker />)

    const input = screen.getByLabelText('Approval date')
    await userEvent.type(input, '2026-02-30{Enter}')

    await waitFor(() => expect(input).toHaveValue('2026-02-30'))
    expect(onChange).not.toHaveBeenCalledWith('')
    expect(onChange).toHaveBeenLastCalledWith('2026-02-30')
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

  it('places the calendar again once the panel it opened in stops moving', async () => {
    class TestKeyframeEffect {
      constructor(readonly target: Element) {}
    }
    vi.stubGlobal('KeyframeEffect', TestKeyframeEffect)
    let finishSlide!: () => void
    const slide = new Promise<void>((resolve) => {
      finishSlide = resolve
    })
    render(
      <aside aria-label="Add fee policy">
        <IsoDatePicker id="effectiveDate" labelText="Effective date" value="" onChange={vi.fn()} />
      </aside>,
    )
    const panel = screen.getByRole('complementary', { name: 'Add fee policy' })
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => [{ effect: new TestKeyframeEffect(panel), finished: slide }],
    })
    const input = screen.getByLabelText('Effective date') as HTMLInputElement & {
      _flatpickr: { isOpen: boolean; _positionCalendar: () => void }
    }
    const placeCalendar = vi.spyOn(input._flatpickr, '_positionCalendar')

    try {
      await userEvent.click(input)
      expect(input._flatpickr.isOpen).toBe(true)
      placeCalendar.mockClear()

      await act(async () => {
        finishSlide()
        await slide
      })

      expect(placeCalendar).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(document, 'getAnimations')
      vi.unstubAllGlobals()
    }
  })
})
