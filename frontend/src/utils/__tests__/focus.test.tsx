import { fireEvent, render, screen } from '@testing-library/react'
import { Dropdown, TextInput } from '@carbon/react'
import { describe, expect, it } from 'vitest'
import IsoDateRangePicker from '@/components/IsoDateRangePicker'
import {
  focusDateCalendarDay,
  focusFirstEditableField,
  focusFirstInvalidField,
} from '@/utils/focus'

describe('focusFirstEditableField', () => {
  it('skips disabled, read-only and hidden fields', () => {
    const { container } = render(
      <div>
        <input aria-label="Locked" disabled />
        <input aria-label="Read only" readOnly />
        <div hidden>
          <input aria-label="Hidden" />
        </div>
        <input type="hidden" aria-label="Hidden input" />
        <input aria-label="Client location" />
      </div>,
    )

    expect(focusFirstEditableField(container)).toBe(true)
    expect(screen.getByLabelText('Client location')).toHaveFocus()
  })

  it('focuses the checked option of a radio group', () => {
    const { container } = render(
      <fieldset>
        <legend>Override fees?</legend>
        <input type="radio" name="override" aria-label="No" defaultChecked />
        <input type="radio" name="override" aria-label="Yes" />
      </fieldset>,
    )
    const yes = screen.getByLabelText('Yes')
    ;(yes as HTMLInputElement).checked = true

    focusFirstEditableField(container)

    expect(yes).toHaveFocus()
  })

  it('reports when the container has no editable field yet', () => {
    const { container } = render(<p>Loading…</p>)

    expect(focusFirstEditableField(container)).toBe(false)
    expect(focusFirstEditableField(null)).toBe(false)
  })
})

describe('focusFirstInvalidField', () => {
  it('focuses the first invalid control, including one inside a Carbon dropdown', () => {
    const { container } = render(
      <div>
        <TextInput id="timber-mark" labelText="Timber mark" />
        <Dropdown
          id="species"
          titleText="Species"
          label="Choose an option"
          items={['Fir']}
          invalid
          invalidText="Select a species."
        />
        <TextInput id="volume" labelText="Volume" invalid invalidText="Enter a volume." />
      </div>,
    )

    expect(focusFirstInvalidField(container)).toBe(true)
    expect(screen.getByRole('combobox', { name: /Species/ })).toHaveFocus()
  })

  it('focuses an invalid text input', () => {
    const { container } = render(
      <TextInput id="volume" labelText="Volume" invalid invalidText="Enter a volume." />,
    )

    focusFirstInvalidField(container)

    expect(screen.getByRole('textbox', { name: 'Volume' })).toHaveFocus()
  })

  it('focuses an invalid date without opening its calendar over the error', () => {
    const { container } = render(
      <IsoDateRangePicker
        fromId="listingFromDate"
        toId="listingToDate"
        fromLabel="List date from"
        toLabel="List date to"
        fromValue="2026-02-30"
        toValue=""
        onChange={() => {}}
      />,
    )

    focusFirstInvalidField(container)

    expect(screen.getByRole('textbox', { name: 'List date from' })).toHaveFocus()
    expect(document.querySelector('.flatpickr-calendar.open')).toBeNull()
    expect(screen.getByText('Date must be YYYY-MM-DD')).toBeVisible()
  })

  it('reports when nothing is invalid', () => {
    const { container } = render(<TextInput id="volume" labelText="Volume" />)

    expect(focusFirstInvalidField(container)).toBe(false)
  })
})

describe('focusDateCalendarDay', () => {
  it('focuses the day once a calendar that has just opened finishes its open animation', () => {
    const { container } = render(
      <div className="flatpickr-calendar">
        <span className="flatpickr-day today" tabIndex={-1}>
          19
        </span>
      </div>,
    )
    const calendarContainer = container.firstElementChild as HTMLElement
    const day = screen.getByText('19')
    // The day can't take focus while the opening calendar still hides it.
    let dayHidden = true
    const focusDay = day.focus.bind(day)
    day.focus = () => {
      if (!dayHidden) focusDay()
    }
    const calendar = {
      isOpen: false,
      open: () => undefined,
      close: () => undefined,
      changeMonth: () => undefined,
      calendarContainer,
    }

    expect(focusDateCalendarDay(calendar)).toBe(true)
    expect(day).not.toHaveFocus()

    dayHidden = false
    fireEvent.animationEnd(calendarContainer)
    expect(day).toHaveFocus()
  })
})
