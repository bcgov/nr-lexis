import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import IsoDateRangePicker from '../IsoDateRangePicker'

function Range({ initial = ['', ''] as [string, string] }) {
  const [values, setValues] = useState(initial)
  return (
    <>
      <IsoDateRangePicker
        fromId="from"
        toId="to"
        fromLabel="List date from"
        toLabel="List date to"
        fromValue={values[0]}
        toValue={values[1]}
        onChange={setValues}
      />
      <output aria-label="Search bounds">{JSON.stringify(values)}</output>
      <button onClick={() => setValues(['', ''])}>Clear range</button>
      <button>Outside</button>
    </>
  )
}

describe('IsoDateRangePicker', () => {
  it('restores both dates and an end-only search without shifting the calendar date', async () => {
    const page = render(<Range initial={['2026-01-10', '2026-01-20']} />)
    expect(screen.getByLabelText('List date from')).toHaveValue('2026-01-10')
    expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-20')
    page.unmount()

    render(<Range initial={['', '2026-01-20']} />)
    await waitFor(() => {
      expect(screen.getByLabelText('List date from')).toHaveValue('')
      expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-20')
    })
    expect(screen.getByLabelText('Search bounds')).toHaveTextContent('["","2026-01-20"]')
  })

  it('keeps invalid typed bounds visible for validation and clears both inputs', async () => {
    render(<Range initial={['2026-01-10', '2026-01-20']} />)
    const from = screen.getByLabelText('List date from')
    fireEvent.change(from, { target: { value: '2026-02-30' } })
    fireEvent.blur(from)
    await waitFor(() => expect(from).toHaveValue('2026-02-30'))
    expect(from).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-20')

    await userEvent.click(screen.getByRole('button', { name: 'Clear range' }))
    expect(from).toHaveValue('')
    expect(screen.getByLabelText('List date to')).toHaveValue('')
    expect(screen.getByLabelText('Search bounds')).toHaveTextContent('["",""]')
  })

  it('updates both search bounds from a single range calendar', async () => {
    render(<Range initial={['2026-01-10', '2026-01-20']} />)
    await userEvent.click(screen.getByLabelText('List date from'))
    const calendar = document.querySelector('.flatpickr-calendar.open')
    expect(calendar).not.toBeNull()
    const day = (number: number) =>
      Array.from(calendar!.querySelectorAll<HTMLElement>('.flatpickr-day')).find(
        (element) =>
          element.textContent === String(number) &&
          !element.classList.contains('prevMonthDay') &&
          !element.classList.contains('nextMonthDay'),
      )!
    await userEvent.click(day(12))
    await userEvent.click(screen.getByLabelText('List date to'))
    await userEvent.click(day(16))

    await waitFor(() => {
      expect(screen.getByLabelText('List date from')).toHaveValue('2026-01-12')
      expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-16')
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        '["2026-01-12","2026-01-16"]',
      )
    })
  })

  it('preserves an open-ended filter after clearing one bound and pressing Enter', async () => {
    render(<Range initial={['2026-01-10', '2026-01-20']} />)
    const from = screen.getByLabelText('List date from')
    const to = screen.getByLabelText('List date to')
    fireEvent.change(from, { target: { value: '' } })
    fireEvent.blur(from)
    fireEvent.change(to, { target: { value: '2026-01-31' } })
    fireEvent.keyDown(to, { key: 'Enter' })
    await waitFor(() => {
      expect(from).toHaveValue('')
      expect(to).toHaveValue('2026-01-31')
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent('["","2026-01-31"]')
    })
  })

  const calendarDay = (number: number) =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.flatpickr-calendar.open .flatpickr-day'),
    ).find(
      (day) =>
        day.textContent === String(number) &&
        !day.classList.contains('prevMonthDay') &&
        !day.classList.contains('nextMonthDay'),
    )!

  it.each([
    [10, 20],
    [20, 10],
  ])('selects a new empty range in either direction: %s then %s', async (first, second) => {
    render(<Range />)
    await userEvent.click(screen.getByLabelText('List date from'))
    await userEvent.click(calendarDay(first))
    await userEvent.click(calendarDay(second))
    const today = new Date()
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    await waitFor(() =>
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        `["${month}-10","${month}-20"]`,
      ),
    )
  })

  it.each([
    { initial: ['', '2026-01-20'], field: 'List date to', day: 25, expected: ['', '2026-01-25'] },
    { initial: ['2026-01-10', ''], field: 'List date from', day: 12, expected: ['2026-01-12', ''] },
  ])(
    'edits $field with the calendar without inventing the other bound',
    async ({ initial, field, day, expected }) => {
      render(<Range initial={initial as [string, string]} />)
      await waitFor(() => {
        expect(screen.getByLabelText('List date from')).toHaveValue(initial[0])
        expect(screen.getByLabelText('List date to')).toHaveValue(initial[1])
      })
      await userEvent.click(screen.getByLabelText(field))
      await userEvent.click(calendarDay(day))
      await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
      await waitFor(() =>
        expect(screen.getByLabelText('Search bounds')).toHaveTextContent(JSON.stringify(expected)),
      )
    },
  )

  it('does not rewrite the untouched bound when a typed date crosses it', async () => {
    render(<Range initial={['2026-01-10', '2026-01-20']} />)
    const from = screen.getByLabelText('List date from')
    await userEvent.click(from)
    fireEvent.change(from, { target: { value: '2026-01-25' } })
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => {
      expect(from).toHaveValue('2026-01-25')
      expect(screen.getByLabelText('List date to')).toHaveValue('2026-01-20')
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        '["2026-01-25","2026-01-20"]',
      )
    })
  })

  it('retains native input edits when an outside pointer closes the calendar before change', async () => {
    render(<Range initial={['2026-01-20', '2026-01-25']} />)
    const from = screen.getByLabelText('List date from')
    await userEvent.click(from)
    fireEvent.input(from, { target: { value: '2026-01-28' } })
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => {
      expect(from).toHaveValue('2026-01-28')
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        '["2026-01-28","2026-01-25"]',
      )
    })
  })

  it('retains an incrementally typed replacement when the calendar closes', async () => {
    render(<Range initial={['2026-01-20', '2026-01-25']} />)
    const from = screen.getByLabelText('List date from')
    await userEvent.click(from)
    await userEvent.clear(from)
    await userEvent.type(from, '2026-01-28')
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => {
      expect(from).toHaveValue('2026-01-28')
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        '["2026-01-28","2026-01-25"]',
      )
    })
  })

  it('keeps keyboard calendar selection on the To endpoint', async () => {
    render(<Range initial={['2026-01-10', '2026-01-20']} />)
    await userEvent.click(screen.getByLabelText('List date to'))
    await userEvent.tab()
    // Flatpickr uses native keyCode for calendar navigation; userEvent.keyboard emits zero.
    fireEvent.keyDown(document.activeElement!, {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
      which: 39,
    })
    fireEvent.keyDown(document.activeElement!, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Search bounds')).toHaveTextContent(
        '["2026-01-10","2026-01-21"]',
      ),
    )
  })
})
