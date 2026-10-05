import { DatePicker, DatePickerInput } from '@carbon/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import { parseIsoDate } from './IsoDatePicker'

type IsoDateRangePickerProps = {
  fromId: string
  toId: string
  fromLabel: string
  toLabel: string
  fromValue: string
  toValue: string
  onChange: (values: [string, string]) => void
}

/** One Carbon range calendar, with independently optional ISO search bounds. */
export default function IsoDateRangePicker({
  fromId,
  toId,
  fromLabel,
  toLabel,
  fromValue,
  toValue,
  onChange,
}: IsoDateRangePickerProps) {
  const rangeRef = useRef<HTMLDivElement>(null)
  const latestValuesRef = useRef<[string, string]>([fromValue, toValue])
  const calendarIntentRef = useRef<'range' | 'from' | 'to'>('range')
  const refreshCalendarRef = useRef(false)
  const calendarOpenRef = useRef(false)
  const keyboardFocusRef = useRef(false)
  const calendarSelectionRef = useRef(false)
  const removeCalendarListenersRef = useRef<(() => void) | null>(null)
  const calendarValues = useMemo(
    // Local Date objects avoid a UTC day shift in Carbon's range-input formatting.
    () => [parseIsoDate(fromValue) || '', parseIsoDate(toValue) || ''],
    [fromValue, toValue],
  )

  const restoreInputs = useCallback(() => {
    rangeRef.current?.querySelectorAll<HTMLInputElement>('input').forEach((input, index) => {
      input.value = latestValuesRef.current[index]
    })
  }, [])

  useEffect(() => {
    latestValuesRef.current = [fromValue, toValue]
    // Keep independently optional/invalid drafts visible after Carbon initializes its calendar.
    restoreInputs()
    const frame = requestAnimationFrame(restoreInputs)
    return () => cancelAnimationFrame(frame)
  }, [fromValue, toValue, restoreInputs])

  useEffect(() => {
    const range = rangeRef.current
    if (!range) return
    // Typed bounds belong to the caller. Flatpickr's blur/Enter parser can rewrite the other
    // bound or fail on an incomplete range; calendar selections are handled separately below.
    const preserveDraft = (event: Event) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Tab') {
        keyboardFocusRef.current = true
      }
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Enter') return
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      event.stopPropagation()
      if (
        event.type === 'keydown' &&
        latestValuesRef.current.some((value) => !isValidIsoDate(value))
      ) {
        event.preventDefault()
      }
    }
    const rememberCalendarIntent = (event: Event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      // Carbon returns focus after picking a date. Only a new input/pointer interaction
      // starts a new selection intent, so an empty range can still take two calendar clicks.
      if (event.type === 'focus' && calendarOpenRef.current && !keyboardFocusRef.current) return
      keyboardFocusRef.current = false
      refreshCalendarRef.current = true
      calendarIntentRef.current =
        input.id === fromId && latestValuesRef.current.every((value) => !value)
          ? 'range'
          : input.id === fromId
            ? 'from'
            : 'to'
    }
    range.addEventListener('focus', rememberCalendarIntent, true)
    range.addEventListener('pointerdown', rememberCalendarIntent, true)
    range.addEventListener('blur', preserveDraft, true)
    range.addEventListener('keydown', preserveDraft, true)
    return () => {
      range.removeEventListener('focus', rememberCalendarIntent, true)
      range.removeEventListener('pointerdown', rememberCalendarIntent, true)
      range.removeEventListener('blur', preserveDraft, true)
      range.removeEventListener('keydown', preserveDraft, true)
    }
  }, [fromId])

  useEffect(() => () => removeCalendarListenersRef.current?.(), [])

  const update = (values: [string, string]) => {
    if (values.every((value, index) => value === latestValuesRef.current[index])) return
    latestValuesRef.current = values
    onChange(values)
  }

  return (
    <div ref={rangeRef} className="search-date-range">
      <DatePicker
        datePickerType="range"
        dateFormat="Y-m-d"
        allowInput
        parseDate={parseIsoDate}
        value={calendarValues}
        onChange={(dates, _text, calendar) => {
          // Carbon also emits changes while parsing/closing typed input. Those callbacks
          // must not replace the caller's draft with the calendar's previous selection.
          if (!calendarSelectionRef.current || !dates.length) return
          calendarSelectionRef.current = false
          if (calendarIntentRef.current === 'range') {
            update([
              calendar.formatDate(dates[0], 'Y-m-d'),
              dates[1] ? calendar.formatDate(dates[1], 'Y-m-d') : '',
            ])
          } else {
            const values: [string, string] = [...latestValuesRef.current]
            const index = calendarIntentRef.current === 'from' ? 0 : 1
            // Carbon's return-focus handler changes latestSelectedDateObj to the start date.
            // Find the new date without treating the untouched bound as the user's choice.
            const existingBound = values[index === 0 ? 1 : 0] || values[index]
            const selectedValues = dates.map((date) => calendar.formatDate(date, 'Y-m-d'))
            values[index] =
              selectedValues.find((value) => value !== existingBound) ?? selectedValues[0]
            update(values)
          }
          keyboardFocusRef.current = false
        }}
        onOpen={(_dates, _text, calendar) => {
          calendarOpenRef.current = true
          removeCalendarListenersRef.current?.()
          const element = calendar.calendarContainer
          const calendarGesture = (event: Event) => {
            const key = event.type === 'keydown' ? (event as KeyboardEvent).key : ''
            keyboardFocusRef.current = key === 'Tab'
            if (
              (event.type === 'click' || key === 'Enter') &&
              event.target instanceof Element &&
              event.target.closest('.flatpickr-day')
            ) {
              calendarSelectionRef.current = true
            }
          }
          element.addEventListener('click', calendarGesture, true)
          element.addEventListener('keydown', calendarGesture, true)
          removeCalendarListenersRef.current = () => {
            element.removeEventListener('click', calendarGesture, true)
            element.removeEventListener('keydown', calendarGesture, true)
          }
          if (!refreshCalendarRef.current) return
          refreshCalendarRef.current = false
          calendar.setDate(
            latestValuesRef.current.map((value) => parseIsoDate(value) || ''),
            false,
          )
          restoreInputs()
        }}
        onClose={() => {
          queueMicrotask(() => {
            calendarOpenRef.current = false
            keyboardFocusRef.current = false
            calendarSelectionRef.current = false
            restoreInputs()
          })
        }}
      >
        {[
          { id: fromId, label: fromLabel, value: fromValue },
          { id: toId, label: toLabel, value: toValue },
        ].map(({ id, label, value }, index) => (
          <DatePickerInput
            key={id}
            id={id}
            labelText={label}
            placeholder="YYYY-MM-DD"
            pattern={String.raw`\d{4}-\d{2}-\d{2}`}
            data-1p-ignore="true"
            data-lpignore="true"
            invalid={!isValidIsoDate(value)}
            invalidText="Date must be YYYY-MM-DD"
            onChange={(event) => {
              const values: [string, string] = [...latestValuesRef.current]
              values[index] = event.target.value
              update(values)
            }}
            onBlur={(event) => {
              const input = event.currentTarget
              requestAnimationFrame(() => {
                if (!isValidIsoDate(latestValuesRef.current[index])) {
                  input.value = latestValuesRef.current[index]
                }
              })
            }}
          />
        ))}
      </DatePicker>
    </div>
  )
}
